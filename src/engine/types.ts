export type TileColor = 'red' | 'blue' | 'yellow' | 'black';

export type TileNumber = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13;

export interface Tile {
  /** Stable globally unique identifier across the 106-tile deck (e.g. "red-7-1", "joker-1") */
  id: string;
  color: TileColor;
  number: TileNumber;
  isJoker: boolean;
  copy: 1 | 2;
}

export interface Meld {
  /** Unique identifier for a meld group on the table */
  id: string;
  tiles: Tile[];
}

export interface JokerAssignment {
  tileId: string;
  representedNumber: TileNumber;
  representedColor: TileColor;
}

export interface MeldValidationResult {
  isValid: boolean;
  type: 'group' | 'run' | 'invalid';
  score: number;
  jokerAssignments: Record<string, JokerAssignment>;
  normalizedTiles: Tile[];
  errorReason?: string;
}

export type AIDifficulty = 'easy' | 'hard';

export type PlayerType = 'human' | 'ai';

export interface Player {
  id: string;
  name: string;
  type: PlayerType;
  aiDifficulty?: AIDifficulty;
  hand: Tile[];
  /** Whether the player has completed the initial >= 30 points meld ("破冰") */
  hasInitialMeld: boolean;
  /** Final score calculated at the end of the game */
  score: number;
}

export interface TurnSnapshot {
  hand: Tile[];
  table: Meld[];
}

export type GameStatus = 'idle' | 'playing' | 'finished';

export type EndReason = 'empty_hand' | 'stalemate';

export interface TurnHistoryLog {
  id: string;
  turnNumber: number;
  playerId: string;
  playerName: string;
  action: 'play' | 'draw' | 'pass';
  tilesPlayedCount: number;
  pointsPlayed?: number;
  brokeIce?: boolean;
  timestamp: number;
}

export interface GameConfig {
  aiCount: 1 | 2 | 3;
  aiDifficulty: AIDifficulty;
  soundEnabled: boolean;
  autoSortRack: 'color' | 'number' | 'manual';
}

export interface GameState {
  id: string;
  status: GameStatus;
  config: GameConfig;
  players: Player[];
  currentPlayerIndex: number;
  /** Remaining draw pool */
  pool: Tile[];
  /** Current working table melds */
  table: Meld[];
  /** Snapshot of current player's hand and table at the beginning of their turn */
  turnStartSnapshot: TurnSnapshot;
  /** Stack of intermediate snapshots within the current turn for step-by-step undo */
  undoStack: TurnSnapshot[];
  turnNumber: number;
  /** Number of consecutive passes when pool is empty (triggers stalemate when === players.length) */
  consecutivePasses: number;
  winnerId: string | null;
  endReason: EndReason | null;
  history: TurnHistoryLog[];
  lastError: string | null;
  lastActionNotice: string | null;
  /** Tile IDs that were drawn or played in the most recent turn for visual highlight */
  recentTileIds: string[];
}

export interface TurnCommitValidation {
  isValid: boolean;
  errorReason?: string;
  playedTiles: Tile[];
  totalPlayedScore: number;
  brokeIce: boolean;
  normalizedTable: Meld[];
}

export interface AIPlayerView {
  playerId: string;
  hand: Tile[];
  table: Meld[];
  hasInitialMeld: boolean;
  difficulty: AIDifficulty;
  poolCount: number;
  opponentHandCounts: number[];
}

export interface AIMoveDecision {
  action: 'play' | 'draw';
  newHand: Tile[];
  newTable: Meld[];
  explanation: string;
}
