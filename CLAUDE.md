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
   Writes `data/<from>_to_<to>.json`. Auth: the script reads `GITHUB_TOKEN` from `.env` (preferred). If `.env` is absent, it strips the stale process `GITHUB_TOKEN` and falls back to `gh` keyring. If it errors with `gh not authenticated`, stop and tell Daniel to add a token to `.env` (see `.env.example`) or run `gh auth login`.

3. **Gather the Obsidian daily logs:**
   ```
   node scripts/logs.mjs --from <from> --to <to>
   ```
   Writes `data/<from>_to_<to>.logs.md` — the day-by-day work log from the Obsidian vault
   (`OBSIDIAN_DAILY_LOG_DIR` in `.env`). Read it alongside the commits: the logs carry the
   *why* and the cross-repo story (deploys, integrations, decisions, non-commit work like DNS or
   server ops) that commit subjects alone miss. If the folder is missing or empty for the range,
   say so and continue on commits alone.

4. **Compute stats:**
   ```
   node scripts/stats.mjs --range <from>_to_<to>
   ```
   Writes `data/<from>_to_<to>.stats.json`. Read it — you need the per-repo commit counts, the daily volume, and the inactive-repo list to write the narrative.

5. **Project checklist — let Daniel choose what goes in.** From the commits (step 2) and the daily
   logs (step 3), identify the **main projects / work streams** of the range (roughly: each repo or
   initiative with meaningful activity — the candidate initiative cards). Present them to Daniel as
   a **multi-select checklist** (use the AskUserQuestion tool with `multiSelect: true`; if there are
   more than 4 candidates, split across multiple checklist questions in the same call), each option
   labelled with the project name and a one-line summary of what was done + commit count. Daniel
   ticks the ones to include. **Only the ticked projects become initiative cards** in the draft; the
   daily breakdown and stats still cover the whole range, but keep the narrative focus on the
   selected projects. Unticked work may be mentioned in passing in the executive summary at most.

6. **Draft the narrative.** Copy `templates/draft-template.md` to `drafts/<from>_to_<to>.md` and fill it in. Follow the **Drafting guide** below. Read the JSON files from steps 2 and 4 **and the daily-log digest from step 3** to ground the prose in real data — quote real commit subjects, file paths, and code identifiers, and use the daily logs for deploys, integrations, and decisions that don't show up as commits.

7. **Hand off to Daniel.** Tell him the draft is at `drafts/<from>_to_<to>.md`. Stop and wait. He may edit the file directly. When he says "render", "looks good", "go", or similar, **re-read the draft from disk** in case he edited it, then continue.

8. **Render the PDF:**
   ```
   node scripts/render.mjs --range <from>_to_<to>
   ```
   The PDF path is printed on stdout. Repeat it back to Daniel and stop.

9. **Update the meeting-minutes sheet (on request).** After the PDF is final, Daniel may drop the
   PDF into the conversation and say "update the sheet" (or similar). Follow **Updating the
   meeting-minutes sheet** below.

## Updating the meeting-minutes sheet

The team meeting-minutes sheet:

```
https://docs.google.com/spreadsheets/d/1aXewHRCc1DUnFUTLGcew1Z84_oLwLEwHh_Nbs7pUpVk/edit?gid=1307831504#gid=1307831504
```

Columns: `A Department | B Meeting date | C Task | D Stakeholder | E Deadline Date | F Priority | G Status | H Notes`.
Rows are grouped in meeting-date blocks; the newest block is at the bottom.

**HARD RULE — only ever touch rows where Department == `Developer`.** Never edit, overwrite, move,
or insert into any other department's rows (Video, Production, Design, JagLekker, Social Media, …),
no matter how related a task looks. New rows must be created as `Developer` rows in empty cells at
the bottom of the sheet — never by inserting between or displacing existing rows. Before committing
any edit, confirm the target row's column A reads `Developer` (or is an empty new row you are
creating as `Developer`).

### Trigger

Daniel drops the final report PDF and says "update the sheet". The PDF corresponds to a draft in
`drafts/<range>.md` — prefer the draft as the source of truth (same content, already structured);
fall back to extracting the PDF text only if the draft is gone.

### Recipe

1. **Extract the main focuses** — the initiative-card titles (the `### <Initiative title>` cards),
   each with its 2–5 sentence body for context.

