// Time-allocation engine: turns the commit log + Obsidian daily-log digest for a
// range into a per-project time breakdown (pie data), an hours table, and a
// per-day timesheet of work blocks.
//
// Model (Daniel's heuristic — recovered verbatim from the original build chat):
// every timestamped event — a commit or a daily-log line — is the END of a work
// block. A block starts at the previous event on that day, capped at blockCap
// minutes back. So a lone event counts as one capped block (~1h); tightly-spaced
// events split the gap between them, chaining into one continuous stretch. A gap
// wider than the cap is NOT fully counted (only the cap). Duration is the gap,
// never a fixed per-event amount, so a commit and a log line about the same work
// don't double-count — they bound the same stretch of the day. No fixed work
// window, no weekday/weekend rule, no rounding to whole hours.
//
// Commits are timestamped in UTC; daily logs are local. Commits are shifted by
// tzOffsetMinutes (SAST, UTC+2) before clustering so both sit on one timeline.
//
// Per-day overrides (config.timesheet.dayOverrides[date]) force a day's start
// and/or end clock time: `start` moves the first block's start (events before it
// are dropped); `end` moves the last block's end (events after it are dropped,
// and the trailing time to the forced end is credited to the last block).
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function pad(n) { return String(n).padStart(2, '0'); }

export function hhmmToMin(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

export function minutesToClock(mins) {
  const m = ((Math.round(mins) % 1440) + 1440) % 1440;
  return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
}

export function localDayLabel(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, 12));
  const dow = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][dt.getUTCDay()];
  return `${dow} ${d} ${MONTHS[m - 1]}`;
}

// Shift a UTC ISO timestamp into local time → { date: 'YYYY-MM-DD', mins }.
export function utcToLocal(iso, offsetMin) {
  const t = new Date(iso).getTime() + offsetMin * 60 * 1000;
  const d = new Date(t);
  const date = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  const mins = d.getUTCHours() * 60 + d.getUTCMinutes();
  return { date, mins };
}

function mapRepoProject(name, projectMap) {
  return projectMap[name] ?? name;
}

export function matchLogProject(text, rules, fallback) {
  const low = text.toLowerCase();
  for (const rule of rules) {
    if (rule.any.some(kw => low.includes(kw))) return rule.project;
  }
  return fallback;
}

