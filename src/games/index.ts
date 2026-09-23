import { elementToNumber } from './elementToNumber';
import { guessMass } from './guessMass';
import { nameAll } from './nameAll';
import { numberToElement } from './numberToElement';
import { symbolToName } from './symbolToName';
import type { GameDefinition } from './types';

/** The game registry. Order here is the order of the picker. */
export const GAMES: readonly GameDefinition[] = [
  nameAll,
  symbolToName,
  numberToElement,
  elementToNumber,
  guessMass,
];

export function gameById(id: string): GameDefinition | undefined {
  return GAMES.find((g) => g.id === id);
}
