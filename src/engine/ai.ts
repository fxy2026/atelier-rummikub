import { cloneMelds, cloneTiles, INITIAL_MELD_MIN_POINTS, TILE_COLORS } from './deck';
import {
  AIMoveDecision,
  AIPlayerView,
  Meld,
  Tile,
  TileColor,
  TileNumber,
} from './types';
import { validateMeld, validateTurnCommit } from './validator';

interface CandidateMeld {
  tiles: Tile[];
  tileIds: Set<string>;
  score: number;
  jokerCount: number;
  type: 'group' | 'run';
}

/**
 * Generates all valid 3..4 tile Groups and 3..6 tile Runs from a given set of tiles.
 */
export function generateCandidateMeldsFromTiles(
  tiles: readonly Tile[],
  allowJokers: boolean = true
): CandidateMeld[] {
  const candidates: CandidateMeld[] = [];
  const seenSignatures = new Set<string>();

  const jokers = allowJokers ? tiles.filter((t) => t.isJoker) : [];
  const nonJokers = tiles.filter((t) => !t.isJoker);

  const addCandidate = (meldTiles: Tile[]) => {
    const signature = meldTiles
      .map((t) => t.id)
      .sort()
      .join('|');
    if (seenSignatures.has(signature)) return;

    const validation = validateMeld(meldTiles);
    if (!validation.isValid || validation.type === 'invalid') return;

    seenSignatures.add(signature);
    candidates.push({
      tiles: validation.normalizedTiles,
      tileIds: new Set(validation.normalizedTiles.map((t) => t.id)),
      score: validation.score,
      jokerCount: validation.normalizedTiles.filter((t) => t.isJoker).length,
      type: validation.type,
    });
  };

  // 1. Generate Candidate Number Groups (same number, distinct colors)
  const byNumber = new Map<TileNumber, Tile[]>();
  for (const t of nonJokers) {
    const list = byNumber.get(t.number) ?? [];
    list.push(t);
    byNumber.set(t.number, list);
  }

  for (const [, sameNumTiles] of byNumber.entries()) {
    // Group by color so we consider both copies if helpful for disjoint sets
    const byColor = new Map<TileColor, Tile[]>();
    for (const t of sameNumTiles) {
      const list = byColor.get(t.color) ?? [];
      list.push(t);
      byColor.set(t.color, list);
    }

    const distinctColors = Array.from(byColor.keys());

    // Helper to enumerate combinations of distinct color tiles
    const buildColorCombos = (
      colorIdx: number,
      current: Tile[]
    ) => {
      if (current.length >= 3 && current.length <= 4) {
        addCandidate(current);
      }
      if (current.length >= 2 && current.length < 4 && jokers.length >= 1) {
        addCandidate([...current, jokers[0]]);
      }
      if (current.length >= 1 && current.length <= 2 && jokers.length >= 2) {
        addCandidate([...current, jokers[0], jokers[1]]);
      }

      if (colorIdx >= distinctColors.length || current.length >= 4) return;

      const color = distinctColors[colorIdx];
      const copies = byColor.get(color) ?? [];
      // Option A: skip this color
      buildColorCombos(colorIdx + 1, current);
      // Option B: pick each available copy of this color
      for (const copyTile of copies) {
        buildColorCombos(colorIdx + 1, [...current, copyTile]);
      }
    };

    buildColorCombos(0, []);
  }

  // 2. Generate Candidate Runs (same color, consecutive numbers)
  for (const color of TILE_COLORS) {
    const colorTiles = nonJokers.filter((t) => t.color === color);
    if (colorTiles.length === 0) continue;

    const byNum = new Map<number, Tile[]>();
    for (const t of colorTiles) {
      const list = byNum.get(t.number) ?? [];
      list.push(t);
      byNum.set(t.number, list);
    }

    // Try all start numbers 1..11 and lengths 3..6
    for (let startNum = 1; startNum <= 11; startNum++) {
      for (let len = 3; len <= 6 && startNum + len - 1 <= 13; len++) {
        const buildRunWindow = (
          offset: number,
          current: Tile[],
          jokersUsed: number
        ) => {
          if (offset === len) {
            const nonJokerCount = len - jokersUsed;
            if (nonJokerCount >= 1) {
              addCandidate(current);
            }
            return;
          }

          const targetNum = startNum + offset;
          const copies = byNum.get(targetNum) ?? [];

          for (const copyTile of copies) {
            buildRunWindow(offset + 1, [...current, copyTile], jokersUsed);
          }

          if (jokersUsed < jokers.length) {
            buildRunWindow(
              offset + 1,
              [...current, jokers[jokersUsed]],
              jokersUsed + 1
            );
          }
        };

        buildRunWindow(0, [], 0);
      }
    }
  }

  return candidates;
}

