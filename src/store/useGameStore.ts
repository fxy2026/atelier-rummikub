'use client';

import { create } from 'zustand';
import {
  commitTurnPlay,
  computeSmartHint,
  createInitialGameState,
  DEFAULT_GAME_CONFIG,
  drawTileAndEndTurn,
  executeAITurn,
  GameConfig,
  GameState,
  moveTilesToMeld,
  playTilesToNewMeld,
  resetTurnToStart,
  returnTilesToHand,
  sortCurrentPlayerHand,
  sortTableMeld,
  splitTableMeld,
  undoTurnStep,
  validateTileConservation,
} from '@/engine';
import {
  applyAuthoritativeRoomAction,
  RoomChatMessage,
  RoomRecord,
  SanitizedRoomView,
  sanitizeRoomForViewer,
} from '@/lib/multiplayer';
import { soundFX } from '@/lib/sound';
import {
  CareerStats,
  DEFAULT_CAREER_STATS,
  loadCareerStats,
  recordGameEndStats,
  recordTurnPlayStats,
} from '@/lib/stats';

const SAVE_STORAGE_KEY = 'atelier_rummikub_save_v2';
const CONFIG_STORAGE_KEY = 'atelier_rummikub_config_v2';
const MP_ROOMS_LOCAL_KEY = 'atelier_rummikub_mp_rooms_v2';
const MP_TOKENS_LOCAL_KEY = 'atelier_rummikub_mp_tokens_v2';

export type ScreenMode = 'home' | 'game' | 'multiplayer';
export type ModalType = 'none' | 'rules' | 'settings' | 'multiplayer' | 'tracker';

const AI_CHAT_REPLIES = [
  '好棋！这手牌拆得真妙 👏',
  '容我推演一番桌面局势 🤔',
  '看来你离清空手牌不远了！',
  '拉密的魅力就在瞬息万变的重组 ✨',
  '稳住，我还在等关键连接牌！',
];

interface GameStore {
  hydrated: boolean;
  screen: ScreenMode;
  config: GameConfig;
  gameState: GameState | null;
  selectedTileIds: string[];
  isAIThinking: boolean;
  activeModal: ModalType;
  careerStats: CareerStats;
  localMessages: RoomChatMessage[];

  // Multiplayer room state
  mpRoom: SanitizedRoomView | null;
  mpSecretToken: string | null;
  mpError: string | null;
  mpInviteCode: string | null;

  // Lifecycle & navigation
  hydrateFromStorage: () => void;
  setScreen: (screen: ScreenMode) => void;
  setActiveModal: (modal: ModalType) => void;
  updateConfig: (partial: Partial<GameConfig>) => void;
  setMpInviteCode: (code: string | null) => void;

  // Game actions
  startNewGame: (overrideConfig?: Partial<GameConfig>) => void;
  resumeSavedGame: () => void;
  clearSavedGame: () => void;

  // Selection & Tile manipulation
  toggleSelectTile: (tileId: string) => void;
  clearSelection: () => void;
  playSelectedToNewMeld: () => void;
  playTilesByIdsToNewMeld: (tileIds: string[]) => void;
  moveTileOrSelectionToMeld: (
    tileIds: string[],
    targetMeldId: string,
    targetIndex?: number
  ) => void;
  returnTileOrSelectionToHand: (tileIds: string[], targetHandIndex?: number) => void;
  splitMeld: (meldId: string, splitIndex: number) => void;
  normalizeMeldById: (meldId: string) => void;
  sortHand: (mode: 'color' | 'number' | 'smart') => void;
  undoStep: () => void;
  resetTurn: () => void;
  applySmartHint: () => void;

  // Turn completion
  submitTurn: () => boolean;
  drawTile: () => void;
  stepAITurn: () => void;
  clearError: () => void;

  // Multiplayer & Social actions
  createMultiplayerRoom: (playerName: string, maxPlayers: 2 | 3 | 4) => Promise<string | null>;
  joinMultiplayerRoom: (roomCode: string, playerName: string) => Promise<boolean>;
  renameMultiplayerPlayer: (playerName: string) => Promise<boolean>;
  sendTableMessage: (text: string) => Promise<void>;
  startMultiplayerGame: () => Promise<void>;
  restartMultiplayerGame: () => Promise<void>;
  refreshMultiplayerRoom: (roomCode?: string) => Promise<void>;
  leaveMultiplayerRoom: () => void;
}

function saveGameToLocalStorage(state: GameState | null) {
  if (typeof window === 'undefined') return;
  try {
    if (!state) {
      window.localStorage.removeItem(SAVE_STORAGE_KEY);
      return;
    }
    const payload = JSON.stringify({
      version: 2,
      savedAt: Date.now(),
      gameState: state,
    });
    window.localStorage.setItem(SAVE_STORAGE_KEY, payload);
  } catch {
    // Ignore storage quota errors
  }
}

