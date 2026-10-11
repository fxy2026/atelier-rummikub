import {
  commitTurnPlay,
  createInitialGameState,
  drawTileAndEndTurn,
  executeAITurn,
  GameState,
  Meld,
  Tile,
} from '@/engine';

export interface RoomSeat {
  seatIndex: number;
  playerId: string;
  playerName: string;
  playerType: 'human' | 'ai';
  /** Secret token known only to this player's browser & the authoritative server */
  secretToken?: string;
  connected: boolean;
  lastSeenAt: number;
}

export interface RoomChatMessage {
  id: string;
  playerId: string;
  playerName: string;
  text: string;
  timestamp: number;
}

export interface RoomRecord {
  roomCode: string;
  hostPlayerId: string;
  status: 'waiting' | 'playing' | 'finished';
  maxPlayers: 2 | 3 | 4;
  version: number;
  seats: RoomSeat[];
  messages?: RoomChatMessage[];
  gameState: GameState | null;
  createdAt: number;
  updatedAt: number;
}

export interface SanitizedPlayerSummary {
  id: string;
  name: string;
  type: 'human' | 'ai';
  handCount: number;
  hasInitialMeld: boolean;
  score: number;
  /** Populated ONLY for the requesting player (or when game is finished) */
  hand: Tile[];
}

export interface SanitizedRoomView {
  roomCode: string;
  hostPlayerId: string;
  status: 'waiting' | 'playing' | 'finished';
  maxPlayers: 2 | 3 | 4;
  version: number;
  myPlayerId: string | null;
  seats: Omit<RoomSeat, 'secretToken'>[];
  messages: RoomChatMessage[];
  gameState: (Omit<GameState, 'players' | 'pool' | 'turnStartSnapshot' | 'undoStack'> & {
    poolCount: number;
    players: SanitizedPlayerSummary[];
    myHand: Tile[];
    myTurnStartHand: Tile[];
    turnStartTable: Meld[];
  }) | null;
  transportMode: 'supabase-cloud' | 'local-broadcast';
}

/**
 * Strips all other players' hidden hand tiles and pool tile identities from `RoomRecord`
 * before sending it to a specific player client.
 */
export function sanitizeRoomForViewer(
  room: RoomRecord,
  viewerSecretToken: string | null,
  transportMode: 'supabase-cloud' | 'local-broadcast'
): SanitizedRoomView {
  const matchedSeat = viewerSecretToken
    ? room.seats.find((s) => s.secretToken === viewerSecretToken)
    : undefined;
  const myPlayerId = matchedSeat?.playerId ?? null;

  const publicSeats = room.seats.map((s) => ({
    seatIndex: s.seatIndex,
    playerId: s.playerId,
    playerName: s.playerName,
    playerType: s.playerType,
    connected: s.connected,
    lastSeenAt: s.lastSeenAt,
  }));

  const messages = room.messages ?? [];

  if (!room.gameState) {
    return {
      roomCode: room.roomCode,
      hostPlayerId: room.hostPlayerId,
      status: room.status,
      maxPlayers: room.maxPlayers,
      version: room.version,
      myPlayerId,
      seats: publicSeats,
      messages,
      gameState: null,
      transportMode,
    };
  }

  const gs = room.gameState;
  const isFinished = gs.status === 'finished';
  const currentPlayer = gs.players[gs.currentPlayerIndex];
  const isMyTurn = currentPlayer?.id === myPlayerId;

  const sanitizedPlayers: SanitizedPlayerSummary[] = gs.players.map((p) => {
    const canSeeHand = isFinished || p.id === myPlayerId;
    return {
      id: p.id,
      name: p.name,
      type: p.type,
      handCount: p.hand.length,
      hasInitialMeld: p.hasInitialMeld,
      score: p.score,
      hand: canSeeHand ? p.hand : [],
    };
  });

  const myPlayer = gs.players.find((p) => p.id === myPlayerId);

  return {
    roomCode: room.roomCode,
    hostPlayerId: room.hostPlayerId,
    status: room.status,
    maxPlayers: room.maxPlayers,
    version: room.version,
    myPlayerId,
    seats: publicSeats,
    messages,
    gameState: {
      id: gs.id,
      status: gs.status,
      config: gs.config,
      currentPlayerIndex: gs.currentPlayerIndex,
      table: gs.table,
      turnNumber: gs.turnNumber,
      consecutivePasses: gs.consecutivePasses,
      winnerId: gs.winnerId,
      endReason: gs.endReason,
      history: gs.history,
      lastError: gs.lastError,
      lastActionNotice: gs.lastActionNotice,
      recentTileIds: gs.recentTileIds,
      poolCount: gs.pool.length,
      players: sanitizedPlayers,
      myHand: myPlayer ? myPlayer.hand : [],
      myTurnStartHand: isMyTurn ? gs.turnStartSnapshot.hand : myPlayer ? myPlayer.hand : [],
      turnStartTable: gs.turnStartSnapshot.table,
    },
    transportMode,
  };
}

