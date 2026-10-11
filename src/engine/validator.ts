import {
  INITIAL_MELD_MIN_POINTS,
  TILE_COLORS,
} from './deck';
import {
  JokerAssignment,
  Meld,
  MeldValidationResult,
  Tile,
  TileColor,
  TileNumber,
  TurnCommitValidation,
  TurnSnapshot,
} from './types';

const COLOR_SORT_ORDER: Record<TileColor, number> = {
  red: 0,
  blue: 1,
  yellow: 2,
  black: 3,
};

/**
 * Validates whether a sequence of tiles forms a legal Rummikub Number Group (数字组):
 * - 3 or 4 tiles
 * - Same number across all non-joker tiles
 * - Distinct colors across all non-joker tiles
 */
export function validateGroup(tiles: readonly Tile[]): MeldValidationResult {
  if (tiles.length < 3) {
    return {
      isValid: false,
      type: 'invalid',
      score: 0,
      jokerAssignments: {},
      normalizedTiles: [...tiles],
      errorReason: '数字组至少需要 3 张牌',
    };
  }

  if (tiles.length > 4) {
    return {
      isValid: false,
      type: 'invalid',
      score: 0,
      jokerAssignments: {},
      normalizedTiles: [...tiles],
      errorReason: '数字组最多只能包含 4 张牌（四种不同颜色）',
    };
  }

  const nonJokers = tiles.filter((t) => !t.isJoker);
  const jokers = tiles.filter((t) => t.isJoker);

  const targetNumber: TileNumber = nonJokers.length > 0 ? nonJokers[0].number : 13;

  for (const tile of nonJokers) {
    if (tile.number !== targetNumber) {
      return {
        isValid: false,
        type: 'invalid',
        score: 0,
        jokerAssignments: {},
        normalizedTiles: [...tiles],
        errorReason: '数字组中的所有牌点数必须相同',
      };
    }
  }

  const usedColors = new Set<TileColor>();
  for (const tile of nonJokers) {
    if (usedColors.has(tile.color)) {
      return {
        isValid: false,
        type: 'invalid',
        score: 0,
        jokerAssignments: {},
        normalizedTiles: [...tiles],
        errorReason: '数字组中不能包含重复颜色的牌',
      };
    }
    usedColors.add(tile.color);
  }

  const availableColors = TILE_COLORS.filter((c) => !usedColors.has(c));
  const jokerAssignments: Record<string, JokerAssignment> = {};

  jokers.forEach((joker, idx) => {
    const assignedColor = availableColors[idx] ?? TILE_COLORS[idx % TILE_COLORS.length];
    jokerAssignments[joker.id] = {
      tileId: joker.id,
      representedNumber: targetNumber,
      representedColor: assignedColor,
    };
  });

  const normalizedNonJokers = [...nonJokers].sort(
    (a, b) => COLOR_SORT_ORDER[a.color] - COLOR_SORT_ORDER[b.color]
  );
  const normalizedTiles = [...normalizedNonJokers, ...jokers];

  return {
    isValid: true,
    type: 'group',
    score: targetNumber * tiles.length,
    jokerAssignments,
    normalizedTiles,
  };
}

/**
 * Validates whether a sequence of tiles forms a legal Rummikub Run (顺子):
 * - 3 to 13 tiles
 * - Same color across all non-joker tiles
 * - Consecutive numbers within 1..13 (no 13->1 wrap-around)
 */