function loadGameFromLocalStorage(): GameState | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(SAVE_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.version !== 2 || !parsed.gameState) {
      window.localStorage.removeItem(SAVE_STORAGE_KEY);
      return null;
    }
    const gs = parsed.gameState as GameState;
    if (
      !Array.isArray(gs.players) ||
      !Array.isArray(gs.pool) ||
      !Array.isArray(gs.table) ||
      !gs.turnStartSnapshot
    ) {
      window.localStorage.removeItem(SAVE_STORAGE_KEY);
      return null;
    }
    const conservation = validateTileConservation(gs);
    if (!conservation.isValid) {
      window.localStorage.removeItem(SAVE_STORAGE_KEY);
      return null;
    }
    return gs;
  } catch {
    return null;
  }
}

function saveConfigToLocalStorage(config: GameConfig) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(config));
  } catch {}
}

function loadConfigFromLocalStorage(): GameConfig {
  if (typeof window === 'undefined') return DEFAULT_GAME_CONFIG;
  try {
    const raw = window.localStorage.getItem(CONFIG_STORAGE_KEY);
    if (!raw) return DEFAULT_GAME_CONFIG;
    const parsed = JSON.parse(raw);
    return {
      ...DEFAULT_GAME_CONFIG,
      ...parsed,
    };
  } catch {
    return DEFAULT_GAME_CONFIG;
  }
}

function getLocalRoomMap(): Record<string, RoomRecord> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(MP_ROOMS_LOCAL_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveLocalRoomRecord(room: RoomRecord) {
  if (typeof window === 'undefined') return;
  try {
    const map = getLocalRoomMap();
    map[room.roomCode] = room;
    window.localStorage.setItem(MP_ROOMS_LOCAL_KEY, JSON.stringify(map));
    if (typeof BroadcastChannel !== 'undefined') {
      const bc = new BroadcastChannel('atelier_rummikub_mp_channel');
      bc.postMessage({ type: 'room_updated', roomCode: room.roomCode });
      bc.close();
    }
  } catch {}
}

function getSavedPlayerToken(roomCode: string): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(MP_TOKENS_LOCAL_KEY);
    const map = raw ? JSON.parse(raw) : {};
    return map[roomCode] ?? null;
  } catch {
    return null;
  }
}

function savePlayerToken(roomCode: string, token: string) {
  if (typeof window === 'undefined') return;
  try {
    const raw = window.localStorage.getItem(MP_TOKENS_LOCAL_KEY);
    const map = raw ? JSON.parse(raw) : {};
    map[roomCode] = token;
    window.localStorage.setItem(MP_TOKENS_LOCAL_KEY, JSON.stringify(map));
  } catch {}
}

/**
 * Converts a `SanitizedRoomView` into a local working `GameState` so the exact same board UI works for both single-player and online rooms.
 */
function buildWorkingGameStateFromRoomView(view: SanitizedRoomView): GameState | null {
  if (!view.gameState) return null;
  const gs = view.gameState;
  const players = gs.players.map((p) => ({
    id: p.id,
    name: p.name,
    type: p.type,
    hand: p.id === view.myPlayerId ? gs.myHand : p.hand,
    hasInitialMeld: p.hasInitialMeld,
    score: p.score,
  }));

  const dummyPool = Array.from({ length: gs.poolCount }, (_, idx) => ({
    id: `hidden-pool-${idx}`,
    color: 'black' as const,
    number: 1 as const,
    isJoker: false,
    copy: 1 as const,
  }));

  return {
    id: gs.id,
    status: gs.status,
    config: gs.config,
    players,
    currentPlayerIndex: gs.currentPlayerIndex,
    pool: dummyPool,
    table: gs.table,
    turnStartSnapshot: {
      hand: gs.myTurnStartHand,
      table: gs.turnStartTable,
    },
    undoStack: [],
    turnNumber: gs.turnNumber,
    consecutivePasses: gs.consecutivePasses,
    winnerId: gs.winnerId,
    endReason: gs.endReason,
    history: gs.history,
    lastError: gs.lastError,
    lastActionNotice: gs.lastActionNotice,
    recentTileIds: gs.recentTileIds,
  };
}

