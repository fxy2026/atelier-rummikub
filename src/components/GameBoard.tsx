'use client';

import React, { useEffect, useMemo, useState } from 'react';
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
import { Tile } from '@/engine';
import { useGameStore } from '@/store/useGameStore';
import { TopHud } from './TopHud';
import { TableArea } from './TableArea';
import { PlayerRack } from './PlayerRack';
import { ActionBar } from './ActionBar';
import { TileView } from './TileView';
import { RulesModal, SettingsModal, SettlementModal } from './Modals';

export const GameBoard: React.FC = () => {
  const {
    gameState,
    config,
    selectedTileIds,
    activeModal,
    mpRoom,
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
    sortHand,
    undoStep,
    resetTurn,
    applySmartHint,
    submitTurn,
    drawTile,
    stepAITurn,
    clearError,
    refreshMultiplayerRoom,
    leaveMultiplayerRoom,
  } = useGameStore();

  const [activeDragTile, setActiveDragTile] = useState<Tile | null>(null);

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
      stepAITurn();
    }, 950);
    return () => window.clearTimeout(timer);
  }, [isAITurn, gameState?.currentPlayerIndex, gameState?.turnNumber, stepAITurn]);

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

  if (!gameState || !humanPlayer) {
    return null;
  }

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

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div
        className="h-screen w-full overflow-hidden flex flex-col bg-obsidian text-stone-100 select-none"
        data-testid="game-board"
      >
        {/* Top Information Bar */}
        <TopHud
          gameState={gameState}
          isMyTurn={isMyTurn}
          isAIThinking={isAITurn}
          mpRoom={mpRoom}
          onGoHome={() => {
            if (mpRoom) {
              leaveMultiplayerRoom();
            } else {
              setScreen('home');
            }
          }}
          onOpenRules={() => setActiveModal('rules')}
          onOpenSettings={() => setActiveModal('settings')}
          onClearError={clearError}
        />

        {/* Center Table Melds Area */}
        <TableArea
          melds={gameState.table}
          isMyTurn={isMyTurn}
          selectedTileIds={selectedTileIds}
          turnStartHandIds={turnStartHandIds}
          recentTileIds={recentTileIds}
          lastActorName={lastActorName}
          recentHistory={gameState.history}
          onToggleSelectTile={toggleSelectTile}
          onPlaySelectedToNewMeld={playSelectedToNewMeld}
          onMoveSelectedToMeld={(meldId, targetIndex) =>
            moveTileOrSelectionToMeld(selectedTileIds, meldId, targetIndex)
          }
          onSplitMeld={splitMeld}
        />

        {/* Bottom Player Hand Rack */}
        <PlayerRack
          hand={humanPlayer.hand}
          isMyTurn={isMyTurn}
          sortMode={config.autoSortRack}
          selectedTileIds={selectedTileIds}
          recentTileIds={recentTileIds}
          turnStartHandIds={turnStartHandIds}
          allTilesById={allTilesById}
          onToggleSelectTile={toggleSelectTile}
          onClearSelection={clearSelection}
          onPlaySelectedToNewMeld={playSelectedToNewMeld}
          onReturnSelectedToHand={() =>
            returnTileOrSelectionToHand(selectedTileIds)
          }
          onSortHand={sortHand}
        />

        {/* Bottom Control Console */}
        <ActionBar
          gameState={gameState}
          isMyTurn={isMyTurn}
          onUndo={undoStep}
          onResetTurn={resetTurn}
          onSmartHint={applySmartHint}
          onDrawTile={drawTile}
          onSubmitTurn={submitTurn}
        />

        {/* Drag Overlay */}
        <DragOverlay>
          {activeDragTile ? (
            <div className="scale-105 rotate-2 pointer-events-none">
              <TileView tile={activeDragTile} isSelected />
            </div>
          ) : null}
        </DragOverlay>

        {/* Modals */}
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
            onPlayAgain={() => startNewGame()}
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
