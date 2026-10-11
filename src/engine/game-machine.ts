import { computeAIMove } from './ai';
import {
  calculateHandPenalty,
  cloneMelds,
  cloneTiles,
  dealInitialHands,
  sortTiles,
  validateTileConservation,
} from './deck';
import {
  EndReason,
  GameConfig,
  GameState,
  Meld,
  Player,
  Tile,
  TurnSnapshot,
} from './types';
import { validateMeld, validateTurnCommit } from './validator';

const AI_NAMES = ['阿尔法 · 智者', '贝塔 · 大师', '伽马 · 策士'];

export const DEFAULT_GAME_CONFIG: GameConfig = {
  aiCount: 3,
  aiDifficulty: 'hard',
  soundEnabled: true,
  autoSortRack: 'color',
};

/**
 * Creates a fresh, valid Rummikub game state for 1 Human + (1..3) AI players (or custom players).
 */
export function createInitialGameState(
  partialConfig: Partial<GameConfig> = {},
  rng: () => number = Math.random,
  customPlayerNames?: { name: string; type: 'human' | 'ai' }[]
): GameState {
  const config: GameConfig = {
    ...DEFAULT_GAME_CONFIG,
    ...partialConfig,
  };

  const totalPlayers = customPlayerNames
    ? customPlayerNames.length
    : 1 + config.aiCount;

  const { hands, pool } = dealInitialHands(totalPlayers, rng);

  const players: Player[] = [];
  for (let i = 0; i < totalPlayers; i++) {
    const custom = customPlayerNames?.[i];
    const isHuman = custom ? custom.type === 'human' : i === 0;
    const rawHand = hands[i];
    const sortedHand =
      config.autoSortRack === 'manual'
        ? rawHand
        : sortTiles(rawHand, config.autoSortRack);

    players.push({
      id: isHuman && i === 0 ? 'player-human' : `player-${i + 1}`,
      name: custom
        ? custom.name
        : isHuman
        ? config.playerName?.trim() || '你（玩家）'
        : AI_NAMES[i - 1] ?? `AI #${i}`,
      type: isHuman ? 'human' : 'ai',
      aiDifficulty: isHuman ? undefined : config.aiDifficulty,
      hand: sortedHand,
      hasInitialMeld: false,
      score: 0,
    });
  }

  const initialSnapshot: TurnSnapshot = {
    hand: cloneTiles(players[0].hand),
    table: [],
  };

  return {
    id: `game-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    status: 'playing',
    config,
    players,
    currentPlayerIndex: 0,
    pool,
    table: [],
    turnStartSnapshot: initialSnapshot,
    undoStack: [],
    turnNumber: 1,
    consecutivePasses: 0,
    winnerId: null,
    endReason: null,
    history: [],
    lastError: null,
    lastActionNotice: '新对局已开始，首次出牌（破冰）需满 30 分',
    recentTileIds: [],
  };
}

/**
 * Helper to record current working state onto the undo stack before mutating.
 */
function pushUndoSnapshot(state: GameState): TurnSnapshot[] {
  const currentPlayer = state.players[state.currentPlayerIndex];
  const snapshot: TurnSnapshot = {
    hand: cloneTiles(currentPlayer.hand),
    table: cloneMelds(state.table),
  };
  return [...state.undoStack, snapshot];
}

/**
 * Updates the current player's hand and table while preserving undo history.
 */
function withUpdatedWorkingState(
  state: GameState,
  newHand: Tile[],
  newTable: Meld[],
  recordUndo: boolean = true
): GameState {
  const undoStack = recordUndo ? pushUndoSnapshot(state) : state.undoStack;
  const cleanedTable = newTable.filter((m) => m.tiles.length > 0);
  const updatedPlayers = state.players.map((p, idx) =>
    idx === state.currentPlayerIndex ? { ...p, hand: newHand } : p
  );

  return {
    ...state,
    players: updatedPlayers,
    table: cleanedTable,
    undoStack,
    lastError: null,
  };
}

/**
 * Removes specific tile IDs from wherever they currently sit (current player's hand or table melds)
 * and returns the extracted tiles in the requested order along with the remaining hand and table.
 */
function extractTilesFromWorkingState(
  hand: readonly Tile[],
  table: readonly Meld[],
  tileIds: readonly string[]
): {
  extracted: Tile[];
  remainingHand: Tile[];
  remainingTable: Meld[];
} {
  const idSet = new Set(tileIds);
  const tileMap = new Map<string, Tile>();

  const remainingHand: Tile[] = [];
  for (const t of hand) {
    if (idSet.has(t.id)) {
      tileMap.set(t.id, { ...t });
    } else {
      remainingHand.push({ ...t });
    }
  }

  const remainingTable: Meld[] = [];
  for (const meld of table) {
    const keptTiles: Tile[] = [];
    for (const t of meld.tiles) {
      if (idSet.has(t.id)) {
        tileMap.set(t.id, { ...t });
      } else {
        keptTiles.push({ ...t });
      }
    }
    if (keptTiles.length > 0) {
      remainingTable.push({
        id: meld.id,
        tiles: keptTiles,
      });
    }
  }

  const extracted: Tile[] = [];
  for (const id of tileIds) {
    const found = tileMap.get(id);
    if (found) extracted.push(found);
  }

  return { extracted, remainingHand, remainingTable };
}

/**
 * Moves one or more tiles (from hand or table) to create a brand-new meld on the table.
 */
export function playTilesToNewMeld(
  state: GameState,
  tileIds: readonly string[]
): GameState {
  if (state.status !== 'playing' || tileIds.length === 0) return state;

  const currentPlayer = state.players[state.currentPlayerIndex];

  // If player has not broken the ice, disallow moving tiles from pre-existing table melds
  if (!currentPlayer.hasInitialMeld) {
    const startTableIds = new Set(
      state.turnStartSnapshot.table.flatMap((m) => m.tiles.map((t) => t.id))
    );
    if (tileIds.some((id) => startTableIds.has(id))) {
      return {
        ...state,
        lastError: '完成首次 30 分破冰前，不能移动或拆分桌面已有的牌组',
      };
    }
  }

  const { extracted, remainingHand, remainingTable } = extractTilesFromWorkingState(
    currentPlayer.hand,
    state.table,
    tileIds
  );

  if (extracted.length === 0) return state;

  // Auto-normalize if the newly created meld is already a valid run/group
  const check = validateMeld(extracted);
  const meldTiles = check.isValid ? check.normalizedTiles : extracted;

  const newMeld: Meld = {
    id: `meld-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    tiles: meldTiles,
  };

  return withUpdatedWorkingState(state, remainingHand, [...remainingTable, newMeld]);
}