export const useGameStore = create<GameStore>((set, get) => ({
  hydrated: false,
  screen: 'home',
  config: DEFAULT_GAME_CONFIG,
  gameState: null,
  selectedTileIds: [],
  isAIThinking: false,
  activeModal: 'none',
  careerStats: DEFAULT_CAREER_STATS,
  localMessages: [],
  mpRoom: null,
  mpSecretToken: null,
  mpError: null,
  mpInviteCode: null,

  hydrateFromStorage: () => {
    const savedConfig = loadConfigFromLocalStorage();
    const savedGame = loadGameFromLocalStorage();
    const savedStats = loadCareerStats();
    soundFX.setEnabled(savedConfig.soundEnabled);
    set({
      hydrated: true,
      config: savedConfig,
      gameState: savedGame,
      careerStats: savedStats,
    });
  },

  setScreen: (screen) => set({ screen }),

  setActiveModal: (activeModal) => set({ activeModal }),

  setMpInviteCode: (mpInviteCode) => set({ mpInviteCode }),

  updateConfig: (partial) => {
    const nextConfig = { ...get().config, ...partial };
    soundFX.setEnabled(nextConfig.soundEnabled);
    saveConfigToLocalStorage(nextConfig);

    if (partial.playerName && partial.playerName.trim()) {
      const cleanName = partial.playerName.trim().slice(0, 20);
      if (get().mpRoom) {
        get().renameMultiplayerPlayer(cleanName);
      }
    }

    const currentGs = get().gameState;
    if (currentGs) {
      const updatedPlayers =
        partial.playerName && partial.playerName.trim() && !get().mpRoom
          ? currentGs.players.map((p, idx) =>
              idx === 0 && p.type === 'human'
                ? { ...p, name: partial.playerName!.trim().slice(0, 20) }
                : p
            )
          : currentGs.players;
      const updatedGs = {
        ...currentGs,
        players: updatedPlayers,
        config: nextConfig,
      };
      saveGameToLocalStorage(updatedGs);
      set({ config: nextConfig, gameState: updatedGs });
    } else {
      set({ config: nextConfig });
    }
  },

  startNewGame: (overrideConfig) => {
    const mergedConfig = { ...get().config, ...overrideConfig };
    soundFX.setEnabled(mergedConfig.soundEnabled);
    saveConfigToLocalStorage(mergedConfig);

    const newState = createInitialGameState(mergedConfig);
    saveGameToLocalStorage(newState);
    soundFX.playTilePlace();

    set({
      config: mergedConfig,
      gameState: newState,
      screen: 'game',
      selectedTileIds: [],
      isAIThinking: false,
      activeModal: 'none',
      mpRoom: null,
      localMessages: [],
    });
  },

  resumeSavedGame: () => {
    const gs = get().gameState ?? loadGameFromLocalStorage();
    if (!gs) return;
    set({
      gameState: gs,
      screen: 'game',
      selectedTileIds: [],
      activeModal: 'none',
    });
  },

  clearSavedGame: () => {
    saveGameToLocalStorage(null);
    set({ gameState: null, selectedTileIds: [] });
  },

  toggleSelectTile: (tileId) => {
    const current = get().selectedTileIds;
    const exists = current.includes(tileId);
    soundFX.playTileClick();
    set({
      selectedTileIds: exists
        ? current.filter((id) => id !== tileId)
        : [...current, tileId],
    });
  },

  clearSelection: () => set({ selectedTileIds: [] }),

  playSelectedToNewMeld: () => {
    const { gameState, selectedTileIds } = get();
    if (!gameState || selectedTileIds.length === 0) return;

    const nextState = playTilesToNewMeld(gameState, selectedTileIds);
    if (nextState.lastError) {
      soundFX.playError();
    } else {
      soundFX.playTilePlace();
    }
    if (!get().mpRoom) saveGameToLocalStorage(nextState);
    set({
      gameState: nextState,
      selectedTileIds: [],
    });
  },

  playTilesByIdsToNewMeld: (tileIds) => {
    const { gameState } = get();
    if (!gameState || tileIds.length === 0) return;

    const nextState = playTilesToNewMeld(gameState, tileIds);
    if (nextState.lastError) {
      soundFX.playError();
    } else {
      soundFX.playTilePlace();
    }
    if (!get().mpRoom) saveGameToLocalStorage(nextState);
    set({
      gameState: nextState,
      selectedTileIds: [],
    });
  },

  moveTileOrSelectionToMeld: (tileIds, targetMeldId, targetIndex) => {
    const { gameState } = get();
    if (!gameState || tileIds.length === 0) return;

    const nextState = moveTilesToMeld(gameState, tileIds, targetMeldId, targetIndex);
    if (nextState.lastError) {
      soundFX.playError();
    } else {
      soundFX.playTilePlace();
    }
    if (!get().mpRoom) saveGameToLocalStorage(nextState);
    set({
      gameState: nextState,
      selectedTileIds: [],
    });
  },

  returnTileOrSelectionToHand: (tileIds, targetHandIndex) => {
    const { gameState } = get();
    if (!gameState || tileIds.length === 0) return;

    const nextState = returnTilesToHand(gameState, tileIds, targetHandIndex);
    if (nextState.lastError) {
      soundFX.playError();
    } else {
      soundFX.playTilePlace();
    }
    if (!get().mpRoom) saveGameToLocalStorage(nextState);
    set({
      gameState: nextState,
      selectedTileIds: [],
    });
  },

  splitMeld: (meldId, splitIndex) => {
    const { gameState } = get();
    if (!gameState) return;
    const nextState = splitTableMeld(gameState, meldId, splitIndex);
    if (nextState.lastError) {
      soundFX.playError();
    } else {
      soundFX.playTileClick();
    }
    if (!get().mpRoom) saveGameToLocalStorage(nextState);
    set({ gameState: nextState, selectedTileIds: [] });
  },

  normalizeMeldById: (meldId) => {
    const { gameState } = get();
    if (!gameState) return;
    const nextState = sortTableMeld(gameState, meldId);
    soundFX.playTileClick();
    if (!get().mpRoom) saveGameToLocalStorage(nextState);
    set({ gameState: nextState });
  },

  sortHand: (mode) => {
    const { gameState } = get();
    if (!gameState) return;
    const nextState = sortCurrentPlayerHand(gameState, mode);
    soundFX.playTileClick();
    if (!get().mpRoom) saveGameToLocalStorage(nextState);
    set({
      gameState: nextState,
      config: nextState.config,
    });
  },

  undoStep: () => {
    const { gameState } = get();
    if (!gameState) return;
    const nextState = undoTurnStep(gameState);
    soundFX.playTileClick();
    if (!get().mpRoom) saveGameToLocalStorage(nextState);
    set({ gameState: nextState, selectedTileIds: [] });
  },

  resetTurn: () => {
    const { gameState } = get();
    if (!gameState) return;
    const nextState = resetTurnToStart(gameState);
    soundFX.playTilePlace();
    if (!get().mpRoom) saveGameToLocalStorage(nextState);
    set({ gameState: nextState, selectedTileIds: [] });
  },

  applySmartHint: () => {
    const { gameState } = get();
    if (!gameState || gameState.status !== 'playing') return;

    const currentPlayer = gameState.players[gameState.currentPlayerIndex];
    const hint = computeSmartHint({
      turnStartSnapshot: gameState.turnStartSnapshot,
      hasInitialMeld: currentPlayer.hasInitialMeld,
    });

    if (hint.action === 'draw') {
      soundFX.playError();
      set({
        gameState: {
          ...gameState,
          lastActionNotice: `智能提示：${hint.explanation}`,
        },
      });
      return;
    }

    const prevSnapshot = {
      hand: currentPlayer.hand.map((t) => ({ ...t })),
      table: gameState.table.map((m) => ({
        id: m.id,
        tiles: m.tiles.map((t) => ({ ...t })),
      })),
    };

    const updatedPlayers = gameState.players.map((p, idx) =>
      idx === gameState.currentPlayerIndex ? { ...p, hand: hint.newHand } : p
    );

    const nextState: GameState = {
      ...gameState,
      players: updatedPlayers,
      table: hint.newTable,
      undoStack: [...gameState.undoStack, prevSnapshot],
      lastError: null,
      lastActionNotice: `已为你自动摆出推荐方案：${hint.explanation}（点击「出牌提交」确认或「撤销」恢复）`,
    };

    soundFX.playTilePlace();
    if (!get().mpRoom) saveGameToLocalStorage(nextState);
    set({ gameState: nextState, selectedTileIds: [] });
  },

  submitTurn: () => {
    const { gameState, mpRoom, mpSecretToken } = get();
    if (!gameState) return false;

    // Multiplayer room authoritative submission
    if (mpRoom && mpSecretToken) {
      const currentPlayer = gameState.players[gameState.currentPlayerIndex];
      const proposedHand = currentPlayer.hand;
      const proposedTable = gameState.table;

      if (mpRoom.transportMode === 'local-broadcast') {
        const map = getLocalRoomMap();
        const record = map[mpRoom.roomCode];
        if (!record) return false;
        const res = applyAuthoritativeRoomAction({
          room: record,
          secretToken: mpSecretToken,
          expectedVersion: mpRoom.version,
          action: {
            type: 'commit_turn',
            proposedHand,
            proposedTable,
          },
        });
        if (!res.ok) {
          soundFX.playError();
          set({
            gameState: { ...gameState, lastError: res.error ?? '提交失败' },
          });
          return false;
        }
        saveLocalRoomRecord(res.room);
        const nextView = sanitizeRoomForViewer(res.room, mpSecretToken, 'local-broadcast');
        soundFX.playCommitSuccess();
        const nextGs = buildWorkingGameStateFromRoomView(nextView);
        let nextStats = get().careerStats;
        if (nextGs && nextGs.history[0]?.playerId === nextView.myPlayerId) {
          nextStats = recordTurnPlayStats({
            tilesPlayedCount: nextGs.history[0].tilesPlayedCount,
            pointsPlayed: nextGs.history[0].pointsPlayed ?? 0,
            brokeIce: Boolean(nextGs.history[0].brokeIce),
          });
        }
        if (nextGs && nextGs.status === 'finished') {
          const me = nextGs.players.find((p) => p.id === nextView.myPlayerId);
          nextStats = recordGameEndStats({
            won: nextGs.winnerId === nextView.myPlayerId,
            finalScore: me?.score ?? 0,
          });
        }
        set({
          mpRoom: nextView,
          gameState: nextGs,
          selectedTileIds: [],
          careerStats: nextStats,
        });
        return true;
      } else {
        fetch('/api/rooms', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            op: 'action',
            roomCode: mpRoom.roomCode,
            secretToken: mpSecretToken,
            expectedVersion: mpRoom.version,
            action: {
              type: 'commit_turn',
              proposedHand,
              proposedTable,
            },
          }),
        })
          .then((r) => r.json())
          .then((data) => {
            if (data.error) {
              soundFX.playError();
              set((s) => ({
                gameState: s.gameState
                  ? { ...s.gameState, lastError: data.error }
                  : null,
              }));
            } else if (data.room) {
              soundFX.playCommitSuccess();
              const nextGs = buildWorkingGameStateFromRoomView(data.room);
              let nextStats = get().careerStats;
              if (nextGs && nextGs.history[0]?.playerId === data.room.myPlayerId) {
                nextStats = recordTurnPlayStats({
                  tilesPlayedCount: nextGs.history[0].tilesPlayedCount,
                  pointsPlayed: nextGs.history[0].pointsPlayed ?? 0,
                  brokeIce: Boolean(nextGs.history[0].brokeIce),
                });
              }
              if (nextGs && nextGs.status === 'finished') {
                const me = nextGs.players.find((p) => p.id === data.room.myPlayerId);
                nextStats = recordGameEndStats({
                  won: nextGs.winnerId === data.room.myPlayerId,
                  finalScore: me?.score ?? 0,
                });
              }
              set({
                mpRoom: data.room,
                gameState: nextGs,
                selectedTileIds: [],
                careerStats: nextStats,
              });
            }
          });
        return true;
      }
    }

    // Standard single-player commit
    const wasUnbroken = !gameState.players[gameState.currentPlayerIndex].hasInitialMeld;
    const result = commitTurnPlay(gameState);
    if (!result.success) {
      soundFX.playError();
      set({ gameState: result.state });
      return false;
    }

    const latestPlay = result.state.history[0];
    let nextStats = recordTurnPlayStats({
      tilesPlayedCount: latestPlay?.tilesPlayedCount ?? 0,
      pointsPlayed: latestPlay?.pointsPlayed ?? 0,
      brokeIce: Boolean(latestPlay?.brokeIce),
    });

    if (result.state.status === 'finished') {
      soundFX.playVictory();
      const human = result.state.players.find((p) => p.type === 'human');
      nextStats = recordGameEndStats({
        won: result.state.winnerId === human?.id,
        finalScore: human?.score ?? 0,
      });
    } else {
      soundFX.playCommitSuccess(wasUnbroken);
    }

    saveGameToLocalStorage(result.state);
    set({
      gameState: result.state,
      selectedTileIds: [],
      careerStats: nextStats,
    });
    return true;
  },

  drawTile: () => {
    const { gameState, mpRoom, mpSecretToken } = get();
    if (!gameState) return;

    if (mpRoom && mpSecretToken) {
      if (mpRoom.transportMode === 'local-broadcast') {
        const map = getLocalRoomMap();
        const record = map[mpRoom.roomCode];
        if (!record) return;
        const res = applyAuthoritativeRoomAction({
          room: record,
          secretToken: mpSecretToken,
          expectedVersion: mpRoom.version,
          action: { type: 'draw_tile' },
        });
        if (!res.ok) {
          soundFX.playError();
          set({
            gameState: { ...gameState, lastError: res.error ?? '操作失败' },
          });
          return;
        }
        saveLocalRoomRecord(res.room);
        const nextView = sanitizeRoomForViewer(res.room, mpSecretToken, 'local-broadcast');
        soundFX.playDrawTile();
        set({
          mpRoom: nextView,
          gameState: buildWorkingGameStateFromRoomView(nextView),
          selectedTileIds: [],
        });
      } else {
        fetch('/api/rooms', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            op: 'action',
            roomCode: mpRoom.roomCode,
            secretToken: mpSecretToken,
            expectedVersion: mpRoom.version,
            action: { type: 'draw_tile' },
          }),
        })
          .then((r) => r.json())
          .then((data) => {
            if (data.room) {
              soundFX.playDrawTile();
              set({
                mpRoom: data.room,
                gameState: buildWorkingGameStateFromRoomView(data.room),
                selectedTileIds: [],
              });
            }
          });
      }
      return;
    }

    const { state: nextState } = drawTileAndEndTurn(gameState);
    let nextStats = get().careerStats;
    if (nextState.status === 'finished') {
      soundFX.playVictory();
      const human = nextState.players.find((p) => p.type === 'human');
      nextStats = recordGameEndStats({
        won: nextState.winnerId === human?.id,
        finalScore: human?.score ?? 0,
      });
    } else {
      soundFX.playDrawTile();
    }
    saveGameToLocalStorage(nextState);
    set({
      gameState: nextState,
      selectedTileIds: [],
      careerStats: nextStats,
    });
  },

  stepAITurn: () => {
    const { gameState, mpRoom } = get();
    if (!gameState || gameState.status !== 'playing' || mpRoom) return;

    const currentPlayer = gameState.players[gameState.currentPlayerIndex];
    if (currentPlayer.type !== 'ai') return;

    const nextState = executeAITurn(gameState);
    let nextStats = get().careerStats;

    if (nextState.status === 'finished') {
      soundFX.playVictory();
      const human = nextState.players.find((p) => p.type === 'human');
      nextStats = recordGameEndStats({
        won: nextState.winnerId === human?.id,
        finalScore: human?.score ?? 0,
      });
    } else if (nextState.history[0]?.action === 'play') {
      soundFX.playCommitSuccess(nextState.history[0]?.brokeIce);
    } else {
      soundFX.playDrawTile();
    }

    // If the turn just returned to the human player, play a subtle turn chime
    const nextActive = nextState.players[nextState.currentPlayerIndex];
    if (nextState.status === 'playing' && nextActive?.type === 'human') {
      setTimeout(() => soundFX.playTurnStart(), 180);
    }

    saveGameToLocalStorage(nextState);
    set({
      gameState: nextState,
      isAIThinking: false,
      careerStats: nextStats,
    });
  },

  clearError: () => {
    const { gameState } = get();
    if (!gameState || !gameState.lastError) return;
    set({
      gameState: {
        ...gameState,
        lastError: null,
      },
    });
  },

  createMultiplayerRoom: async (playerName, maxPlayers) => {
    set({ mpError: null });
    if (typeof window !== 'undefined' && playerName.trim()) {
      try {
        window.localStorage.setItem('atelier_rummikub_mp_name_v2', playerName.trim());
      } catch {}
    }

    try {
      const checkRes = await fetch('/api/rooms');
      const checkJson = await checkRes.json();

      if (checkJson.cloudConfigured) {
        const res = await fetch('/api/rooms', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ op: 'create', playerName, maxPlayers }),
        });
        const data = await res.json();
        if (data.error) {
          set({ mpError: data.error });
          return null;
        }
        savePlayerToken(data.room.roomCode, data.secretToken);
        set({
          mpRoom: data.room,
          mpSecretToken: data.secretToken,
          screen: 'multiplayer',
          activeModal: 'none',
        });
        return data.room.roomCode;
      }
    } catch {}

    // Fallback: Local Cross-Tab Authoritative Room
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let roomCode = '';
    for (let i = 0; i < 6; i++) {
      roomCode += chars[Math.floor(Math.random() * chars.length)];
    }
    const playerId = `mp-p1-${Date.now().toString(36)}`;
    const secretToken = `tok-${Math.random().toString(36).slice(2)}`;

    const newRoom: RoomRecord = {
      roomCode,
      hostPlayerId: playerId,
      status: 'waiting',
      maxPlayers,
      version: 1,
      seats: [
        {
          seatIndex: 0,
          playerId,
          playerName: playerName || '房主',
          playerType: 'human',
          secretToken,
          connected: true,
          lastSeenAt: Date.now(),
        },
      ],
      messages: [],
      gameState: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    saveLocalRoomRecord(newRoom);
    savePlayerToken(roomCode, secretToken);
    const view = sanitizeRoomForViewer(newRoom, secretToken, 'local-broadcast');
    set({
      mpRoom: view,
      mpSecretToken: secretToken,
      screen: 'multiplayer',
      activeModal: 'none',
    });
    return roomCode;
  },

  joinMultiplayerRoom: async (rawCode, playerName) => {
    const roomCode = rawCode.trim().toUpperCase();
    set({ mpError: null });
    const existingToken = getSavedPlayerToken(roomCode);
    if (typeof window !== 'undefined' && playerName && playerName !== '受邀玩家') {
      try {
        window.localStorage.setItem('atelier_rummikub_mp_name_v2', playerName.trim());
      } catch {}
    }

    try {
      const checkRes = await fetch('/api/rooms');
      const checkJson = await checkRes.json();
      if (checkJson.cloudConfigured) {
        const res = await fetch('/api/rooms', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            op: 'join',
            roomCode,
            playerName,
            secretToken: existingToken,
          }),
        });
        const data = await res.json();
        if (data.error) {
          set({ mpError: data.error });
          return false;
        }
        savePlayerToken(roomCode, data.secretToken);
        const gs = buildWorkingGameStateFromRoomView(data.room);
        set({
          mpRoom: data.room,
          mpSecretToken: data.secretToken,
          mpInviteCode: null,
          gameState: gs,
          screen: data.room.status === 'waiting' ? 'multiplayer' : 'game',
          activeModal: 'none',
        });
        return true;
      }
    } catch {}

    // Local Broadcast Room join / reconnect
    const map = getLocalRoomMap();
    const room = map[roomCode];
    if (!room) {
      set({ mpError: `未找到房间 ${roomCode}，请确认房间号是否正确` });
      return false;
    }

    const existingSeat = existingToken
      ? room.seats.find((s) => s.secretToken === existingToken)
      : undefined;

    if (existingSeat) {
      existingSeat.connected = true;
      existingSeat.lastSeenAt = Date.now();
      saveLocalRoomRecord(room);
      const view = sanitizeRoomForViewer(room, existingToken, 'local-broadcast');
      set({
        mpRoom: view,
        mpSecretToken: existingToken,
        gameState: buildWorkingGameStateFromRoomView(view),
        screen: view.status === 'waiting' ? 'multiplayer' : 'game',
        activeModal: 'none',
      });
      return true;
    }

    if (room.status !== 'waiting' || room.seats.length >= room.maxPlayers) {
      set({ mpError: '该房间已满员或对局已经开始' });
      return false;
    }

    const seatIndex = room.seats.length;
    const playerId = `mp-p${seatIndex + 1}-${Date.now().toString(36)}`;
    const secretToken = `tok-${Math.random().toString(36).slice(2)}`;

    room.seats.push({
      seatIndex,
      playerId,
      playerName: playerName || `玩家 #${seatIndex + 1}`,
      playerType: 'human',
      secretToken,
      connected: true,
      lastSeenAt: Date.now(),
    });
    room.version += 1;
    room.updatedAt = Date.now();

    saveLocalRoomRecord(room);
    savePlayerToken(roomCode, secretToken);
    const view = sanitizeRoomForViewer(room, secretToken, 'local-broadcast');
    set({
      mpRoom: view,
      mpSecretToken: secretToken,
      mpInviteCode: null,
      screen: 'multiplayer',
      activeModal: 'none',
    });
    return true;
  },

  renameMultiplayerPlayer: async (rawName) => {
    const cleanName = rawName.trim().slice(0, 20);
    if (!cleanName) return false;
    const { mpRoom, mpSecretToken } = get();
    if (!mpRoom || !mpSecretToken) return false;

    if (typeof window !== 'undefined') {
      try {
        window.localStorage.setItem('atelier_rummikub_mp_name_v2', cleanName);
      } catch {}
    }

    if (mpRoom.transportMode === 'local-broadcast') {
      const map = getLocalRoomMap();
      const record = map[mpRoom.roomCode];
      if (!record) return false;
      const res = applyAuthoritativeRoomAction({
        room: record,
        secretToken: mpSecretToken,
        expectedVersion: mpRoom.version,
        action: { type: 'rename_player', playerName: cleanName },
      });
      if (!res.ok) {
        set({ mpError: res.error ?? '修改昵称失败' });
        return false;
      }
      saveLocalRoomRecord(res.room);
      const view = sanitizeRoomForViewer(res.room, mpSecretToken, 'local-broadcast');
      set({
        mpRoom: view,
        gameState: buildWorkingGameStateFromRoomView(view) ?? get().gameState,
      });
      return true;
    } else {
      try {
        const res = await fetch('/api/rooms', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            op: 'action',
            roomCode: mpRoom.roomCode,
            secretToken: mpSecretToken,
            expectedVersion: mpRoom.version,
            action: { type: 'rename_player', playerName: cleanName },
          }),
        });
        const data = await res.json();
        if (data.error) {
          set({ mpError: data.error });
          return false;
        }
        if (data.room) {
          set({
            mpRoom: data.room,
            gameState: buildWorkingGameStateFromRoomView(data.room) ?? get().gameState,
          });
          return true;
        }
      } catch {
        set({ mpError: '网络请求失败，请稍后重试' });
      }
      return false;
    }
  },

  sendTableMessage: async (rawText) => {
    const cleanText = rawText.trim().slice(0, 40);
    if (!cleanText) return;
    soundFX.playTileClick();

    const { mpRoom, mpSecretToken, gameState } = get();
    if (mpRoom && mpSecretToken) {
      if (mpRoom.transportMode === 'local-broadcast') {
        const map = getLocalRoomMap();
        const record = map[mpRoom.roomCode];
        if (!record) return;
        const res = applyAuthoritativeRoomAction({
          room: record,
          secretToken: mpSecretToken,
          expectedVersion: mpRoom.version,
          action: { type: 'send_message', text: cleanText },
        });
        if (res.ok) {
          saveLocalRoomRecord(res.room);
          set({
            mpRoom: sanitizeRoomForViewer(res.room, mpSecretToken, 'local-broadcast'),
          });
        }
      } else {
        try {
          const res = await fetch('/api/rooms', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              op: 'action',
              roomCode: mpRoom.roomCode,
              secretToken: mpSecretToken,
              expectedVersion: mpRoom.version,
              action: { type: 'send_message', text: cleanText },
            }),
          });
          const data = await res.json();
          if (data.room) {
            set({ mpRoom: data.room });
          }
        } catch {}
      }
      return;
    }

    // Single-player mode: show player's chat bubble and trigger a playful AI response
    if (!gameState) return;
    const human = gameState.players.find((p) => p.type === 'human') ?? gameState.players[0];
    const myMsg: RoomChatMessage = {
      id: `local-msg-${Date.now()}`,
      playerId: human.id,
      playerName: human.name,
      text: cleanText,
      timestamp: Date.now(),
    };
    set((s) => ({
      localMessages: [myMsg, ...s.localMessages].slice(0, 10),
    }));

    const aiPlayers = gameState.players.filter((p) => p.type === 'ai');
    if (aiPlayers.length > 0) {
      const responder = aiPlayers[Math.floor(Math.random() * aiPlayers.length)];
      const replyText =
        AI_CHAT_REPLIES[Math.floor(Math.random() * AI_CHAT_REPLIES.length)];
      setTimeout(() => {
        const aiMsg: RoomChatMessage = {
          id: `local-ai-msg-${Date.now()}`,
          playerId: responder.id,
          playerName: responder.name,
          text: replyText,
          timestamp: Date.now(),
        };
        set((s) => ({
          localMessages: [aiMsg, ...s.localMessages].slice(0, 10),
        }));
      }, 900);
    }
  },

  startMultiplayerGame: async () => {
    const { mpRoom, mpSecretToken, config } = get();
    if (!mpRoom || !mpSecretToken) return;

    if (mpRoom.transportMode === 'local-broadcast') {
      const map = getLocalRoomMap();
      const record = map[mpRoom.roomCode];
      if (!record) return;
      const res = applyAuthoritativeRoomAction({
        room: record,
        secretToken: mpSecretToken,
        expectedVersion: mpRoom.version,
        action: { type: 'start_game', fillAiDifficulty: config.aiDifficulty },
      });
      if (!res.ok) {
        set({ mpError: res.error ?? '启动失败' });
        return;
      }
      saveLocalRoomRecord(res.room);
      const view = sanitizeRoomForViewer(res.room, mpSecretToken, 'local-broadcast');
      soundFX.playTilePlace();
      set({
        mpRoom: view,
        gameState: buildWorkingGameStateFromRoomView(view),
        screen: 'game',
        selectedTileIds: [],
      });
    } else {
      const res = await fetch('/api/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          op: 'action',
          roomCode: mpRoom.roomCode,
          secretToken: mpSecretToken,
          expectedVersion: mpRoom.version,
          action: { type: 'start_game', fillAiDifficulty: config.aiDifficulty },
        }),
      });
      const data = await res.json();
      if (data.room) {
        soundFX.playTilePlace();
        set({
          mpRoom: data.room,
          gameState: buildWorkingGameStateFromRoomView(data.room),
          screen: 'game',
          selectedTileIds: [],
        });
      }
    }
  },

  restartMultiplayerGame: async () => {
    const { mpRoom, mpSecretToken, config } = get();
    if (!mpRoom || !mpSecretToken) {
      get().startNewGame();
      return;
    }

    if (mpRoom.transportMode === 'local-broadcast') {
      const map = getLocalRoomMap();
      const record = map[mpRoom.roomCode];
      if (!record) return;
      const res = applyAuthoritativeRoomAction({
        room: record,
        secretToken: mpSecretToken,
        expectedVersion: mpRoom.version,
        action: { type: 'restart_game', fillAiDifficulty: config.aiDifficulty },
      });
      if (!res.ok) return;
      saveLocalRoomRecord(res.room);
      const view = sanitizeRoomForViewer(res.room, mpSecretToken, 'local-broadcast');
      soundFX.playTilePlace();
      set({
        mpRoom: view,
        gameState: buildWorkingGameStateFromRoomView(view),
        screen: 'game',
        selectedTileIds: [],
      });
    } else {
      try {
        const res = await fetch('/api/rooms', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            op: 'action',
            roomCode: mpRoom.roomCode,
            secretToken: mpSecretToken,
            expectedVersion: mpRoom.version,
            action: { type: 'restart_game', fillAiDifficulty: config.aiDifficulty },
          }),
        });
        const data = await res.json();
        if (data.room) {
          soundFX.playTilePlace();
          set({
            mpRoom: data.room,
            gameState: buildWorkingGameStateFromRoomView(data.room),
            screen: 'game',
            selectedTileIds: [],
          });
        }
      } catch {}
    }
  },

  refreshMultiplayerRoom: async (codeOverride) => {
    const { mpRoom, mpSecretToken, gameState } = get();
    const roomCode = codeOverride ?? mpRoom?.roomCode;
    const token = mpSecretToken ?? (roomCode ? getSavedPlayerToken(roomCode) : null);
    if (!roomCode) return;

    const wasMyTurnBefore =
      Boolean(gameState && mpRoom?.myPlayerId) &&
      gameState?.players[gameState.currentPlayerIndex]?.id === mpRoom?.myPlayerId;

    if (!mpRoom || mpRoom.transportMode === 'local-broadcast') {
      const map = getLocalRoomMap();
      const record = map[roomCode];
      if (record) {
        const view = sanitizeRoomForViewer(record, token, 'local-broadcast');
        const nextGs = buildWorkingGameStateFromRoomView(view);
        const versionChanged = !mpRoom || view.version !== mpRoom.version;
        const isMyTurnNow =
          Boolean(nextGs && view.myPlayerId) &&
          nextGs?.players[nextGs.currentPlayerIndex]?.id === view.myPlayerId;

        if (versionChanged && !wasMyTurnBefore && isMyTurnNow && nextGs?.status === 'playing') {
          soundFX.playTurnStart();
        }

        set({
          mpRoom: view,
          mpSecretToken: token,
          gameState: versionChanged ? nextGs : gameState ?? nextGs,
          screen: view.status === 'waiting' ? 'multiplayer' : 'game',
        });
        return;
      }
    }

    try {
      const res = await fetch(`/api/rooms?code=${roomCode}`, {
        headers: token ? { 'x-player-token': token } : {},
      });
      const data = await res.json();
      if (data.room) {
        const nextGs = buildWorkingGameStateFromRoomView(data.room);
        const versionChanged = !mpRoom || data.room.version !== mpRoom.version;
        const isMyTurnNow =
          Boolean(nextGs && data.room.myPlayerId) &&
          nextGs?.players[nextGs.currentPlayerIndex]?.id === data.room.myPlayerId;

        if (versionChanged && !wasMyTurnBefore && isMyTurnNow && nextGs?.status === 'playing') {
          soundFX.playTurnStart();
        }

        set({
          mpRoom: data.room,
          mpSecretToken: token,
          gameState: versionChanged ? nextGs : gameState ?? nextGs,
          screen: data.room.status === 'waiting' ? 'multiplayer' : 'game',
        });
      }
    } catch {}
  },

  leaveMultiplayerRoom: () => {
    set({
      mpRoom: null,
      mpSecretToken: null,
      mpError: null,
      gameState: loadGameFromLocalStorage(),
      screen: 'home',
    });
  },
}));