interface CombinationResult {
  melds: CandidateMeld[];
  totalScore: number;
  totalTiles: number;
  jokersUsed: number;
}

/**
 * Finds the optimal set of mutually disjoint melds from a list of candidate melds.
 */
function findBestDisjointMelds(
  candidates: readonly CandidateMeld[],
  preferMode: 'max_score' | 'max_tiles' | 'conserve_joker',
  deadlineMs: number
): CombinationResult {
  // Sort candidates descending by score and tile count to prune search early
  const sorted = [...candidates].sort((a, b) => {
    if (preferMode === 'conserve_joker' && a.jokerCount !== b.jokerCount) {
      return a.jokerCount - b.jokerCount;
    }
    if (preferMode === 'max_tiles' && b.tiles.length !== a.tiles.length) {
      return b.tiles.length - a.tiles.length;
    }
    return b.score - a.score;
  });

  let best: CombinationResult = {
    melds: [],
    totalScore: 0,
    totalTiles: 0,
    jokersUsed: 0,
  };

  const evaluateBetter = (cand: CombinationResult, incumbent: CombinationResult): boolean => {
    if (cand.melds.length === 0) return false;
    if (incumbent.melds.length === 0) return true;

    if (preferMode === 'max_score') {
      if (cand.totalScore !== incumbent.totalScore) {
        return cand.totalScore > incumbent.totalScore;
      }
      if (cand.jokersUsed !== incumbent.jokersUsed) {
        return cand.jokersUsed < incumbent.jokersUsed;
      }
      return cand.totalTiles > incumbent.totalTiles;
    }

    if (preferMode === 'conserve_joker') {
      const candValue = cand.totalScore - cand.jokersUsed * 18 + cand.totalTiles * 4;
      const incValue = incumbent.totalScore - incumbent.jokersUsed * 18 + incumbent.totalTiles * 4;
      return candValue > incValue;
    }

    // max_tiles
    if (cand.totalTiles !== incumbent.totalTiles) {
      return cand.totalTiles > incumbent.totalTiles;
    }
    return cand.totalScore > incumbent.totalScore;
  };

  const usedTileIds = new Set<string>();
  const currentMelds: CandidateMeld[] = [];

  const backtrack = (
    startIdx: number,
    runningScore: number,
    runningTiles: number,
    runningJokers: number
  ) => {
    const currentResult: CombinationResult = {
      melds: [...currentMelds],
      totalScore: runningScore,
      totalTiles: runningTiles,
      jokersUsed: runningJokers,
    };

    if (evaluateBetter(currentResult, best)) {
      best = currentResult;
    }

    if (Date.now() > deadlineMs) return;

    for (let i = startIdx; i < sorted.length; i++) {
      const cand = sorted[i];
      let conflict = false;
      for (const id of cand.tileIds) {
        if (usedTileIds.has(id)) {
          conflict = true;
          break;
        }
      }
      if (conflict) continue;

      for (const id of cand.tileIds) usedTileIds.add(id);
      currentMelds.push(cand);

      backtrack(
        i + 1,
        runningScore + cand.score,
        runningTiles + cand.tiles.length,
        runningJokers + cand.jokerCount
      );

      currentMelds.pop();
      for (const id of cand.tileIds) usedTileIds.delete(id);
    }
  };

  backtrack(0, 0, 0, 0);
  return best;
}

/**
 * Attempts to use remaining hand tiles to extend, split, or rearrange existing table melds.
 * Used when the player has already broken the ice (`hasInitialMeld === true`).
 */