/**
 * Moves a single tile (or multiple tiles) into an existing table meld at an optional target index.
 */
export function moveTilesToMeld(
  state: GameState,
  tileIds: readonly string[],
  targetMeldId: string,
  targetIndex?: number
): GameState {
  if (state.status !== 'playing' || tileIds.length === 0) return state;

  const currentPlayer = state.players[state.currentPlayerIndex];
  const startTableIds = new Set(
    state.turnStartSnapshot.table.flatMap((m) => m.tiles.map((t) => t.id))
  );

  const targetMeld = state.table.find((m) => m.id === targetMeldId);
  if (!targetMeld) {
    return playTilesToNewMeld(state, tileIds);
  }

  // If player hasn't broken the ice, prevent modifying pre-existing table melds
  if (!currentPlayer.hasInitialMeld) {
    const targetIsPreExisting = targetMeld.tiles.some((t) => startTableIds.has(t.id));
    const movingPreExisting = tileIds.some((id) => startTableIds.has(id));
    if (targetIsPreExisting || movingPreExisting) {
      return {
        ...state,
        lastError: '首次破冰出牌不能借用或修改桌面已有牌组，请先用自己的手牌凑满 30 分',
      };
    }
  }

  const { extracted, remainingHand, remainingTable } = extractTilesFromWorkingState(
    currentPlayer.hand,
    state.table,
    tileIds
  );

  if (extracted.length === 0) return state;

  const targetExistsAfterExtract = remainingTable.some((m) => m.id === targetMeldId);
  let nextTable: Meld[];

  if (!targetExistsAfterExtract) {
    nextTable = [
      ...remainingTable,
      {
        id: targetMeldId,
        tiles: extracted,
      },
    ];
  } else {
    nextTable = remainingTable.map((meld) => {
      if (meld.id !== targetMeldId) return meld;
      const updatedTiles = [...meld.tiles];
      const insertAt =
        targetIndex !== undefined
          ? Math.max(0, Math.min(updatedTiles.length, targetIndex))
          : updatedTiles.length;
      updatedTiles.splice(insertAt, 0, ...extracted);

      // If no explicit index was requested, auto-sort if it forms a valid meld
      if (targetIndex === undefined) {
        const check = validateMeld(updatedTiles);
        if (check.isValid) {
          return { ...meld, tiles: check.normalizedTiles };
        }
      }

      return { ...meld, tiles: updatedTiles };
    });
  }

  return withUpdatedWorkingState(state, remainingHand, nextTable);
}

