# Checks and Balances

Personal engineering-activity report generator. Produces a polished A4 PDF
from the GitHub commit log of `github.com/Danieldckh` for any date range.

## Use it

In Claude Code, in this folder, say something like:

> Generate an activity report for 1–12 May 2026.

Claude follows `CLAUDE.md`:

1. `scripts/collect.mjs` pulls commits via `gh`.
2. `scripts/logs.mjs` pulls the matching Obsidian daily-log entries
   (`OBSIDIAN_DAILY_LOG_DIR` in `.env`).
3. `scripts/stats.mjs` computes hero numbers + daily volume.
4. `scripts/timesheet.mjs` derives per-project hours from commit + daily-log
   timestamps (drives the front-page donut + hours table and the Timesheet
   section). Time model lives in `config.json` → `timesheet`.
5. Claude shows the range's main projects as a tick-box checklist — you choose
   which ones make it into the report.
6. Claude writes a markdown draft to `drafts/<range>.md` covering the ticked
   projects, grounded in commits + daily logs.
7. You review/edit.
8. Say "render"; `scripts/render.mjs` produces the PDF in `out/`. The report layout is FIXED —
   every report has the front-page **Time Allocation** (donut + hours table) and the per-day
   **Timesheet** (active window + project split). `render.mjs` builds the timesheet inline if step 4
   was skipped, so the layout is never omitted.
9. Optionally, drop the final PDF back in and say "update the sheet" — Claude
   logs the report's main focuses as completed Developer tasks in the team
   meeting-minutes Google Sheet (existing tasks get a dated note; new ones get
   a fresh row), driving the edits through Playwright.

## One-time setup

```powershell
npm install
npx playwright install chromium
gh auth login        # if not already authenticated
```

Requires Node ≥20.

## Files

- `CLAUDE.md` — the workflow Claude follows.
- `config.json` — author, GitHub username, brand block, and the `timesheet`
  time-allocation model (work windows, holidays, repo→project map, excludes).
- `scripts/collect.mjs` — gh → `data/<range>.json`.
- `scripts/stats.mjs` — derived numbers.
- `scripts/timesheet.mjs` — per-project hours → `data/<range>.timesheet.json`.
- `scripts/render.mjs` — draft + stats → PDF.
- `templates/report.html` + `templates/_tokens.css` — visual design.
- `templates/draft-template.md` — the markdown skeleton.
- `Daniel-May-2026-Activity-Report.pdf` — the visual fidelity target.

## Tests

```powershell
npm test
```

Covers the pure helpers (stats derivation). The `gh` and Playwright integrations are smoke-tested by actually running the pipeline end-to-end.

## Re-render after edits

Edit the draft, then ask Claude to render again — only `render.mjs` re-runs. The collect and stats steps don't need to.
