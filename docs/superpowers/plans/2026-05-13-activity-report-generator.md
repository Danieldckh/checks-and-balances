# Activity Report Generator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reproduce the design of `Daniel-May-2026-Activity-Report.pdf` as a Claude-driven generator that produces an equivalent PDF for any user-chosen date range, from the GitHub commit log of repos owned by `github.com/Danieldckh`.

**Architecture:** Three Node scripts (collect → stats → render) plus a CLAUDE.md that orchestrates them through Claude in chat. The user reviews a markdown draft between stats and render. PDF is produced by Playwright from a styled HTML template.

**Tech Stack:** Node.js (≥20), Playwright (Chromium), `gray-matter`, `marked`, GitHub CLI (`gh`).

**Spec:** `docs/superpowers/specs/2026-05-13-activity-report-generator-design.md`

---

## File structure

```
Checks and Balances/
├── .gitignore
├── CLAUDE.md
├── README.md
├── config.json
├── package.json
│
├── scripts/
│   ├── collect.mjs            # gh API → data/<range>.json (CLI + pure helpers, separated by entry-point check)
│   ├── stats.mjs              # data → data/<range>.stats.json
│   └── render.mjs             # draft.md + stats → out/<name>.pdf
│
├── templates/
│   ├── _tokens.css            # color/typography tokens
│   ├── report.html            # PDF template with {{placeholders}}
│   └── draft-template.md      # skeleton Claude fills in
│
├── test/
│   ├── fixtures/
│   │   ├── sample-data.json
│   │   └── sample-draft.md
│   ├── stats.test.mjs
│   ├── render-parse-draft.test.mjs
│   └── render-bar-chart.test.mjs
│
├── data/                      # gitignored, regenerated per run
├── drafts/                    # editable narrative source per run
└── out/                       # final PDFs per run
```

Each script uses the pattern:

```js
import { pathToFileURL } from 'node:url';
// ...pure exports...
if (import.meta.url === pathToFileURL(process.argv[1]).href) main();
```

so test files can import pure helpers without triggering `main()`.

---

## Task 1: Project bootstrap

**Files:**
- Create: `.gitignore`
- Create: `package.json`
- Create: `config.json`
- Create: `README.md` (stub — fleshed out in Task 9)

- [ ] **Step 1: Initialize git repository**

Run: `git init`
Expected: `Initialized empty Git repository in C:/Users/pamde/Desktop/Checks and Balances/.git/`

- [ ] **Step 2: Create `.gitignore`**

```
node_modules/
data/
drafts/
out/
*.tmp.*
.DS_Store
```

- [ ] **Step 3: Create `package.json`**

```json
{
  "name": "checks-and-balances",
  "version": "0.1.0",
  "type": "module",
  "private": true,
  "engines": {
    "node": ">=20"
  },
  "scripts": {
    "collect": "node scripts/collect.mjs",
    "stats": "node scripts/stats.mjs",
    "render": "node scripts/render.mjs",
    "test": "node --test test"
  },
  "dependencies": {
    "gray-matter": "^4.0.3",
    "marked": "^12.0.0",
    "playwright": "^1.44.0"
  }
}
```

- [ ] **Step 4: Create `config.json`**

```json
{
  "githubLogin": "Danieldckh",
  "author": { "name": "Daniel", "githubLogin": "Danieldckh" },
  "brand": {
    "line": "Agri360 · ProAgri CRM",
    "subline": "ENGINEERING ACTIVITY REPORT",
    "mark": "A"
  },
  "footerLeft": "Daniel · Danieldckh · ProAgri Engineering",
  "footerRightSuffix": "Source: GitHub commit log"
}
```

- [ ] **Step 5: Create stub `README.md`**

```markdown
# Checks and Balances

Activity report generator. See `CLAUDE.md` for the workflow.
```

- [ ] **Step 6: Install dependencies and Chromium**

Run: `npm install`
Then: `npx playwright install chromium`
Expected: Both complete without errors. `node_modules/` and Playwright's browser cache populated.

- [ ] **Step 7: Verify `gh` is installed and authenticated**

Run: `gh auth status`
Expected: Output shows logged-in user. If not, stop and run `gh auth login`. Do not skip — every subsequent task depends on this.

- [ ] **Step 8: Commit**

```bash
git add .gitignore package.json package-lock.json config.json README.md
git commit -m "chore: bootstrap project with playwright + gh deps"
```

---

## Task 2: Stats derivation (`scripts/stats.mjs`) with TDD

**Files:**
- Create: `test/fixtures/sample-data.json`
- Create: `test/stats.test.mjs`
- Create: `scripts/stats.mjs`

- [ ] **Step 1: Create the test fixture**

Write `test/fixtures/sample-data.json`:

```json
{
  "range": { "from": "2026-05-01", "to": "2026-05-03" },
  "generatedAt": "2026-05-13T12:00:00Z",
  "author": { "name": "Test", "githubLogin": "test" },
  "repos": [
    {
      "name": "alpha",
      "private": false,
      "isNewInRange": false,
      "lastPushBeforeRange": "2026-04-15",
      "commits": [
        { "sha": "a1", "date": "2026-05-01T10:00:00Z", "author": { "login": "test" }, "subject": "x", "body": "", "files": [] },
        { "sha": "a2", "date": "2026-05-01T11:00:00Z", "author": { "login": "test" }, "subject": "y", "body": "", "files": [] },
        { "sha": "a3", "date": "2026-05-03T09:00:00Z", "author": { "login": "test" }, "subject": "z", "body": "", "files": [] }
      ]
    },
    {
      "name": "beta",
      "private": false,
      "isNewInRange": true,
      "lastPushBeforeRange": null,
      "commits": [
        { "sha": "b1", "date": "2026-05-02T08:00:00Z", "author": { "login": "test" }, "subject": "init", "body": "", "files": [] },
        { "sha": "b2", "date": "2026-05-02T09:00:00Z", "author": { "login": "test" }, "subject": "more", "body": "", "files": [] },
        { "sha": "b3", "date": "2026-05-02T10:00:00Z", "author": { "login": "test" }, "subject": "more", "body": "", "files": [] }
      ]
    },
    {
      "name": "gamma",
      "private": false,
      "isNewInRange": false,
      "lastPushBeforeRange": "2026-03-10",
      "commits": []
    }
  ]
}
```

- [ ] **Step 2: Write the failing test**

