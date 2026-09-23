# CLAUDE.md — Element Drills (chemdrills)

A set of browser games for learning the periodic table: naming every element, symbol/number/name lookups, and estimating atomic mass. More chemistry games are planned, so the architecture treats each game as a plug-in.

Read this file in full at the start of every session. Update the Status section at the end of every session. It must always say honestly what is verified and what is still open.

## Developer environment

- The developer works on **Windows / PowerShell** and in TypeScript/React.
- npm scripts MUST be cross-platform. No `rm -rf`, no `export VAR=`, no sh-only syntax. Use `rimraf` or `cross-env`, or Node scripts, if needed. (`a && b` is fine inside npm scripts: npm runs them through `cmd.exe` on Windows.)
- GitHub account: `iangopenbusinessai-lab`.

## Stack

- Vite 8 + React 19 + TypeScript 6 (`strict`, `noUncheckedIndexedAccess`, `noUnused*`)
- Vitest for unit tests, Playwright (Chromium) for browser tests
- ESLint 10 flat config (`eslint.config.js`): typescript-eslint, react-hooks, react-refresh
- Plain CSS: `src/styles/tokens.css` (tokens) + `src/styles/app.css` (layout/components). No CSS framework.
- No backend. Persistence is localStorage only.

## Commands

```
npm run dev          # local dev server
npm run build        # tsc -b (strict) + vite build — must pass with zero errors
npm test             # Vitest unit tests
npm run lint         # ESLint
npm run e2e          # Playwright: builds, serves on port 4317, runs e2e/
npm run e2e:install  # one-time: download Playwright's Chromium
```

The e2e server uses port **4317** with `reuseExistingServer: false` on purpose: another local project serves on Vite's default 4173, and reusing it silently tests the wrong app. Screenshots land in `test-results/screenshots/` (gitignored).

## Source of truth

- `prototype/element-drills.html` is the original single-file prototype and the behavioral spec. When this file and the prototype disagree about game rules, the prototype wins. (It is also published as the claude.ai artifact "Element Drills".)
- **Data exception:** the prototype's masses were hand-typed. `src/data/elements.ts` is the authority for data.

## Architecture

```
src/
  data/elements.ts       118 typed elements, FAMILIES, ALT_NAMES (single source of truth)
  lib/matching.ts        pure answer matching (normalize, levenshtein, matchName, ...)
  lib/scoring.ts         pure mass scoring (massTolerance, massPoints, MASS_MISS_THRESHOLD)
  lib/quiz.ts            ranges, shuffle, default question generator / scorer / feedback
  lib/storage.ts         try/catch-wrapped, versioned localStorage helpers
  lib/famStyle.ts        sets --fam to a family token (inline style)
  games/
    types.ts             GameDefinition = QuizGame | FillGame
    index.ts             GAMES registry (order = picker order)
    nameAll.ts, symbolToName.ts, numberToElement.ts, elementToNumber.ts, guessMass.ts
  components/
    ElementTile.tsx      the core visual (big prompt tile, small result tiles)
    PeriodicTable.tsx    18-col grid + family legend, used by Name Them All
    ModePicker.tsx       element-cell buttons, one per game
    RangePicker.tsx      1–20 / 1–36 / 1–54 / All 118
    QuizRunner.tsx       plays any QuizGame (question → answer → reveal → results)
    FillRunner.tsx       plays any FillGame (timed free typing that fills the table)
  App.tsx                picker + stage; remounts the runner (via key) to restart a round
  styles/tokens.css, styles/app.css
e2e/                     Playwright specs (games, storage-blocked, visual)
```

### GameDefinition

Every game is one module exporting a `GameDefinition` (`src/games/types.ts`). Common fields: `id` (used in storage keys, so never rename a shipped id), `title`, `code` (big text on the picker tile), `family` (picker tile color), `kind`, `round`, and a checker and a scorer.

- `kind: 'quiz'` → `QuizRunner`. `round: { questions, maxPerQuestion, showStreak }`, plus `prompt` (question text, placeholder, `inputMode`, which tile fields to hide, optional hint), `makeQuestions(pool, count)`, `check(e, input) → Answer`, `score(e, answer) → points`, `isMiss(points)`, `feedback(...)`, `missedLabel`.
- `kind: 'fill'` → `FillRunner`. `round: { seconds }`, `check(pool, input, found) → Element | undefined`, `score(found)`.

### How to add a game

1. If it fits an existing runner (a typed-answer quiz or timed fill), create `src/games/myGame.ts` exporting a `QuizGame`/`FillGame`. Reuse the helpers in `lib/quiz.ts` (`randomQuestions`, `oneIfCorrect`, `missIfZero`, `identityFeedback`).
2. Add one line to `GAMES` in `src/games/index.ts`.
3. Add unit tests for any new pure logic, plus an e2e test.

