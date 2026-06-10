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

7. **Update the meeting-minutes sheet (on request).** After the PDF is final, Daniel may drop the
   PDF into the conversation and say "update the sheet" (or similar). Follow **Updating the
   meeting-minutes sheet** below.

## Updating the meeting-minutes sheet

The team meeting-minutes sheet:

```
https://docs.google.com/spreadsheets/d/1aXewHRCc1DUnFUTLGcew1Z84_oLwLEwHh_Nbs7pUpVk/edit?gid=1307831504#gid=1307831504
```

Columns: `A Department | B Meeting date | C Task | D Stakeholder | E Deadline Date | F Priority | G Status | H Notes`.
Rows are grouped in meeting-date blocks; the newest block is at the bottom. Only touch rows whose
Department is **Developer** (that's Daniel). Never edit other departments' rows.

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
   - **Already exists as a Developer task** → append to its **Notes** (column H, keep existing
     text): `DD/MM <one quick sentence on what was done>` — date is today, day/month only, no year
     (e.g. `22/05 Rebuilt the autofill engine and shipped the category fix`). Match the existing
     notes style in the sheet.
   - **Doesn't exist** → add a **new Developer row directly underneath the last existing Developer
     row** (bottom block), filled as:
     `Department=Developer · B=today's date · Task=<initiative title, phrased like the other rows> ·
     Stakeholder=Daniel · Deadline Date=<the date the work was completed — the last day in the
     report's daily breakdown that mentions this focus; fall back to the report's end date> ·
     Priority=High · Status=Complete`.

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
- `scripts/stats.mjs` — `data/<range>.json` → `data/<range>.stats.json`.
- `scripts/render.mjs` — draft + stats → `out/<Author>-<...>-Activity-Report.pdf`.
- `templates/report.html`, `templates/_tokens.css` — visual design.
- `templates/draft-template.md` — markdown skeleton.
- `Daniel-May-2026-Activity-Report.pdf` — visual fidelity target.