2. **Read the current sheet state without a browser** (the sheet is link-readable):
   ```
   curl -sL "https://docs.google.com/spreadsheets/d/1aXewHRCc1DUnFUTLGcew1Z84_oLwLEwHh_Nbs7pUpVk/export?format=csv&gid=1307831504"
   ```
   Note the total row count and, for each main focus, whether a **Developer** row already covers it
   (match loosely on meaning, not exact text — e.g. "Mahindra changes / lead list" covers a
   "Mahindra CRM lead-list" initiative).

3. **Decide per focus:**
   - **Already exists as a Developer task** (complete or not) → **append to the END of its Notes**
     (column H, existing text stays first, new note last):
     `DD/MM <one quick sentence on what was done>` — date is today, day/month only, no year
     (e.g. `22/05 Rebuilt the autofill engine and shipped the category fix`).
   - **Doesn't exist** → add a **new Developer row directly underneath the last existing Developer
     row** (bottom block). **Keep the Task cell short and simple** — project + a few words, like the
     other rows (e.g. `Mahindra CRM - Performance pass`) — and put the detail in **Notes** as
     `DD/MM <what was done, one or two clauses>`. Fill the row as:
     `Department=Developer · B=today's date · Task=<short title> · Stakeholder=Daniel ·
     Deadline Date=<the date the work was completed — the last day in the report's daily breakdown
     that mentions this focus; fall back to the report's end date> · Priority=High ·
     Status=Complete · Notes=<DD/MM detail>`.

4. **Make the edits with Playwright** (the only part that needs a browser):
   - Launch **visible** Chromium with a **persistent profile** so the Google login survives runs:
     ```js
     import { chromium } from 'playwright';
     const ctx = await chromium.launchPersistentContext('.playwright-profile', { headless: false });
     const page = await ctx.newPage();
     await page.goto('<sheet URL>');
     ```
     Run the script in the background so the window stays open.
   - **If not logged in to Google:** stop on the login page, leave the browser open, and give
     Daniel click-by-click instructions to sign in; continue automatically once he has.
   - The grid is a `<canvas>` — don't hunt for cell DOM nodes. Drive it with the keyboard:
     click the **Name Box** (top-left), type the cell ref (e.g. `H205`), press Enter, then type the
     value and press Enter. To append to existing Notes, press `F2` (edit mode) first, then `End`,
     a space, and the new text. For a new row, jump to column A of the first empty row under the
     last Developer row and Tab across the columns.
   - **Verify**: re-fetch the CSV export and confirm every edit landed exactly as intended; fix and
     re-check anything that didn't.

5. **Report back** to Daniel: which rows were updated (with the note added) and which were newly
   created, then leave the browser open for him to eyeball.

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

**Day-of-week labels MUST be computed from the ISO date, never guessed.** Before writing headings, generate the full label list for the range with:

```
node -e "const f='2026-05-01',t='2026-05-13';for(let d=new Date(f+'T00:00');d<=new Date(t+'T00:00');d.setDate(d.getDate()+1))console.log(d.toLocaleDateString('en-GB',{weekday:'short',day:'numeric',month:'short'}))"
```

Substitute `f` and `t` with the actual range. Then cross-check against the `dailyVolume` array in `data/<range>.stats.json` — each entry already pairs a real `date` field with its commit count, so use it as the source of truth. If a `### <Day D Month>` heading in the draft does not match a key in `dailyVolume`, the renderer will silently render a blank commit pill, so verifying every label is mandatory.

For days that span multiple repos or themes, use bold lead-ins:

```markdown
### Tue 5 May
**Three threads in parallel.**

**Content calendar / Design.** Reordered columns…

**Agri4All product-uploads.** Masonry-style 2-column layout…
```

Synthesise, don't list every commit. Goal: one or two clear paragraphs per day.

## Style rules

- Past tense, active voice.
- Specific over generic. *"Rewrote the AI autofill engine (description prompt, category enumeration, extras-leakage fix)"* beats *"Improved the autofill engine."*
- Quote real identifiers, file paths, env-var names, URLs.
- No emoji. No marketing language. No "I am proud to announce".
- En dash `–` for date ranges, not hyphen `-`.

### Validation

Before handing the draft to Daniel, grep the day headings and confirm every `### Day D Month` line matches the computed calendar.

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
- `scripts/logs.mjs` — Obsidian daily logs → `data/<range>.logs.md`.
- `scripts/stats.mjs` — `data/<range>.json` → `data/<range>.stats.json`.
- `scripts/render.mjs` — draft + stats → `out/<Author>-<...>-Activity-Report.pdf`.
- `templates/report.html`, `templates/_tokens.css` — visual design.
- `templates/draft-template.md` — markdown skeleton.
- `Daniel-May-2026-Activity-Report.pdf` — visual fidelity target.