**Limit, stated honestly:** "one file + one line" holds only for games that fit an existing runner. A game with a genuinely new interaction (drag-to-sort families, equation balancing, multiple choice) needs a new `kind` in `types.ts` and a new runner component with a branch in `App.tsx`. After that, further games of that kind are one file + one line again.

### Element data

`Element = { z, symbol, name, mass, massText, synthetic, family, period, group, gridRow, gridCol }`

- `mass` is numeric (used for scoring). `massText` is the display form: IUPAC digits exactly as published, **trailing zeros included** (Ne `20.180`, Te `127.60`). The prototype used `parseFloat` and lost those zeros, which was a display bug.
- **Mass source:** CIAAW/IUPAC *Abridged Standard Atomic Weights 2024* (ciaaw.org/abridged-atomic-weights.htm), copied digit for digit by script, not retyped. Compared to the prototype, three values changed:
  - H `1.008` → `1.0080`: same number, extra digit.
  - Ar `39.948` → `39.95`: revised by IUPAC in 2017.
  - Zr `91.224` → `91.222`: revised by IUPAC in 2024.
- **Synthetic** (displayed in brackets, e.g. `[98]` = the most stable isotope's mass number): Tc (43), Pm (61), and every Z ≥ 84 except Th (90), Pa (91), U (92). IUPAC publishes no standard weight for these, so they can't be checked against IUPAC.
  - We keep the prototype's widely used values.
  - Cross-checked against PubChem: 28 of 34 agree. PubChem differs on Tc (97), Mt (277), Ds (282), Cn (286), Fl (290) and Og (295), where "most stable isotope" is contested or recently revised.
- `group` is `null` for the f-block (La–Lu, Ac–Lr), which sits below the table. `period` for the f-block is 6/7.
- **ALT_NAMES**: 13 → aluminium, 16 → sulphur, 55 → caesium. Primary names use US spelling.
- **Families** (these drive tile colors; ids match the `--f-*` tokens):
  - `alkali`: 3, 11, 19, 37, 55, 87
  - `alkaline`: 4, 12, 20, 38, 56, 88
  - `transition`: 21–30, 39–48, 72–80, 104–112
  - `lanthanide`: 57–71
  - `actinide`: 89–103
  - `metalloid`: 5, 14, 32, 33, 51, 52
  - `nonmetal`: 1, 6, 7, 8, 15, 16, 34
  - `halogen`: 9, 17, 35, 53, 85, 117
  - `noble`: 2, 10, 18, 36, 54, 86, 118
  - `post`: everything else
- **Grid layout**: standard long-form table, 18 columns. Row 8 is a spacer. La–Lu sit on row 9, cols 3–17, and Ac–Lr on row 10, cols 3–17. The test checks this against a hand-drawn ASCII table, not against the position code.

### Answer matching rules (`src/lib/matching.ts`)

- `normalize`: lowercase, strip every non-letter.
- Alternate spellings are accepted in every game.
- **Quiz games** (`matchName`): a Levenshtein distance of 1 counts as correct (`'close'`) for normalized inputs of 5+ letters. The feedback then shows the correct spelling ("Correct, spelled Hydrogen.").
- **Name Them All** (`matchNameExact` / `findExactElement`): exact matches only (plus alternate spellings). No fuzzy matching, because it would lock in the wrong neighboring element.
- **Number → element** (`matchNameOrSymbol`): the symbol is also accepted, case-insensitive.
- **Element → number** (`matchInteger`): `parseInt`, like the prototype.

## Game specs

| Game | id | Rules |
|---|---|---|
| Name them all | `nameAll` | 12:00 clock that starts on the first keystroke. A name locks in the moment it's spelled right and the input clears. The table fills in. Give up or time-out reveals missed elements with a dashed outline. The best count is saved. |
| Symbol to name | `symbolToName` | 10 questions. Score and streak. |
| Number to element | `numberToElement` | 10 questions. Name or symbol accepted. |
| Element to number | `elementToNumber` | 10 questions. Integer answer. `inputmode="decimal"`. |
| Guess the mass | `guessMass` | 10 questions × 100 points. `tol = max(2, 0.08 × mass)`, `points = round(100 × max(0, 1 − |guess − mass| / tol))`. Shows the hint "roughly twice the atomic number for lighter elements". Synthetic elements get the note about bracketed masses. A guess scoring under 60 counts as a miss ("Worth another look"). No streak. |

Shared quiz behavior:
- Enter submits and Enter again goes to the next question (focus moves to the Next button). Empty answers are ignored.
- After answering, the tile reveals every field.
- The results screen shows the score, the best score ("New best" only when a previous best existed and was beaten), and the missed tiles.
- The element range picker restarts the round when changed, and the selected range is remembered (default 1–36).

Deliberate deviation from the prototype: mass guesses accept a decimal comma (`35,5`), because `inputmode="decimal"` shows a comma key on some locales' keyboards.

## Design rules

- The **element tile is the identity** of the app. Game picker buttons, question prompts, and results are all element tiles. Don't restyle into generic cards.
- Font: Bricolage Grotesque (Google Fonts) with a system sans fallback. Tabular numbers for all digits.
- Tile colors come from the ten `--f-*` family tokens. Tile text is always dark ink (`--tile-ink`), even in dark mode.
- Light and dark themes via tokens: `prefers-color-scheme`, plus a `data-theme="light|dark"` override on `<html>`. There is no toggle UI, and the prototype had none.
- The periodic table scrolls inside its own `overflow-x: auto` wrapper (min-width 720px). The page body never scrolls sideways.
- Accessibility:
  - Visible focus.
  - `aria-live` on answer feedback, the found count and the end-of-round hint.
  - Fully keyboard playable.
  - `prefers-reduced-motion` respected.
  - Prompt tiles' `aria-label` lists only the visible fields, so screen readers don't give away the answer. The prototype said "Hidden element", which hid the symbol too.
- Mobile: usable at 375px, `inputmode="decimal"` for number answers, `viewport-fit=cover` with safe-area padding on `body`.

## Storage

- Keys:
  - `eldrills:v1:best:{gameId}:{range}` (e.g. `eldrills:v1:best:symbolToName:36`)
  - `eldrills:v1:best:nameAll`
  - `eldrills:v1:range`
- Note: the prototype used unversioned keys (`eldrills:best:all`, ...), and these are not migrated.
- Every read and write is wrapped in try/catch, including the `window.localStorage` getter itself. Values are validated on read. The app works identically with storage blocked.

## Verification checklist (run every session that touches the relevant area)

1. `npm run build` passes with zero TS errors, and `npm run lint` is clean.
2. `npm test` passes:
   - data integrity: 118 entries, z runs 1..118 with no gaps, unique symbols, correct families and grid positions
   - matching edge cases: aluminium; a 1-letter typo accepted in a quiz but rejected in Name Them All; symbol case
3. `npm run e2e` passes:
   - every game played through
   - a right and a wrong answer in each quiz
   - mass points checked against the formula
   - a range switch restarts the round
4. localStorage throwing → no crash (`e2e/storage-blocked.spec.ts`).
5. Screenshots at 375px and 1280px, in light and dark (`e2e/visual.spec.ts`). Check for no horizontal body scroll and family-colored tiles, then **look at the PNGs**.

## Status

### Real (verified 2026-09-22)
- **React/TS app**: all five games ported from the prototype, with rules, wording and styling matching it.
- **`npm run build`**: zero TS errors under strict + `noUncheckedIndexedAccess`.
- **`npm run lint`**: clean.
- **`npm test`**: 35 unit tests pass.
  - Data integrity: count, z sequence, unique symbols/names, grid vs. a hand-drawn table, families, synthetic set, mass display.
  - Matching: aluminium/sulphur/caesium; "hydrogn" accepted in a quiz but rejected in Name Them All; `fe`/`FE`/`Fe`; short-input typos rejected.
  - Also mass scoring, storage (including throwing storage), and the game registry.
- **`npm run e2e`**: 19 Playwright tests pass, and are stable across a `--repeat-each=2` run.
  - Name Them All: 3 names lock in and the count and cells update; a typo doesn't lock in; the clock starts on the first keystroke; time-out and Give up reveal missed cells; the best count is saved.
  - Each quiz: a right and a wrong answer; a full round reaches results with missed tiles and a saved best.
  - Mass: an exact guess scores 100, a far guess scores 0, and a partial guess matches `massPoints`.
  - A range switch mid-round restarts at question 1, and the range is remembered after a reload.
  - Fully keyboard playable.
  - localStorage throwing: every game plays to its end screen with no page errors.
  - Visual: 375 and 1280, light and dark, with no horizontal body scroll, tile backgrounds equal to their family token, and the table scrolling in its wrapper only below 720px. Screenshots were reviewed by eye.
- **All scripts run from PowerShell** (build, test, lint, e2e).
- **Masses**: all 84 elements with a standard weight match CIAAW 2024 abridged. The 34 synthetic ones were cross-checked against PubChem, with the differences noted above.

### Open
- **Dev mode**: the e2e suite runs against the production build (`vite preview`). `npm run dev` with React StrictMode wasn't exercised by automated tests this session.
- **Browsers**: only Chromium is tested. Firefox/WebKit (Safari/iOS) and real devices aren't, and safe-area padding is untested on real hardware.
- **Screen readers**: not tested with a real screen reader (NVDA/VoiceOver).
- **Deployment target**: Vercel or GitHub Pages, undecided.
- **Accounts or leaderboards**: deliberately out of scope for now.
- **Roadmap games** (not started, not yet specced; most will need a new runner `kind`, see "How to add a game"):
  - family sorting
  - electron configuration
  - periodic-trend "which is bigger" (radius, electronegativity)
  - equation balancing
  - naming compounds from formulas
