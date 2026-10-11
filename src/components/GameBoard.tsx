'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { Meld, Tile } from '@/engine';
import { useGameStore } from '@/store/useGameStore';
import { TopHud } from './TopHud';
import { TableArea } from './TableArea';
import { PlayerRack } from './PlayerRack';
import { ActionBar } from './ActionBar';
import { TileView } from './TileView';
import { FlyingTileItem, TileFlightOverlay } from './TileFlightOverlay';
import {
  RulesModal,
  SettingsModal,
  SettlementModal,
  TileTrackerModal,
} from './Modals';

interface CapturedTileRect {
  left: number;
  top: number;
  width: number;
  height: number;
  zone: 'rack' | 'table';
  meldId?: string;
  meldSig?: string;
}

function captureCurrentDomTileRects(melds?: Meld[]): Map<string, CapturedTileRect> {
  const map = new Map<string, CapturedTileRect>();
  if (typeof document === 'undefined') return map;

  const meldSigByTileId = new Map<string, string>();
  if (melds) {
    for (const m of melds) {
      const sig = m.tiles
        .map((t) => t.id)
        .sort()
        .join(',');
      for (const t of m.tiles) {
        meldSigByTileId.set(t.id, sig);
      }
    }
  }

  const nodes = document.querySelectorAll<HTMLElement>('[data-tile-id]');
  nodes.forEach((el) => {
    const id = el.getAttribute('data-tile-id');
    if (!id) return;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return;
    const rawZone = el.getAttribute('data-tile-zone');
    const zone: 'rack' | 'table' = rawZone === 'rack' ? 'rack' : 'table';
    const meldId = el.getAttribute('data-tile-meld') ?? undefined;
    map.set(id, {
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height,
      zone,
      meldId,
      meldSig: meldSigByTileId.get(id),
    });
  });

  return map;
}

