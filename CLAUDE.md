# CLAUDE.md — Element Drills (chemdrills)

A set of browser games for learning the periodic table: naming every element, symbol/number/name lookups, estimating atomic mass, and sorting elements into families. More chemistry games are planned, so the architecture treats each game as a plug-in.

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
  lib/sort.ts            pure sort-round logic: pool, buckets, deal, place, scoring, best (tie-break)
  lib/useBucketDrag.ts   the drag engine (mouse + touch); see "Drag rules"
  games/
    types.ts             GameDefinition = QuizGame | FillTableGame | SortGame
    index.ts             GAMES registry (order = picker order)
    nameAll.ts, symbolToName.ts, numberToElement.ts, elementToNumber.ts, guessMass.ts, familySort.ts
  components/
    ElementTile.tsx      the core visual: sizes lg/sm/xs, tone family/neutral, optional color override
    PeriodicTable.tsx    18-col grid + family legend, used by Name Them All
    ModePicker.tsx       element-cell buttons, one per game
    RangePicker.tsx      1–20 / 1–36 / 1–54 / All 118
    QuizRunner.tsx       plays any QuizGame (question → answer → reveal → results)
    FillRunner.tsx       plays any FillTableGame (timed free typing that fills the table)
    SortRunner.tsx       plays any SortGame (tray of neutral tiles, buckets, results)
  App.tsx                picker + stage; exhaustive switch on kind; remounts the runner (via key) to restart
  styles/tokens.css, styles/app.css