Write `test/stats.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deriveStats } from '../scripts/stats.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(readFileSync(resolve(__dirname, 'fixtures/sample-data.json'), 'utf8'));

test('deriveStats: hero stats reflect commit volume and repo state', () => {
  const stats = deriveStats(fixture);
  assert.equal(stats.heroStats.commitsPushed, 6);
  assert.equal(stats.heroStats.activeWorkdays, 3);
  assert.equal(stats.heroStats.reposShippedTo, 2);
  assert.equal(stats.heroStats.newAppsLaunched, 1);
});

test('deriveStats: daily volume covers every day in range, inclusive', () => {
  const stats = deriveStats(fixture);
  assert.equal(stats.dailyVolume.length, 3);
  assert.deepEqual(stats.dailyVolume.map(d => d.date), [
    '2026-05-01', '2026-05-02', '2026-05-03',
  ]);
  assert.deepEqual(stats.dailyVolume.map(d => d.count), [2, 3, 1]);
  assert.equal(stats.dailyVolume[0].label, 'May 1');
});

test('deriveStats: per-repo and inactive-repo lists separated correctly', () => {
  const stats = deriveStats(fixture);
  assert.deepEqual(
    stats.perRepo.map(r => r.name).sort(),
    ['alpha', 'beta'],
  );
  assert.deepEqual(stats.inactiveRepos, [
    { name: 'gamma', lastPushBeforeRange: '2026-03-10' },
  ]);
});

test('deriveStats: month/year labels and singleMonth flag', () => {
  const stats = deriveStats(fixture);
  assert.equal(stats.monthLabel, 'May');
  assert.equal(stats.yearLabel, '2026');
  assert.equal(stats.singleMonth, true);
});

test('deriveStats: singleMonth is false when range crosses months', () => {
  const data = {
    ...fixture,
    range: { from: '2026-04-28', to: '2026-05-03' },
  };
  const stats = deriveStats(data);
  assert.equal(stats.singleMonth, false);
});

test('deriveStats: newAppsLaunched floor — only counts new repos with ≥3 commits', () => {
  const data = {
    ...fixture,
    repos: [
      {
        name: 'sparse-new',
        private: false,
        isNewInRange: true,
        lastPushBeforeRange: null,
        commits: [
          { sha: 's1', date: '2026-05-01T09:00:00Z', author: { login: 'test' }, subject: 'init', body: '', files: [] },
          { sha: 's2', date: '2026-05-01T10:00:00Z', author: { login: 'test' }, subject: 'more', body: '', files: [] },
        ],
      },
    ],
  };
  const stats = deriveStats(data);
  assert.equal(stats.heroStats.newAppsLaunched, 0);
});
```

- [ ] **Step 3: Run the test and confirm it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module '../scripts/stats.mjs'` (file doesn't exist yet).

- [ ] **Step 4: Implement `scripts/stats.mjs`**

```js
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

export function deriveStats(data) {
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
  }
  if (!args.range) {
    console.error('Usage: stats.mjs --range <from>_to_<to>');
    process.exit(1);
  }
  return args;
}

