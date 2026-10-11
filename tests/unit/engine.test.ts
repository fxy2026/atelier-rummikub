import { describe, expect, it } from 'vitest';
import {
  calculateHandPenalty,
  commitTurnPlay,
  computeAIMove,
  createDeck,
  createInitialGameState,
  dealInitialHands,
  drawTileAndEndTurn,
  executeAITurn,
  moveTilesToMeld,
  playTilesToNewMeld,
  resetTurnToStart,
  returnTilesToHand,
  shuffleDeck,
  splitTableMeld,
  Tile,
  TileColor,
  TileNumber,
  TOTAL_DECK_SIZE,
  undoTurnStep,
  validateGroup,
  validateMeld,
  validateRun,
  validateTileConservation,
  validateTurnCommit,
} from '../../src/engine';
import {
  applyAuthoritativeRoomAction,
  RoomRecord,
  sanitizeRoomForViewer,
} from '../../src/lib/multiplayer';

function makeTile(
  color: TileColor,
  number: TileNumber,
  copy: 1 | 2 = 1
): Tile {
  return {
    id: `${color}-${number}-${copy}`,
    color,
    number,
    isJoker: false,
    copy,
  };
}

function makeJoker(copy: 1 | 2 = 1): Tile {
  return {
    id: `joker-${copy}`,
    color: copy === 1 ? 'red' : 'black',
    number: 13,
    isJoker: true,
    copy,
  };
}

