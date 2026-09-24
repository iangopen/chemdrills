# CLAUDE.md — Element Drills (chemdrills)

A set of browser games for learning the periodic table: naming every element, symbol/number/name lookups, estimating atomic mass, and sorting elements into families. More chemistry games are planned, so the architecture treats each game as a plug-in.

Read this file in full at the start of every session. Update the Status section at the end of every session. It must always say honestly what is verified and what is still open.

## Developer environment

- The developer works on **Windows / PowerShell** and in TypeScript/React.
- npm scripts MUST be cross-platform. No `rm -rf`, no `export VAR=`, no sh-only syntax. Use `rimraf` or `cross-env`, or Node scripts, if needed. (`a && b` is fine inside npm scripts: npm runs them through `cmd.exe` on Windows.)
- GitHub account: `iangopenbusinessai-lab`.

## Commands

`npm run dev` serves at http://localhost:5173/chemdrills/ (note the base path). `npm run e2e` builds, serves on port 4317 and runs `e2e/` (run `npm run e2e:install` once first).

The e2e server uses port **4317** with `reuseExistingServer: false` on purpose: another local project serves on Vite's default 4173, and reusing it silently tests the wrong app. Screenshots land in `test-results/screenshots/` (gitignored).

## Deployment

- **Target: GitHub Pages via GitHub Actions.** Live URL: **https://iangopenbusinessai-lab.github.io/chemdrills/**
- `.github/workflows/deploy.yml` builds and deploys on every push to `main`. **Before editing it, use the `deploy-pages` skill** (job layout, action version pins, actionlint).
- The workflow **requires Settings → Pages → Source = "GitHub Actions"**. Before this session the repo was on the legacy "Deploy from a branch" (`main`, `/`) source, which publishes the raw repo, not the build.
- `.nvmrc` (`24`) is the single source for the Node version, locally and in CI. `package-lock.json` must stay committed (`npm ci`).

### Base-path rules

The site lives at `/chemdrills/`, not `/`.

1. **`base: '/chemdrills/'` in `vite.config.ts` is unconditional**, for every build: dev, preview, e2e and CI. Never make it depend on an env var. The tests must run against exactly the bundle that ships; a local-only `/` base would let a broken asset path pass every test and then fail live.
2. **Any hand-built URL** (a `fetch` path, an asset reference, a link, an image `src`, a file in `public/`) uses `import.meta.env.BASE_URL`, e.g. `` `${import.meta.env.BASE_URL}data.json` ``. Never write a root-absolute `'/...'` path. Imported assets (`import x from './x.png'`) and `index.html` references are rewritten by Vite automatically.
3. **Playwright navigates with relative paths only**: `page.goto('./')`, never `goto('/')`. `baseURL` is `http://localhost:4317/chemdrills/`, and `goto('/')` resolves against the host root and drops `/chemdrills/`.
   - Note: `vite preview` answers `/` with a 302 to `/chemdrills/`, so `goto('/')` happened to work locally, which hid the problem. GitHub Pages has no such redirect.
   - `e2e/deploy.spec.ts` asserts the app loads directly (200, no redirect), every same-origin request is under `/chemdrills/` with status < 400, the font loads, and there are no console errors. A mutation check showed it catches a root-absolute `fetch('/elements.json')`.
4. **No router exists.** If one is added, set its `basename` to `import.meta.env.BASE_URL`, and remember that GitHub Pages returns 404 when a deep route is refreshed. Report that; don't silently add a `404.html` redirect hack.

## Source of truth

- `prototype/element-drills.html` is the original single-file prototype and the behavioral spec. When this file and the prototype disagree about game rules, the prototype wins. (It is also published as the claude.ai artifact "Element Drills".)
- **Data exception:** the prototype's masses were hand-typed. `src/data/elements.ts` is the authority for data.

## Architecture

Every game is one module in `src/games/` exporting a `GameDefinition` (discriminated union on `kind`, `src/games/types.ts`), registered in `src/games/index.ts`. A game's `id` is used in storage keys, so **never rename a shipped id**. To add a game, use the **`add-game` skill**.

