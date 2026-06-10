// Git-based collector — bypasses the GitHub REST API entirely.
// Shallow-clones the active repos with --shallow-since and extracts commits
// via `git log`. Uses the PAT from .env for HTTPS auth.
//
// Usage:  node scripts/collect-git.mjs --from YYYY-MM-DD --to YYYY-MM-DD
import { execSync, spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const FIELD_SEP = '<<<FIELD>>>';
const RECORD_SEP = '<<<RECORD>>>';

function loadDotEnv() {
  const envPath = resolve(ROOT, '.env');
  if (!existsSync(envPath)) return {};
  const out = {};
  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/i);
    if (!m) continue;
    let val = m[2];
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
    out[m[1]] = val;
  }
  return out;
}

const DOTENV = loadDotEnv();
const TOKEN = DOTENV.GITHUB_TOKEN ?? DOTENV.GH_TOKEN ?? process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN;
if (!TOKEN) { console.error('No GITHUB_TOKEN in .env'); process.exit(1); }

const KNOWN_ACTIVE = [
  'Agri360',
  'mahindra-crm',
  'meeting-notes-generator',
  'postpilot',
  'secretary-transcribe',
  'video-request-form-2',
];

const KNOWN_INACTIVE = [
  { name: 'sitecraft-app',          lastPushBeforeRange: '2026-04-16' },
  { name: 'voice-over-agent',       lastPushBeforeRange: '2026-04-14' },
  { name: 'checklist-Agri360',      lastPushBeforeRange: '2026-04-30' },
  { name: 'Editable-booking-form',  lastPushBeforeRange: '2026-04-30' },
  { name: 'secure-signature-page',  lastPushBeforeRange: '2026-04-29' },
  { name: 'Booking-Form-Esign',     lastPushBeforeRange: '2026-04-30' },
  { name: 'Client-Lookup',          lastPushBeforeRange: '2026-04-30' },
];

const KNOWN_NEW_IN_RANGE = new Set(['postpilot', 'secretary-transcribe', 'mahindra-crm']);

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--from') args.from = argv[++i];
    else if (argv[i] === '--to') args.to = argv[++i];
  }
  if (!args.from || !args.to) { console.error('Usage: collect-git.mjs --from YYYY-MM-DD --to YYYY-MM-DD'); process.exit(1); }
  return args;
}

function readConfig() {
  return JSON.parse(readFileSync(resolve(ROOT, 'config.json'), 'utf8'));
}

function gitClone(repoName, cloneDir, shallowSince) {
  const url = `https://x-access-token:${TOKEN}@github.com/Danieldckh/${repoName}.git`;
  const res = spawnSync('git', ['clone', '--bare', '--quiet', `--shallow-since=${shallowSince}`, url, cloneDir], { stdio: ['ignore', 'inherit', 'pipe'] });
  if (res.status !== 0) {
    rmSync(cloneDir, { recursive: true, force: true });
    const fallback = spawnSync('git', ['clone', '--bare', '--quiet', url, cloneDir], { stdio: ['ignore', 'inherit', 'pipe'] });
    if (fallback.status !== 0) {
      throw new Error(`git clone failed for ${repoName}: ${fallback.stderr?.toString() ?? ''}`);
    }
  }
}

function gitLog(cloneDir, sinceIso, untilIso) {
  const fmt = `%H${FIELD_SEP}%aI${FIELD_SEP}%ae${FIELD_SEP}%aN${FIELD_SEP}%B${RECORD_SEP}`;
  const res = spawnSync('git', [
    `--git-dir=${cloneDir}`,
    'log',
    `--since=${sinceIso}`,
    `--until=${untilIso}`,
    `--format=${fmt}`,
    '--no-merges',
    '--all',
  ], { encoding: 'utf8', maxBuffer: 200 * 1024 * 1024 });
  if (res.status !== 0) {
    throw new Error(`git log failed in ${cloneDir}: ${res.stderr ?? ''}`);
  }
  const commits = [];
  for (const rec of res.stdout.split(RECORD_SEP)) {
    const trimmed = rec.replace(/^\n+/, '');
    if (!trimmed) continue;
    const fields = trimmed.split(FIELD_SEP);
    if (fields.length < 5) continue;
    const [sha, date, email, name, message] = fields;
    if (!sha) continue;
    const clean = message.replace(/\n+$/, '');
    const [subject, ...bodyLines] = clean.split('\n');
    commits.push({
      sha,
      date,
      author: { login: null, email, name },
      subject,
      body: bodyLines.join('\n').trim(),
      files: [],
    });
  }
  return commits;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const config = readConfig();
  const fromIso = `${args.from}T00:00:00Z`;
  const toEndIso = `${args.to}T23:59:59Z`;

  const cacheRoot = resolve(tmpdir(), 'checks-and-balances-clones');
  mkdirSync(cacheRoot, { recursive: true });

  const out = {
    range: { from: args.from, to: args.to },
    generatedAt: new Date().toISOString(),
    author: config.author,
    repos: [],
  };

  for (const name of KNOWN_ACTIVE) {
    console.error(`  Danieldckh/${name} ...`);
    const cloneDir = resolve(cacheRoot, `${name}.git`);
    if (existsSync(cloneDir)) rmSync(cloneDir, { recursive: true, force: true });
    gitClone(name, cloneDir, args.from);
    const commits = gitLog(cloneDir, fromIso, toEndIso);
    console.error(`    ${commits.length} commits in range`);
    out.repos.push({
      name,
      private: false,
      isNewInRange: KNOWN_NEW_IN_RANGE.has(name) && commits.length > 0,
      lastPushBeforeRange: null,
      commits,
    });
  }

  for (const inactive of KNOWN_INACTIVE) {
    out.repos.push({
      name: inactive.name,
      private: false,
      isNewInRange: false,
      lastPushBeforeRange: inactive.lastPushBeforeRange,
      commits: [],
    });
  }

  const rangeToken = `${args.from}_to_${args.to}`;
  const outPath = resolve(ROOT, 'data', `${rangeToken}.json`);
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(out, null, 2));
  console.error(`Wrote ${outPath}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main();
