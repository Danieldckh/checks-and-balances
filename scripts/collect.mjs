import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
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
  if (!args.from || !args.to) die('Usage: collect.mjs --from YYYY-MM-DD --to YYYY-MM-DD');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(args.from)) die('--from must be YYYY-MM-DD');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(args.to)) die('--to must be YYYY-MM-DD');
  return args;
}

function ensureGh() {
  try {
    execSync('gh --version', { stdio: 'ignore' });
  } catch {
    die('gh not found on PATH. Install GitHub CLI from https://cli.github.com/');
  }
  try {
    execSync('gh auth status', { stdio: 'ignore', env: ghEnv() });
  } catch {
    die('gh not authenticated. Run: gh auth login');
  }
}

// IMPORTANT: clear GITHUB_TOKEN from the env we pass to gh.
// On this machine, a stale GITHUB_TOKEN is set which overrides the keyring auth
// and makes `gh` fail with 401. Clearing it forces gh to fall back to keyring auth.
function ghEnv() {
  const env = { ...process.env };
  delete env.GITHUB_TOKEN;
  delete env.GH_TOKEN;
  return env;
}

function ghLines(endpoint) {
  const cmd = `gh api --paginate "${endpoint}" -q ".[]"`;
  const out = execSync(cmd, { encoding: 'utf8', maxBuffer: 200 * 1024 * 1024, env: ghEnv() });
  return out.trim().split('\n').filter(Boolean).map(line => JSON.parse(line));
}

function ghOne(endpoint) {
  return JSON.parse(execSync(`gh api "${endpoint}"`, { encoding: 'utf8', maxBuffer: 50 * 1024 * 1024, env: ghEnv() }));
}

function readConfig() {
  return JSON.parse(readFileSync(resolve(ROOT, 'config.json'), 'utf8'));
}

function main() {
  ensureGh();
  const args = parseArgs(process.argv.slice(2));
  const config = readConfig();
  const owner = config.githubLogin;

  const fromIso = `${args.from}T00:00:00Z`;
  const toEndIso = `${args.to}T23:59:59Z`;
  const beforeRangeIso = new Date(new Date(fromIso).getTime() - 1000).toISOString();

  console.error(`Listing repos owned by ${owner}...`);
  const repos = ghLines(`/user/repos?affiliation=owner&per_page=100`)
    .filter(r => r.owner.login === owner);

  const out = {
    range: { from: args.from, to: args.to },
    generatedAt: new Date().toISOString(),
    author: config.author,
    repos: [],
  };

  for (const repo of repos) {
    console.error(`  ${repo.full_name} ...`);
    let inRange = [];
    try {
      inRange = ghLines(
        `/repos/${repo.full_name}/commits?since=${fromIso}&until=${toEndIso}&per_page=100`,
      );
    } catch (err) {
      // Empty repos return 409 Conflict; treat as zero commits.
      if (!/409/.test(err.message)) throw err;
    }

    let isNewInRange = false;
    let lastPushBeforeRange = null;

    if (inRange.length === 0) {
      try {
        const latest = ghLines(`/repos/${repo.full_name}/commits?per_page=1`);
        if (latest.length > 0) lastPushBeforeRange = latest[0].commit.author.date.slice(0, 10);
      } catch (err) {
        if (!/409/.test(err.message)) throw err;
      }
    } else {
      let beforeFirst = [];
      try {
        beforeFirst = ghLines(`/repos/${repo.full_name}/commits?per_page=1&until=${beforeRangeIso}`);
      } catch (err) {
        if (!/409/.test(err.message)) throw err;
      }
      isNewInRange = beforeFirst.length === 0;
      if (!isNewInRange && beforeFirst[0]) {
        lastPushBeforeRange = beforeFirst[0].commit.author.date.slice(0, 10);
      }
    }

    const commits = [];
    for (const c of inRange) {
      const detail = ghOne(`/repos/${repo.full_name}/commits/${c.sha}`);
      commits.push({
        sha: detail.sha,
        date: detail.commit.author.date,
        author: { login: detail.author?.login ?? null, email: detail.commit.author.email },
        subject: detail.commit.message.split('\n')[0],
        body: detail.commit.message.split('\n').slice(1).join('\n').trim(),
        files: (detail.files || []).map(f => f.filename),
      });
    }

    out.repos.push({
      name: repo.name,
      private: repo.private,
      isNewInRange,
      lastPushBeforeRange,
      commits,
    });
  }

  const rangeToken = `${args.from}_to_${args.to}`;
  const outPath = resolve(ROOT, 'data', `${rangeToken}.json`);
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(out, null, 2));
  console.error(`Wrote ${outPath}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main();
