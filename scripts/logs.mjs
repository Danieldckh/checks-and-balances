import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

function die(msg) {
  console.error(msg);
  process.exit(1);
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--from') args.from = argv[++i];
    else if (argv[i] === '--to') args.to = argv[++i];
  }
  if (!args.from || !args.to) die('Usage: logs.mjs --from YYYY-MM-DD --to YYYY-MM-DD');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(args.from)) die('--from must be YYYY-MM-DD');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(args.to)) die('--to must be YYYY-MM-DD');
  return args;
}

function loadDotEnv() {
  const envPath = resolve(ROOT, '.env');
  if (!existsSync(envPath)) return {};
  const out = {};
  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/i);
    if (!m) continue;
    let val = m[2];
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    out[m[1]] = val;
  }
  return out;
}

export function datesInRange(from, to) {
  // Format in LOCAL time — toISOString() shifts to UTC, which on a UTC+N machine
  // walks every date back a day and silently drops the last day of the range.
  const pad = n => String(n).padStart(2, '0');
  const fmt = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const out = [];
  for (let d = new Date(`${from}T00:00`); d <= new Date(`${to}T00:00`); d.setDate(d.getDate() + 1)) {
    out.push(fmt(d));
  }
  return out;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const dir = loadDotEnv().OBSIDIAN_DAILY_LOG_DIR ?? process.env.OBSIDIAN_DAILY_LOG_DIR;
  if (!dir) die('No OBSIDIAN_DAILY_LOG_DIR. Put it in .env (see .env.example) — the vault daily-log folder.');
  if (!existsSync(dir)) die(`Daily-log folder not found: ${dir}`);

  const rangeToken = `${args.from}_to_${args.to}`;
  const sections = [];
  let found = 0;

  for (const date of datesInRange(args.from, args.to)) {
    const file = resolve(dir, `${date}.md`);
    if (!existsSync(file)) continue;
    found++;
    // Drop the per-file H1 + Parent line; re-head each day so the combined file scans cleanly.
    const body = readFileSync(file, 'utf8')
      .replace(/^#\s.*\r?\n/, '')
      .replace(/^\s*Parent:.*\r?\n/m, '')
      .trim();
    sections.push(`## ${date}\n\n${body}`);
  }

  const outPath = resolve(ROOT, 'data', `${rangeToken}.logs.md`);
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(
    outPath,
    `# Daily logs ${args.from} – ${args.to}\n\n${sections.join('\n\n')}\n`,
  );
  console.error(`Wrote ${outPath} (${found} day file(s) found in range)`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main();