// Parse the logs.md digest into events. `## YYYY-MM-DD` headers, then lines like
// `- HH:MM *(backfilled)* — summary` or `- YYYY-MM-DD HH:MM — summary`.
export function parseLogEvents(md, rules, fallback) {
  const events = [];
  let curDate = null;
  for (const raw of md.split(/\r?\n/)) {
    const h = raw.match(/^##\s+(\d{4}-\d{2}-\d{2})\s*$/);
    if (h) { curDate = h[1]; continue; }
    if (!curDate) continue;
    const m = raw.match(/^\s*-\s+(?:\d{4}-\d{2}-\d{2}\s+)?(\d{1,2}):(\d{2})\b(.*)$/);
    if (!m) continue;
    const mins = parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
    const text = m[3].replace(/^\s*\*\(backfilled\)\*/, '').replace(/^\s*[—–-]\s*/, '').trim();
    const project = matchLogProject(text, rules, fallback);
    if (project === '__EXCLUDE__') continue;
    events.push({ date: curDate, mins, project, source: 'log', text });
  }
  return events;
}

// Collapse a day's sorted events into attributed work blocks, honouring an
// optional { start, end } clock override (minutes-of-day).
export function blocksForDay(dayEvents, cap, override = {}) {
  let evs = [...dayEvents].sort((a, b) => a.mins - b.mins);
  if (override.start != null) evs = evs.filter(e => e.mins >= override.start);
  if (override.end != null) evs = evs.filter(e => e.mins <= override.end);
  if (!evs.length) return [];

  const blocks = [];
  let prevEnd = null;
  for (const ev of evs) {
    let start = prevEnd == null ? ev.mins - cap : Math.max(prevEnd, ev.mins - cap);
    if (override.start != null && prevEnd == null) start = override.start; // force day start
    const minutes = Math.max(0, ev.mins - start);
    blocks.push({ startMin: start, endMin: ev.mins, minutes, project: ev.project, source: ev.source, text: ev.text });
    prevEnd = ev.mins;
  }
  // force day end: extend (or clamp) the last block to the override end
  if (override.end != null && blocks.length) {
    const last = blocks[blocks.length - 1];
    last.endMin = override.end;
    last.minutes = Math.max(0, override.end - last.startMin);
  }
  return blocks;
}

export function computeTimesheet(data, logsMd, cfg) {
  const projectMap = cfg.repoToProject ?? {};
  const rules = cfg.logRules ?? [];
  const fallback = cfg.fallbackProject ?? 'Life OS / Ops';
  const exclude = new Set(cfg.excludeRepos ?? []);
  const offset = cfg.tzOffsetMinutes ?? 120;
  const cap = cfg.blockCapMinutes ?? 60;
  const overrides = cfg.dayOverrides ?? {};

  const events = [];
  for (const repo of data.repos ?? []) {
    if (exclude.has(repo.name)) continue;
    for (const c of repo.commits ?? []) {
      const { date, mins } = utcToLocal(c.date, offset);
      events.push({ date, mins, project: mapRepoProject(repo.name, projectMap), source: 'commit', text: c.subject });
    }
  }
  if (logsMd) events.push(...parseLogEvents(logsMd, rules, fallback));

  const byDateMap = new Map();
  for (const ev of events) {
    if (!byDateMap.has(ev.date)) byDateMap.set(ev.date, []);
    byDateMap.get(ev.date).push(ev);
  }

  const byDay = [];
  const projTotals = new Map();
  for (const date of [...byDateMap.keys()].sort()) {
    const ov = overrides[date] ?? {};
    const blocks = blocksForDay(byDateMap.get(date), cap, {
      start: ov.start != null ? hhmmToMin(ov.start) : null,
      end: ov.end != null ? hhmmToMin(ov.end) : null,
    });
    let dayMinutes = 0;
    const perProjectMin = {};
    for (const b of blocks) {
      dayMinutes += b.minutes;
      projTotals.set(b.project, (projTotals.get(b.project) ?? 0) + b.minutes);
      perProjectMin[b.project] = (perProjectMin[b.project] ?? 0) + b.minutes;
    }
    const window = blocks.length
      ? { start: minutesToClock(blocks[0].startMin), end: minutesToClock(blocks[blocks.length - 1].endMin) }
      : null;
    byDay.push({ date, label: localDayLabel(date), dayMinutes, window, perProjectMin, blocks });
  }

  const totalMinutes = [...projTotals.values()].reduce((a, b) => a + b, 0);
  const projects = [...projTotals.entries()]
    .map(([project, minutes]) => ({
      project, minutes,
      hours: +(minutes / 60).toFixed(1),
      pct: totalMinutes ? +(minutes / totalMinutes * 100).toFixed(1) : 0,
    }))
    .sort((a, b) => b.minutes - a.minutes);

  return {
    range: data.range, tzOffsetMin: offset, blockCapMin: cap,
    totalMinutes, totalHours: +(totalMinutes / 60).toFixed(1),
    activeDays: byDay.filter(d => d.dayMinutes > 0).length,
    projects, byDay,
  };
}

// Adapter to the renderer's expected shape (byProject + days).
export function deriveTimesheet(data, logsMd, cfg) {
  const ts = computeTimesheet(data, logsMd, cfg);
  return {
    range: ts.range,
    totalHours: ts.totalHours,
    byProject: ts.projects.filter(p => p.hours > 0).map(p => ({ name: p.project, hours: p.hours, pct: p.pct / 100 })),
    days: ts.byDay.filter(d => d.dayMinutes > 0).map(d => ({
      date: d.date,
      label: d.label,
      window: d.window,
      hours: +(d.dayMinutes / 60).toFixed(1),
      perProject: Object.fromEntries(
        Object.entries(d.perProjectMin)
          .map(([k, v]) => [k, +(v / 60).toFixed(1)])
          .filter(([, h]) => h > 0)
          .sort((a, b) => b[1] - a[1])
      ),
    })),
  };
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) if (argv[i] === '--range') args.range = argv[++i];
  if (!args.range) { console.error('Usage: timesheet.mjs --range <from>_to_<to>'); process.exit(1); }
  return args;
}

function main() {
  const { range } = parseArgs(process.argv.slice(2));
  const config = JSON.parse(readFileSync(resolve(ROOT, 'config.json'), 'utf8'));
  const cfg = config.timesheet ?? {};
  const data = JSON.parse(readFileSync(resolve(ROOT, 'data', `${range}.json`), 'utf8'));
  const logsPath = resolve(ROOT, 'data', `${range}.logs.md`);
  const logsMd = existsSync(logsPath) ? readFileSync(logsPath, 'utf8') : null;
  if (!logsMd) console.error('[timesheet] no logs digest found — computing from commits only');

  const ts = computeTimesheet(data, logsMd, cfg);
  const outPath = resolve(ROOT, 'data', `${range}.timesheet.json`);
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(deriveTimesheet(data, logsMd, cfg), null, 2));
  console.error(`Wrote ${outPath} — ${ts.totalHours}h across ${ts.projects.length} projects, ${ts.activeDays} active days`);
  for (const p of ts.projects) console.error(`  ${String(p.hours.toFixed(1)).padStart(6)}h  ${String(p.pct.toFixed(1)).padStart(5)}%  ${p.project}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main();
