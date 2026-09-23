import { matchName } from '../lib/matching';
import { identityFeedback, missIfZero, oneIfCorrect, QUESTIONS_PER_ROUND, randomQuestions } from '../lib/quiz';
import type { QuizGame } from './types';

export const symbolToName: QuizGame = {
  id: 'symbolToName',
  title: 'Symbol to name',
  code: 'Sy',
  family: 'transition',
  kind: 'quiz',
  round: { questions: QUESTIONS_PER_ROUND, maxPerQuestion: 1, showStreak: true },
  prompt: {
    question: 'Which element has this symbol?',
    placeholder: 'Element name',
    inputMode: 'text',
    hide: { name: false, num: false, mass: false },
  },
  makeQuestions: randomQuestions,
  check: (e, input) => ({ match: matchName(e, input) }),
  score: oneIfCorrect,
  isMiss: missIfZero,
  feedback: identityFeedback,
  missedLabel: 'Missed',
};
