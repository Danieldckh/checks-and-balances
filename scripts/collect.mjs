import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

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

const DOTENV = loadDotEnv();
const TOKEN = DOTENV.GITHUB_TOKEN ?? DOTENV.GH_TOKEN ?? process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN;

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

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function gh(pathAndQuery, attempt = 0) {
  if (!TOKEN) die('No GitHub token. Put GITHUB_TOKEN in .env (see .env.example).');
  const url = pathAndQuery.startsWith('http') ? pathAndQuery : `https://api.github.com${pathAndQuery}`;
  // Light throttle between every request to stay under the secondary rate limit.
  await sleep(350);
  const res = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${TOKEN}`,
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'checks-and-balances-collector',
    },
  });
  if (res.status === 409) return { data: [], linkHeader: null }; // empty repo
  // Retry secondary-rate-limit 403/429 by honoring Retry-After (or backing off).
  if ((res.status === 403 || res.status === 429) && attempt < 5) {
    const retryAfter = parseInt(res.headers.get('retry-after') ?? '', 10);
    const waitMs = (isFinite(retryAfter) && retryAfter > 0 ? retryAfter : Math.min(60, 5 * 2 ** attempt)) * 1000;
    process.stderr.write(`[rate-limited, sleeping ${Math.round(waitMs / 1000)}s] `);
    await sleep(waitMs);
    return gh(pathAndQuery, attempt + 1);
  }
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`GitHub API ${res.status} for ${url}: ${body.slice(0, 400)}`);
  }
  return { data: await res.json(), linkHeader: res.headers.get('link') };
}

function nextPageUrl(linkHeader) {
  if (!linkHeader) return null;
  for (const part of linkHeader.split(',')) {
    const m = part.match(/<([^>]+)>;\s*rel="next"/);
    if (m) return m[1];
  }
  return null;
}

async function ghPaginate(pathAndQuery) {
  const all = [];
  let next = pathAndQuery;
  while (next) {
    const { data, linkHeader } = await gh(next);
    if (Array.isArray(data)) all.push(...data);
    else all.push(data);
    next = nextPageUrl(linkHeader);
  }
  return all;
}

function readConfig() {
  return JSON.parse(readFileSync(resolve(ROOT, 'config.json'), 'utf8'));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const config = readConfig();
  const owner = config.githubLogin;

  const fromIso = `${args.from}T00:00:00Z`;
  const toEndIso = `${args.to}T23:59:59Z`;

  console.error(`Listing repos owned by ${owner}...`);
  const repos = (await ghPaginate(`/user/repos?affiliation=owner&per_page=100`))
    .filter(r => r.owner.login === owner);

  const out = {
    range: { from: args.from, to: args.to },
    generatedAt: new Date().toISOString(),
    author: config.author,
    repos: [],
  };

  const rangeToken = `${args.from}_to_${args.to}`;
  const outPath = resolve(ROOT, 'data', `${rangeToken}.json`);
  mkdirSync(dirname(outPath), { recursive: true });
  const saveCheckpoint = () => writeFileSync(outPath, JSON.stringify(out, null, 2));

  for (const repo of repos) {
    process.stderr.write(`  ${repo.full_name} ... `);

    // Skip cheaply: if repo.pushed_at predates the range, we know there are no in-range commits.
    // pushed_at and created_at are already in the /user/repos response — no extra calls needed.
    const pushedAt = repo.pushed_at;
    const createdAt = repo.created_at;
    const isNewInRange = createdAt >= fromIso;
    const lastPushBeforeRange = pushedAt && pushedAt < fromIso ? pushedAt.slice(0, 10) : null;

    if (pushedAt && pushedAt < fromIso) {
      process.stderr.write(`inactive (last push ${lastPushBeforeRange})\n`);
      out.repos.push({ name: repo.name, private: repo.private, isNewInRange, lastPushBeforeRange, commits: [] });
      continue;
    }

    let inRange = [];
    try {
      inRange = await ghPaginate(
        `/repos/${repo.full_name}/commits?since=${fromIso}&until=${toEndIso}&per_page=100`,
      );
    } catch (err) {
      if (!/\b409\b/.test(err.message)) throw err;
    }

    const commits = inRange.map(c => ({
      sha: c.sha,
      date: c.commit.author.date,
      author: { login: c.author?.login ?? null, email: c.commit.author.email },
      subject: c.commit.message.split('\n')[0],
      body: c.commit.message.split('\n').slice(1).join('\n').trim(),
      files: [],
    }));

    process.stderr.write(`${commits.length} commits in range${isNewInRange ? ' (new repo)' : ''}\n`);

    out.repos.push({
      name: repo.name,
      private: repo.private,
      isNewInRange,
      lastPushBeforeRange,
      commits,
    });
    saveCheckpoint();
  }

  saveCheckpoint();
  console.error(`Wrote ${outPath}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main();