export function validateRun(tiles: readonly Tile[]): MeldValidationResult {
  if (tiles.length < 3) {
    return {
      isValid: false,
      type: 'invalid',
      score: 0,
      jokerAssignments: {},
      normalizedTiles: [...tiles],
      errorReason: '顺子至少需要 3 张牌',
    };
  }

  if (tiles.length > 13) {
    return {
      isValid: false,
      type: 'invalid',
      score: 0,
      jokerAssignments: {},
      normalizedTiles: [...tiles],
      errorReason: '顺子最多只能包含 13 张牌',
    };
  }

  const nonJokers = tiles.filter((t) => !t.isJoker);
  const jokers = tiles.filter((t) => t.isJoker);

  if (nonJokers.length === 0) {
    // Fallback if only jokers are passed
    const jokerAssignments: Record<string, JokerAssignment> = {};
    let score = 0;
    tiles.forEach((t, idx) => {
      const num = (13 - tiles.length + 1 + idx) as TileNumber;
      jokerAssignments[t.id] = {
        tileId: t.id,
        representedNumber: num,
        representedColor: 'red',
      };
      score += num;
    });
    return {
      isValid: true,
      type: 'run',
      score,
      jokerAssignments,
      normalizedTiles: [...tiles],
    };
  }

  const runColor = nonJokers[0].color;
  for (const tile of nonJokers) {
    if (tile.color !== runColor) {
      return {
        isValid: false,
        type: 'invalid',
        score: 0,
        jokerAssignments: {},
        normalizedTiles: [...tiles],
        errorReason: '顺子中的所有牌必须是同一种颜色',
      };
    }
  }

  const numbersSet = new Set<number>();
  for (const tile of nonJokers) {
    if (numbersSet.has(tile.number)) {
      return {
        isValid: false,
        type: 'invalid',
        score: 0,
        jokerAssignments: {},
        normalizedTiles: [...tiles],
        errorReason: '顺子中不能包含相同点数的重复牌',
      };
    }
    numbersSet.add(tile.number);
  }

  // Check explicit wrap-around 13 -> 1 attempt
  if (numbersSet.has(13) && numbersSet.has(1) && tiles.length < 13) {
    return {
      isValid: false,
      type: 'invalid',
      score: 0,
      jokerAssignments: {},
      normalizedTiles: [...tiles],
      errorReason: '顺子不能将 13 与 1 循环连接',
    };
  }

  // Pass 1: Check if the exact current order in `tiles` is already a valid ascending consecutive run
  let positionalStartNum: number | null = null;
  let positionalValid = true;

  for (let i = 0; i < tiles.length; i++) {
    const t = tiles[i];
    if (!t.isJoker) {
      const impliedStart = t.number - i;
      if (positionalStartNum === null) {
        positionalStartNum = impliedStart;
      } else if (positionalStartNum !== impliedStart) {
        positionalValid = false;
        break;
      }
    }
  }

  if (
    positionalValid &&
    positionalStartNum !== null &&
    positionalStartNum >= 1 &&
    positionalStartNum + tiles.length - 1 <= 13
  ) {
    const jokerAssignments: Record<string, JokerAssignment> = {};
    let score = 0;
    for (let i = 0; i < tiles.length; i++) {
      const representedNum = (positionalStartNum + i) as TileNumber;
      score += representedNum;
      if (tiles[i].isJoker) {
        jokerAssignments[tiles[i].id] = {
          tileId: tiles[i].id,
          representedNumber: representedNum,
          representedColor: runColor,
        };
      }
    }
    return {
      isValid: true,
      type: 'run',
      score,
      jokerAssignments,
      normalizedTiles: [...tiles],
    };
  }

  // Pass 2: Canonical sorted run check (handles unsorted tiles or edge jokers placed on the wrong side of 1 or 13)
  const sortedNonJokers = [...nonJokers].sort((a, b) => a.number - b.number);
  const minNum = sortedNonJokers[0].number;
  const maxNum = sortedNonJokers[sortedNonJokers.length - 1].number;
  const span = maxNum - minNum + 1;
  const internalGapsNeeded = span - sortedNonJokers.length;

  if (jokers.length < internalGapsNeeded) {
    return {
      isValid: false,
      type: 'invalid',
      score: 0,
      jokerAssignments: {},
      normalizedTiles: [...tiles],
      errorReason: '顺子点数不连续，无法构成合法顺子',
    };
  }

  const remainingJokers = jokers.length - internalGapsNeeded;
  // Place extra jokers at the higher end first (up to 13) to maximize meld points, then lower end (down to 1)
  const addHigh = Math.min(remainingJokers, 13 - maxNum);
  const addLow = remainingJokers - addHigh;

  const startNum = minNum - addLow;
  const endNum = maxNum + addHigh;

  if (startNum < 1 || endNum > 13) {
    return {
      isValid: false,
      type: 'invalid',
      score: 0,
      jokerAssignments: {},
      normalizedTiles: [...tiles],
      errorReason: '顺子点数超出 1–13 范围',
    };
  }

  const nonJokerByNumber = new Map<number, Tile>();
  for (const t of sortedNonJokers) {
    nonJokerByNumber.set(t.number, t);
  }

  const normalizedTiles: Tile[] = [];
  const jokerAssignments: Record<string, JokerAssignment> = {};
  let jokerCursor = 0;
  let score = 0;

  for (let num = startNum; num <= endNum; num++) {
    const representedNum = num as TileNumber;
    score += representedNum;
    const existing = nonJokerByNumber.get(num);
    if (existing) {
      normalizedTiles.push(existing);
    } else {
      const joker = jokers[jokerCursor++];
      normalizedTiles.push(joker);
      jokerAssignments[joker.id] = {
        tileId: joker.id,
        representedNumber: representedNum,
        representedColor: runColor,
      };
    }
  }

  return {
    isValid: true,
    type: 'run',
    score,
    jokerAssignments,
    normalizedTiles,
  };
}

/**
 * Validates any candidate meld (either a Group or a Run).
 */