function applyTableExtensionsAndSplits(
  remainingHand: readonly Tile[],
  currentTable: readonly Meld[],
  difficulty: 'easy' | 'hard'
): { hand: Tile[]; table: Meld[]; addedCount: number } {
  let workingHand = cloneTiles(remainingHand);
  const workingTable = cloneMelds(currentTable);
  let addedCount = 0;

  // Pass 1: Direct single-tile extensions onto existing table melds
  let progress = true;
  while (progress) {
    progress = false;
    // Sort workingHand descending by number (keep jokers last) so we shed high-point tiles first
    workingHand.sort((a, b) => {
      if (a.isJoker !== b.isJoker) return a.isJoker ? 1 : -1;
      return b.number - a.number;
    });

    for (let hIdx = 0; hIdx < workingHand.length; hIdx++) {
      const tile = workingHand[hIdx];
      // Easy AI avoids spending a Joker just to extend an already valid table meld unless it's its last tile
      if (tile.isJoker && workingHand.length > 1) continue;

      let placed = false;
      for (let mIdx = 0; mIdx < workingTable.length; mIdx++) {
        const meld = workingTable[mIdx];
        const tryAppend = validateMeld([...meld.tiles, tile]);
        if (tryAppend.isValid) {
          workingTable[mIdx] = {
            ...meld,
            tiles: tryAppend.normalizedTiles,
          };
          workingHand.splice(hIdx, 1);
          addedCount++;
          placed = true;
          progress = true;
          break;
        }

        const tryPrepend = validateMeld([tile, ...meld.tiles]);
        if (tryPrepend.isValid) {
          workingTable[mIdx] = {
            ...meld,
            tiles: tryPrepend.normalizedTiles,
          };
          workingHand.splice(hIdx, 1);
          addedCount++;
          placed = true;
          progress = true;
          break;
        }
      }
      if (placed) break;
    }

    // Easy AI stops after at most 1 simple table extension
    if (difficulty === 'easy' && addedCount >= 1) {
      break;
    }
  }

  if (difficulty === 'easy') {
    return { hand: workingHand, table: workingTable, addedCount };
  }

  // Pass 2 (Hard AI only): Split a 5+ tile Run on the table if we hold a duplicate middle tile in hand
  for (let hIdx = 0; hIdx < workingHand.length; hIdx++) {
    const tile = workingHand[hIdx];
    if (tile.isJoker) continue;

    let splitDone = false;
    for (let mIdx = 0; mIdx < workingTable.length; mIdx++) {
      const meld = workingTable[mIdx];
      if (meld.tiles.length < 5) continue;

      const meldVal = validateMeld(meld.tiles);
      if (!meldVal.isValid || meldVal.type !== 'run') continue;

      // Find index in normalizedTiles where tile matches color & number
      const ordered = meldVal.normalizedTiles;
      const matchIdx = ordered.findIndex(
        (t) => !t.isJoker && t.color === tile.color && t.number === tile.number
      );
      if (matchIdx >= 2 && ordered.length - matchIdx >= 3) {
        const leftPart = [...ordered.slice(0, matchIdx), tile];
        const rightPart = ordered.slice(matchIdx);
        const leftVal = validateMeld(leftPart);
        const rightVal = validateMeld(rightPart);
        if (leftVal.isValid && rightVal.isValid) {
          workingTable.splice(
            mIdx,
            1,
            { id: `${meld.id}-L`, tiles: leftVal.normalizedTiles },
            { id: `${meld.id}-R`, tiles: rightVal.normalizedTiles }
          );
          workingHand.splice(hIdx, 1);
          addedCount++;
          splitDone = true;
          break;
        }
      }
    }
    if (splitDone) hIdx--;
  }

  // Pass 3 (Hard AI only): Borrow a spare tile from a 4-tile Group or 4+ tile Run to complete a 2-tile pair in hand
  if (workingHand.length >= 2) {
    let borrowed = true;
    while (borrowed && workingHand.length >= 2) {
      borrowed = false;
      for (let mIdx = 0; mIdx < workingTable.length; mIdx++) {
        const meld = workingTable[mIdx];
        if (meld.tiles.length < 4) continue;

        for (let tIdx = 0; tIdx < meld.tiles.length; tIdx++) {
          const candidateBorrow = meld.tiles[tIdx];
          const remainingMeldTiles = meld.tiles.filter((_, idx) => idx !== tIdx);
          const remainingMeldValid = validateMeld(remainingMeldTiles);
          if (!remainingMeldValid.isValid) continue;

          // See if candidateBorrow + any 2 tiles in workingHand form a valid meld
          let foundPair: [number, number] | null = null;
          let formedTiles: Tile[] = [];

          for (let i = 0; i < workingHand.length && !foundPair; i++) {
            for (let j = i + 1; j < workingHand.length; j++) {
              const h1 = workingHand[i];
              const h2 = workingHand[j];
              if (h1.isJoker && h2.isJoker) continue;
              const testMeld = validateMeld([candidateBorrow, h1, h2]);
              if (testMeld.isValid) {
                foundPair = [i, j];
                formedTiles = testMeld.normalizedTiles;
                break;
              }
            }
          }

          if (foundPair) {
            const [idx1, idx2] = foundPair;
            workingTable[mIdx] = {
              ...meld,
              tiles: remainingMeldValid.normalizedTiles,
            };
            workingTable.push({
              id: `meld-ai-rearrange-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              tiles: formedTiles,
            });
            // Remove idx2 then idx1
            workingHand.splice(idx2, 1);
            workingHand.splice(idx1, 1);
            addedCount += 2;
            borrowed = true;
            break;
          }
        }
        if (borrowed) break;
      }
    }
  }

  // Pass 4 (Hard AI only): Replace a Joker on the table with a matching tile from hand, and use that Joker with 2 hand tiles
  if (workingHand.length >= 3) {
    for (let mIdx = 0; mIdx < workingTable.length; mIdx++) {
      const meld = workingTable[mIdx];
      const meldVal = validateMeld(meld.tiles);
      if (!meldVal.isValid) continue;

      const jokerInMeld = meld.tiles.find((t) => t.isJoker);
      if (!jokerInMeld) continue;

      const assignment = meldVal.jokerAssignments[jokerInMeld.id];
      if (!assignment) continue;

      const replacementHandIdx = workingHand.findIndex(
        (t) =>
          !t.isJoker &&
          t.color === assignment.representedColor &&
          t.number === assignment.representedNumber
      );

      if (replacementHandIdx === -1) continue;

      const replacementTile = workingHand[replacementHandIdx];
      const otherHandTiles = workingHand.filter((_, idx) => idx !== replacementHandIdx);

      // Find 2 tiles in otherHandTiles that form a valid meld with jokerInMeld
      let pairForJoker: [Tile, Tile] | null = null;
      let newJokerMeldTiles: Tile[] = [];

      for (let i = 0; i < otherHandTiles.length && !pairForJoker; i++) {
        for (let j = i + 1; j < otherHandTiles.length; j++) {
          const test = validateMeld([otherHandTiles[i], otherHandTiles[j], jokerInMeld]);
          if (test.isValid) {
            pairForJoker = [otherHandTiles[i], otherHandTiles[j]];
            newJokerMeldTiles = test.normalizedTiles;
            break;
          }
        }
      }

      if (pairForJoker) {
        const replacedMeldTiles = meld.tiles.map((t) =>
          t.id === jokerInMeld.id ? replacementTile : t
        );
        const replacedVal = validateMeld(replacedMeldTiles);
        if (replacedVal.isValid) {
          workingTable[mIdx] = {
            ...meld,
            tiles: replacedVal.normalizedTiles,
          };
          workingTable.push({
            id: `meld-ai-joker-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            tiles: newJokerMeldTiles,
          });
          const removeIds = new Set([
            replacementTile.id,
            pairForJoker[0].id,
            pairForJoker[1].id,
          ]);
          workingHand = workingHand.filter((t) => !removeIds.has(t.id));
          addedCount += 3;
          break;
        }
      }
    }
  }

  return { hand: workingHand, table: workingTable, addedCount };
}

/**
 * Computes an AI player's turn decision based ONLY on public table state and the AI's own hand.
 * Never accesses opponent hands or pool order.
 */
export function computeAIMove(view: AIPlayerView): AIMoveDecision {
  const { hand, table, hasInitialMeld, difficulty, opponentHandCounts } = view;
  const deadlineMs = Date.now() + (difficulty === 'hard' ? 90 : 40);

  const turnStartSnapshot = {
    hand: cloneTiles(hand),
    table: cloneMelds(table),
  };

  const minOpponentTiles =
    opponentHandCounts.length > 0 ? Math.min(...opponentHandCounts) : 14;
  const urgentMode = minOpponentTiles <= 4;

  // CASE 1: AI has NOT completed Initial Meld ("破冰" >= 30 points)
  if (!hasInitialMeld) {
    // First try without Jokers so AI doesn't waste Jokers if it already has >= 30 natural points
    const naturalCandidates = generateCandidateMeldsFromTiles(hand, false);
    const bestNatural = findBestDisjointMelds(naturalCandidates, 'max_score', deadlineMs);

    let chosenCombo: CombinationResult = bestNatural;

    if (bestNatural.totalScore < INITIAL_MELD_MIN_POINTS || (difficulty === 'hard' && urgentMode)) {
      const allCandidates = generateCandidateMeldsFromTiles(hand, true);
      const bestWithJokers = findBestDisjointMelds(allCandidates, 'max_score', deadlineMs);
      if (bestWithJokers.totalScore >= INITIAL_MELD_MIN_POINTS) {
        chosenCombo = bestWithJokers;
      }
    }

    if (chosenCombo.totalScore < INITIAL_MELD_MIN_POINTS) {
      return {
        action: 'draw',
        newHand: cloneTiles(hand),
        newTable: cloneMelds(table),
        explanation: '手牌组合未达到首次破冰所需的 30 分，选择摸牌',
      };
    }

    // For Easy AI: if multiple melds exist, plays just enough melds to reach >= 30 points
    let meldsToPlay = chosenCombo.melds;
    if (difficulty === 'easy' && meldsToPlay.length > 1) {
      const subset: CandidateMeld[] = [];
      let running = 0;
      for (const m of meldsToPlay) {
        subset.push(m);
        running += m.score;
        if (running >= INITIAL_MELD_MIN_POINTS) break;
      }
      if (running >= INITIAL_MELD_MIN_POINTS) {
        meldsToPlay = subset;
      }
    }

    const playedIds = new Set<string>();
    const newTable = cloneMelds(table);

    meldsToPlay.forEach((m, idx) => {
      for (const id of m.tileIds) playedIds.add(id);
      newTable.push({
        id: `meld-ai-init-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 6)}`,
        tiles: cloneTiles(m.tiles),
      });
    });

    const newHand = hand.filter((t) => !playedIds.has(t.id));

    const commitCheck = validateTurnCommit({
      turnStartSnapshot,
      currentHand: newHand,
      currentTable: newTable,
      hasInitialMeld: false,
    });

    if (commitCheck.isValid) {
      return {
        action: 'play',
        newHand,
        newTable: commitCheck.normalizedTable,
        explanation: `完成首次破冰出牌（共打出 ${commitCheck.playedTiles.length} 张牌，计 ${commitCheck.totalPlayedScore} 分）`,
      };
    }

    return {
      action: 'draw',
      newHand: cloneTiles(hand),
      newTable: cloneMelds(table),
      explanation: '未找到合法的破冰出牌方案，选择摸牌',
    };
  }

  // CASE 2: AI HAS already completed Initial Meld (Subsequent turns)
  const allowJokerInHandMelds =
    difficulty === 'easy' || urgentMode || hand.length <= 6;
  const handCandidates = generateCandidateMeldsFromTiles(
    hand,
    allowJokerInHandMelds ? true : false
  );

  let bestHandCombo = findBestDisjointMelds(
    handCandidates,
    difficulty === 'hard' && !urgentMode ? 'conserve_joker' : 'max_tiles',
    deadlineMs
  );

  // If Hard AI found nothing without jokers, allow jokers as well
  if (bestHandCombo.melds.length === 0 && !allowJokerInHandMelds) {
    const withJokerCandidates = generateCandidateMeldsFromTiles(hand, true);
    bestHandCombo = findBestDisjointMelds(withJokerCandidates, 'conserve_joker', deadlineMs);
  }

  // Easy AI plays at most 1 hand meld per turn to feel natural and distinct from Hard AI
  const selectedHandMelds =
    difficulty === 'easy' ? bestHandCombo.melds.slice(0, 1) : bestHandCombo.melds;

  const usedFromHandIds = new Set<string>();
  const workingTable = cloneMelds(table);

  selectedHandMelds.forEach((m, idx) => {
    for (const id of m.tileIds) usedFromHandIds.add(id);
    workingTable.push({
      id: `meld-ai-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 6)}`,
      tiles: cloneTiles(m.tiles),
    });
  });

  const remainingHand = hand.filter((t) => !usedFromHandIds.has(t.id));

  // Now attempt table extensions and splits
  const extended = applyTableExtensionsAndSplits(
    remainingHand,
    workingTable,
    difficulty
  );

  const totalPlayedCount = hand.length - extended.hand.length;
  if (totalPlayedCount > 0) {
    const commitCheck = validateTurnCommit({
      turnStartSnapshot,
      currentHand: extended.hand,
      currentTable: extended.table,
      hasInitialMeld: true,
    });

    if (commitCheck.isValid) {
      return {
        action: 'play',
        newHand: extended.hand,
        newTable: commitCheck.normalizedTable,
        explanation: `打出 ${commitCheck.playedTiles.length} 张牌（计 ${commitCheck.totalPlayedScore} 分）`,
      };
    }
  }

  return {
    action: 'draw',
    newHand: cloneTiles(hand),
    newTable: cloneMelds(table),
    explanation: '无可出的合法牌组，摸一张牌',
  };
}

/**
 * Smart Hint helper for the human player: suggests a valid play from their current turnStartSnapshot.
 */
export function computeSmartHint(params: {
  turnStartSnapshot: { hand: Tile[]; table: Meld[] };
  hasInitialMeld: boolean;
}): AIMoveDecision {
  return computeAIMove({
    playerId: 'human-hint',
    hand: params.turnStartSnapshot.hand,
    table: params.turnStartSnapshot.table,
    hasInitialMeld: params.hasInitialMeld,
    difficulty: 'hard',
    poolCount: 20,
    opponentHandCounts: [3],
  });
}
