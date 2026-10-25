import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const DAY_MS = 24 * 60 * 60 * 1000;

export function deriveStats(data, opts = {}) {
  const exclude = new Set(opts.exclude ?? []);
  const { from, to } = data.range;
  const fromDate = new Date(`${from}T00:00:00Z`);
  const toDate = new Date(`${to}T00:00:00Z`);

  const dailyVolume = [];
  for (let t = fromDate.getTime(); t <= toDate.getTime(); t += DAY_MS) {
    const d = new Date(t);
    const iso = d.toISOString().slice(0, 10);
    const label = `${MONTHS[d.getUTCMonth()].slice(0, 3)} ${d.getUTCDate()}`;
    dailyVolume.push({ date: iso, label, count: 0 });
  }
  const byDate = new Map(dailyVolume.map(d => [d.date, d]));

  let commitsPushed = 0;
  const activeDays = new Set();
  const perRepo = [];
  const inactiveRepos = [];

  for (const repo of data.repos) {
    if (exclude.has(repo.name)) continue;
    if (repo.commits.length === 0) {
      inactiveRepos.push({ name: repo.name, lastPushBeforeRange: repo.lastPushBeforeRange });
      continue;
    }
    perRepo.push({ name: repo.name, commits: repo.commits.length, isNewInRange: repo.isNewInRange });
    for (const c of repo.commits) {
      commitsPushed++;
      const date = c.date.slice(0, 10);
      activeDays.add(date);
      const bucket = byDate.get(date);
      if (bucket) bucket.count++;
    }
  }

  const reposShippedTo = perRepo.length;
  const newAppsLaunched = perRepo.filter(r => r.isNewInRange && r.commits >= 3).length;
  const sameYear = fromDate.getUTCFullYear() === toDate.getUTCFullYear();
  const sameMonth = sameYear && fromDate.getUTCMonth() === toDate.getUTCMonth();

  return {
    range: data.range,
    heroStats: { commitsPushed, activeWorkdays: activeDays.size, reposShippedTo, newAppsLaunched },
    dailyVolume,
    perRepo,
    inactiveRepos,
    monthLabel: MONTHS[fromDate.getUTCMonth()],
    yearLabel: String(fromDate.getUTCFullYear()),
    singleMonth: sameMonth,
  };
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--range') args.range = argv[++i];
    else if (argv[i] === '--exclude') args.exclude = argv[++i];
  }
  if (!args.range) {
    console.error('Usage: stats.mjs --range <from>_to_<to> [--exclude repo,repo]');
    process.exit(1);
  }
  return args;
}

function main() {
  const { range, exclude } = parseArgs(process.argv.slice(2));
  const excluded = exclude ? exclude.split(',').map(s => s.trim()).filter(Boolean) : [];
  const inPath = resolve(ROOT, 'data', `${range}.json`);
  const outPath = resolve(ROOT, 'data', `${range}.stats.json`);
  const data = JSON.parse(readFileSync(inPath, 'utf8'));
  const stats = deriveStats(data, { exclude: excluded });
  if (excluded.length) console.error(`Excluded from totals: ${excluded.join(', ')}`);
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(stats, null, 2));
  console.error(`Wrote ${outPath}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main();