function main() {
  const { range } = parseArgs(process.argv.slice(2));
  const inPath = resolve(ROOT, 'data', `${range}.json`);
  const outPath = resolve(ROOT, 'data', `${range}.stats.json`);
  const data = JSON.parse(readFileSync(inPath, 'utf8'));
  const stats = deriveStats(data);
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(stats, null, 2));
  console.error(`Wrote ${outPath}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main();
```

- [ ] **Step 5: Run tests and confirm they pass**

Run: `npm test`
Expected: All six `deriveStats` tests pass.

- [ ] **Step 6: Commit**

```bash
git add scripts/stats.mjs test/stats.test.mjs test/fixtures/sample-data.json
git commit -m "feat(stats): derive hero stats and daily volume from collected data"
```

---

## Task 3: Data collection (`scripts/collect.mjs`)

This task has no unit test — every meaningful function calls out to `gh`. The smoke test happens in Task 10.

**Files:**
- Create: `scripts/collect.mjs`

- [ ] **Step 1: Implement `scripts/collect.mjs`**

```js
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
    execSync('gh auth status', { stdio: 'ignore' });
  } catch {
    die('gh not authenticated. Run: gh auth login');
  }
}

function ghLines(endpoint) {
  const cmd = `gh api --paginate "${endpoint}" -q ".[]"`;
  const out = execSync(cmd, { encoding: 'utf8', maxBuffer: 200 * 1024 * 1024 });
  return out.trim().split('\n').filter(Boolean).map(line => JSON.parse(line));
}

function ghOne(endpoint) {
  return JSON.parse(execSync(`gh api "${endpoint}"`, { encoding: 'utf8', maxBuffer: 50 * 1024 * 1024 }));
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
```

- [ ] **Step 2: Run against a known recent range as a smoke check**

Run: `node scripts/collect.mjs --from 2026-05-01 --to 2026-05-02`
Expected: Console logs each repo being listed. A file `data/2026-05-01_to_2026-05-02.json` is created. Open it and check: `repos` is an array, each repo has the expected fields, at least one repo has commits.

If `409 Conflict` or auth errors appear, fix them before proceeding.

- [ ] **Step 3: Commit**

```bash
git add scripts/collect.mjs
git commit -m "feat(collect): pull commits + per-commit detail from gh into data/<range>.json"
```

---

## Task 4: Templates — CSS tokens, draft skeleton, HTML

**Files:**
- Create: `templates/_tokens.css`
- Create: `templates/draft-template.md`
- Create: `templates/report.html`

- [ ] **Step 1: Create `templates/_tokens.css`**

```css
:root {
  --ink: #1a1d1f;
  --rule: #d8dcd2;
  --brand: #1f4d2c;
  --brand-tint: #e8efe2;
  --eyebrow: #2d6a3f;
  --muted: #5a6068;
  --bar-zero: #c8d0c2;

  --font-display: 'Fraunces', Georgia, serif;
  --font-body: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
}
```

- [ ] **Step 2: Create `templates/draft-template.md`**

```markdown
---
title: <Month> <Year> Activity Report
period: <D>–<D> <Month> <Year>
generated: <D Month Year>
heroStats:
  commitsPushed: 0
  activeWorkdays: 0
  reposShippedTo: 0
  newAppsLaunched: 0
---

## Lead
One or two sentences. Scope, timeframe in words, what the reader is looking at.

## Executive summary
One paragraph. Streams of work, commit counts per stream, new apps and their URLs.
Note repos with no activity if it matters.

## Initiatives

### Initiative title
- repo: <Repo name>
- kind: <AGRI360 | NEW APP | …>

Body, 2–5 sentences. Specific, technical. Quote real code identifiers and file paths
from commit messages. Past tense, active voice.

### Another initiative title
- repo: <Repo name>
- kind: <AGRI360 | NEW APP | …>

Body.

## Days

### Fri 1 May
Prose for that day. Use bold lead-ins (`**Topic.**`) when the day spans multiple
sub-themes.

### Tue 5 May
Prose.

## Methodology
Generated from the Git commit log of all repositories under `github.com/Danieldckh`
with activity in <Month> <Year>. Repositories audited:

- **Danieldckh/<repo>** — description (<N> commits in <Month>).
- **Danieldckh/<repo>** — no <Month> activity (last push <date>).

**Scope note.** "Commits" counts merged work pushed to the default branch. It does *not*
include design exploration, code review, deployment debugging, production hotfixes
applied directly via Coolify, or work-in-progress branches that did not land. The true
effort hour-count exceeds what <N> commits implies.
```

- [ ] **Step 3: Create `templates/report.html`**

```html
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>{{title}}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,700&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
{{tokensCss}}

* { box-sizing: border-box; }
@page { size: A4; margin: 18mm; }
html, body { margin: 0; padding: 0; }
body {
  font-family: var(--font-body);
  color: var(--ink);
  font-size: 11pt;
  line-height: 1.5;
  print-color-adjust: exact;
  -webkit-print-color-adjust: exact;
}

.top-rule { height: 4px; background: var(--brand); margin: 0 0 24px; }

.brand-band { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 36px; }
.brand-band .mark {
  display: inline-flex; align-items: center; justify-content: center;
  width: 28px; height: 28px; background: var(--brand); color: white;
  font-family: var(--font-display); font-weight: 700; font-size: 16pt;
  border-radius: 3px; margin-right: 10px; vertical-align: middle;
}
.brand-band .brand-text { display: inline-block; vertical-align: middle; }
.brand-band .brand-line { font-weight: 700; font-size: 12pt; }
.brand-band .brand-sub { font-size: 8pt; letter-spacing: 0.18em; color: var(--muted); text-transform: uppercase; }
.brand-band .meta { font-size: 9pt; text-align: right; line-height: 1.7; }
.brand-band .meta b { font-weight: 600; }

.eyebrow { font-size: 9pt; letter-spacing: 0.22em; text-transform: uppercase; color: var(--eyebrow); margin-bottom: 6px; }
h1.title { font-family: var(--font-display); font-size: 34pt; font-weight: 700; margin: 0 0 14px; line-height: 1.05; }
.lead { font-size: 11.5pt; color: var(--ink); max-width: 80%; margin: 0 0 28px; }

.hero-stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 36px; }
.hero-stats .stat { background: var(--brand-tint); border-radius: 4px; padding: 14px 16px; }
.hero-stats .stat .num { font-family: var(--font-display); font-weight: 700; font-size: 26pt; line-height: 1; color: var(--brand); }
.hero-stats .stat .label { font-size: 8pt; letter-spacing: 0.18em; text-transform: uppercase; color: var(--ink); margin-top: 8px; }

hr.sep { border: 0; border-top: 1px solid var(--rule); margin: 28px 0; }

h2.section { font-size: 11pt; font-weight: 700; letter-spacing: 0.22em; text-transform: uppercase; margin: 0 0 14px; border-bottom: 1px solid var(--rule); padding-bottom: 8px; }

p { margin: 0 0 12px; }

.initiatives { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-bottom: 28px; }
.card { border: 1px solid var(--rule); border-radius: 4px; padding: 14px 16px; page-break-inside: avoid; }
.card .eyebrow { color: var(--eyebrow); margin-bottom: 4px; font-size: 8pt; }
.card .card-title { font-weight: 700; font-size: 12pt; margin: 0 0 8px; }
.card p { font-size: 10.5pt; margin: 0; }
.card code { font-family: ui-monospace, 'Cascadia Mono', Menlo, Consolas, monospace; font-size: 9.5pt; }

.chart { margin: 8px 0 22px; }
.chart svg { width: 100%; height: 140px; display: block; }

table.daily { width: 100%; border-collapse: collapse; font-size: 10pt; }
table.daily thead th { background: var(--brand); color: white; text-align: left; padding: 10px 12px; font-size: 8.5pt; letter-spacing: 0.18em; text-transform: uppercase; }
table.daily tbody td { padding: 14px 12px; border-bottom: 1px solid var(--rule); vertical-align: top; }
table.daily tbody tr { page-break-inside: avoid; }
table.daily .col-date { width: 110px; font-weight: 600; }
table.daily .col-commits { width: 90px; }
table.daily .commit-pill { display: inline-block; width: 22px; height: 22px; line-height: 22px; text-align: center; background: var(--brand-tint); color: var(--brand); border-radius: 50%; font-weight: 600; font-size: 9.5pt; }
table.daily code { font-family: ui-monospace, 'Cascadia Mono', Menlo, Consolas, monospace; font-size: 9.5pt; }

.methodology p { font-size: 10.5pt; }
.methodology ul { margin: 8px 0 16px; padding-left: 20px; }
.methodology li { margin-bottom: 6px; }
.scope-note { border-left: 3px solid var(--brand); background: #f5f7f1; padding: 10px 12px; font-size: 9.5pt; color: var(--ink); }

.footer-rule { border-top: 1px solid var(--rule); margin-top: 28px; padding-top: 10px; display: flex; justify-content: space-between; font-size: 9pt; color: var(--muted); }
</style>
</head>
<body>

<div class="top-rule"></div>

<header class="brand-band">
  <div>
    <span class="mark">{{brandMark}}</span>
    <span class="brand-text">
      <div class="brand-line">{{brandLine}}</div>
      <div class="brand-sub">{{brandSubline}}</div>
    </span>
  </div>
  <div class="meta">
    <div><b>Period:</b> {{period}}</div>
    <div><b>Author:</b> {{authorLine}}</div>
    <div><b>Generated:</b> {{generated}}</div>
  </div>
</header>

<div class="eyebrow">Personal Checks &amp; Balances</div>
<h1 class="title">{{title}}</h1>
<p class="lead">{{leadHtml}}</p>

<section class="hero-stats">
  <div class="stat"><div class="num">{{commitsPushed}}</div><div class="label">Commits Pushed</div></div>
  <div class="stat"><div class="num">{{activeWorkdays}}</div><div class="label">Active Workdays</div></div>
  <div class="stat"><div class="num">{{reposShippedTo}}</div><div class="label">Repos Shipped To</div></div>
  <div class="stat"><div class="num">{{newAppsLaunched}}</div><div class="label">New Apps Launched</div></div>
</section>

<hr class="sep">

<h2 class="section">Executive Summary</h2>
<div>{{executiveSummaryHtml}}</div>

<div class="initiatives">{{initiativesHtml}}</div>

<h2 class="section">Daily Commit Volume</h2>
<div class="chart">{{barChartSvg}}</div>

<h2 class="section">Daily Breakdown</h2>
<table class="daily">
  <thead><tr><th class="col-date">Date</th><th class="col-commits">Commits</th><th>Summary of Work Shipped</th></tr></thead>
  <tbody>{{daysHtml}}</tbody>
</table>

<h2 class="section">Methodology &amp; Verification</h2>
<div class="methodology">{{methodologyHtml}}</div>

<div class="footer-rule">
  <div>{{footerLeft}}</div>
  <div>Generated {{generated}} · {{footerRightSuffix}}</div>
</div>

</body>
</html>
```

- [ ] **Step 4: Commit**

```bash
git add templates/_tokens.css templates/draft-template.md templates/report.html
git commit -m "feat(templates): css tokens, draft skeleton, html template"
```

---

## Task 5: Draft parser with TDD (`scripts/render.mjs` — part 1)

**Files:**
- Create: `test/fixtures/sample-draft.md`
- Create: `test/render-parse-draft.test.mjs`
- Create: `scripts/render.mjs` (with only `parseDraft` exported for now)

- [ ] **Step 1: Create `test/fixtures/sample-draft.md`**

```markdown
---
title: May 2026 Activity Report
period: 1–3 May 2026
generated: 13 May 2026
heroStats:
  commitsPushed: 6
  activeWorkdays: 3
  reposShippedTo: 2
  newAppsLaunched: 1
---

## Lead
A short lead with an inline `identifier`.

## Executive summary
Single paragraph summary.

## Initiatives

### First initiative
- repo: alpha
- kind: AGRI360

Body of the first initiative.

### Second initiative
- repo: beta
- kind: NEW APP

Body of the second initiative.

## Days

### Fri 1 May
**Lead-in.** Day-one prose.

### Sat 2 May
Day-two prose.

## Methodology
Methodology paragraph.

- **Danieldckh/alpha** — description (3 commits in May).
- **Danieldckh/beta** — new social-media scheduler (3 commits in May).

**Scope note.** A note.
```

- [ ] **Step 2: Write the failing test**

Write `test/render-parse-draft.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseDraft } from '../scripts/render.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(resolve(__dirname, 'fixtures/sample-draft.md'), 'utf8');

test('parseDraft: extracts frontmatter', () => {
  const d = parseDraft(src);
  assert.equal(d.frontmatter.title, 'May 2026 Activity Report');
  assert.equal(d.frontmatter.period, '1–3 May 2026');
  assert.equal(d.frontmatter.heroStats.commitsPushed, 6);
});

test('parseDraft: lead is markdown string', () => {
  const d = parseDraft(src);
  assert.match(d.lead, /short lead with an inline `identifier`/);
});

test('parseDraft: executive summary is markdown string', () => {
  const d = parseDraft(src);
  assert.match(d.executiveSummary, /Single paragraph summary\./);
});

test('parseDraft: initiatives parsed with title, repo, kind, body', () => {
  const d = parseDraft(src);
  assert.equal(d.initiatives.length, 2);
  assert.equal(d.initiatives[0].title, 'First initiative');
  assert.equal(d.initiatives[0].repo, 'alpha');
  assert.equal(d.initiatives[0].kind, 'AGRI360');
  assert.match(d.initiatives[0].body, /Body of the first/);
  assert.equal(d.initiatives[1].kind, 'NEW APP');
});

test('parseDraft: days parsed with date label and body', () => {
  const d = parseDraft(src);
  assert.equal(d.days.length, 2);
  assert.equal(d.days[0].label, 'Fri 1 May');
  assert.match(d.days[0].body, /\*\*Lead-in\.\*\* Day-one prose/);
  assert.equal(d.days[1].label, 'Sat 2 May');
});

test('parseDraft: methodology is the full markdown of the section', () => {
  const d = parseDraft(src);
  assert.match(d.methodology, /Methodology paragraph\./);
  assert.match(d.methodology, /Danieldckh\/alpha/);
  assert.match(d.methodology, /Scope note/);
});
```

- [ ] **Step 3: Run test and confirm it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module '../scripts/render.mjs'`.

- [ ] **Step 4: Create `scripts/render.mjs` with `parseDraft` only**

```js
import matter from 'gray-matter';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

export function parseDraft(src) {
  const { data: frontmatter, content } = matter(src);

  // Split content by top-level `## ` headings while preserving the heading text.
  const sections = {};
  const lines = content.split('\n');
  let current = null;
  let buf = [];
  const flush = () => { if (current) sections[current] = buf.join('\n').trim(); };
  for (const line of lines) {
    const m = line.match(/^##\s+(.+?)\s*$/);
    if (m) {
      flush();
      current = m[1].toLowerCase();
      buf = [];
    } else if (current) {
      buf.push(line);
    }
  }
  flush();

  const lead = sections['lead'] ?? '';
  const executiveSummary = sections['executive summary'] ?? '';
  const methodology = sections['methodology'] ?? '';

  const initiatives = parseSubsections(sections['initiatives'] ?? '').map(({ title, body }) => {
    const lines = body.split('\n');
    const meta = {};
    let bodyStart = 0;
    for (let i = 0; i < lines.length; i++) {
      const m = lines[i].match(/^- (\w+):\s*(.+?)\s*$/);
      if (m) { meta[m[1]] = m[2]; bodyStart = i + 1; }
      else if (lines[i].trim() === '') { bodyStart = i + 1; }
      else break;
    }
    const cardBody = lines.slice(bodyStart).join('\n').trim();
    return { title, repo: meta.repo ?? '', kind: meta.kind ?? '', body: cardBody };
  });

  const days = parseSubsections(sections['days'] ?? '').map(({ title, body }) => ({
    label: title,
    body,
  }));

  return { frontmatter, lead, executiveSummary, initiatives, days, methodology };
}

function parseSubsections(block) {
  const out = [];
  const lines = block.split('\n');
  let current = null;
  let buf = [];
  const flush = () => {
    if (current !== null) out.push({ title: current, body: buf.join('\n').trim() });
  };
  for (const line of lines) {
    const m = line.match(/^###\s+(.+?)\s*$/);
    if (m) {
      flush();
      current = m[1];
      buf = [];
    } else if (current !== null) {
      buf.push(line);
    }
  }
  flush();
  return out;
}

function main() {
  console.error('render: not implemented yet — see Task 7');
  process.exit(1);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main();
```

- [ ] **Step 5: Run tests and confirm they pass**

Run: `npm test`
Expected: All `parseDraft` tests pass. The earlier `deriveStats` tests still pass.

- [ ] **Step 6: Commit**

```bash
git add scripts/render.mjs test/render-parse-draft.test.mjs test/fixtures/sample-draft.md
git commit -m "feat(render): parse frontmatter and sectioned markdown drafts"
```

---

## Task 6: Bar chart SVG with TDD (`scripts/render.mjs` — part 2)

**Files:**
- Create: `test/render-bar-chart.test.mjs`
- Modify: `scripts/render.mjs` (add `buildBarChartSvg`)

- [ ] **Step 1: Write the failing test**

Write `test/render-bar-chart.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildBarChartSvg } from '../scripts/render.mjs';

const dailyVolume = [
  { date: '2026-05-01', label: 'May 1', count: 1 },
  { date: '2026-05-02', label: 'May 2', count: 0 },
  { date: '2026-05-03', label: 'May 3', count: 5 },
];

test('buildBarChartSvg: returns an svg root with viewBox', () => {
  const svg = buildBarChartSvg(dailyVolume);
  assert.match(svg, /^<svg[\s\S]*viewBox=/);
  assert.match(svg, /<\/svg>\s*$/);
});

test('buildBarChartSvg: renders one bar rect per non-zero day with count label', () => {
  const svg = buildBarChartSvg(dailyVolume);
  const barCount = (svg.match(/class="bar"/g) || []).length;
  assert.equal(barCount, 2);
  assert.ok(svg.includes('>1</text>'), 'count "1" not labelled');
  assert.ok(svg.includes('>5</text>'), 'count "5" not labelled');
});

test('buildBarChartSvg: renders zero-day glyphs distinct from bars', () => {
  const svg = buildBarChartSvg(dailyVolume);
  assert.match(svg, /class="zero"/);
});

test('buildBarChartSvg: includes every day label', () => {
  const svg = buildBarChartSvg(dailyVolume);
  assert.ok(svg.includes('>May 1</text>'));
  assert.ok(svg.includes('>May 2</text>'));
  assert.ok(svg.includes('>May 3</text>'));
});
```

- [ ] **Step 2: Run test and confirm it fails**

Run: `npm test`
Expected: FAIL — `buildBarChartSvg is not a function`.

- [ ] **Step 3: Add `buildBarChartSvg` to `scripts/render.mjs`**

Insert this near the other exports in `scripts/render.mjs`:

```js
export function buildBarChartSvg(dailyVolume, opts = {}) {
  const width = opts.width ?? 720;
  const height = opts.height ?? 140;
  const padTop = 28;
  const padBottom = 28;
  const chartH = height - padTop - padBottom;
  const n = dailyVolume.length;
  const slotW = width / n;
  const barW = Math.max(6, Math.min(28, slotW * 0.55));

  const max = Math.max(1, ...dailyVolume.map(d => d.count));

  const parts = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid meet">`,
  );
  parts.push(`<line x1="0" y1="${padTop + chartH + 0.5}" x2="${width}" y2="${padTop + chartH + 0.5}" stroke="#d8dcd2" stroke-width="1"/>`);

  for (let i = 0; i < n; i++) {
    const d = dailyVolume[i];
    const cx = slotW * i + slotW / 2;
    const x = cx - barW / 2;
    if (d.count > 0) {
      const h = (d.count / max) * chartH;
      const y = padTop + chartH - h;
      parts.push(`<rect class="bar" x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${barW.toFixed(2)}" height="${h.toFixed(2)}" fill="#1f4d2c"/>`);
      parts.push(`<text x="${cx.toFixed(2)}" y="${(y - 6).toFixed(2)}" text-anchor="middle" font-family="Inter, sans-serif" font-size="10" font-weight="600" fill="#1f4d2c">${d.count}</text>`);
    } else {
      const baseY = padTop + chartH - 4;
      parts.push(`<g class="zero" transform="translate(${(x).toFixed(2)} ${baseY.toFixed(2)})">`);
      for (let k = 0; k < 3; k++) {
        const dotX = (barW / 4) + k * (barW / 4);
        parts.push(`<circle cx="${dotX.toFixed(2)}" cy="0" r="1.4" fill="#c8d0c2"/>`);
      }
      parts.push(`</g>`);
    }
    parts.push(`<text x="${cx.toFixed(2)}" y="${(padTop + chartH + 18).toFixed(2)}" text-anchor="middle" font-family="Inter, sans-serif" font-size="9" fill="#5a6068">${d.label}</text>`);
  }

  parts.push(`</svg>`);
  return parts.join('');
}
```

- [ ] **Step 4: Run tests and confirm they pass**

Run: `npm test`
Expected: All `buildBarChartSvg` tests pass. Earlier tests still green.

- [ ] **Step 5: Commit**

```bash
git add scripts/render.mjs test/render-bar-chart.test.mjs
git commit -m "feat(render): inline-svg bar chart with zero-day glyphs"
```

---

## Task 7: HTML population and Playwright (`scripts/render.mjs` — part 3)

**Files:**
- Modify: `scripts/render.mjs` (add HTML population, filename logic, Playwright pipeline; replace stub `main`).

- [ ] **Step 1: Add `populateTemplate`, `computeOutputFilename`, `renderDraftToHtml`, and the full `main` to `scripts/render.mjs`**

Add the imports near the top:

```js
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { chromium } from 'playwright';
import { marked } from 'marked';
```

Add these exports below the existing ones, and replace the stub `main` at the bottom:

```js
export function populateTemplate(template, vars) {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => (key in vars ? String(vars[key]) : ''));
}

export function computeOutputFilename(stats, author) {
  if (stats.singleMonth) {
    return `${author.name}-${stats.monthLabel}-${stats.yearLabel}-Activity-Report.pdf`;
  }
  return `${author.name}-${stats.range.from}-to-${stats.range.to}-Activity-Report.pdf`;
}

function htmlEscape(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function renderInitiativesHtml(initiatives) {
  return initiatives.map((it, i) => `
    <div class="card">
      <div class="eyebrow">Initiative ${i + 1} · ${htmlEscape(it.kind)}</div>
      <div class="card-title">${htmlEscape(it.title)}</div>
      ${marked.parse(it.body)}
    </div>
  `).join('\n');
}

function renderDaysHtml(days, dailyVolume) {
  const countByLabel = new Map(dailyVolume.map(d => [labelToHumanLabel(d), d.count]));
  return days.map(day => {
    const count = countByLabel.get(day.label) ?? '';
    return `
      <tr>
        <td class="col-date">${htmlEscape(day.label)}</td>
        <td class="col-commits"><span class="commit-pill">${count}</span></td>
        <td>${marked.parse(day.body)}</td>
      </tr>
    `;
  }).join('\n');
}

// Daily volume produces "May 1" labels; days entries use "Fri 1 May" or similar.
// This helper extracts a comparable form. If the user picks an unusual day label,
// the pill simply renders empty — not fatal.
function labelToHumanLabel(d) {
  // returns "Fri 1 May" style — best-effort match to days[].label
  const date = new Date(`${d.date}T12:00:00Z`);
  const dow = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][date.getUTCDay()];
  const day = date.getUTCDate();
  const mon = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][date.getUTCMonth()];
  return `${dow} ${day} ${mon}`;
}