export function validateMeld(tiles: readonly Tile[]): MeldValidationResult {
  if (tiles.length < 3) {
    return {
      isValid: false,
      type: 'invalid',
      score: 0,
      jokerAssignments: {},
      normalizedTiles: [...tiles],
      errorReason: '每个牌组至少需要 3 张牌',
    };
  }

  const nonJokers = tiles.filter((t) => !t.isJoker);

  if (nonJokers.length >= 2) {
    const allSameNumber = nonJokers.every((t) => t.number === nonJokers[0].number);
    const allSameColor = nonJokers.every((t) => t.color === nonJokers[0].color);

    if (allSameNumber && !allSameColor) {
      return validateGroup(tiles);
    }
    if (allSameColor && !allSameNumber) {
      return validateRun(tiles);
    }
    if (allSameNumber && allSameColor) {
      // e.g. [Red 7, Red 7, Red 7] or [Red 7, Red 7, Joker]
      return {
        isValid: false,
        type: 'invalid',
        score: 0,
        jokerAssignments: {},
        normalizedTiles: [...tiles],
        errorReason: '不能使用相同颜色且相同点数的重复牌组成牌组',
      };
    }

    return {
      isValid: false,
      type: 'invalid',
      score: 0,
      jokerAssignments: {},
      normalizedTiles: [...tiles],
      errorReason: '牌组必须为「同点数异色数字组」或「同色连续顺子」',
    };
  }

  // 1 non-joker + 2 jokers (or 3 jokers): both Group and Run may be valid; prefer whichever is valid and higher scoring
  const groupRes = validateGroup(tiles);
  const runRes = validateRun(tiles);

  if (groupRes.isValid && runRes.isValid) {
    return runRes.score > groupRes.score ? runRes : groupRes;
  }
  if (groupRes.isValid) return groupRes;
  if (runRes.isValid) return runRes;

  return groupRes;
}

/**
 * Validates the entire turn commit transaction against all Rummikub rules:
 * 1. Tile conservation between turnStartSnapshot and current working state.
 * 2. No table tiles (especially Jokers) returned to the player's hand.
 * 3. At least 1 tile played from the player's hand.
 * 4. All melds on the table are valid Groups or Runs.
 * 5. Initial meld ("破冰") rule: if !hasInitialMeld, pre-existing table melds cannot be touched,
 *    and newly played hand melds must total >= 30 points.
 */