/**
 * Authoritatively applies a player's turn submission or draw action onto a `RoomRecord`.
 * Enforces turn ownership, optimistic concurrency `expectedVersion`, and full Rummikub rule validation.
 */
export function applyAuthoritativeRoomAction(params: {
  room: RoomRecord;
  secretToken: string;
  expectedVersion: number;
  action:
    | { type: 'start_game'; fillAiDifficulty?: 'easy' | 'hard' }
    | { type: 'restart_game'; fillAiDifficulty?: 'easy' | 'hard' }
    | { type: 'rename_player'; playerName: string }
    | { type: 'send_message'; text: string }
    | { type: 'commit_turn'; proposedHand: Tile[]; proposedTable: Meld[] }
    | { type: 'draw_tile' };
}): { room: RoomRecord; ok: boolean; error?: string } {
  const { room, secretToken, expectedVersion, action } = params;

  const actorSeat = room.seats.find((s) => s.secretToken === secretToken);
  if (!actorSeat) {
    return { room, ok: false, error: '无效的玩家身份凭证，无法执行操作' };
  }

  // Action 0a: Rename player (allowed in waiting lobby or active game)
  if (action.type === 'rename_player') {
    const cleanName = String(action.playerName || '').trim().slice(0, 20);
    if (!cleanName) {
      return { room, ok: false, error: '昵称不能为空' };
    }
    const updatedSeats = room.seats.map((s) =>
      s.playerId === actorSeat.playerId ? { ...s, playerName: cleanName } : s
    );
    const updatedGameState = room.gameState
      ? {
          ...room.gameState,
          players: room.gameState.players.map((p) =>
            p.id === actorSeat.playerId ? { ...p, name: cleanName } : p
          ),
        }
      : null;

    return {
      room: {
        ...room,
        seats: updatedSeats,
        gameState: updatedGameState,
        version: room.version + 1,
        updatedAt: Date.now(),
      },
      ok: true,
    };
  }

  // Action 0b: Quick chat / emote message
  if (action.type === 'send_message') {
    const cleanText = String(action.text || '').trim().slice(0, 40);
    if (!cleanText) {
      return { room, ok: false, error: '消息不能为空' };
    }
    const nextMsg: RoomChatMessage = {
      id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      playerId: actorSeat.playerId,
      playerName: actorSeat.playerName,
      text: cleanText,
      timestamp: Date.now(),
    };
    const nextMessages = [nextMsg, ...(room.messages ?? [])].slice(0, 15);
    return {
      room: {
        ...room,
        messages: nextMessages,
        version: room.version + 1,
        updatedAt: Date.now(),
      },
      ok: true,
    };
  }

  // Action 0c: Restart game (Rematch in same room)
  if (action.type === 'restart_game') {
    if (room.status !== 'finished' && actorSeat.playerId !== room.hostPlayerId) {
      return { room, ok: false, error: '对局进行中只有房主可以重开对局' };
    }

    const updatedSeats = [...room.seats];
    while (updatedSeats.length < room.maxPlayers) {
      const idx = updatedSeats.length;
      updatedSeats.push({
        seatIndex: idx,
        playerId: `room-ai-${idx + 1}`,
        playerName: `AI 补位 #${idx}`,
        playerType: 'ai',
        connected: true,
        lastSeenAt: Date.now(),
      });
    }

    const initialState = createInitialGameState(
      {
        aiCount: Math.max(1, updatedSeats.length - 1) as 1 | 2 | 3,
        aiDifficulty:
          action.fillAiDifficulty ?? room.gameState?.config.aiDifficulty ?? 'hard',
      },
      Math.random,
      updatedSeats.map((s) => ({
        name: s.playerName,
        type: s.playerType,
      }))
    );

    initialState.players = initialState.players.map((p, idx) => ({
      ...p,
      id: updatedSeats[idx].playerId,
    }));

    return {
      room: {
        ...room,
        status: 'playing',
        seats: updatedSeats,
        gameState: initialState,
        version: room.version + 1,
        updatedAt: Date.now(),
      },
      ok: true,
    };
  }

  if (room.version !== expectedVersion) {
    return {
      room,
      ok: false,
      error: '房间状态已更新（检测到并发或重复提交），已为你同步最新桌面状态',
    };
  }

  // Action 1: Host starts the game
  if (action.type === 'start_game') {
    if (actorSeat.playerId !== room.hostPlayerId) {
      return { room, ok: false, error: '只有房主可以开始对局' };
    }
    if (room.status !== 'waiting') {
      return { room, ok: false, error: '对局已经开始' };
    }

    const updatedSeats = [...room.seats];
    while (updatedSeats.length < room.maxPlayers) {
      const idx = updatedSeats.length;
      updatedSeats.push({
        seatIndex: idx,
        playerId: `room-ai-${idx + 1}`,
        playerName: `AI 补位 #${idx}`,
        playerType: 'ai',
        connected: true,
        lastSeenAt: Date.now(),
      });
    }

    const initialState = createInitialGameState(
      {
        aiCount: Math.max(1, updatedSeats.length - 1) as 1 | 2 | 3,
        aiDifficulty: action.fillAiDifficulty ?? 'hard',
      },
      Math.random,
      updatedSeats.map((s) => ({
        name: s.playerName,
        type: s.playerType,
      }))
    );

    // Align player IDs with seat playerIds
    initialState.players = initialState.players.map((p, idx) => ({
      ...p,
      id: updatedSeats[idx].playerId,
    }));

    return {
      room: {
        ...room,
        status: 'playing',
        seats: updatedSeats,
        gameState: initialState,
        version: room.version + 1,
        updatedAt: Date.now(),
      },
      ok: true,
    };
  }

  if (!room.gameState || room.status !== 'playing') {
    return { room, ok: false, error: '当前房间不在对局进行中状态' };
  }

  let gs = room.gameState;
  const activePlayer = gs.players[gs.currentPlayerIndex];

  if (activePlayer.id !== actorSeat.playerId) {
    return { room, ok: false, error: '当前不是你的出牌回合' };
  }

  if (action.type === 'commit_turn') {
    // Verify proposedHand + proposedTable against authoritative turnStartSnapshot
    const workingState: GameState = {
      ...gs,
      players: gs.players.map((p, idx) =>
        idx === gs.currentPlayerIndex ? { ...p, hand: action.proposedHand } : p
      ),
      table: action.proposedTable,
    };

    const commitRes = commitTurnPlay(workingState);
    if (!commitRes.success) {
      return {
        room,
        ok: false,
        error: commitRes.error ?? '服务端校验未通过：非法出牌',
      };
    }

    gs = commitRes.state;
  } else if (action.type === 'draw_tile') {
    gs = drawTileAndEndTurn(gs).state;
  }

  // If the next player(s) in the room are AI bots, advance their turns authoritatively
  let safetyCounter = 0;
  while (
    gs.status === 'playing' &&
    gs.players[gs.currentPlayerIndex].type === 'ai' &&
    safetyCounter < 6
  ) {
    gs = executeAITurn(gs);
    safetyCounter++;
  }

  return {
    room: {
      ...room,
      status: gs.status === 'finished' ? 'finished' : 'playing',
      gameState: gs,
      version: room.version + 1,
      updatedAt: Date.now(),
    },
    ok: true,
  };
}