### Element data

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
- **Families** drive tile colors; ids match the `--f-*` tokens. The list lives in `src/data/elements.ts`.
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
| Family sort | `familySort` | 12 tiles dealt from the range into a tray, in a **neutral** color. Buckets: only the families present in the range (7 for 1–20, 8 for 1–36 and 1–54, 10 for All), in `FAMILIES` order. Place by drag, or select a tile and then a bucket. Judged immediately. Right: the tile stays in the bucket in its family color. Wrong: back to the tray with a shake (an instant dashed outline under reduced motion), and it counts as a mistake. Dropped outside every bucket: back to the tray, not a mistake. Score = tiles right on the first try, out of 12. The elapsed time starts on the first interaction (select or drag) and stops on the 12th placement. Results: score, time, best (score and time), and the tiles that needed more than one try, each with its correct family. |

Family Sort isn't in the prototype. Its spec is the row above plus the Drag rules below.

**Z 104–118 are never dealt in Family Sort, even under All 118** (`PREDICTED_FROM_Z` in `lib/sort.ts`). Their family placements are predictions from periodic trends, not measured chemistry (only a handful of atoms of each have ever existed). Asking a learner to "know" them teaches false certainty. H stays in the pool as a nonmetal, and Po and At stay in the families the data file gives them (post-transition, halogen). Nothing was reclassified.

Shared quiz behavior:
- Enter submits and Enter again goes to the next question (focus moves to the Next button). Empty answers are ignored.
- After answering, the tile reveals every field.
- The results screen shows the score, the best score ("New best" only when a previous best existed and was beaten), and the missed tiles.
- The element range picker restarts the round when changed, and the selected range is remembered (default 1–36).

Deliberate deviation from the prototype: mass guesses accept a decimal comma (`35,5`), because `inputmode="decimal"` shows a comma key on some locales' keyboards.

## Drag rules

Any drag interaction in this project must follow the non-negotiable drag rules in `src/lib/CLAUDE.md` (no Pointer Events, no `setPointerCapture`; one coordinate core; tap-to-place must always work). Read that file before touching drag code.

## Design rules

- The **element tile is the identity** of the app. Game picker buttons, question prompts, and results are all element tiles. Don't restyle into generic cards.
- Font: Bricolage Grotesque (Google Fonts) with a system sans fallback. Tabular numbers for all digits.
- Tile colors come from the ten `--f-*` family tokens. Tile text is always dark ink (`--tile-ink`), even in dark mode.
- When a tile's family is the answer (Family Sort's tray), render it with `tone="neutral"` (`--tile-neutral`). The neutral variant also leaves `data-family` out of the DOM. Never fork ElementTile; add props instead.
- Small tray tiles shrink long names (Praseodymium) to fit on one line, using `--len` and container units. CSS `hyphens: auto` was tried and does nothing where the browser lacks a hyphenation dictionary, as in headless Chromium here.
- Light and dark themes via tokens: `prefers-color-scheme`, plus a `data-theme="light|dark"` override on `<html>`. There is no toggle UI, and the prototype had none.
- The periodic table scrolls inside its own `overflow-x: auto` wrapper (min-width 720px). The page body never scrolls sideways.
- Accessibility:
  - Visible focus.
  - `aria-live` on answer feedback, the found count and the end-of-round hint.
  - Fully keyboard playable.
  - `prefers-reduced-motion` respected.
  - Prompt tiles' `aria-label` lists only the visible fields, so screen readers don't give away the answer. The prototype said "Hidden element", which hid the symbol too.
- Mobile: usable at 375px, `inputmode="decimal"` for number answers, `viewport-fit=cover` with safe-area padding on `body`.
- Family Sort on phones: the bucket grid wraps (3 columns at 375px) and is `position: sticky; bottom: 0`, so every bucket stays on screen during a drag and nobody has to scroll mid-drag.

## Storage

