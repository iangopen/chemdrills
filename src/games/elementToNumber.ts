import { matchInteger } from '../lib/matching';
import { identityFeedback, missIfZero, oneIfCorrect, QUESTIONS_PER_ROUND, randomQuestions } from '../lib/quiz';
import type { QuizGame } from './types';

export const elementToNumber: QuizGame = {
  id: 'elementToNumber',
  title: 'Element to number',
  code: 'Z',
  family: 'alkaline',
  kind: 'quiz',
  round: { questions: QUESTIONS_PER_ROUND, maxPerQuestion: 1, showStreak: true },
  prompt: {
    question: 'What is its atomic number?',
    placeholder: 'Atomic number',
    inputMode: 'decimal',
    hide: { num: false, mass: false },
  },
  makeQuestions: randomQuestions,
  check: (e, input) => ({ match: matchInteger(e.z, input) }),
  score: oneIfCorrect,
  isMiss: missIfZero,
  feedback: identityFeedback,
  missedLabel: 'Missed',
};