/**
 * Returns one or more tiles from the working table back to the current player's hand.
 * Enforces the rule that tiles originally on the table at turn start (including table Jokers)
 * CANNOT be taken into the player's hand.
 */
export function returnTilesToHand(
  state: GameState,
  tileIds: readonly string[],
  targetHandIndex?: number
): GameState {
  if (state.status !== 'playing' || tileIds.length === 0) return state;

  const currentPlayer = state.players[state.currentPlayerIndex];
  const startTableIds = new Set(
    state.turnStartSnapshot.table.flatMap((m) => m.tiles.map((t) => t.id))
  );

  for (const id of tileIds) {
    if (startTableIds.has(id)) {
      return {
        ...state,
        lastError: '桌面原有的牌（包括从桌面替换出的 Joker）不能收回手牌',
      };
    }
  }

  const { extracted, remainingHand, remainingTable } = extractTilesFromWorkingState(
    currentPlayer.hand,
    state.table,
    tileIds
  );

  if (extracted.length === 0) return state;

  const updatedHand = [...remainingHand];
  const insertAt =
    targetHandIndex !== undefined
      ? Math.max(0, Math.min(updatedHand.length, targetHandIndex))
      : updatedHand.length;
  updatedHand.splice(insertAt, 0, ...extracted);

  return withUpdatedWorkingState(state, updatedHand, remainingTable);
}

/**
 * Splits a table meld into two separate melds at `splitIndex` (1 .. tiles.length - 1).
 */
export function splitTableMeld(
  state: GameState,
  meldId: string,
  splitIndex: number
): GameState {
  if (state.status !== 'playing') return state;

  const currentPlayer = state.players[state.currentPlayerIndex];
  const meldIdx = state.table.findIndex((m) => m.id === meldId);
  if (meldIdx === -1) return state;

  const meld = state.table[meldIdx];
  if (splitIndex <= 0 || splitIndex >= meld.tiles.length) return state;

  const startTableIds = new Set(
    state.turnStartSnapshot.table.flatMap((m) => m.tiles.map((t) => t.id))
  );

  if (!currentPlayer.hasInitialMeld && meld.tiles.some((t) => startTableIds.has(t.id))) {
    return {
      ...state,
      lastError: '完成首次 30 分破冰前，不能拆分桌面已有的牌组',
    };
  }

  const leftTiles = meld.tiles.slice(0, splitIndex);
  const rightTiles = meld.tiles.slice(splitIndex);

  const nextTable = [...state.table];
  nextTable.splice(
    meldIdx,
    1,
    { id: `${meld.id}-a-${Date.now()}`, tiles: leftTiles },
    { id: `${meld.id}-b-${Date.now()}`, tiles: rightTiles }
  );

  return withUpdatedWorkingState(state, currentPlayer.hand, nextTable);
}

/**
 * Normalizes / sorts the tiles inside a specific table meld if it can form a valid Run or Group.
 */
export function sortTableMeld(state: GameState, meldId: string): GameState {
  const currentPlayer = state.players[state.currentPlayerIndex];
  const nextTable = state.table.map((meld) => {
    if (meld.id !== meldId) return meld;
    const check = validateMeld(meld.tiles);
    if (check.isValid) {
      return { ...meld, tiles: check.normalizedTiles };
    }
    return { ...meld, tiles: sortTiles(meld.tiles, 'number') };
  });

  return withUpdatedWorkingState(state, currentPlayer.hand, nextTable);
}

/**
 * Sorts the current player's rack by color or number without losing any turn changes.
 */