- Keys:
  - `eldrills:v1:best:{gameId}:{range}` (e.g. `eldrills:v1:best:symbolToName:36`). Quizzes store a number.
  - Family Sort uses the same key shape (`eldrills:v1:best:familySort:36`) but stores `{ score, seconds }`.
    - Results rank by first-try score, with ties broken by the faster time. Time is compared in whole seconds, as displayed, and an equal time is not better.
    - "New best" shows only when a previous best existed and was beaten.
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
5. Screenshots at 375px and 1280px, in light and dark (`e2e/visual.spec.ts`, `e2e/sort-visual.spec.ts`). Check for no horizontal body scroll and family-colored tiles, then **look at the PNGs**.
6. Any drag change: `e2e/sort-touch.spec.ts` (real CDP touch input) must pass. CDP `touchEnd`/`touchCancel` list the points being **released**, and an empty list releases all of them. This was verified with a probe: listing the finger that should stay down lifts that finger.
7. Run the whole e2e suite with `--repeat-each=3`, since rounds are random.
8. Deployment changes:
   - After `npm run build`, every local `src`/`href` in `dist/index.html` starts with `/chemdrills/`. Only the Google Fonts URLs are external.
   - `e2e/deploy.spec.ts` passes.
   - actionlint is clean on `.github/workflows/deploy.yml`.

## Status

### Real (verified 2026-09-23)
- **Deployment setup (local verification only; not yet live, see Open)**:
  - The workflow is written, and actionlint 1.7.12 reports 0 errors. A negative control with a typo'd runner label and step id was caught, so the linter really checks. ShellCheck isn't installed, so the two one-line `run:` steps weren't shell-linted.
  - `base: '/chemdrills/'` is set unconditionally. `dist/index.html` references `/chemdrills/assets/*.js` and `*.css`, and the built CSS has no `url()`. Nothing in `src/` builds URLs by hand, and there's no router and no `public/` folder.
  - Under `vite preview` on 4317, `/chemdrills/` renders with Bricolage Grotesque loaded. All five requests returned 200 (page, CSS, JS, font CSS, font file), with no console messages. The screenshot was reviewed by eye.
  - The repo is public. Pages was on the legacy branch source when checked, and must be switched to "GitHub Actions".
  - The existing spec diff is exactly 14 `goto('/')` → `goto('./')` swaps, with 0 other changed lines. All assertions are unchanged.
  - Unit and e2e suites pass from PowerShell: 46 unit tests, 36 e2e tests, and 108 of 108 across `--repeat-each=3`.
- **Six games**: the five ported from the prototype (rules, wording and styling matching it), plus Family Sort (the first `sort` kind).
- **Game model**: `GameDefinition = QuizGame | FillTableGame | SortGame`, with an exhaustive `switch` in `App.tsx`. The five original games behave exactly as before: all 35 original unit tests and 19 original Playwright tests pass **unmodified** (`git diff` on the old test files is empty).
- **`npm run build`**: zero TS errors under strict + `noUncheckedIndexedAccess`.
- **`npm run lint`**: clean.
- **`npm test`**: 46 unit tests pass.
  - Data integrity: count, z sequence, unique symbols/names, grid vs. a hand-drawn table, families, synthetic set, mass display.
  - Matching: aluminium/sulphur/caesium; "hydrogn" accepted in a quiz but rejected in Name Them All; `fe`/`FE`/`Fe`; short-input typos rejected.
  - Mass scoring, storage (including throwing storage), and the game registry.
  - Sort:
    - 12 distinct tiles, over 200 seeds × 4 ranges, never Z ≥ 104.
    - Only in-range families, in table order.
    - H stays a nonmetal; Po and At keep their data-file families.
    - Placement judging, first-try scoring, mistake counting; a drop outside a bucket isn't a mistake.
    - The best result's tie-break (a faster time wins at an equal score; an equal time doesn't), stored as `{ score, seconds }`.
    - Corrupt or blocked storage.
