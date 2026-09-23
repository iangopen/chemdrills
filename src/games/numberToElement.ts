import { matchNameOrSymbol } from '../lib/matching';
import { identityFeedback, missIfZero, oneIfCorrect, QUESTIONS_PER_ROUND, randomQuestions } from '../lib/quiz';
import type { QuizGame } from './types';

export const numberToElement: QuizGame = {
  id: 'numberToElement',
  title: 'Number to element',
  code: 'Nº',
  family: 'halogen',
  kind: 'quiz',
  round: { questions: QUESTIONS_PER_ROUND, maxPerQuestion: 1, showStreak: true },
  prompt: {
    question: 'Which element has this atomic number?',
    placeholder: 'Name or symbol',
    inputMode: 'text',
    hide: { name: false, sym: false, mass: false },
  },
  makeQuestions: randomQuestions,
  check: (e, input) => ({ match: matchNameOrSymbol(e, input) }),
  score: oneIfCorrect,
  isMiss: missIfZero,
  feedback: identityFeedback,
  missedLabel: 'Missed',
};