export const GameBoard: React.FC = () => {
  const {
    gameState,
    config,
    selectedTileIds,
    activeModal,
    mpRoom,
    localMessages,
    setScreen,
    setActiveModal,
    updateConfig,
    startNewGame,
    toggleSelectTile,
    clearSelection,
    playSelectedToNewMeld,
    playTilesByIdsToNewMeld,
    moveTileOrSelectionToMeld,
    returnTileOrSelectionToHand,
    splitMeld,
    normalizeMeldById,
    sortHand,
    undoStep,
    resetTurn,
    applySmartHint,
    submitTurn,
    drawTile,
    stepAITurn,
    clearError,
    sendTableMessage,
    restartMultiplayerGame,
    refreshMultiplayerRoom,
    leaveMultiplayerRoom,
  } = useGameStore();

  const [activeDragTile, setActiveDragTile] = useState<Tile | null>(null);
  const [activeFlights, setActiveFlights] = useState<FlyingTileItem[]>([]);
  const [lastHintFlights, setLastHintFlights] = useState<FlyingTileItem[]>([]);
  const [hintMovedIds, setHintMovedIds] = useState<string[]>([]);
  const [lastHintExplanation, setLastHintExplanation] = useState<string | null>(null);

  const pendingTransitionRef = useRef<{
    mode: 'hint' | 'move';
    beforeRects: Map<string, CapturedTileRect>;
  } | null>(null);
  const flightCleanupTimerRef = useRef<number | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 6,
      },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 120,
        tolerance: 5,
      },
    })
  );

  const startFlightAnimation = useCallback((items: FlyingTileItem[]) => {
    if (items.length === 0) return;
    if (flightCleanupTimerRef.current) {
      window.clearTimeout(flightCleanupTimerRef.current);
    }
    setActiveFlights(items);
    const maxEnd = items.reduce(
      (max, it) => Math.max(max, it.delayMs + it.durationMs),
      0
    );
    // Keep trajectory overlay slightly longer for hint mode so player can trace arrows
    const hasTrajectory = items.some((it) => it.showTrajectory);
    const holdExtra = hasTrajectory ? 550 : 60;
    flightCleanupTimerRef.current = window.setTimeout(() => {
      setActiveFlights([]);
    }, maxEnd + holdExtra);
  }, []);

  // Replay the last Smart Hint trajectory animation on demand
  const handleReplayHintAnimation = useCallback(() => {
    if (lastHintFlights.length === 0) return;
    const nowKey = Date.now();
    const replayed = lastHintFlights.map((item, idx) => ({
      ...item,
      key: `replay-${nowKey}-${idx}-${item.tile.id}`,
    }));
    startFlightAnimation(replayed);
  }, [lastHintFlights, startFlightAnimation]);

  // Clear hint highlights when turn number changes
  useEffect(() => {
    setHintMovedIds([]);
    setLastHintExplanation(null);
    setLastHintFlights([]);
    setActiveFlights([]);
  }, [gameState?.turnNumber, gameState?.id]);

  // Schedule AI turns automatically in single-player mode with comfortable reading pace (950ms)
  const currentPlayer = gameState?.players[gameState.currentPlayerIndex];
  const isAITurn =
    Boolean(gameState) &&
    gameState?.status === 'playing' &&
    !mpRoom &&
    currentPlayer?.type === 'ai';

  useEffect(() => {
    if (!isAITurn) return;
    const timer = window.setTimeout(() => {
      pendingTransitionRef.current = {
        mode: 'move',
        beforeRects: captureCurrentDomTileRects(gameState?.table),
      };
      stepAITurn();
    }, 950);
    return () => window.clearTimeout(timer);
  }, [isAITurn, gameState?.currentPlayerIndex, gameState?.turnNumber, gameState?.table, stepAITurn]);

  // Listen for Multiplayer Room updates across tabs or poll interval
  useEffect(() => {
    if (!mpRoom) return;

    const handleBroadcast = (event: MessageEvent) => {
      if (
        event.data?.type === 'room_updated' &&
        event.data?.roomCode === mpRoom.roomCode
      ) {
        refreshMultiplayerRoom(mpRoom.roomCode);
      }
    };

    let bc: BroadcastChannel | null = null;
    if (typeof BroadcastChannel !== 'undefined') {
      bc = new BroadcastChannel('atelier_rummikub_mp_channel');
      bc.addEventListener('message', handleBroadcast);
    }

    const pollTimer = window.setInterval(() => {
      refreshMultiplayerRoom(mpRoom.roomCode);
    }, 2000);

    return () => {
      if (bc) {
        bc.removeEventListener('message', handleBroadcast);
        bc.close();
      }
      window.clearInterval(pollTimer);
    };
  }, [mpRoom, refreshMultiplayerRoom]);

  const humanPlayer = useMemo(() => {
    if (!gameState) return null;
    if (mpRoom?.myPlayerId) {
      return (
        gameState.players.find((p) => p.id === mpRoom.myPlayerId) ??
        gameState.players[0]
      );
    }
    return (
      gameState.players.find((p) => p.type === 'human') ?? gameState.players[0]
    );
  }, [gameState, mpRoom]);

  const isMyTurn = useMemo(() => {
    if (!gameState || gameState.status !== 'playing' || !humanPlayer) return false;
    return gameState.players[gameState.currentPlayerIndex]?.id === humanPlayer.id;
  }, [gameState, humanPlayer]);

  const turnStartHandIds = useMemo(() => {
    if (!gameState) return new Set<string>();
    return new Set(gameState.turnStartSnapshot.hand.map((t) => t.id));
  }, [gameState]);

  const recentTileIds = useMemo(() => {
    if (!gameState) return new Set<string>();
    return new Set(gameState.recentTileIds);
  }, [gameState]);

  const hintMovedTileIdsSet = useMemo(() => new Set(hintMovedIds), [hintMovedIds]);

  const inFlightTileIdsSet = useMemo(
    () => new Set(activeFlights.map((f) => f.tile.id)),
    [activeFlights]
  );

  const lastActorName = useMemo(() => {
    if (!gameState || gameState.history.length === 0) return undefined;
    return gameState.history[0]?.playerName;
  }, [gameState]);

  const allTilesById = useMemo(() => {
    const map = new Map<string, Tile>();
    if (!gameState) return map;
    for (const p of gameState.players) {
      for (const t of p.hand) map.set(t.id, t);
    }
    for (const m of gameState.table) {
      for (const t of m.tiles) map.set(t.id, t);
    }
    return map;
  }, [gameState]);

  // Measure after-state DOM positions whenever gameState.table or humanPlayer.hand changes
  useEffect(() => {
    const pending = pendingTransitionRef.current;
    if (!pending || !gameState) return;
    pendingTransitionRef.current = null;

    const afterRects = captureCurrentDomTileRects(gameState.table);
    const flights: FlyingTileItem[] = [];
    const movedIdsForHint: string[] = [];
    const isHint = pending.mode === 'hint';
    const stamp = Date.now();

    afterRects.forEach((after, tileId) => {
      const before = pending.beforeRects.get(tileId);
      if (!before) return;

      const zoneChanged = before.zone !== after.zone;
      const meldCompositionChanged =
        before.zone === 'table' &&
        after.zone === 'table' &&
        before.meldSig !== after.meldSig;
      const distance = Math.hypot(after.left - before.left, after.top - before.top);

      if (zoneChanged || (meldCompositionChanged && distance > 14)) {
        const tile = allTilesById.get(tileId);
        if (!tile) return;

        const idx = flights.length;
        flights.push({
          key: `flight-${stamp}-${idx}-${tileId}`,
          tile,
          fromX: before.left,
          fromY: before.top,
          toX: after.left,
          toY: after.top,
          width: after.width,
          height: after.height,
          fromZone: before.zone,
          toZone: after.zone,
          delayMs: isHint ? idx * 140 : idx * 50,
          durationMs: isHint ? 780 : 420,
          showTrajectory: isHint,
        });

        if (isHint && after.zone === 'table') {
          movedIdsForHint.push(tileId);
        }
      }
    });

    if (flights.length > 0) {
      startFlightAnimation(flights);
      if (isHint) {
        setLastHintFlights(flights);
        setHintMovedIds(movedIdsForHint);
        const notice = gameState.lastActionNotice ?? '';
        const cleaned = notice
          .replace(/^已为你自动摆出推荐方案：/, '')
          .replace(/（点击「出牌提交」确认或「撤销」恢复）$/, '');
        setLastHintExplanation(cleaned || '推荐出牌组合');
      }
    } else if (isHint && lastHintFlights.length > 0) {
      // User clicked Smart Hint again while hint is already on the table -> replay the trajectory animation!
      handleReplayHintAnimation();
    }
  }, [
    gameState,
    allTilesById,
    startFlightAnimation,
    lastHintFlights.length,
    handleReplayHintAnimation,
  ]);

  if (!gameState || !humanPlayer) {
    return null;
  }

  const handleAnimatedSmartHint = () => {
    pendingTransitionRef.current = {
      mode: 'hint',
      beforeRects: captureCurrentDomTileRects(gameState.table),
    };
    applySmartHint();
  };

  const handleAnimatedPlaySelectedToNewMeld = () => {
    pendingTransitionRef.current = {
      mode: 'move',
      beforeRects: captureCurrentDomTileRects(gameState.table),
    };
    playSelectedToNewMeld();
  };

  const handleAnimatedPlayIdsToNewMeld = (tileIds: string[]) => {
    pendingTransitionRef.current = {
      mode: 'move',
      beforeRects: captureCurrentDomTileRects(gameState.table),
    };
    playTilesByIdsToNewMeld(tileIds);
  };

  const handleAnimatedMoveToMeld = (
    tileIds: string[],
    meldId: string,
    targetIndex?: number
  ) => {
    pendingTransitionRef.current = {
      mode: 'move',
      beforeRects: captureCurrentDomTileRects(gameState.table),
    };
    moveTileOrSelectionToMeld(tileIds, meldId, targetIndex);
  };

  const handleAnimatedReturnToHand = (tileIds: string[]) => {
    pendingTransitionRef.current = {
      mode: 'move',
      beforeRects: captureCurrentDomTileRects(gameState.table),
    };
    returnTileOrSelectionToHand(tileIds);
  };

  const handleAnimatedUndo = () => {
    setHintMovedIds([]);
    setLastHintExplanation(null);
    pendingTransitionRef.current = {
      mode: 'move',
      beforeRects: captureCurrentDomTileRects(gameState.table),
    };
    undoStep();
  };

  const handleAnimatedReset = () => {
    setHintMovedIds([]);
    setLastHintExplanation(null);
    pendingTransitionRef.current = {
      mode: 'move',
      beforeRects: captureCurrentDomTileRects(gameState.table),
    };
    resetTurn();
  };

  const handleDragStart = (event: DragStartEvent) => {
    const tile = event.active.data.current?.tile as Tile | undefined;
    if (tile) {
      setActiveDragTile(tile);
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveDragTile(null);
    if (!isMyTurn) return;

    const { active, over } = event;
    if (!over) return;

    const draggedId = String(active.id);
    const tileIdsToMove = selectedTileIds.includes(draggedId)
      ? selectedTileIds
      : [draggedId];

    const overData = over.data.current;

    if (overData?.type === 'meld' && typeof overData.meldId === 'string') {
      moveTileOrSelectionToMeld(tileIdsToMove, overData.meldId);
      return;
    }

    if (overData?.type === 'new-meld') {
      playTilesByIdsToNewMeld(tileIdsToMove);
      return;
    }

    if (overData?.type === 'rack') {
      returnTileOrSelectionToHand(tileIdsToMove);
    }
  };

  const activeMessages = mpRoom ? mpRoom.messages : localMessages;

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div
        className="h-[100dvh] w-full overflow-hidden flex flex-col bg-obsidian text-stone-100 select-none"
        data-testid="game-board"
      >
        {/* Top Information Bar */}
        <TopHud
          gameState={gameState}
          isMyTurn={isMyTurn}
          isAIThinking={isAITurn}
          mpRoom={mpRoom}
          messages={activeMessages}
          onGoHome={() => {
            if (mpRoom) {
              leaveMultiplayerRoom();
            } else {
              setScreen('home');
            }
          }}
          onOpenTracker={() => setActiveModal('tracker')}
          onOpenRules={() => setActiveModal('rules')}
          onOpenSettings={() => setActiveModal('settings')}
          onSendMessage={sendTableMessage}
          onClearError={clearError}
        />

        {/* Center Table Melds Area */}
        <TableArea
          melds={gameState.table}
          isMyTurn={isMyTurn}
          selectedTileIds={selectedTileIds}
          turnStartHandIds={turnStartHandIds}
          recentTileIds={recentTileIds}
          hintMovedTileIds={hintMovedTileIdsSet}
          inFlightTileIds={inFlightTileIdsSet}
          lastHintExplanation={lastHintExplanation}
          lastActorName={lastActorName}
          recentHistory={gameState.history}
          onToggleSelectTile={toggleSelectTile}
          onPlaySelectedToNewMeld={handleAnimatedPlaySelectedToNewMeld}
          onMoveSelectedToMeld={(meldId, targetIndex) =>
            handleAnimatedMoveToMeld(selectedTileIds, meldId, targetIndex)
          }
          onSplitMeld={splitMeld}
          onNormalizeMeld={normalizeMeldById}
          onReplayHintAnimation={
            lastHintFlights.length > 0 ? handleReplayHintAnimation : undefined
          }
        />

        {/* Bottom Player Hand Rack */}
        <PlayerRack
          hand={humanPlayer.hand}
          isMyTurn={isMyTurn}
          sortMode={config.autoSortRack}
          selectedTileIds={selectedTileIds}
          recentTileIds={recentTileIds}
          inFlightTileIds={inFlightTileIdsSet}
          turnStartHandIds={turnStartHandIds}
          allTilesById={allTilesById}
          onToggleSelectTile={toggleSelectTile}
          onClearSelection={clearSelection}
          onPlaySelectedToNewMeld={handleAnimatedPlaySelectedToNewMeld}
          onPlayCandidateMeld={handleAnimatedPlayIdsToNewMeld}
          onReturnSelectedToHand={() => handleAnimatedReturnToHand(selectedTileIds)}
          onSortHand={sortHand}
        />

        {/* Bottom Control Console */}
        <ActionBar
          gameState={gameState}
          isMyTurn={isMyTurn}
          onUndo={handleAnimatedUndo}
          onResetTurn={handleAnimatedReset}
          onSmartHint={handleAnimatedSmartHint}
          onDrawTile={drawTile}
          onSubmitTurn={submitTurn}
        />

        {/* Board-Wide Parabolic Tile Flight & SVG Trajectory Overlay */}
        <TileFlightOverlay flights={activeFlights} />

        {/* Drag Overlay */}
        <DragOverlay>
          {activeDragTile ? (
            <div className="scale-105 rotate-2 pointer-events-none">
              <TileView tile={activeDragTile} isSelected />
            </div>
          ) : null}
        </DragOverlay>

        {/* Modals */}
        {activeModal === 'tracker' && (
          <TileTrackerModal
            gameState={gameState}
            myHand={humanPlayer.hand}
            onClose={() => setActiveModal('none')}
          />
        )}

        {activeModal === 'rules' && (
          <RulesModal onClose={() => setActiveModal('none')} />
        )}

        {activeModal === 'settings' && (
          <SettingsModal
            config={config}
            onUpdateConfig={updateConfig}
            onStartNewWithConfig={(partial) => startNewGame(partial)}
            onClose={() => setActiveModal('none')}
          />
        )}

        {gameState.status === 'finished' && (
          <SettlementModal
            gameState={gameState}
            isMultiplayer={Boolean(mpRoom)}
            onPlayAgain={() => {
              if (mpRoom) {
                restartMultiplayerGame();
              } else {
                startNewGame();
              }
            }}
            onGoHome={() => {
              if (mpRoom) {
                leaveMultiplayerRoom();
              } else {
                setScreen('home');
              }
            }}
          />
        )}
      </div>
    </DndContext>
  );
};