export function sortCurrentPlayerHand(
  state: GameState,
  mode: 'color' | 'number'
): GameState {
  const currentPlayer = state.players[state.currentPlayerIndex];
  const sortedHand = sortTiles(currentPlayer.hand, mode);
  const updatedPlayers = state.players.map((p, idx) =>
    idx === state.currentPlayerIndex ? { ...p, hand: sortedHand } : p
  );

  return {
    ...state,
    config: { ...state.config, autoSortRack: mode },
    players: updatedPlayers,
  };
}

/**
 * Step-by-step Undo within the current turn.
 */
export function undoTurnStep(state: GameState): GameState {
  if (state.status !== 'playing' || state.undoStack.length === 0) return state;

  const previous = state.undoStack[state.undoStack.length - 1];
  const nextUndoStack = state.undoStack.slice(0, -1);

  const updatedPlayers = state.players.map((p, idx) =>
    idx === state.currentPlayerIndex ? { ...p, hand: cloneTiles(previous.hand) } : p
  );

  return {
    ...state,
    players: updatedPlayers,
    table: cloneMelds(previous.table),
    undoStack: nextUndoStack,
    lastError: null,
    lastActionNotice: '已撤销上一步操作',
  };
}

/**
 * Resets all changes made during the current turn back to `turnStartSnapshot`.
 */
export function resetTurnToStart(state: GameState): GameState {
  if (state.status !== 'playing') return state;

  const updatedPlayers = state.players.map((p, idx) =>
    idx === state.currentPlayerIndex
      ? { ...p, hand: cloneTiles(state.turnStartSnapshot.hand) }
      : p
  );

  return {
    ...state,
    players: updatedPlayers,
    table: cloneMelds(state.turnStartSnapshot.table),
    undoStack: [],
    lastError: null,
    lastActionNotice: '已重置本回合至初始状态',
  };
}

/**
 * Computes final scores for all players when the game finishes.
 * - Normal Win (`empty_hand`):
 *   Each loser receives `-calculateHandPenalty(loser.hand)`.
 *   The winner receives `+sum(losers' penalties)`.
 * - Stalemate (`stalemate`):
 *   Winner is the player with the lowest hand penalty.
 *   Each loser receives `-calculateHandPenalty(loser.hand)`.
 *   Winner receives `sum(losers' penalties) - calculateHandPenalty(winner.hand)`.
 */
function finalizePlayersWithScores(
  players: readonly Player[],
  winnerId: string
): Player[] {
  const penalties = new Map<string, number>();
  let totalLoserPenalties = 0;

  for (const p of players) {
    const pen = calculateHandPenalty(p.hand);
    penalties.set(p.id, pen);
    if (p.id !== winnerId) {
      totalLoserPenalties += pen;
    }
  }

  const winnerPenalty = penalties.get(winnerId) ?? 0;

  return players.map((p) => {
    if (p.id === winnerId) {
      return {
        ...p,
        score: totalLoserPenalties - winnerPenalty,
      };
    }
    return {
      ...p,
      score: -(penalties.get(p.id) ?? 0),
    };
  });
}

/**
 * Commits the current player's turn after validating all Rummikub rules.
 */
