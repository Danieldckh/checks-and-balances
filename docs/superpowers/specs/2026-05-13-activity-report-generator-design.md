# Activity Report Generator — Design

**Status:** Approved — ready for implementation plan.
**Date:** 2026-05-13
**Author:** Daniel (Danieldckh) — drafted via brainstorming with Claude.

## Purpose

Reproduce the look and rigor of `Daniel-May-2026-Activity-Report.pdf` (already in the project root) for any user-chosen date range. The report is a polished engineering-activity PDF, generated from the GitHub commit log of repositories owned by `github.com/Danieldckh`, with narrative prose written by Claude in chat and reviewed by the user before rendering.

The first-class entry point is conversational: the user says something like *"generate an activity report for 1–12 May 2026"* in Claude Code, and `CLAUDE.md` drives Claude through the steps.

## Goals and non-goals

**Goals**

- Match the visual design of the existing PDF exactly (palette, typography, layout).
- Take an arbitrary date range — single month, partial month, or cross-month.
- Pull commits from every repo under `Danieldckh`, public and private.
- Produce a per-day narrative and per-initiative narrative rich enough to mention specific code identifiers (`ENABLED_DELIVERABLE_TYPES`, `app/icon.svg`, etc.) — not a generic summary.
- Keep narrative prose in a human-editable markdown draft; the user reviews and may edit before the PDF is rendered.
- Re-rendering after an edit is a pure mechanical step (no re-analysis).

**Non-goals**

- Author filtering. All commits on the default branch of repos owned by `Danieldckh` count.
- A web UI, scheduling, multi-user support, or sharing/export integrations.
- Cross-platform fonts — uses Google Fonts (Fraunces + Inter), with an optional local override.

## Architecture overview

```
Checks and Balances/
├── CLAUDE.md                      Instructions Claude reads on every run
├── README.md                      Human-facing quickstart
├── package.json                   Playwright + gray-matter + marked
├── config.json                    Brand, author, GitHub username
│
├── Daniel-May-2026-Activity-Report.pdf   Existing reference (kept as a fidelity target)
│
├── scripts/
│   ├── collect.mjs                gh API → data/<range>.json
│   ├── stats.mjs                  data → data/<range>.stats.json
│   └── render.mjs                 draft + stats → out/<name>.pdf
│
├── templates/
│   ├── report.html                Styled HTML template
│   ├── _tokens.css                Color/typography tokens
│   └── draft-template.md          Skeleton Claude fills in
│
├── data/<range>.json              Raw commit data per range
├── data/<range>.stats.json        Derived numbers per range
├── data/<range>.rendered.html     Final HTML kept for debugging
├── drafts/<range>.md              Narrative draft (user-editable)
└── out/<filename>.pdf             Final PDF
```

**Workflow, end to end:**

1. User in chat: *"Generate an activity report for 1–12 May 2026."*
2. Claude parses the range and runs `node scripts/collect.mjs --from 2026-05-01 --to 2026-05-12`.
3. Claude runs `node scripts/stats.mjs --range 2026-05-01_to_2026-05-12`.
4. Claude reads the stats JSON and writes `drafts/2026-05-01_to_2026-05-12.md` using the structure in `templates/draft-template.md`.
5. Claude hands off to the user. The user reviews the draft, edits in place if needed, then says "render" (or equivalent).
6. Claude runs `node scripts/render.mjs --range 2026-05-01_to_2026-05-12`. The PDF lands in `out/`.

## Configuration — `config.json`

