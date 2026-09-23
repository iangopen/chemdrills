import { QUESTIONS_PER_ROUND, randomQuestions } from '../lib/quiz';
import { MASS_MAX_POINTS, MASS_MISS_THRESHOLD, massPoints, parseGuess } from '../lib/scoring';
import type { QuizGame } from './types';

export const guessMass: QuizGame = {
  id: 'guessMass',
  title: 'Guess the mass',
  code: 'u',
  family: 'metalloid',
  kind: 'quiz',
  round: { questions: QUESTIONS_PER_ROUND, maxPerQuestion: MASS_MAX_POINTS, showStreak: false },
  prompt: {
    question: 'Estimate its atomic mass.',
    placeholder: 'Mass in u, e.g. 35.5',
    inputMode: 'decimal',
    hide: { mass: false },
    hint: 'Scored out of 100 per element. For lighter elements, the mass is roughly twice the atomic number.',
  },
  makeQuestions: randomQuestions,
  check: (_e, input) => ({ match: null, guess: parseGuess(input) }),
  score: (e, a) => massPoints(e.mass, a.guess ?? Number.NaN),
  isMiss: (points) => points < MASS_MISS_THRESHOLD,
  feedback: (e, input, _a, points) =>
    `${e.name} is ${e.massText} u. You said ${input.trim()}: ${points} points.` +
    (e.synthetic ? ' Bracketed masses are the most stable isotope.' : ''),
  missedLabel: 'Worth another look',
};
