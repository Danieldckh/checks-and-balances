# Checks and Balances

Personal engineering-activity report generator. Produces a polished A4 PDF
from the GitHub commit log of `github.com/Danieldckh` for any date range.

## Use it

In Claude Code, in this folder, say something like:

> Generate an activity report for 1–12 May 2026.

Claude follows `CLAUDE.md`:

1. `scripts/collect.mjs` pulls commits via `gh`.
2. `scripts/stats.mjs` computes hero numbers + daily volume.
3. Claude writes a markdown draft to `drafts/<range>.md`.
4. You review/edit.
5. Say "render"; `scripts/render.mjs` produces the PDF in `out/`.

## One-time setup

```powershell
npm install
npx playwright install chromium
gh auth login        # if not already authenticated
```

Requires Node ≥20.

## Files

- `CLAUDE.md` — the workflow Claude follows.
- `config.json` — author, GitHub username, brand block.
- `scripts/collect.mjs` — gh → `data/<range>.json`.
- `scripts/stats.mjs` — derived numbers.
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