export function renderDraftToHtml({ draft, stats, config, tokensCss, template }) {
  const initiativesHtml = renderInitiativesHtml(draft.initiatives);
  const daysHtml = renderDaysHtml(draft.days, stats.dailyVolume);
  const methodologyHtml = marked.parse(
    draft.methodology.replace(/^\*\*Scope note\.\*\*([\s\S]+)$/m, (_, body) =>
      `<div class="scope-note"><b>Scope note.</b>${body}</div>`,
    ),
  );

  return populateTemplate(template, {
    tokensCss,
    title: draft.frontmatter.title,
    period: draft.frontmatter.period,
    generated: draft.frontmatter.generated,
    brandMark: config.brand.mark,
    brandLine: config.brand.line,
    brandSubline: config.brand.subline,
    authorLine: `${config.author.name} (${config.author.githubLogin})`,
    leadHtml: marked.parse(draft.lead),
    commitsPushed: draft.frontmatter.heroStats.commitsPushed,
    activeWorkdays: draft.frontmatter.heroStats.activeWorkdays,
    reposShippedTo: draft.frontmatter.heroStats.reposShippedTo,
    newAppsLaunched: draft.frontmatter.heroStats.newAppsLaunched,
    executiveSummaryHtml: marked.parse(draft.executiveSummary),
    initiativesHtml,
    barChartSvg: buildBarChartSvg(stats.dailyVolume),
    daysHtml,
    methodologyHtml,
    footerLeft: config.footerLeft,
    footerRightSuffix: config.footerRightSuffix,
  });
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--range') args.range = argv[++i];
  }
  if (!args.range) {
    console.error('Usage: render.mjs --range <from>_to_<to>');
    process.exit(1);
  }
  return args;
}