```jsonc
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

Edit-once and forget. Every script reads from here.

## Data collection — `scripts/collect.mjs`

**CLI:**
```
node scripts/collect.mjs --from YYYY-MM-DD --to YYYY-MM-DD
```

Both dates inclusive, interpreted as local calendar days.

**Steps:**

1. **List repos** owned by the configured user. Tries `/user/repos?affiliation=owner&per_page=100` first (works for private repos when the gh token has access); falls back to `/users/<login>/repos` if not. Paginated via `gh api --paginate`.

2. **Fetch commits in range** per repo on the default branch:
   ```
   gh api --paginate "/repos/<owner>/<repo>/commits?since=<fromISO>&until=<toEndOfDayISO>"
   ```
   `toEndOfDayISO` is `<to>T23:59:59Z` so the `--to` flag is inclusive of the entire final day. GitHub treats `until` as an exclusive upper bound on commit timestamps.

3. **Per-commit detail.** For each commit SHA from step 2:
   ```
   gh api "/repos/<owner>/<repo>/commits/<sha>"
   ```
   Keep the commit subject, body, author info, date, and the `.files[*].filename` list. **Drop** the `.files[*].patch` field before persisting — patches bloat the JSON and aren't needed for narrative writing.

4. **"New app launched" detection.** A repo is new in the range when it has no commits *before* `from`:
   ```
   gh api "/repos/<owner>/<repo>/commits?per_page=1&until=<from minus 1s ISO>"
   ```
   Empty response → `isNewInRange: true`.

5. **Inactive-repo metadata.** For each repo owned by the user that has *no* commits in the range, record the date of its most recent commit ever:
   ```
   gh api "/repos/<owner>/<repo>/commits?per_page=1"
   ```
   This feeds the methodology block (*"no May activity (last push 16 April 2026)"*).

**Output — `data/<range>.json`:**

```jsonc
{
  "range": { "from": "2026-05-01", "to": "2026-05-12" },
  "generatedAt": "2026-05-13T...",
  "author": { "name": "Daniel", "githubLogin": "Danieldckh" },
  "repos": [
    {
      "name": "Agri360",
      "private": true,
      "isNewInRange": false,
      "lastPushBeforeRange": "2026-04-30",
      "commits": [
        {
          "sha": "abc123",
          "date": "2026-05-01T09:14:33Z",
          "author": { "login": "Danieldckh", "email": "..." },
          "subject": "Client-list UI overhaul",
          "body": "Rebuilt client-list page with auto-enrich...",
          "files": ["apps/web/.../ClientList.tsx", "..."]
        }
      ]
    }
  ]
}
```

**Error handling.**

- If `gh` is not on the PATH: exit with `Run "winget install GitHub.cli" first` and a non-zero code.
- If `gh auth status` reports unauthenticated: exit with `Run "gh auth login" first` and a non-zero code.
- API rate-limit hit: log the reset time and exit non-zero. (Re-running after the reset is the recovery; no automatic backoff loop.)

## Stats derivation — `scripts/stats.mjs`

**CLI:**
```
node scripts/stats.mjs --range <from>_to_<to>
```

Reads `data/<range>.json` and writes `data/<range>.stats.json`:

```jsonc
{
  "range": { "from": "2026-05-01", "to": "2026-05-12" },
  "heroStats": {
    "commitsPushed": 87,
    "activeWorkdays": 8,
    "reposShippedTo": 3,
    "newAppsLaunched": 2
  },
  "dailyVolume": [
    { "date": "2026-05-01", "label": "May 1", "count": 1 },
    { "date": "2026-05-02", "label": "May 2", "count": 0 },
    ...
  ],
  "perRepo": [
    { "name": "Agri360", "commits": 52, "isNewInRange": false },
    { "name": "postpilot", "commits": 32, "isNewInRange": true },
    { "name": "secretary-transcribe", "commits": 3, "isNewInRange": true }
  ],
  "inactiveRepos": [
    { "name": "sitecraft-app", "lastPushBeforeRange": "2026-04-16" },
    ...
  ],
  "monthLabel": "May",
  "yearLabel": "2026",
  "singleMonth": true
}
```

**Definitions used:**

- `commitsPushed` — total commit count across all repos in `range`.
- `activeWorkdays` — number of distinct calendar dates in `range` with ≥1 commit.
- `reposShippedTo` — number of repos with ≥1 commit in `range`.
- `newAppsLaunched` — number of repos with `isNewInRange: true` *and* `commits ≥ 3` in `range` (the floor prevents counting an accidentally-pushed empty repo as a launch).
- `singleMonth` — `true` when `from` and `to` are in the same calendar month; controls filename and title format downstream.

## Narrative drafting — `templates/draft-template.md` and CLAUDE.md

The draft is markdown. It's the single source of truth for the prose in the final PDF.

**Skeleton — `templates/draft-template.md`:**

```markdown
---
title: <Month> <Year> Activity Report
period: <D>–<D> <Month> <Year>
generated: <D Month Year>
heroStats:
  commitsPushed: <N>
  activeWorkdays: <N>
  reposShippedTo: <N>
  newAppsLaunched: <N>
---

## Lead
<One or two sentences. Scope, timeframe in words, what the reader is looking at.>

## Executive summary
<One paragraph. Streams of work, commit counts per stream, new apps + URLs, any
notable repos with *no* activity if it matters.>

## Initiatives

### <Initiative title>
- repo: <Repo name>
- kind: <AGRI360 | NEW APP | …>

<Body, 2–5 sentences. Specific, technical. Quote real code identifiers and
file paths from commit messages.>

### <Initiative title>
- repo: ...
- kind: ...

<Body.>

## Days

### <Day-of-week D Month>
<Prose. For multi-stream days, use bold lead-ins for sub-themes.>

### <Day-of-week D Month>
<Prose.>

## Methodology
Generated from the Git commit log of all repositories under `github.com/Danieldckh`
with activity in <Month> <Year>. Repositories audited:

- **Danieldckh/<repo>** — <description> (<N> commits in <Month>).
- **Danieldckh/<repo>** — no <Month> activity (last push <date>).
- ...

