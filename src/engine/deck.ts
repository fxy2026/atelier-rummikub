import { GameState, Meld, Tile, TileColor, TileNumber } from './types';

export const TILE_COLORS: TileColor[] = ['red', 'blue', 'yellow', 'black'];
export const TILE_NUMBERS: TileNumber[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13];
export const TOTAL_DECK_SIZE = 106;
export const INITIAL_HAND_SIZE = 14;
export const JOKER_PENALTY_POINTS = 30;
export const INITIAL_MELD_MIN_POINTS = 30;

const COLOR_ORDER: Record<TileColor, number> = {
  red: 0,
  blue: 1,
  yellow: 2,
  black: 3,
};

/**
 * Generates the standard 106-tile Rummikub deck:
 * - 4 colors (red, blue, yellow, black) x 13 numbers (1..13) x 2 copies = 104 tiles
 * - 2 Jokers (red joker-1, black joker-2) = 2 tiles
 */
export function createDeck(): Tile[] {
  const deck: Tile[] = [];

  for (const color of TILE_COLORS) {
    for (const num of TILE_NUMBERS) {
      for (const copy of [1, 2] as const) {
        deck.push({
          id: `${color}-${num}-${copy}`,
          color,
          number: num,
          isJoker: false,
          copy,
        });
      }
    }
  }

  deck.push({
    id: 'joker-1',
    color: 'red',
    number: 13,
    isJoker: true,
    copy: 1,
  });

  deck.push({
    id: 'joker-2',
    color: 'black',
    number: 13,
    isJoker: true,
    copy: 2,
  });

  return deck;
}

/**
 * Unbiased Fisher-Yates shuffle. Accepts an optional RNG for deterministic tests.
 */
export function shuffleDeck(deck: readonly Tile[], rng: () => number = Math.random): Tile[] {
  const copy = deck.map((tile) => ({ ...tile }));
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const temp = copy[i];
    copy[i] = copy[j];
    copy[j] = temp;
  }
  return copy;
}

export interface DealResult {
  hands: Tile[][];
  pool: Tile[];
}

/**
 * Deals 14 tiles to each of the 2–4 players and leaves the rest in the draw pool.
 */
export function dealInitialHands(
  playerCount: number,
  rng: () => number = Math.random
): DealResult {
  if (playerCount < 2 || playerCount > 4) {
    throw new Error(`Invalid player count: ${playerCount}. Must be between 2 and 4.`);
  }

  const shuffled = shuffleDeck(createDeck(), rng);
  const hands: Tile[][] = [];
  let cursor = 0;

  for (let p = 0; p < playerCount; p++) {
    hands.push(shuffled.slice(cursor, cursor + INITIAL_HAND_SIZE));
    cursor += INITIAL_HAND_SIZE;
  }

  const pool = shuffled.slice(cursor);
  return { hands, pool };
}

/**
 * Sorts a list of tiles either by color-first (red -> blue -> yellow -> black, then 1..13)
 * or by number-first (1..13, then color), placing Jokers at the end.
 */
export function sortTiles(tiles: readonly Tile[], mode: 'color' | 'number'): Tile[] {
  return [...tiles].sort((a, b) => {
    if (a.isJoker && !b.isJoker) return 1;
    if (!a.isJoker && b.isJoker) return -1;
    if (a.isJoker && b.isJoker) return a.id.localeCompare(b.id);

    if (mode === 'color') {
      const colorDiff = COLOR_ORDER[a.color] - COLOR_ORDER[b.color];
      if (colorDiff !== 0) return colorDiff;
      if (a.number !== b.number) return a.number - b.number;
      return a.copy - b.copy;
    } else {
      if (a.number !== b.number) return a.number - b.number;
      const colorDiff = COLOR_ORDER[a.color] - COLOR_ORDER[b.color];
      if (colorDiff !== 0) return colorDiff;
      return a.copy - b.copy;
    }
  });
}

/**
 * Calculates the penalty points of remaining tiles in a player's hand at game end.
 * Number tiles = face value (1..13), Joker = 30 points.
 */
export function calculateHandPenalty(hand: readonly Tile[]): number {
  return hand.reduce((sum, tile) => sum + (tile.isJoker ? JOKER_PENALTY_POINTS : tile.number), 0);
}

/**
 * Deep clones a list of melds to guarantee immutability across turn snapshots.
 */
export function cloneMelds(melds: readonly Meld[]): Meld[] {
  return melds.map((meld) => ({
    id: meld.id,
    tiles: meld.tiles.map((t) => ({ ...t })),
  }));
}

/**
 * Deep clones a list of tiles.
 */
export function cloneTiles(tiles: readonly Tile[]): Tile[] {
  return tiles.map((t) => ({ ...t }));
}

export interface ConservationCheckResult {
  isValid: boolean;
  totalCount: number;
  uniqueCount: number;
  duplicateIds: string[];
  missingIds: string[];
}

/**
 * Verifies that all 106 canonical tiles exist exactly once across pool, players' hands, and table.
 */
export function validateTileConservation(
  state: Pick<GameState, 'pool' | 'players' | 'table'>
): ConservationCheckResult {
  const canonicalIds = new Set(createDeck().map((t) => t.id));
  const seenIds = new Set<string>();
  const duplicateIds: string[] = [];
  let totalCount = 0;

  const inspectTile = (tile: Tile) => {
    totalCount++;
    if (seenIds.has(tile.id)) {
      duplicateIds.push(tile.id);
    } else {
      seenIds.add(tile.id);
    }
  };

  for (const tile of state.pool) inspectTile(tile);
  for (const player of state.players) {
    for (const tile of player.hand) inspectTile(tile);
  }
  for (const meld of state.table) {
    for (const tile of meld.tiles) inspectTile(tile);
  }

  const missingIds: string[] = [];
  for (const id of canonicalIds) {
    if (!seenIds.has(id)) {
      missingIds.push(id);
    }
  }

  const isValid =
    totalCount === TOTAL_DECK_SIZE &&
    seenIds.size === TOTAL_DECK_SIZE &&
    duplicateIds.length === 0 &&
    missingIds.length === 0;

  return {
    isValid,
    totalCount,
    uniqueCount: seenIds.size,
    duplicateIds,
    missingIds,
  };
}