async function main() {
  const { range } = parseArgs(process.argv.slice(2));
  const config = JSON.parse(readFileSync(resolve(ROOT, 'config.json'), 'utf8'));
  const draftSrc = readFileSync(resolve(ROOT, 'drafts', `${range}.md`), 'utf8');
  const statsRaw = JSON.parse(readFileSync(resolve(ROOT, 'data', `${range}.stats.json`), 'utf8'));
  const draft = parseDraft(draftSrc);

  const template = readFileSync(resolve(ROOT, 'templates', 'report.html'), 'utf8');
  const tokensCss = readFileSync(resolve(ROOT, 'templates', '_tokens.css'), 'utf8');

  const html = renderDraftToHtml({ draft, stats: statsRaw, config, tokensCss, template });

  const htmlPath = resolve(ROOT, 'data', `${range}.rendered.html`);
  mkdirSync(dirname(htmlPath), { recursive: true });
  writeFileSync(htmlPath, html);
  console.error(`HTML written: ${htmlPath}`);

  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: 'networkidle' });
  await page.emulateMedia({ media: 'print' });

  const outName = computeOutputFilename(statsRaw, config.author);
  const outPath = resolve(ROOT, 'out', outName);
  mkdirSync(dirname(outPath), { recursive: true });
  await page.pdf({
    path: outPath,
    format: 'A4',
    printBackground: true,
    margin: { top: '18mm', right: '18mm', bottom: '18mm', left: '18mm' },
  });
  await browser.close();
  console.log(outPath);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main();