e2e/                     Playwright specs: games, storage-blocked, visual, sort, sort-touch, sort-visual
```

### GameDefinition

Every game is one module exporting a `GameDefinition` (`src/games/types.ts`), a discriminated union on `kind`. Each kind has its own config shape and its own screen. `App.tsx` switches on `kind` with a `never` check, so a new kind without a screen does not compile.

Common fields: `id` (used in storage keys, so never rename a shipped id), `title`, `code` (big text on the picker tile), `family` (picker tile color), `kind`.

- `kind: 'quiz'` → `QuizRunner`. `round: { questions, maxPerQuestion, showStreak }`, plus `prompt` (question text, placeholder, `inputMode`, which tile fields to hide, optional hint), `makeQuestions(pool, count)`, `check(e, input) → Answer`, `score(e, answer) → points`, `isMiss(points)`, `feedback(...)`, `missedLabel`.
- `kind: 'fillTable'` → `FillRunner`. `round: { seconds }`, `check(pool, input, found) → Element | undefined`, `score(found)`. (Renamed from `'fill'` on 2026-09-23; no behavior change.)
- `kind: 'sort'` → `SortRunner`. `round: { tiles }`, `prompt: { instruction }`, `eligible(e)` (pool filter on top of the range), `buckets: SortBucket[]` (`{ id, label, color }` in display order), `bucketOf(e) → bucket id`, `retryLabel`. Judging, first-try scoring, the timer and best results are shared in `lib/sort.ts`, not per game.

### How to add a game

1. Pick the kind it fits and create `src/games/myGame.ts` exporting a `QuizGame` / `FillTableGame` / `SortGame`. For quizzes, reuse the helpers in `lib/quiz.ts` (`randomQuestions`, `oneIfCorrect`, `missIfZero`, `identityFeedback`).
2. Add one line to `GAMES` in `src/games/index.ts`.
3. Add unit tests for any new pure logic, plus an e2e test.

**Adding a sort game** (say, metals / nonmetals / metalloids) is one file plus one registry line:

```ts
export const metalSort: SortGame = {
  id: 'metalSort', title: 'Metal or not', code: 'Me', family: 'post', kind: 'sort',
  round: { tiles: 12 },
  prompt: { instruction: 'Metal, metalloid, or nonmetal?' },
  eligible: isMeasured, // keeps the Z 104+ exclusion
  buckets: [
    { id: 'metal', label: 'Metal', color: 'transition' },
    { id: 'metalloid', label: 'Metalloid', color: 'metalloid' },
    { id: 'nonmetal', label: 'Nonmetal', color: 'nonmetal' },
  ],
  bucketOf: (e) => (e.family === 'metalloid' ? 'metalloid' : NONMETALS.has(e.family) ? 'nonmetal' : 'metal'),
  retryLabel: 'Needed another try',
};
```

A bucket's `color` is a family token, and placed tiles take on the bucket's color. Buckets with no eligible element in the chosen range are hidden automatically.

**Limit, stated honestly:** a game with a genuinely new interaction (equation balancing, multiple choice, ordering) needs a new `kind` in `types.ts`, a new screen component, and a new `case` in `App.tsx`; the compiler insists. After that, further games of that kind are one file + one line again.

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
| Family sort | `familySort` | 12 tiles dealt from the range into a tray, in a **neutral** color. Buckets: only the families present in the range (7 for 1–20, 8 for 1–36 and 1–54, 10 for All), in `FAMILIES` order. Place by drag, or select a tile and then a bucket. Judged immediately. Right: the tile stays in the bucket in its family color. Wrong: back to the tray with a shake (an instant dashed outline under reduced motion), and it counts as a mistake. Dropped outside every bucket: back to the tray, not a mistake. Score = tiles right on the first try, out of 12. The elapsed time starts on the first interaction (select or drag) and stops on the 12th placement. Results: score, time, best (score and time), and the tiles that needed more than one try, each with its correct family. |

Family Sort isn't in the prototype. Its spec is the row above plus the Drag rules below.

**Z 104–118 are never dealt in Family Sort, even under All 118** (`PREDICTED_FROM_Z` in `lib/sort.ts`). Their family placements are predictions from periodic trends, not measured chemistry (only a handful of atoms of each have ever existed). Asking a learner to "know" them teaches false certainty. H stays in the pool as a nonmetal, and Po and At stay in the families the data file gives them (post-transition, halogen). Nothing was reclassified.

Shared quiz behavior:
- Enter submits and Enter again goes to the next question (focus moves to the Next button). Empty answers are ignored.
- After answering, the tile reveals every field.
- The results screen shows the score, the best score ("New best" only when a previous best existed and was beaten), and the missed tiles.
- The element range picker restarts the round when changed, and the selected range is remembered (default 1–36).

Deliberate deviation from the prototype: mass guesses accept a decimal comma (`35,5`), because `inputmode="decimal"` shows a comma key on some locales' keyboards.

## Drag rules (apply to any drag interaction in this project)

Hard-won in an earlier project's touch drag, and not negotiable. They're implemented in `src/lib/useBucketDrag.ts`.

1. **No Pointer Events and no `setPointerCapture`.** That model was abandoned after real pain.
2. **One coordinate core**: `startDragAt(tile, x, y)` → `moveTo(x, y)` → `endDrag(drop)`. Thin mouse and touch wrappers only extract coordinates. Rendering and drop logic are shared, never duplicated per input type.
3. **`touchmove`, `touchend` and `touchcancel` are native `document.addEventListener` calls with `{ passive: false }`.** React's root touch listeners are passive, so `preventDefault` inside `onTouchMove` silently fails. `onTouchStart` can stay a React prop.
4. **Hit-test with `document.elementFromPoint` only while moving** (touch has implicit capture). Resolve it with `.closest('[data-bucket]')` and store it in a ref **synchronously**. The drop reads that ref, never React state and never a fresh hit-test at touchend. (Stale hover state caused a real drop-target race before.) React state mirrors the ref only to highlight the hovered bucket.
5. **Follow the initiating touch's `identifier`.** Find it in `changedTouches`, and never index `touches[0]`. A second finger can't start, move or end the drag.
6. **Handle `touchcancel`**: end without judging (back to the tray, not a mistake) and restore `body.style.userSelect` and `cursor`. Unmounting mid-drag also restores them.
7. **After any touch ends, ignore mouse events for ~500ms** (`MOUSE_IGNORE_MS`), because browsers synthesize mouse events after touchend, which would start or drop a tile twice. `touchend` also calls `preventDefault`. Click handlers ignore pointer clicks (`detail > 0`) inside the window, but keyboard clicks (`detail === 0`) always count.
8. **`touch-action: none` on draggable tiles only**, so the page still scrolls when a finger starts anywhere else.
9. **The touch preview sits above the finger** (`TOUCH_PREVIEW_GAP`), not centered under it. The mouse preview keeps the grab point.
10. **A drop outside every target** returns the item and is not a mistake.
11. **Movement under `DRAG_THRESHOLD` (8px) is a tap**, meaning selection, not a drag. A touch tap selects in the touchend handler, and a mouse tap is left to `onClick`. After a real mouse drag, the click that follows is suppressed.
12. **Tap-to-place works with no drag code at all.** Selection and placement live in `onClick` (keyboard, mouse click, screen readers). Drag is an extra path, never the only one.

Checked by mutation testing:
- Removing the 500ms window, following `touches[0]`, or skipping the body-style restore each makes a touch e2e test fail.
- Making touchmove passive is caught only by the console-error check (Chromium logs "Unable to preventDefault inside passive event listener"). The page itself didn't misbehave, because `touch-action: none` on the tiles already blocks scrolling in Chromium. Keep `passive: false` anyway: it's the defense for browsers whose touch-action support differs.

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

## Status

### Real (verified 2026-09-23)
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
- **`npm run e2e`**: 35 Playwright tests pass, 105 of 105 across a `--repeat-each=3` run, from PowerShell.
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
- **Real devices**: no real phone, tablet or Safari/iOS testing has been done. Touch was tested only through Chromium's CDP touch emulation. iOS Safari's touch/scroll behavior, synthesized-mouse timing, `touch-action` support and sticky positioning are unverified, and so is safe-area padding.
- **Browsers**: only Chromium is tested. Firefox and WebKit aren't.
- **Screen readers**: not tested with NVDA or VoiceOver. The aria labels and live regions are written but unheard.
- **Dev mode**: e2e runs against the production build (`vite preview`). `npm run dev` with React StrictMode isn't exercised by automated tests.
- **Deployment target**: Vercel or GitHub Pages, undecided.
- **Accounts or leaderboards**: deliberately out of scope for now.
- **Roadmap games** (not started, not yet specced; see "How to add a game"):
  - other sort games (e.g. metals / nonmetals / metalloids): should be one file + one line now
  - electron configuration
  - periodic-trend "which is bigger" (radius, electronegativity)
  - equation balancing
  - naming compounds from formulas