**Scope note.** "Commits" counts merged work pushed to the default branch. It does *not*
include design exploration, code review, deployment debugging, production hotfixes
applied directly via Coolify, or work-in-progress branches that did not land. The true
effort hour-count exceeds what <N> commits implies.
```

**CLAUDE.md** (project root) tells Claude:

- The trigger phrases that should kick off the recipe.
- The exact six-step recipe above.
- The drafting guide (title and period formats, lead/summary/initiative shape, daily-breakdown grouping, methodology block construction).
- The style rules: past tense, active voice, specific over generic, quote real identifiers and paths, no emoji, no marketing language.
- The hard rule that Claude **stops** after writing the draft and waits for the user before rendering.
- The hard rule that re-rendering only re-runs `render.mjs` — never regenerates the draft.

## Rendering — `scripts/render.mjs`

**CLI:**
```
node scripts/render.mjs --range <from>_to_<to>
```

**Pipeline:**

1. Read `drafts/<range>.md` with `gray-matter` → frontmatter + body.
2. Walk the body sections by `##` headings — Lead, Executive summary, Initiatives, Days, Methodology. For Initiatives, each `###` is one card; the bullet list (`- repo:`, `- kind:`) declares card metadata. For Days, each `###` is one table row.
3. Run `marked` over the prose blocks so inline markdown (backticks → `<code>`, `**bold**`, `*italic*`) renders correctly.
4. Build the daily-volume SVG inline (see below).
5. Substitute into `templates/report.html` via simple `{{placeholder}}` replacement — no Handlebars / Mustache dependency, the substitutions are flat.
6. Write the populated HTML to `data/<range>.rendered.html` (kept on disk so styling can be debugged in a real browser).
7. Launch Playwright Chromium, `page.setContent(html, { waitUntil: 'networkidle' })`, `page.emulateMedia({ media: 'print' })`, then `page.pdf({...})` with A4 format, 18mm margins, `printBackground: true`.
8. Compute the filename:
   - `singleMonth: true` → `<Author>-<Month>-<Year>-Activity-Report.pdf`
   - otherwise → `<Author>-<from>-to-<to>-Activity-Report.pdf`
9. Write to `out/`. Print the absolute path on stdout.

### Daily-volume bar chart (inline SVG)

Generated in `render.mjs`, embedded directly in the HTML. Layout:

- Container width / N bars, fixed inter-bar gap.
- For each day with `count > 0`: a filled rectangle, height = `count / max * chartHeight`, fill `var(--brand)`. The `count` number floats above the bar in `Inter` 12px.
- For each day with `count == 0`: a small hatched glyph on the baseline (using an SVG `<pattern>` of diagonal lines) — matches the existing PDF's "May 2 · · ·" treatment.
- Day labels below each column in `Inter` 10px, muted color.

Pure SVG. No Chart.js, no canvas. Rendered in the print-CSS media type by Playwright.

### `templates/report.html` structure

Sections, top-to-bottom:

1. Brand band — brand mark + brand line on the left, Period/Author/Generated on the right.
2. Eyebrow: `PERSONAL CHECKS & BALANCES`.
3. Title (frontmatter) + lead paragraph.
4. Hero stats — four cards with `--brand-tint` background.
5. `EXECUTIVE SUMMARY`.
6. `## Initiatives` rendered as a 2-column grid of cards. Each card: eyebrow `INITIATIVE N · <KIND>` (uppercase), bold title, body paragraph.
7. `DAILY COMMIT VOLUME` heading + inline SVG.
8. `DAILY BREAKDOWN` table — Date · Commits · Summary columns, brand-green table header.
9. `METHODOLOGY & VERIFICATION`.
10. Footer rule + footer text.

CSS rules:

- `@page { size: A4; margin: 18mm; }`
- `print-color-adjust: exact` on the body so brand greens render.
- `page-break-inside: avoid` on each initiative card, each table row, and the chart.

### Tokens — `templates/_tokens.css`

```css
:root {
  --ink: #1a1d1f;
  --rule: #d8dcd2;
  --brand: #1f4d2c;
  --brand-tint: #e8efe2;
  --eyebrow: #2d6a3f;
  --muted: #5a6068;

  --font-display: 'Fraunces', Georgia, serif;
  --font-body: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
}
```

If `templates/fonts/*.woff2` exists, the template prefers `@font-face` from there over Google Fonts.

## Dependencies and setup

**Runtime deps** (`package.json`):
- `playwright`
- `gray-matter`
- `marked`

**One-time install:**
```
npm install
npx playwright install chromium
gh auth login        # if not already authenticated
```

No build step. Everything is `.mjs`, run directly under Node.

## Conventions and constraints

- **Range token format** in filenames: `<from>_to_<to>` (e.g., `2026-05-01_to_2026-05-12`). Used for `data/`, `drafts/`, and intermediate HTML.
- **Final PDF filename**: single-month uses `Daniel-May-2026-Activity-Report.pdf` (matches the existing PDF). Cross-month uses `Daniel-2026-05-05-to-2026-06-18-Activity-Report.pdf`.
- **Idempotence**: every script overwrites its outputs. Re-running `collect.mjs` for the same range refreshes the JSON. The user's hand-edits live in `drafts/<range>.md`, which `collect.mjs` and `stats.mjs` never touch.
- **Source of truth**: `drafts/<range>.md` for prose, `data/<range>.json` for raw facts. The renderer trusts both.

## Open questions

None. Design ready for the implementation plan.