```

(The earlier `if (import.meta.url …) main()` line at the bottom of the file is being replaced — make sure only one remains.)

- [ ] **Step 2: Sanity-check that the test suite still passes**

Run: `npm test`
Expected: All tests pass — adding new exports and a new `main` should not affect the existing tests.

- [ ] **Step 3: Render against the fixture draft to validate the pipeline end-to-end without a real PDF run**

This is a smoke check, not a unit test. Manually:
1. Create `drafts/2026-05-01_to_2026-05-03.md` by copying `test/fixtures/sample-draft.md`.
2. Run `node scripts/stats.mjs --range 2026-05-01_to_2026-05-03` — but stats needs `data/2026-05-01_to_2026-05-03.json`. So instead copy `test/fixtures/sample-data.json` to `data/2026-05-01_to_2026-05-03.json`, then run stats, then run render.

Run these in order:

```powershell
Copy-Item test/fixtures/sample-data.json data/2026-05-01_to_2026-05-03.json
Copy-Item test/fixtures/sample-draft.md drafts/2026-05-01_to_2026-05-03.md
node scripts/stats.mjs --range 2026-05-01_to_2026-05-03
node scripts/render.mjs --range 2026-05-01_to_2026-05-03
```

Expected: `out/Test-May-2026-Activity-Report.pdf` exists. Open it. The brand, hero stats, executive summary, two initiative cards, bar chart with 2 bars and 1 zero-day glyph, two daily rows, and the methodology block should all render. Don't worry about prose content — the smoke test is about layout, not narrative.

Note: the fixture's author is `{ "name": "Test", "githubLogin": "test" }` but `config.json` says `Daniel`. The fixture data only matters for the *stats* JSON — the rendered PDF will still show `Daniel (Danieldckh)` from config. That's fine for this smoke test.

- [ ] **Step 4: Delete the smoke-test artefacts so they don't get committed**

```powershell
Remove-Item data/2026-05-01_to_2026-05-03.json
Remove-Item data/2026-05-01_to_2026-05-03.stats.json
Remove-Item data/2026-05-01_to_2026-05-03.rendered.html
Remove-Item drafts/2026-05-01_to_2026-05-03.md
Remove-Item out/Test-May-2026-Activity-Report.pdf
```

- [ ] **Step 5: Commit**

```bash
git add scripts/render.mjs
git commit -m "feat(render): populate template, render via playwright, name output by range"
```

---

## Task 8: `CLAUDE.md`

**Files:**
- Create: `CLAUDE.md`

- [ ] **Step 1: Write `CLAUDE.md`**

```markdown
# Activity Report Generator

This project generates a polished PDF engineering-activity report for any date range,
from the GitHub commit log of `github.com/Danieldckh`. The reference output is
`Daniel-May-2026-Activity-Report.pdf` in the project root.

## When to trigger this workflow