- **`npm run e2e`**: 36 Playwright tests pass, 108 of 108 across a `--repeat-each=3` run, from PowerShell. That's the 35 below plus `deploy.spec.ts`, all served under `/chemdrills/`.
  - The original 19:
    - Name Them All: names lock in; typos don't; the clock starts on the first keystroke; time-out and Give up reveal missed cells; the best count is saved.
    - Each quiz: a right and a wrong answer, and a full round with results.
    - Mass points checked against the formula.
    - A range switch restarts the round.
    - Keyboard play.
    - Blocked storage.
    - Visual checks at 375/1280, light/dark.
  - Family Sort, mouse:
    - A full round by real mouse drag, with a deliberate wrong drop and a drop outside every bucket (no mistake).
    - Score 11/12, the time (driven by Playwright's clock), the retried tile with its family, and the best line "11 in m:ss".
    - `{ score, seconds }` is saved.
    - Click-to-place.
  - Family Sort, keyboard only: a full round by Tab/Enter, including a wrong placement (focus returns to the tile).
  - Family Sort, touch via CDP `Input.dispatchTouchEvent` at 375×667:
    - a) a full drag into the correct bucket; the preview sits above the finger, and every bucket is on screen mid-drag
    - b) touchcancel mid-drag: no preview or hover left, body `userSelect`/`cursor` restored, no mistake, and the next drag works
    - c) a second finger (down on another tile, over a wrong bucket, lifted) doesn't disturb the first
    - d) CDP mouse press/release right after touchend (both after a drag-drop and after a tap-select) causes no second action, and mouse clicks work again after the window
    - e) a short tap (3px jitter) selects rather than drags
    - f) a swipe starting on the heading scrolls the page
  - Mutation checks: the tests fail when the mouse-ignore window, the identifier check, or the body restore is removed (see Drag rules).
  - Neutral tray: each tray tile's **computed** background equals `--tile-neutral`, differs from its family color, and has no `data-family`. A placed tile's computed background equals its family token.
  - Buckets per range (7 / 10), a range switch mid-round restarts, 15 deals under All never include Z ≥ 104, and a full round works with storage throwing.
  - Screenshots at 375/1280, light/dark, mid-round and on results, with no horizontal body scroll and every bucket inside the width. Reviewed by eye.
  - All 103 sortable names fit on one line in a 375px tray tile (Range measurement, and Praseodymium checked by eye).
- **Masses**: all 84 elements with a standard weight match CIAAW 2024 abridged. The 34 synthetic ones were cross-checked against PubChem, with the differences noted above.

### Open
- **Live deploy: NOT verified.** The workflow has never run on GitHub, and nothing has been loaded from https://iangopenbusinessai-lab.github.io/chemdrills/. This stays open until the developer confirms the live site loads on their phone. Remaining manual steps:
  1. Settings → Pages → Source: switch from "Deploy from a branch" to **GitHub Actions**. (The repo is already public.)
  2. Push `main`.
  3. Watch the Actions tab: "Deploy to GitHub Pages" should pass both `build` and `deploy`.
  4. Open the live URL on a phone.
- **Real devices**: no real phone, tablet or Safari/iOS testing has been done. Touch was tested only through Chromium's CDP touch emulation. iOS Safari's touch/scroll behavior, synthesized-mouse timing, `touch-action` support and sticky positioning are unverified, and so is safe-area padding.
- **Browsers**: only Chromium is tested. Firefox and WebKit aren't.
- **Screen readers**: not tested with NVDA or VoiceOver. The aria labels and live regions are written but unheard.
- **Dev mode**: e2e runs against the production build (`vite preview`). `npm run dev` with React StrictMode isn't exercised by automated tests.
- **Accounts or leaderboards**: deliberately out of scope for now.
- **Roadmap games** (not started, not yet specced; see the `add-game` skill):
  - other sort games (e.g. metals / nonmetals / metalloids): should be one file + one line now
  - electron configuration
  - periodic-trend "which is bigger" (radius, electronegativity)
  - equation balancing
  - naming compounds from formulas