export function validateTurnCommit(params: {
  turnStartSnapshot: TurnSnapshot;
  currentHand: readonly Tile[];
  currentTable: readonly Meld[];
  hasInitialMeld: boolean;
}): TurnCommitValidation {
  const { turnStartSnapshot, currentHand, currentTable, hasInitialMeld } = params;

  const activeTable = currentTable.filter((m) => m.tiles.length > 0);

  // 1. Check tile conservation across turnStartSnapshot vs (currentHand + activeTable)
  const startHandIds = new Set(turnStartSnapshot.hand.map((t) => t.id));
  const startTableIds = new Set(
    turnStartSnapshot.table.flatMap((m) => m.tiles.map((t) => t.id))
  );

  const totalStartCount =
    turnStartSnapshot.hand.length +
    turnStartSnapshot.table.reduce((acc, m) => acc + m.tiles.length, 0);

  const currentTableTiles = activeTable.flatMap((m) => m.tiles);
  const totalCurrentCount = currentHand.length + currentTableTiles.length;

  if (totalStartCount !== totalCurrentCount) {
    return {
      isValid: false,
      errorReason: '牌数校验异常：当前手牌与桌面牌总数与回合开始时不一致',
      playedTiles: [],
      totalPlayedScore: 0,
      brokeIce: false,
      normalizedTable: activeTable,
    };
  }

  const seenCurrentIds = new Set<string>();
  for (const t of [...currentHand, ...currentTableTiles]) {
    if (seenCurrentIds.has(t.id) || (!startHandIds.has(t.id) && !startTableIds.has(t.id))) {
      return {
        isValid: false,
        errorReason: '牌组校验异常：检测到重复牌或未知牌 ID',
        playedTiles: [],
        totalPlayedScore: 0,
        brokeIce: false,
        normalizedTable: activeTable,
      };
    }
    seenCurrentIds.add(t.id);
  }

  // 2. Check that no tile from turnStartSnapshot.table ended up in currentHand
  const currentHandIds = new Set(currentHand.map((t) => t.id));
  for (const meld of turnStartSnapshot.table) {
    for (const tile of meld.tiles) {
      if (currentHandIds.has(tile.id)) {
        if (tile.isJoker) {
          return {
            isValid: false,
            errorReason:
              '从桌面替换出的 Joker 万能牌必须在同一回合重新用于桌面合法牌组，不能收回手牌',
            playedTiles: [],
            totalPlayedScore: 0,
            brokeIce: false,
            normalizedTable: activeTable,
          };
        }
        return {
          isValid: false,
          errorReason: '桌面上已有的牌不能收回手牌',
          playedTiles: [],
          totalPlayedScore: 0,
          brokeIce: false,
          normalizedTable: activeTable,
        };
      }
    }
  }

  // 3. Check that at least 1 tile from hand was played onto the table
  const playedTiles = turnStartSnapshot.hand.filter((t) => !currentHandIds.has(t.id));
  if (playedTiles.length === 0) {
    return {
      isValid: false,
      errorReason: '本回合尚未打出任何手牌；若无法出牌请点击「摸牌」结束回合',
      playedTiles: [],
      totalPlayedScore: 0,
      brokeIce: false,
      normalizedTable: activeTable,
    };
  }

  // 4. Validate every meld on the table
  const normalizedTable: Meld[] = [];
  const meldValidations: MeldValidationResult[] = [];

  for (let i = 0; i < activeTable.length; i++) {
    const meld = activeTable[i];
    const validation = validateMeld(meld.tiles);
    if (!validation.isValid) {
      return {
        isValid: false,
        errorReason: `桌面牌组 #${i + 1} 不合法：${validation.errorReason ?? '无效组合'}`,
        playedTiles,
        totalPlayedScore: 0,
        brokeIce: false,
        normalizedTable: activeTable,
      };
    }
    meldValidations.push(validation);
    normalizedTable.push({
      id: meld.id,
      tiles: validation.normalizedTiles,
    });
  }

  // 5. Initial Meld ("破冰" >= 30 points) check if !hasInitialMeld
  const playedTileIdSet = new Set(playedTiles.map((t) => t.id));

  if (!hasInitialMeld) {
    // Check that no meld mixes startTableIds and playedTileIdSet
    for (const meld of activeTable) {
      const hasTableTile = meld.tiles.some((t) => startTableIds.has(t.id));
      const hasHandTile = meld.tiles.some((t) => playedTileIdSet.has(t.id));
      if (hasTableTile && hasHandTile) {
        return {
          isValid: false,
          errorReason: '首次破冰出牌不能借用或添加到桌面已有牌组，必须完全由自己的手牌组成',
          playedTiles,
          totalPlayedScore: 0,
          brokeIce: false,
          normalizedTable,
        };
      }
    }

    // Also verify existing table melds were not split, merged, or rearranged
    const startMeldSignatures = turnStartSnapshot.table
      .filter((m) => m.tiles.length > 0)
      .map((m) => m.tiles.map((t) => t.id).sort().join(','))
      .sort();

    const currentOldMeldSignatures = activeTable
      .filter((m) => m.tiles.every((t) => startTableIds.has(t.id)))
      .map((m) => m.tiles.map((t) => t.id).sort().join(','))
      .sort();

    if (
      startMeldSignatures.length !== currentOldMeldSignatures.length ||
      startMeldSignatures.some((sig, idx) => sig !== currentOldMeldSignatures[idx])
    ) {
      return {
        isValid: false,
        errorReason: '完成首次 30 分破冰前，不能拆分或重组桌面已有的牌组',
        playedTiles,
        totalPlayedScore: 0,
        brokeIce: false,
        normalizedTable,
      };
    }

    // Sum points of all new melds played from hand
    let initialMeldScore = 0;
    for (let i = 0; i < activeTable.length; i++) {
      const meld = activeTable[i];
      if (meld.tiles.every((t) => playedTileIdSet.has(t.id))) {
        initialMeldScore += meldValidations[i].score;
      }
    }

    if (initialMeldScore < INITIAL_MELD_MIN_POINTS) {
      return {
        isValid: false,
        errorReason: `首次出牌（破冰）牌组总点数至少需要 ${INITIAL_MELD_MIN_POINTS} 分，当前仅 ${initialMeldScore} 分`,
        playedTiles,
        totalPlayedScore: initialMeldScore,
        brokeIce: false,
        normalizedTable,
      };
    }

    return {
      isValid: true,
      playedTiles,
      totalPlayedScore: initialMeldScore,
      brokeIce: true,
      normalizedTable,
    };
  }

  // 6. Subsequent turn: calculate score of played tiles (using their effective value in their respective melds)
  let totalPlayedScore = 0;
  for (let i = 0; i < activeTable.length; i++) {
    const meld = activeTable[i];
    const validation = meldValidations[i];
    for (const tile of meld.tiles) {
      if (playedTileIdSet.has(tile.id)) {
        if (tile.isJoker) {
          totalPlayedScore += validation.jokerAssignments[tile.id]?.representedNumber ?? 0;
        } else {
          totalPlayedScore += tile.number;
        }
      }
    }
  }

  return {
    isValid: true,
    playedTiles,
    totalPlayedScore,
    brokeIce: false,
    normalizedTable,
  };
}
