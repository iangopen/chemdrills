---
name: add-game
description: How to add a new Element Drills game (quiz, fillTable or sort kind, or a new kind) — files to create, registry line, tests, and a worked sort-game example.
---

Read `src/games/types.ts` for the exact `GameDefinition` fields of each kind.

# How to add a game

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