export function commitTurnPlay(state: GameState): {
  state: GameState;
  success: boolean;
  error?: string;
} {
  if (state.status !== 'playing') {
    return { state, success: false, error: '当前对局已结束' };
  }

  const currentPlayer = state.players[state.currentPlayerIndex];
  const validation = validateTurnCommit({
    turnStartSnapshot: state.turnStartSnapshot,
    currentHand: currentPlayer.hand,
    currentTable: state.table,
    hasInitialMeld: currentPlayer.hasInitialMeld,
  });

  if (!validation.isValid) {
    return {
      state: {
        ...state,
        lastError: validation.errorReason ?? '出牌不符合规则',
      },
      success: false,
      error: validation.errorReason,
    };
  }

  const updatedPlayers = state.players.map((p, idx) =>
    idx === state.currentPlayerIndex
      ? {
          ...p,
          hand: cloneTiles(currentPlayer.hand),
          hasInitialMeld: true,
        }
      : p
  );

  // Check 106-tile conservation before committing
  const conservation = validateTileConservation({
    pool: state.pool,
    players: updatedPlayers,
    table: validation.normalizedTable,
  });

  if (!conservation.isValid) {
    return {
      state: {
        ...state,
        lastError: '系统检测到 106 张牌总量不守恒，已拒绝提交，请重置本回合',
      },
      success: false,
      error: '106 张牌总量不守恒',
    };
  }

  const logEntry = {
    id: `log-${state.turnNumber}-${Date.now()}`,
    turnNumber: state.turnNumber,
    playerId: currentPlayer.id,
    playerName: currentPlayer.name,
    action: 'play' as const,
    tilesPlayedCount: validation.playedTiles.length,
    pointsPlayed: validation.totalPlayedScore,
    brokeIce: validation.brokeIce,
    timestamp: Date.now(),
  };

  const recentTileIds = validation.playedTiles.map((t) => t.id);

  // Check if current player emptied their hand -> WIN!
  if (currentPlayer.hand.length === 0) {
    const scoredPlayers = finalizePlayersWithScores(updatedPlayers, currentPlayer.id);
    return {
      state: {
        ...state,
        status: 'finished',
        players: scoredPlayers,
        table: validation.normalizedTable,
        undoStack: [],
        consecutivePasses: 0,
        winnerId: currentPlayer.id,
        endReason: 'empty_hand',
        history: [logEntry, ...state.history],
        lastError: null,
        lastActionNotice: `${currentPlayer.name} 打光了所有手牌，赢得本局胜利！`,
        recentTileIds,
      },
      success: true,
    };
  }

  const nextPlayerIndex = (state.currentPlayerIndex + 1) % updatedPlayers.length;
  const nextPlayer = updatedPlayers[nextPlayerIndex];

  return {
    state: {
      ...state,
      players: updatedPlayers,
      currentPlayerIndex: nextPlayerIndex,
      table: validation.normalizedTable,
      turnStartSnapshot: {
        hand: cloneTiles(nextPlayer.hand),
        table: cloneMelds(validation.normalizedTable),
      },
      undoStack: [],
      turnNumber: state.turnNumber + 1,
      consecutivePasses: 0,
      history: [logEntry, ...state.history],
      lastError: null,
      lastActionNotice: validation.brokeIce
        ? `${currentPlayer.name} 破冰成功！打出 ${validation.playedTiles.length} 张牌（${validation.totalPlayedScore} 分）`
        : `${currentPlayer.name} 打出 ${validation.playedTiles.length} 张牌`,
      recentTileIds,
    },
    success: true,
  };
}

/**
 * Rolls back any uncommitted edits for the current turn, draws 1 tile from the pool (or passes if pool is empty),
 * and advances to the next player (or triggers stalemate endgame if everyone passed on an empty pool).
 */