Run the recipe below when the user's message clearly asks for an activity report
for a date range. Trigger phrases include — but are not limited to —
"generate a report for…", "activity report for…", "checks and balances for…",
"make me the May report", or any message that names a date range with the clear
intent to produce a report.

## The recipe

1. **Parse the date range.** Convert the user's words into ISO `from` and `to`
   (inclusive). Examples: "1–12 May" → `2026-05-01` / `2026-05-12`. "the first
   week of May" → `2026-05-01` / `2026-05-07`. If genuinely ambiguous, ask once,
   then proceed.

2. **Collect commits.** Run:
   ```
   node scripts/collect.mjs --from <from> --to <to>
   ```
   This writes `data/<from>_to_<to>.json`. If it errors with `gh not authenticated`,
   stop and tell the user to run `gh auth login`.

3. **Compute stats.** Run:
   ```
   node scripts/stats.mjs --range <from>_to_<to>
   ```
   This writes `data/<from>_to_<to>.stats.json`. Read it.

4. **Draft the narrative.** Copy `templates/draft-template.md` to
   `drafts/<from>_to_<to>.md` and fill it in based on the JSON files from
   steps 2 and 3. Follow the **Drafting guide** below.

5. **Hand off.** Tell the user the draft is at `drafts/<from>_to_<to>.md` and
   wait. They may say "render", "looks good", "go", or edit the file directly.
   When they ask to render, **re-read the draft from disk first** in case they
   edited it.

6. **Render.** Run:
   ```
   node scripts/render.mjs --range <from>_to_<to>
   ```
   The final PDF path is printed on stdout. Repeat it to the user and stop.

## Drafting guide

### Title and period

- If `from` and `to` fall in the same calendar month → title is
  `<Month> <Year> Activity Report`.
- Otherwise → title is `<Start D Mon> – <End D Mon> <Year> Activity Report`.
- Period line within a month: `<D>–<D> <Month> <Year>` (en dash).
- Period line across months: `<D> <Month> – <D> <Month> <Year>`.

### Lead paragraph

One or two sentences. Name the scope (which apps), the timeframe in words
("first half of May"), and what the reader is looking at. Don't repeat the
title.

### Executive summary

One paragraph. State the streams of work, attach commit counts to each, and
call out any new apps with their live URLs. If a meaningful repo had **no**
activity, note that explicitly when it matters (e.g.,
"the April pipeline reshuffle has stabilised in production").

### Initiative cards

Aim for **3–8 cards**. Group commits into coherent themes; do **not** make one
card per commit. A theme is usually a repo × area pair (e.g., "Agri360 ·
Video department redesign"), not a whole repo.

Each card has:

- `### <Initiative title>` — short noun phrase.
- `- repo: <Repo name>` — the repo this maps to.
- `- kind: <AGRI360 | NEW APP | …>` — uppercase tag shown in the eyebrow.
  Use `AGRI360` for the CRM, `NEW APP` for newly launched repos, or invent
  another tag for outliers.
- Body: 2–5 sentences. Past tense, active voice. **Quote real code
  identifiers, env-var names, and file paths** from the commit messages and
  the `files` array (e.g., `ENABLED_DELIVERABLE_TYPES`, `app/icon.svg`,
  `MetaPublisher`). Avoid generic adjectives like "robust", "comprehensive",
  "powerful".

### Daily breakdown

One `### <Day-of-week D Month>` per day with ≥1 commit, in date order.
The label format is `Fri 1 May`, `Tue 5 May`, etc. — the renderer matches
this to the daily-volume data to print the commit count pill.

For days that span multiple repos or themes, use bold lead-ins:

```markdown
**Three threads in parallel.**

**Content calendar / Design.** …

**Agri4All product-uploads.** …
```

Synthesise — don't list every commit. The goal is one or two clear paragraphs
per day, not a commit log.

### Methodology block

Auto-derived from the stats JSON:

- For each repo in `perRepo`: `**Danieldckh/<name>** — <short description> (<N> commits in <Month>).`
- For each repo in `inactiveRepos`: `**Danieldckh/<name>** — no <Month> activity (last push <date>).`
- Repos in neither list don't appear.
- End with the scope note from the template — don't change it.

## Style rules

- Past tense, active voice.
- Specific over generic. *"Rewrote the AI autofill engine (description prompt,
  category enumeration, extras-leakage fix)"* beats *"Improved the autofill
  engine."*
- Quote real identifiers, file paths, env-var names, and URLs.
- No emoji. No marketing language. No "I am proud to announce".
- En dashes for date ranges (`1–12 May`), not hyphens.

## Re-rendering after edits

If the user edits `drafts/<range>.md` and asks to re-render, **only** re-run
`scripts/render.mjs`. Do **not** regenerate the draft. The draft is the source
of truth for prose once you've handed off.

## Setup that must already exist

- Node.js ≥20, `npm install` has been run.
- Playwright Chromium installed: `npx playwright install chromium`.
- GitHub CLI installed and authenticated: `gh auth status` returns success.

If any of these fail, stop and tell the user what's missing.
```

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: claude.md describing the report-generation recipe"
```

---

## Task 9: README.md

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Replace the stub README with the human-facing quickstart**

```markdown
# Checks and Balances

Personal engineering-activity report generator. Produces a polished A4 PDF
from the GitHub commit log of `github.com/Danieldckh` for any date range.

## How to use it

In Claude Code, in this project folder, say something like:

> Generate an activity report for 1–12 May 2026.

Claude will:

1. Run `scripts/collect.mjs` to pull commits via `gh`.
2. Run `scripts/stats.mjs` to compute the hero numbers and daily volume.
3. Write a markdown draft to `drafts/<range>.md`.
4. Hand off to you for review/edits.
5. When you say "render", run `scripts/render.mjs` and produce the final PDF
   in `out/`.

The recipe Claude follows is in `CLAUDE.md`. The visual design lives in
`templates/report.html` + `templates/_tokens.css`.

## One-time setup

```bash
npm install
npx playwright install chromium
gh auth login        # if not already authenticated
```

Requires Node ≥20.

## Files

- `CLAUDE.md` — the workflow Claude follows.
- `config.json` — author, GitHub username, brand block. Edit-once.
- `scripts/collect.mjs` — gh API → `data/<range>.json`.
- `scripts/stats.mjs` — `data/<range>.json` → `data/<range>.stats.json`.
- `scripts/render.mjs` — draft + stats → `out/<Author>-<...>-Activity-Report.pdf`.
- `templates/report.html`, `templates/_tokens.css` — the visual design.
- `templates/draft-template.md` — the markdown skeleton Claude fills in.
- `Daniel-May-2026-Activity-Report.pdf` — the visual fidelity target.

## Running the tests

```bash
npm test
```

Tests cover the pure helpers: stats derivation, draft parsing, bar-chart SVG
generation. The `gh` and Playwright integrations are smoke-tested by actually
running the pipeline end-to-end.

## Re-running after edits

If you edit a draft in `drafts/<range>.md`, ask Claude to "render" again —
that re-runs only `scripts/render.mjs` and emits a fresh PDF. The collect
and stats steps don't need to re-run.
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: human-facing readme with quickstart and file map"
```

