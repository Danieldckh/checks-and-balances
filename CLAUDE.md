# Activity Report Generator

This project produces a polished A4 PDF engineering-activity report — visually identical to `Daniel-May-2026-Activity-Report.pdf` — for any date range, from the GitHub commit log of `github.com/Danieldckh`.

When Daniel asks for a report in this directory, run the recipe below.

## When to trigger this workflow

Trigger phrases include — but are not limited to:
- "generate a report for…"
- "make me the <month> report"
- "activity report for…"
- "checks and balances for…"
- any message that names a date range with the clear intent to produce a report

If the request is genuinely ambiguous (e.g., "make me a report" with no date), ask once for the range, then proceed.

## The recipe

1. **Parse the date range** into ISO `from` and `to` (both inclusive). Examples:
   - "1–12 May 2026" → `2026-05-01` / `2026-05-12`
   - "the first week of May" → `2026-05-01` / `2026-05-07`
   - "May" → first to last day of that month
   - "last month" → first to last day of the previous calendar month

2. **Collect commits:**
   ```
   node scripts/collect.mjs --from <from> --to <to>
   ```
   Writes `data/<from>_to_<to>.json`. If it errors with `gh not authenticated`, stop and tell Daniel to run `gh auth login`. (A stale `GITHUB_TOKEN` env var is stripped automatically by the script.)

3. **Compute stats:**
   ```
   node scripts/stats.mjs --range <from>_to_<to>
   ```
   Writes `data/<from>_to_<to>.stats.json`. Read it — you need the per-repo commit counts, the daily volume, and the inactive-repo list to write the narrative.

4. **Draft the narrative.** Copy `templates/draft-template.md` to `drafts/<from>_to_<to>.md` and fill it in. Follow the **Drafting guide** below. Read the JSON files from steps 2 and 3 to ground the prose in real data — quote real commit subjects, file paths, and code identifiers.

5. **Hand off to Daniel.** Tell him the draft is at `drafts/<from>_to_<to>.md`. Stop and wait. He may edit the file directly. When he says "render", "looks good", "go", or similar, **re-read the draft from disk** in case he edited it, then continue.

6. **Render the PDF:**
   ```
   node scripts/render.mjs --range <from>_to_<to>
   ```
   The PDF path is printed on stdout. Repeat it back to Daniel and stop.

## Drafting guide

### Title and period

- `from` and `to` in the same calendar month → title is `<Month> <Year> Activity Report`.
- Otherwise → `<Start D Mon> – <End D Mon> <Year> Activity Report`.
- Period line within a month: `<D>–<D> <Month> <Year>` (use en dash `–`, not hyphen).
- Period line across months: `<D> <Month> – <D> <Month> <Year>`.

### Lead paragraph

One or two sentences. Name the scope (which apps), the timeframe in words (e.g. "first half of May"), and what the reader is looking at. Don't repeat the title.

### Executive summary

One paragraph. State the streams of work, attach commit counts to each, and call out any new apps with their live URLs. If a meaningful repo had **no** activity, note that when it matters (e.g., "the April pipeline reshuffle has stabilised in production").

### Initiative cards

Aim for **3–8 cards**. Group commits into coherent themes — not one card per commit. A theme is usually a repo × area pair (e.g., "Agri360 · Video department redesign"), not a whole repo.

Each card:

```markdown
### <Initiative title>
- repo: <Repo name>
- kind: <AGRI360 | NEW APP | …>

Body, 2–5 sentences. Past tense, active voice. Quote real code identifiers, env-var
names, and file paths from commit messages (e.g. `ENABLED_DELIVERABLE_TYPES`,
`app/icon.svg`, `MetaPublisher`). Avoid generic adjectives like "robust",
"comprehensive", "powerful".
```

`kind` becomes the eyebrow tag above the title. Use `AGRI360` for CRM work, `NEW APP` for newly launched repos, or invent another short uppercase tag for outliers.

### Daily breakdown

One `### <Day-of-week D Month>` per day with ≥1 commit, in date order. Label format: `Fri 1 May`, `Tue 5 May`, etc. The renderer parses the day + month and looks up the commit count from `dailyVolume` — match the format or the count-pill will render blank.

For days that span multiple repos or themes, use bold lead-ins:

```markdown
### Tue 5 May
**Three threads in parallel.**

**Content calendar / Design.** Reordered columns…

**Agri4All product-uploads.** Masonry-style 2-column layout…
```

Synthesise, don't list every commit. Goal: one or two clear paragraphs per day.

### Methodology block

Build from `stats.json`:

- For each repo in `perRepo`: `**Danieldckh/<name>** — <short description> (<N> commits in <Month>).`
- For each repo in `inactiveRepos`: `**Danieldckh/<name>** — no <Month> activity (last push <date>).`
- Repos in neither list don't appear.
- End with the scope note from the template — don't change it.

## Style rules

- Past tense, active voice.
- Specific over generic. *"Rewrote the AI autofill engine (description prompt, category enumeration, extras-leakage fix)"* beats *"Improved the autofill engine."*
- Quote real identifiers, file paths, env-var names, URLs.
- No emoji. No marketing language. No "I am proud to announce".
- En dash `–` for date ranges, not hyphen `-`.

## Re-rendering after edits

If Daniel edits `drafts/<range>.md` and asks to re-render, **only** re-run `scripts/render.mjs`. Do **not** regenerate the draft — once you've handed it off, the draft is the source of truth for prose.

## Setup that must already exist

- Node ≥20, `npm install` has been run.
- Playwright Chromium installed: `npx playwright install chromium`.
- GitHub CLI installed and authenticated: `gh auth status` returns success.

If any of these fail, stop and tell Daniel what's missing.

## Project layout reference

- `config.json` — author, GitHub username, brand block.
- `scripts/collect.mjs` — gh → `data/<range>.json`.
- `scripts/stats.mjs` — `data/<range>.json` → `data/<range>.stats.json`.
- `scripts/render.mjs` — draft + stats → `out/<Author>-<...>-Activity-Report.pdf`.
- `templates/report.html`, `templates/_tokens.css` — visual design.
- `templates/draft-template.md` — markdown skeleton.
- `Daniel-May-2026-Activity-Report.pdf` — visual fidelity target.