export function drawTileAndEndTurn(state: GameState): {
  state: GameState;
  drawnTile: Tile | null;
} {
  if (state.status !== 'playing') {
    return { state, drawnTile: null };
  }

  // First restore working state to turnStartSnapshot so uncommitted table edits are cleanly rolled back
  const restoredState = resetTurnToStart(state);
  const currentPlayer = restoredState.players[restoredState.currentPlayerIndex];

  // Case A: Pool still has tiles -> Draw 1 tile
  if (restoredState.pool.length > 0) {
    const drawnTile = restoredState.pool[0];
    const remainingPool = restoredState.pool.slice(1);
    const rawNewHand = [...currentPlayer.hand, drawnTile];
    const newHand =
      currentPlayer.type === 'human' && restoredState.config.autoSortRack !== 'manual'
        ? sortTiles(rawNewHand, restoredState.config.autoSortRack)
        : rawNewHand;

    const updatedPlayers = restoredState.players.map((p, idx) =>
      idx === restoredState.currentPlayerIndex ? { ...p, hand: newHand } : p
    );

    const nextPlayerIndex = (restoredState.currentPlayerIndex + 1) % updatedPlayers.length;
    const nextPlayer = updatedPlayers[nextPlayerIndex];

    const logEntry = {
      id: `log-${restoredState.turnNumber}-${Date.now()}`,
      turnNumber: restoredState.turnNumber,
      playerId: currentPlayer.id,
      playerName: currentPlayer.name,
      action: 'draw' as const,
      tilesPlayedCount: 0,
      timestamp: Date.now(),
    };

    return {
      state: {
        ...restoredState,
        players: updatedPlayers,
        currentPlayerIndex: nextPlayerIndex,
        pool: remainingPool,
        turnStartSnapshot: {
          hand: cloneTiles(nextPlayer.hand),
          table: cloneMelds(restoredState.table),
        },
        undoStack: [],
        turnNumber: restoredState.turnNumber + 1,
        consecutivePasses: 0,
        history: [logEntry, ...restoredState.history],
        lastError: null,
        lastActionNotice: `${currentPlayer.name} 从牌池摸了一张牌`,
        recentTileIds: currentPlayer.type === 'human' ? [drawnTile.id] : [],
      },
      drawnTile,
    };
  }

  // Case B: Pool is empty -> Player passes
  const nextConsecutivePasses = restoredState.consecutivePasses + 1;
  const logEntry = {
    id: `log-${restoredState.turnNumber}-${Date.now()}`,
    turnNumber: restoredState.turnNumber,
    playerId: currentPlayer.id,
    playerName: currentPlayer.name,
    action: 'pass' as const,
    tilesPlayedCount: 0,
    timestamp: Date.now(),
  };

  // If all players have consecutively passed with an empty pool -> Stalemate Endgame!
  if (nextConsecutivePasses >= restoredState.players.length) {
    // Winner is the player with the lowest hand penalty (tie-break: fewer tiles)
    const sortedByPenalty = [...restoredState.players].sort((a, b) => {
      const penDiff = calculateHandPenalty(a.hand) - calculateHandPenalty(b.hand);
      if (penDiff !== 0) return penDiff;
      return a.hand.length - b.hand.length;
    });

    const winner = sortedByPenalty[0];
    const scoredPlayers = finalizePlayersWithScores(restoredState.players, winner.id);

    const endReason: EndReason = 'stalemate';
    return {
      state: {
        ...restoredState,
        status: 'finished',
        players: scoredPlayers,
        undoStack: [],
        consecutivePasses: nextConsecutivePasses,
        winnerId: winner.id,
        endReason,
        history: [logEntry, ...restoredState.history],
        lastError: null,
        lastActionNotice: `牌池已耗尽且全员无法继续出牌，${winner.name} 凭最低剩余点数获胜！`,
        recentTileIds: [],
      },
      drawnTile: null,
    };
  }

  const nextPlayerIndex =
    (restoredState.currentPlayerIndex + 1) % restoredState.players.length;
  const nextPlayer = restoredState.players[nextPlayerIndex];

  return {
    state: {
      ...restoredState,
      currentPlayerIndex: nextPlayerIndex,
      turnStartSnapshot: {
        hand: cloneTiles(nextPlayer.hand),
        table: cloneMelds(restoredState.table),
      },
      undoStack: [],
      turnNumber: restoredState.turnNumber + 1,
      consecutivePasses: nextConsecutivePasses,
      history: [logEntry, ...restoredState.history],
      lastError: null,
      lastActionNotice: `牌池已空，${currentPlayer.name} 选择跳过回合`,
      recentTileIds: [],
    },
    drawnTile: null,
  };
}

/**
 * Executes a full turn for the current AI player.
 */
export function executeAITurn(state: GameState): GameState {
  if (state.status !== 'playing') return state;

  const currentPlayer = state.players[state.currentPlayerIndex];
  if (currentPlayer.type !== 'ai') return state;

  const opponentHandCounts = state.players
    .filter((_, idx) => idx !== state.currentPlayerIndex)
    .map((p) => p.hand.length);

  const decision = computeAIMove({
    playerId: currentPlayer.id,
    hand: cloneTiles(currentPlayer.hand),
    table: cloneMelds(state.table),
    hasInitialMeld: currentPlayer.hasInitialMeld,
    difficulty: currentPlayer.aiDifficulty ?? state.config.aiDifficulty,
    poolCount: state.pool.length,
    opponentHandCounts,
  });

  if (decision.action === 'play') {
    const workingState: GameState = {
      ...state,
      players: state.players.map((p, idx) =>
        idx === state.currentPlayerIndex ? { ...p, hand: decision.newHand } : p
      ),
      table: decision.newTable,
    };

    const commitRes = commitTurnPlay(workingState);
    if (commitRes.success) {
      return commitRes.state;
    }
  }

  // Fallback to drawing / passing if AI chose 'draw' or commit failed
  return drawTileAndEndTurn(state).state;
}