---

## Task 10: End-to-end validation against a real range

This is the integration smoke test. No assertions — just a real run, eyeball the PDF, fix anything off.

- [ ] **Step 1: Pick a known small range with real activity**

Use 1–3 May 2026 (the start of the reference period). Date string: `2026-05-01_to_2026-05-03`.

- [ ] **Step 2: Collect**

Run: `node scripts/collect.mjs --from 2026-05-01 --to 2026-05-03`
Expected: `data/2026-05-01_to_2026-05-03.json` exists. Open it. Verify at least one repo (`Agri360`) has commits and each commit has `subject`, `body`, and a `files` array.

- [ ] **Step 3: Stats**

Run: `node scripts/stats.mjs --range 2026-05-01_to_2026-05-03`
Expected: `data/2026-05-01_to_2026-05-03.stats.json` exists. `heroStats.commitsPushed` should roughly match the count from the reference PDF for those three days (≈ 1 + 0 + 0 + 0 + 19 + 4 = 24 if range went 1–6 May; for 1–3 the reference shows only May 1 active with 1 commit, so expect a low count).

- [ ] **Step 4: Have Claude draft the narrative for this range**

In Claude Code: *"Draft the narrative for 1–3 May 2026."* Claude should write `drafts/2026-05-01_to_2026-05-03.md` following the CLAUDE.md guide. Verify the file appears.

- [ ] **Step 5: Render**

Run: `node scripts/render.mjs --range 2026-05-01_to_2026-05-03`
Expected: PDF path printed on stdout. Open the PDF. Compare against `Daniel-May-2026-Activity-Report.pdf`. Check:

- Top brand band looks the same (mark, brand line, period/author/generated meta).
- Hero stat cards render with green tint background.
- Initiative cards in a 2-column grid.
- Bar chart shows the right days and counts; zero-day glyphs visible.
- Daily breakdown table header is brand-green; rows have the count-pill in `--brand-tint`.
- Methodology block lists every relevant repo with the right commit count.
- Footer has the brand text on the left, "Generated … · Source: GitHub commit log" on the right.

- [ ] **Step 6: Iterate on visual diffs**

If anything in the PDF looks off compared to the reference:

- Open `data/2026-05-01_to_2026-05-03.rendered.html` in a real browser.
- Use DevTools to adjust CSS in `templates/report.html` or `templates/_tokens.css`.
- Re-run `node scripts/render.mjs --range 2026-05-01_to_2026-05-03` and re-compare.
- Repeat until the PDF matches.

- [ ] **Step 7: Commit any CSS fixes**

```bash
git add templates/
git commit -m "fix(templates): bring PDF output in line with reference design"
```

(Skip if no changes were needed.)

- [ ] **Step 8: Final commit — mark project as ready**

```bash
git add -A
git commit --allow-empty -m "chore: activity report generator ready for use"
```

---

## Self-review

**Spec coverage check:**

- File structure → Task 1 (bootstrap) and Tasks 2–7 (each file).
- `config.json` shape → Task 1, Step 4. Matches the spec exactly.
- `scripts/collect.mjs` steps 1–5 → Task 3. Includes repo listing, commit range, per-commit detail, new-app detection, inactive-repo metadata.
- `scripts/stats.mjs` output shape → Task 2, Step 4. Covers heroStats, dailyVolume, perRepo, inactiveRepos, monthLabel/yearLabel/singleMonth.
- `templates/draft-template.md` → Task 4, Step 2. Matches spec structure.
- `templates/report.html` → Task 4, Step 3. Includes all 10 sections from spec.
- `templates/_tokens.css` → Task 4, Step 1. All token names match spec.
- `scripts/render.mjs` pipeline → Tasks 5–7. parseDraft, buildBarChartSvg, populateTemplate, renderDraftToHtml, Playwright launch, output filename logic.
- `CLAUDE.md` recipe and drafting guide → Task 8.
- One-time setup → Task 1 Steps 6–7 + Task 9 README.

**Placeholder scan:** No "TODO", "TBD", "implement later", "similar to Task N", "add appropriate error handling" — every step has the actual code or command.

**Type consistency:**

- `parseDraft` returns `{ frontmatter, lead, executiveSummary, initiatives, days, methodology }`. Consumed in Task 7 `renderDraftToHtml` — names match.
- `deriveStats` returns `{ range, heroStats, dailyVolume, perRepo, inactiveRepos, monthLabel, yearLabel, singleMonth }`. Consumed in `renderDraftToHtml` and `computeOutputFilename` — names match.
- `buildBarChartSvg(dailyVolume, opts)` signature matches call site in `renderDraftToHtml`.
- `computeOutputFilename(stats, author)` — `author` is `config.author`, consistent in Task 7 main.
- `populateTemplate(template, vars)` — keys passed in `renderDraftToHtml` (`title`, `period`, `barChartSvg`, `daysHtml`, etc.) match the `{{placeholder}}` names in `templates/report.html`.

Spot-check of `{{placeholder}}` ↔ `vars` mapping:

| Template            | Provided in vars?                  |
|---------------------|------------------------------------|
| `{{tokensCss}}`     | ✓ (read from `_tokens.css`)        |
| `{{title}}`         | ✓                                  |
| `{{period}}`        | ✓                                  |
| `{{generated}}`     | ✓                                  |
| `{{brandMark}}`     | ✓                                  |
| `{{brandLine}}`     | ✓                                  |
| `{{brandSubline}}`  | ✓                                  |
| `{{authorLine}}`    | ✓                                  |
| `{{leadHtml}}`      | ✓                                  |
| `{{commitsPushed}}` | ✓                                  |
| `{{activeWorkdays}}`| ✓                                  |
| `{{reposShippedTo}}`| ✓                                  |
| `{{newAppsLaunched}}`| ✓                                 |
| `{{executiveSummaryHtml}}` | ✓                            |
| `{{initiativesHtml}}`| ✓                                 |
| `{{barChartSvg}}`   | ✓                                  |
| `{{daysHtml}}`      | ✓                                  |
| `{{methodologyHtml}}`| ✓                                 |
| `{{footerLeft}}`    | ✓                                  |
| `{{footerRightSuffix}}` | ✓                              |

All accounted for. Plan is ready.