describe('Rummikub Core Engine Unit Tests', () => {
  it('1. generates exactly 106 tiles with correct distribution (104 number tiles + 2 jokers)', () => {
    const deck = createDeck();
    expect(deck).toHaveLength(TOTAL_DECK_SIZE);
    expect(deck).toHaveLength(106);

    const jokers = deck.filter((t) => t.isJoker);
    const normalTiles = deck.filter((t) => !t.isJoker);
    expect(jokers).toHaveLength(2);
    expect(normalTiles).toHaveLength(104);

    const uniqueIds = new Set(deck.map((t) => t.id));
    expect(uniqueIds.size).toBe(106);
  });

  it('2. preserves all 106 unique tile IDs with zero duplicates or missing tiles after shuffle and deal', () => {
    const deck = createDeck();
    const shuffled = shuffleDeck(deck);
    expect(shuffled).toHaveLength(106);
    expect(new Set(shuffled.map((t) => t.id)).size).toBe(106);

    for (const playerCount of [2, 3, 4]) {
      const { hands, pool } = dealInitialHands(playerCount);
      expect(hands).toHaveLength(playerCount);
      hands.forEach((h) => expect(h).toHaveLength(14));
      expect(pool).toHaveLength(106 - playerCount * 14);

      const allDealt = [...hands.flat(), ...pool];
      expect(allDealt).toHaveLength(106);
      expect(new Set(allDealt.map((t) => t.id)).size).toBe(106);
    }
  });

  it('3. correctly identifies valid Number Groups (3 or 4 tiles, same number, distinct colors)', () => {
    const group3 = [
      makeTile('red', 7, 1),
      makeTile('blue', 7, 1),
      makeTile('black', 7, 1),
    ];
    const res3 = validateMeld(group3);
    expect(res3.isValid).toBe(true);
    expect(res3.type).toBe('group');
    expect(res3.score).toBe(21);

    const group4 = [
      makeTile('red', 10, 1),
      makeTile('blue', 10, 1),
      makeTile('yellow', 10, 1),
      makeTile('black', 10, 2),
    ];
    const res4 = validateMeld(group4);
    expect(res4.isValid).toBe(true);
    expect(res4.type).toBe('group');
    expect(res4.score).toBe(40);
  });

  it('4. rejects invalid Number Groups containing duplicate colors or mismatched numbers or >4 tiles', () => {
    // Red 7 + Red 7 + Blue 7 -> invalid
    const dupColorGroup = [
      makeTile('red', 7, 1),
      makeTile('red', 7, 2),
      makeTile('blue', 7, 1),
    ];
    expect(validateGroup(dupColorGroup).isValid).toBe(false);
    expect(validateMeld(dupColorGroup).isValid).toBe(false);

    // 5 tiles in a group -> invalid
    const fiveTileGroup = [
      makeTile('red', 8, 1),
      makeTile('blue', 8, 1),
      makeTile('yellow', 8, 1),
      makeTile('black', 8, 1),
      makeJoker(1),
    ];
    expect(validateGroup(fiveTileGroup).isValid).toBe(false);
  });

  it('5. correctly identifies valid Runs (3+ tiles, same color, consecutive numbers)', () => {
    const run1 = [
      makeTile('red', 3, 1),
      makeTile('red', 4, 1),
      makeTile('red', 5, 1),
    ];
    const res1 = validateMeld(run1);
    expect(res1.isValid).toBe(true);
    expect(res1.type).toBe('run');
    expect(res1.score).toBe(12);

    const runHigh = [
      makeTile('blue', 11, 1),
      makeTile('blue', 12, 1),
      makeTile('blue', 13, 1),
    ];
    const resHigh = validateMeld(runHigh);
    expect(resHigh.isValid).toBe(true);
    expect(resHigh.type).toBe('run');
    expect(resHigh.score).toBe(36);
  });

  it('6. strictly rejects Runs that wrap around 13 -> 1 or have gaps/mismatched colors', () => {
    const wrapRun1 = [
      makeTile('red', 12, 1),
      makeTile('red', 13, 1),
      makeTile('red', 1, 1),
    ];
    const resWrap1 = validateMeld(wrapRun1);
    expect(resWrap1.isValid).toBe(false);
    expect(resWrap1.errorReason).toContain('13');

    const wrapRun2 = [
      makeTile('blue', 13, 1),
      makeTile('blue', 1, 1),
      makeTile('blue', 2, 1),
    ];
    expect(validateRun(wrapRun2).isValid).toBe(false);

    const gapRun = [
      makeTile('yellow', 4, 1),
      makeTile('yellow', 5, 1),
      makeTile('yellow', 7, 1),
    ];
    expect(validateMeld(gapRun).isValid).toBe(false);
  });

  it('7. properly handles Jokers in Groups and Runs, calculates Joker effective points, and forbids pocketing table Jokers', () => {
    // Joker in a Group of 11s -> Joker counts as 11, total = 33
    const groupWithJoker = [
      makeTile('red', 11, 1),
      makeTile('blue', 11, 1),
      makeJoker(1),
    ];
    const groupVal = validateMeld(groupWithJoker);
    expect(groupVal.isValid).toBe(true);
    expect(groupVal.type).toBe('group');
    expect(groupVal.score).toBe(33);
    expect(groupVal.jokerAssignments['joker-1'].representedNumber).toBe(11);

    // Joker in the middle of a Run [Red 8, Joker, Red 10] -> Joker is Red 9, total = 27
    const runMiddleJoker = [
      makeTile('red', 8, 1),
      makeJoker(1),
      makeTile('red', 10, 1),
    ];
    const runVal = validateMeld(runMiddleJoker);
    expect(runVal.isValid).toBe(true);
    expect(runVal.type).toBe('run');
    expect(runVal.score).toBe(27);
    expect(runVal.jokerAssignments['joker-1'].representedNumber).toBe(9);
    expect(runVal.jokerAssignments['joker-1'].representedColor).toBe('red');

    // Joker liberated from table cannot be returned to hand
    const tableJoker = makeJoker(1);
    const tableMeld = {
      id: 'table-meld-1',
      tiles: [makeTile('red', 8, 1), tableJoker, makeTile('red', 10, 1)],
    };
    const handTiles = [
      makeTile('red', 9, 1),
      makeTile('blue', 5, 1),
      makeTile('yellow', 5, 1),
    ];

    // Illegal attempt: replace Joker with Red 9 and keep tableJoker in hand
    const illegalCommit = validateTurnCommit({
      turnStartSnapshot: {
        hand: handTiles,
        table: [tableMeld],
      },
      currentHand: [tableJoker, makeTile('blue', 5, 1), makeTile('yellow', 5, 1)],
      currentTable: [
        {
          id: 'table-meld-1',
          tiles: [makeTile('red', 8, 1), makeTile('red', 9, 1), makeTile('red', 10, 1)],
        },
      ],
      hasInitialMeld: true,
    });
    expect(illegalCommit.isValid).toBe(false);
    expect(illegalCommit.errorReason).toContain('Joker');

    // Legal replacement: replace Joker with Red 9 AND use tableJoker in a new valid meld on the table
    const legalCommit = validateTurnCommit({
      turnStartSnapshot: {
        hand: handTiles,
        table: [tableMeld],
      },
      currentHand: [],
      currentTable: [
        {
          id: 'table-meld-1',
          tiles: [makeTile('red', 8, 1), makeTile('red', 9, 1), makeTile('red', 10, 1)],
        },
        {
          id: 'table-meld-2',
          tiles: [makeTile('blue', 5, 1), makeTile('yellow', 5, 1), tableJoker],
        },
      ],
      hasInitialMeld: true,
    });
    expect(legalCommit.isValid).toBe(true);
  });

  it('8. rejects initial meld ("破冰") when total points are under 30, and accepts when >= 30 (single or multiple melds)', () => {
    const lowMeld = [
      makeTile('red', 9, 1),
      makeTile('blue', 9, 1),
      makeTile('black', 9, 1),
    ]; // 27 pts
    const extraTile = makeTile('yellow', 2, 1);

    const rejectRes = validateTurnCommit({
      turnStartSnapshot: {
        hand: [...lowMeld, extraTile],
        table: [],
      },
      currentHand: [extraTile],
      currentTable: [{ id: 'm1', tiles: lowMeld }],
      hasInitialMeld: false,
    });
    expect(rejectRes.isValid).toBe(false);
    expect(rejectRes.errorReason).toContain('30');

    // Two small melds summing to 15 + 18 = 33 >= 30 -> accepted!
    const meldA = [
      makeTile('red', 5, 1),
      makeTile('blue', 5, 1),
      makeTile('black', 5, 1),
    ]; // 15
    const meldB = [
      makeTile('yellow', 5, 1),
      makeTile('yellow', 6, 1),
      makeTile('yellow', 7, 1),
    ]; // 18
    const acceptRes = validateTurnCommit({
      turnStartSnapshot: {
        hand: [...meldA, ...meldB, extraTile],
        table: [],
      },
      currentHand: [extraTile],
      currentTable: [
        { id: 'mA', tiles: meldA },
        { id: 'mB', tiles: meldB },
      ],
      hasInitialMeld: false,
    });
    expect(acceptRes.isValid).toBe(true);
    expect(acceptRes.brokeIce).toBe(true);
    expect(acceptRes.totalPlayedScore).toBe(33);
  });

  it('9. rejects initial meld that uses or modifies existing table tiles', () => {
    const existingMeld = [
      makeTile('red', 10, 1),
      makeTile('blue', 10, 1),
      makeTile('yellow', 10, 1),
    ];
    const handTile = makeTile('black', 10, 1);
    const otherHandTile = makeTile('red', 2, 1);

    const res = validateTurnCommit({
      turnStartSnapshot: {
        hand: [handTile, otherHandTile],
        table: [{ id: 'existing', tiles: existingMeld }],
      },
      currentHand: [otherHandTile],
      currentTable: [{ id: 'existing', tiles: [...existingMeld, handTile] }],
      hasInitialMeld: false,
    });
    expect(res.isValid).toBe(false);
    expect(res.errorReason).toContain('破冰');
  });

  it('10. allows a player who HAS completed their initial meld to split and rearrange table melds', () => {
    // Table has [Red 3, Red 4, Red 5, Red 6]; Player has [Blue 6, Black 6] + [Yellow 1]
    const tableRun = [
      makeTile('red', 3, 1),
      makeTile('red', 4, 1),
      makeTile('red', 5, 1),
      makeTile('red', 6, 1),
    ];
    const hand = [
      makeTile('blue', 6, 1),
      makeTile('black', 6, 1),
      makeTile('yellow', 1, 1),
    ];

    const res = validateTurnCommit({
      turnStartSnapshot: {
        hand,
        table: [{ id: 'run-4', tiles: tableRun }],
      },
      currentHand: [makeTile('yellow', 1, 1)],
      currentTable: [
        { id: 'run-3', tiles: tableRun.slice(0, 3) },
        {
          id: 'new-group-6',
          tiles: [
            makeTile('red', 6, 1),
            makeTile('blue', 6, 1),
            makeTile('black', 6, 1),
          ],
        },
      ],
      hasInitialMeld: true,
    });

    expect(res.isValid).toBe(true);
    expect(res.playedTiles).toHaveLength(2);
  });

  it('11. rejects committing an invalid table state (e.g. isolated tile or 2-tile fragment left on table)', () => {
    const startHand = [
      makeTile('red', 10, 1),
      makeTile('blue', 10, 1),
      makeTile('yellow', 10, 1),
      makeTile('black', 4, 1),
    ];

    const res = validateTurnCommit({
      turnStartSnapshot: { hand: startHand, table: [] },
      currentHand: [],
      currentTable: [
        { id: 'valid-meld', tiles: startHand.slice(0, 3) },
        { id: 'isolated-tile', tiles: [startHand[3]] },
      ],
      hasInitialMeld: false,
    });

    expect(res.isValid).toBe(false);
  });

  it('12. supports step-by-step undo and full turn reset back to exact turnStartSnapshot', () => {
    let state = createInitialGameState({ aiCount: 1 });
    const originalHandIds = state.players[0].hand.map((t) => t.id);

    const firstThreeIds = originalHandIds.slice(0, 3);
    state = playTilesToNewMeld(state, firstThreeIds);
    expect(state.players[0].hand).toHaveLength(11);
    expect(state.table).toHaveLength(1);

    const fourthId = originalHandIds[3];
    state = moveTilesToMeld(state, [fourthId], state.table[0].id);
    expect(state.players[0].hand).toHaveLength(10);
    expect(state.table[0].tiles).toHaveLength(4);

    // Step undo: reverts 4th tile move
    state = undoTurnStep(state);
    expect(state.players[0].hand).toHaveLength(11);
    expect(state.table[0].tiles).toHaveLength(3);

    // Full reset: restores all 14 tiles to hand and clears table
    state = resetTurnToStart(state);
    expect(state.players[0].hand.map((t) => t.id)).toEqual(originalHandIds);
    expect(state.table).toHaveLength(0);
    expect(state.undoStack).toHaveLength(0);
  });

  it('13. updates state and rolls back uncommitted edits properly when drawing a tile', () => {
    let state = createInitialGameState({ aiCount: 1 });
    const initialPoolCount = state.pool.length;
    const topPoolTileId = state.pool[0].id;

    // Make a temporary invalid move onto table, then click Draw
    state = playTilesToNewMeld(state, [state.players[0].hand[0].id]);
    expect(state.table).toHaveLength(1);

    const { state: afterDraw, drawnTile } = drawTileAndEndTurn(state);
    expect(drawnTile?.id).toBe(topPoolTileId);
    expect(afterDraw.table).toHaveLength(0); // Uncommitted move was rolled back
    expect(afterDraw.players[0].hand).toHaveLength(15);
    expect(afterDraw.pool).toHaveLength(initialPoolCount - 1);
    expect(afterDraw.currentPlayerIndex).toBe(1);
    expect(validateTileConservation(afterDraw).isValid).toBe(true);
  });

  it('14. strictly conserves all 106 tiles across complex multi-step operations', () => {
    let state = createInitialGameState({ aiCount: 3 });
    expect(validateTileConservation(state).isValid).toBe(true);

    // Play tiles, split meld, return tile to hand, draw, AI turns
    const handIds = state.players[0].hand.map((t) => t.id);
    state = playTilesToNewMeld(state, handIds.slice(0, 4));
    expect(validateTileConservation(state).isValid).toBe(true);

    state = splitTableMeld(state, state.table[0].id, 2);
    expect(validateTileConservation(state).isValid).toBe(true);

    state = returnTilesToHand(state, [handIds[0]]);
    expect(validateTileConservation(state).isValid).toBe(true);

    state = drawTileAndEndTurn(state).state;
    expect(validateTileConservation(state).isValid).toBe(true);

    // Run 3 AI turns
    for (let i = 0; i < 3; i++) {
      state = executeAITurn(state);
      expect(validateTileConservation(state).isValid).toBe(true);
    }
  });

  it('15. triggers victory and computes exact scores (Joker = 30 penalty) when a player empties their hand', () => {
    const baseState = createInitialGameState({ aiCount: 2 });
    const winningMeld = [
      makeTile('red', 12, 1),
      makeTile('blue', 12, 1),
      makeTile('black', 12, 1),
    ]; // 36 points

    const p1Hand = [makeTile('yellow', 5, 1), makeJoker(1)]; // 5 + 30 = 35 penalty
    const p2Hand = [makeTile('red', 8, 1), makeTile('blue', 2, 1)]; // 8 + 2 = 10 penalty

    // Construct a 106-tile conserved custom state for the final turn
    const usedIds = new Set(
      [...winningMeld, ...p1Hand, ...p2Hand].map((t) => t.id)
    );
    const remainingPool = createDeck().filter((t) => !usedIds.has(t.id));

    const customState = {
      ...baseState,
      pool: remainingPool,
      players: [
        { ...baseState.players[0], hand: winningMeld, hasInitialMeld: false },
        { ...baseState.players[1], hand: p1Hand, hasInitialMeld: true },
        { ...baseState.players[2], hand: p2Hand, hasInitialMeld: false },
      ],
      table: [],
      turnStartSnapshot: {
        hand: winningMeld,
        table: [],
      },
    };

    const afterPlay = playTilesToNewMeld(
      customState,
      winningMeld.map((t) => t.id)
    );
    const commitRes = commitTurnPlay(afterPlay);

    expect(commitRes.success).toBe(true);
    expect(commitRes.state.status).toBe('finished');
    expect(commitRes.state.winnerId).toBe(customState.players[0].id);
    expect(commitRes.state.endReason).toBe('empty_hand');

    // Loser 1 has 5 + Joker(30) = -35; Loser 2 has 8 + 2 = -10; Winner gets +45
    expect(calculateHandPenalty(p1Hand)).toBe(35);
    expect(commitRes.state.players[1].score).toBe(-35);
    expect(commitRes.state.players[2].score).toBe(-10);
    expect(commitRes.state.players[0].score).toBe(45);
  });

  it('16. guarantees Easy and Hard AI never submit illegal moves and properly break ice / rearrange table', () => {
    // Scenario A: AI has < 30 points -> must choose 'draw', even if it has a 24-point meld
    const lowHand = [
      makeTile('red', 8, 1),
      makeTile('blue', 8, 1),
      makeTile('black', 8, 1),
      makeTile('yellow', 1, 1),
    ];
    const moveLow = computeAIMove({
      playerId: 'ai-1',
      hand: lowHand,
      table: [],
      hasInitialMeld: false,
      difficulty: 'hard',
      poolCount: 30,
      opponentHandCounts: [14],
    });
    expect(moveLow.action).toBe('draw');

    // Scenario B: AI has >= 30 points -> breaks the ice legally
    const highHand = [
      makeTile('red', 11, 1),
      makeTile('blue', 11, 1),
      makeTile('black', 11, 1),
      makeTile('yellow', 2, 1),
    ];
    const moveHigh = computeAIMove({
      playerId: 'ai-1',
      hand: highHand,
      table: [],
      hasInitialMeld: false,
      difficulty: 'easy',
      poolCount: 30,
      opponentHandCounts: [14],
    });
    expect(moveHigh.action).toBe('play');
    expect(moveHigh.newHand).toHaveLength(1);
    expect(
      validateTurnCommit({
        turnStartSnapshot: { hand: highHand, table: [] },
        currentHand: moveHigh.newHand,
        currentTable: moveHigh.newTable,
        hasInitialMeld: false,
      }).isValid
    ).toBe(true);

    // Scenario C: Hard AI after breaking ice uses table manipulation (borrows 4th tile from table group to play pair from hand)
    const tableGroup4 = {
      id: 'table-g4',
      tiles: [
        makeTile('red', 9, 1),
        makeTile('blue', 9, 1),
        makeTile('yellow', 9, 1),
        makeTile('black', 9, 1),
      ],
    };
    const aiHandPair = [
      makeTile('red', 7, 1),
      makeTile('red', 8, 1),
      makeTile('blue', 1, 1),
    ];
    const moveRearrange = computeAIMove({
      playerId: 'ai-hard',
      hand: aiHandPair,
      table: [tableGroup4],
      hasInitialMeld: true,
      difficulty: 'hard',
      poolCount: 20,
      opponentHandCounts: [10],
    });
    expect(moveRearrange.action).toBe('play');
    expect(moveRearrange.newHand).toHaveLength(1); // Shed Red 7 and Red 8 by borrowing Red 9!
    expect(
      validateTurnCommit({
        turnStartSnapshot: { hand: aiHandPair, table: [tableGroup4] },
        currentHand: moveRearrange.newHand,
        currentTable: moveRearrange.newTable,
        hasInitialMeld: true,
      }).isValid
    ).toBe(true);
  });

  it('17. resolves endgame cleanly when draw pool is exhausted and no player can move (stalemate)', () => {
    const baseState = createInitialGameState({ aiCount: 1 });
    const p0Hand = [makeTile('red', 2, 1)]; // 2 penalty points (lowest -> Winner!)
    const p1Hand = [makeTile('blue', 11, 1)]; // 11 penalty points

    const usedIds = new Set([...p0Hand, ...p1Hand].map((t) => t.id));
    const remainingTiles = createDeck().filter((t) => !usedIds.has(t.id));

    let state = {
      ...baseState,
      pool: [], // Empty pool
      players: [
        { ...baseState.players[0], hand: p0Hand, hasInitialMeld: true },
        { ...baseState.players[1], hand: p1Hand, hasInitialMeld: true },
      ],
      table: [{ id: 'rest', tiles: remainingTiles }],
      currentPlayerIndex: 0,
      consecutivePasses: 0,
      turnStartSnapshot: {
        hand: p0Hand,
        table: [{ id: 'rest', tiles: remainingTiles }],
      },
    };

    // Player 0 passes
    state = drawTileAndEndTurn(state).state;
    expect(state.status).toBe('playing');
    expect(state.consecutivePasses).toBe(1);

    // Player 1 passes -> all players passed consecutively on empty pool -> Stalemate finishes game!
    state = drawTileAndEndTurn(state).state;
    expect(state.status).toBe('finished');
    expect(state.endReason).toBe('stalemate');
    expect(state.winnerId).toBe(state.players[0].id);
    expect(state.players[0].score).toBe(9); // 11 - 2 = 9
    expect(state.players[1].score).toBe(-11);
  });

  it('18. completes a full 4-player AI simulation from deal to finish while maintaining 106-tile conservation at every step', () => {
    let state = createInitialGameState(
      { aiCount: 3, aiDifficulty: 'hard' },
      undefined,
      [
        { name: 'AI 1', type: 'ai' },
        { name: 'AI 2', type: 'ai' },
        { name: 'AI 3', type: 'ai' },
        { name: 'AI 4', type: 'ai' },
      ]
    );

    let stepCount = 0;
    while (state.status === 'playing' && stepCount < 300) {
      state = executeAITurn(state);
      const conservation = validateTileConservation(state);
      expect(conservation.isValid).toBe(true);
      stepCount++;
    }

    expect(state.status).toBe('finished');
    expect(state.winnerId).toBeTruthy();
    expect(['empty_hand', 'stalemate']).toContain(state.endReason);
  });

  it('19. enforces authoritative multiplayer room security: hides opponent hands, rejects stale versions, and blocks out-of-turn moves', () => {
    const baseRoom: RoomRecord = {
      roomCode: 'RMK888',
      hostPlayerId: 'p1',
      status: 'waiting',
      maxPlayers: 2,
      version: 1,
      seats: [
        {
          seatIndex: 0,
          playerId: 'p1',
          playerName: 'Alice',
          playerType: 'human',
          secretToken: 'sec-alice',
          connected: true,
          lastSeenAt: Date.now(),
        },
        {
          seatIndex: 1,
          playerId: 'p2',
          playerName: 'Bob',
          playerType: 'human',
          secretToken: 'sec-bob',
          connected: true,
          lastSeenAt: Date.now(),
        },
      ],
      gameState: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    // Start game as Alice
    const started = applyAuthoritativeRoomAction({
      room: baseRoom,
      secretToken: 'sec-alice',
      expectedVersion: 1,
      action: { type: 'start_game' },
    });
    expect(started.ok).toBe(true);
    expect(started.room.version).toBe(2);

    // Sanitize view for Alice: Alice sees her own 14 tiles, but Bob's hand array is empty!
    const aliceView = sanitizeRoomForViewer(
      started.room,
      'sec-alice',
      'local-broadcast'
    );
    expect(aliceView.myPlayerId).toBe('p1');
    expect(aliceView.gameState?.players[0].hand).toHaveLength(14);
    expect(aliceView.gameState?.players[1].hand).toHaveLength(0);
    expect(aliceView.gameState?.players[1].handCount).toBe(14);

    // Bob tries to act on Alice's turn -> rejected!
    const outOfTurn = applyAuthoritativeRoomAction({
      room: started.room,
      secretToken: 'sec-bob',
      expectedVersion: 2,
      action: { type: 'draw_tile' },
    });
    expect(outOfTurn.ok).toBe(false);
    expect(outOfTurn.error).toContain('不是你的出牌回合');

    // Alice tries to submit with a stale version (1 instead of 2) -> rejected!
    const staleAttempt = applyAuthoritativeRoomAction({
      room: started.room,
      secretToken: 'sec-alice',
      expectedVersion: 1,
      action: { type: 'draw_tile' },
    });
    expect(staleAttempt.ok).toBe(false);
    expect(staleAttempt.error).toContain('并发');
  });
});
