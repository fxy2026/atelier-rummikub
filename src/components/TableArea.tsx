'use client';

import React from 'react';
import { useDroppable } from '@dnd-kit/core';
import {
  AlertCircle,
  ArrowDownToLine,
  ArrowUpDown,
  CheckCircle2,
  History,
  PlusCircle,
  Scissors,
  Sparkles,
} from 'lucide-react';
import { Meld, Tile, TileColor, TurnHistoryLog, validateMeld } from '@/engine';
import { TileView } from './TileView';

const MINI_COLOR_BADGE: Record<TileColor, { pip: string; cls: string }> = {
  red: {
    pip: '♦',
    cls: 'text-[#D92D20] border-[#D92D20]/40 bg-[#FFFDF9]',
  },
  blue: {
    pip: '♠',
    cls: 'text-[#155EEF] border-[#155EEF]/40 bg-[#FFFDF9]',
  },
  yellow: {
    pip: '●',
    cls: 'text-[#B86E00] border-[#B86E00]/40 bg-[#FFFDF9]',
  },
  black: {
    pip: '♣',
    cls: 'text-[#18181B] border-[#18181B]/40 bg-[#FFFDF9]',
  },
};

interface MeldTrayProps {
  meld: Meld;
  index: number;
  isMyTurn: boolean;
  selectedTileIds: string[];
  turnStartHandIds: Set<string>;
  recentTileIds: Set<string>;
  lastActorName?: string;
  onToggleSelectTile: (tileId: string) => void;
  onMoveSelectedToMeld: (meldId: string, targetIndex?: number) => void;
  onSplitMeld: (meldId: string, splitIndex: number) => void;
  onNormalizeMeld: (meldId: string) => void;
}

const MeldTray: React.FC<MeldTrayProps> = ({
  meld,
  index,
  isMyTurn,
  selectedTileIds,
  turnStartHandIds,
  recentTileIds,
  lastActorName,
  onToggleSelectTile,
  onMoveSelectedToMeld,
  onSplitMeld,
  onNormalizeMeld,
}) => {
  const { isOver, setNodeRef } = useDroppable({
    id: `meld-drop-${meld.id}`,
    data: {
      type: 'meld',
      meldId: meld.id,
    },
  });

  const validation = validateMeld(meld.tiles);
  const hasSelection = isMyTurn && selectedTileIds.length > 0;
  const hasRecentTile = meld.tiles.some((t) => recentTileIds.has(t.id));

  // Check if a single tile inside this meld is selected -> offer a 1-tap Split button for mobile ergonomics
  const selectedIdxInMeld =
    isMyTurn && selectedTileIds.length === 1
      ? meld.tiles.findIndex((t) => t.id === selectedTileIds[0])
      : -1;
  const canSplitAtSelected =
    selectedIdxInMeld > 0 && selectedIdxInMeld < meld.tiles.length;

  // Check if selected tiles are outside this meld (so "加入此组" makes sense)
  const hasExternalSelection =
    hasSelection &&
    selectedTileIds.some((id) => !meld.tiles.some((t) => t.id === id));

  return (
    <div
      ref={setNodeRef}
      data-testid={`table-meld-${index}`}
      data-meld-id={meld.id}
      data-meld-valid={validation.isValid ? 'true' : 'false'}
      className={[
        'relative flex flex-col gap-1.5 p-2 sm:p-3 rounded-2xl border transition-all duration-200 shadow-tray',
        isOver
          ? 'bg-[#D4AF37]/20 border-[#D4AF37] scale-[1.02]'
          : hasRecentTile && validation.isValid
          ? 'bg-sky-950/40 border-sky-400/70 shadow-[0_0_20px_rgba(56,189,248,0.22)]'
          : validation.isValid
          ? 'bg-[#091511]/85 border-emerald-500/30 hover:border-emerald-400/50'
          : 'bg-red-950/35 border-amber-500/60',
      ].join(' ')}
    >
      {/* Meld Header: Status Badge + Recent Actor Badge + Quick Insert / Split / Sort Controls */}
      <div className="flex items-center justify-between gap-1.5 sm:gap-2 text-[10px] sm:text-[11px] flex-wrap">
        <div className="flex items-center gap-1 sm:gap-1.5 flex-wrap">
          {validation.isValid ? (
            <span className="inline-flex items-center gap-1 px-1.5 sm:px-2 py-0.5 rounded-md bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 font-semibold tabular-nums">
              <CheckCircle2 className="w-3 h-3" />
              {validation.type === 'group' ? '数字组' : '顺子'} · {validation.score}分
            </span>
          ) : (
            <span
              className="inline-flex items-center gap-1 px-1.5 sm:px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-200 border border-amber-500/40 font-semibold"
              title={validation.errorReason}
            >
              <AlertCircle className="w-3 h-3 text-amber-400" />
              {validation.errorReason ?? '组合未完成'}
            </span>
          )}

          {hasRecentTile && lastActorName && (
            <span
              data-testid={`meld-recent-actor-${index}`}
              className="inline-flex items-center gap-1 px-1.5 sm:px-2 py-0.5 rounded-md bg-sky-500/25 text-sky-200 border border-sky-400/50 font-bold"
            >
              ✨ {lastActorName} 刚出
            </span>
          )}
        </div>

        <div className="flex items-center gap-1 flex-wrap">
          {/* One-tap Split button when user selects a tile inside this meld */}
          {canSplitAtSelected && (
            <button
              type="button"
              onClick={() => onSplitMeld(meld.id, selectedIdxInMeld)}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-500/25 hover:bg-amber-500/35 text-amber-200 border border-amber-400/40 font-bold text-[10px] sm:text-[11px] transition-colors"
              title="在当前选中的这张牌左侧拆分为两个牌组"
            >
              <Scissors className="w-3 h-3" />
              在此处拆分
            </button>
          )}

          {/* One-tap Sort / Normalize button when meld has >= 3 tiles and is not yet ordered */}
          {isMyTurn && !validation.isValid && meld.tiles.length >= 3 && (
            <button
              type="button"
              onClick={() => onNormalizeMeld(meld.id)}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white/10 hover:bg-white/15 text-stone-200 border border-white/15 font-semibold text-[10px] sm:text-[11px] transition-colors"
              title="按数字顺序自动整理此牌组"
            >
              <ArrowUpDown className="w-3 h-3" />
              理牌
            </button>
          )}

          {/* Click-to-Insert button when tiles are selected */}
          {hasExternalSelection && (
            <button
              type="button"
              onClick={() => onMoveSelectedToMeld(meld.id)}
              data-testid={`btn-insert-into-meld-${index}`}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[#D4AF37] hover:bg-[#E6C65A] text-obsidian font-bold text-[10px] sm:text-[11px] shadow-sm transition-colors"
            >
              <ArrowDownToLine className="w-3 h-3" />
              加入此组 ({selectedTileIds.length})
            </button>
          )}
        </div>
      </div>

      {/* Tiles Row with inline split triggers */}
      <div className="flex items-center flex-wrap gap-1 sm:gap-1.5 pt-0.5">
        {meld.tiles.map((tile, tIdx) => {
          const isSelected = selectedTileIds.includes(tile.id);
          const isFromHand = turnStartHandIds.has(tile.id);
          const isRecent = recentTileIds.has(tile.id);
          const jokerAssignment = validation.jokerAssignments[tile.id];

          return (
            <React.Fragment key={tile.id}>
              {/* Split button between adjacent tiles */}
              {isMyTurn && tIdx > 0 && (
                <button
                  type="button"
                  onClick={() => onSplitMeld(meld.id, tIdx)}
                  title="在此处拆分为两个牌组"
                  aria-label={`在第 ${tIdx} 张牌后拆分牌组`}
                  className="opacity-45 sm:opacity-30 hover:opacity-100 focus:opacity-100 -mx-0.5 px-0.5 py-2 rounded text-stone-300 hover:text-[#D4AF37] hover:bg-white/10 transition-all touch-manipulation"
                >
                  <Scissors className="w-3 h-3 rotate-90" />
                </button>
              )}

              <TileView
                tile={tile}
                draggableId={isMyTurn ? tile.id : undefined}
                dragData={{
                  source: 'table',
                  meldId: meld.id,
                  index: tIdx,
                }}
                disabled={!isMyTurn}
                isSelected={isSelected}
                isFromHandThisTurn={isFromHand}
                isRecent={isRecent}
                recentActorLabel={lastActorName}
                jokerAssignment={jokerAssignment}
                onClick={() => {
                  if (!isMyTurn) return;
                  onToggleSelectTile(tile.id);
                }}
              />
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
};

interface TableAreaProps {
  melds: Meld[];
  isMyTurn: boolean;
  selectedTileIds: string[];
  turnStartHandIds: Set<string>;
  recentTileIds: Set<string>;
  lastActorName?: string;
  recentHistory: TurnHistoryLog[];
  onToggleSelectTile: (tileId: string) => void;
  onPlaySelectedToNewMeld: () => void;
  onMoveSelectedToMeld: (meldId: string, targetIndex?: number) => void;
  onSplitMeld: (meldId: string, splitIndex: number) => void;
  onNormalizeMeld: (meldId: string) => void;
}

export const TableArea: React.FC<TableAreaProps> = ({
  melds,
  isMyTurn,
  selectedTileIds,
  turnStartHandIds,
  recentTileIds,
  lastActorName,
  recentHistory,
  onToggleSelectTile,
  onPlaySelectedToNewMeld,
  onMoveSelectedToMeld,
  onSplitMeld,
  onNormalizeMeld,
}) => {
  const { isOver, setNodeRef } = useDroppable({
    id: 'table-new-meld-zone',
    data: {
      type: 'new-meld',
    },
  });

  const hasSelection = isMyTurn && selectedTileIds.length > 0;

  // Collect actual Tile objects on the table that were played in the latest turn
  const recentTableTiles: Tile[] = React.useMemo(() => {
    if (recentTileIds.size === 0) return [];
    const list: Tile[] = [];
    for (const m of melds) {
      for (const t of m.tiles) {
        if (recentTileIds.has(t.id)) {
          list.push(t);
        }
      }
    }
    return list;
  }, [melds, recentTileIds]);

  return (
    <section
      ref={setNodeRef}
      data-testid="table-area"
      className={[
        'relative flex-1 w-full overflow-y-auto px-2.5 sm:px-6 py-2.5 sm:py-4 transition-colors duration-200',
        'bg-[radial-gradient(ellipse_at_center,_#163229_0%,_#0D1F19_65%,_#081410_100%)]',
        isOver ? 'ring-2 ring-inset ring-[#D4AF37]/70' : '',
      ].join(' ')}
    >
      {/* Subtle decorative tournament table border line */}
      <div className="pointer-events-none absolute inset-2 sm:inset-3 rounded-2xl sm:rounded-3xl border border-[#C8A464]/15" />

      <div className="relative z-10 max-w-7xl mx-auto min-h-full flex flex-col justify-between gap-3 sm:gap-4">
        {/* Top Live Turn Action Feed Bar with Visual Mini-Tile Preview */}
        {recentHistory.length > 0 && (
          <div
            data-testid="turn-history-strip"
            className="flex items-center gap-1.5 sm:gap-2 overflow-x-auto py-1 sm:py-1.5 px-2.5 sm:px-3 rounded-xl sm:rounded-2xl bg-black/45 border border-white/10 text-[11px] sm:text-xs shrink-0"
          >
            <span className="inline-flex items-center gap-1 text-stone-400 font-semibold shrink-0">
              <History className="w-3.5 h-3.5 text-[#D4AF37]" />
              <span className="hidden xs:inline sm:inline">出牌动态：</span>
            </span>

            {recentHistory.slice(0, 5).map((item, idx) => (
              <span
                key={item.id}
                className={[
                  'inline-flex items-center gap-1 sm:gap-1.5 px-2 sm:px-2.5 py-0.5 sm:py-1 rounded-lg sm:rounded-xl border shrink-0 transition-all',
                  idx === 0
                    ? item.action === 'play'
                      ? 'bg-sky-500/20 border-sky-400/50 text-sky-100 font-bold'
                      : 'bg-amber-500/20 border-amber-400/50 text-amber-100 font-bold'
                    : 'bg-white/5 border-white/10 text-stone-300',
                ].join(' ')}
              >
                <span className="opacity-70 text-[10px]">#{item.turnNumber}</span>
                <span>{item.playerName}</span>
                <span>
                  {item.action === 'play'
                    ? `出${item.tilesPlayedCount}张${item.brokeIce ? '(破冰)' : ''}`
                    : item.action === 'draw'
                    ? '摸1张'
                    : '跳过'}
                </span>

                {/* Show exact mini tile pills for the most recent play */}
                {idx === 0 && item.action === 'play' && recentTableTiles.length > 0 && (
                  <span className="inline-flex items-center gap-0.5 ml-0.5">
                    {recentTableTiles.slice(0, 6).map((t) => {
                      const meta = MINI_COLOR_BADGE[t.color];
                      return (
                        <span
                          key={t.id}
                          className={`inline-flex items-center px-1 py-0.2 rounded border text-[10px] font-black leading-none tabular-nums ${meta.cls}`}
                        >
                          {t.isJoker ? '★J' : `${meta.pip}${t.number}`}
                        </span>
                      );
                    })}
                    {recentTableTiles.length > 6 && (
                      <span className="text-[10px] text-sky-200">
                        +{recentTableTiles.length - 6}
                      </span>
                    )}
                  </span>
                )}
              </span>
            ))}
          </div>
        )}

        {/* Active Melds Grid */}
        {melds.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center py-6 sm:py-8 px-4">
            <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-[#D4AF37]/10 border border-[#D4AF37]/30 flex items-center justify-center mb-2.5 sm:mb-3">
              <Sparkles className="w-6 h-6 sm:w-7 sm:h-7 text-[#D4AF37]" />
            </div>
            <h2 className="text-sm sm:text-lg font-bold text-stone-200 mb-1">
              桌面尚无牌组
            </h2>
            <p className="text-xs sm:text-sm text-stone-400 max-w-md">
              点击下方手牌架中的牌（或使用「⚡ 成组快打」按钮）即可出牌。首次破冰出牌需满 30 分。
            </p>
            {hasSelection && (
              <button
                type="button"
                onClick={onPlaySelectedToNewMeld}
                data-testid="btn-empty-table-play-selected"
                className="mt-3.5 sm:mt-4 inline-flex items-center gap-2 px-4 sm:px-5 py-2 sm:py-2.5 rounded-xl bg-[#D4AF37] hover:bg-[#E6C65A] text-obsidian font-bold text-xs sm:text-sm shadow-lg transition-all"
              >
                <PlusCircle className="w-4 h-4" />
                将已选的 {selectedTileIds.length} 张牌放到桌面
              </button>
            )}
          </div>
        ) : (
          <div
            data-testid="table-melds-grid"
            className="flex flex-wrap items-start gap-2.5 sm:gap-4 my-auto"
          >
            {melds.map((meld, idx) => (
              <MeldTray
                key={meld.id}
                meld={meld}
                index={idx}
                isMyTurn={isMyTurn}
                selectedTileIds={selectedTileIds}
                turnStartHandIds={turnStartHandIds}
                recentTileIds={recentTileIds}
                lastActorName={lastActorName}
                onToggleSelectTile={onToggleSelectTile}
                onMoveSelectedToMeld={onMoveSelectedToMeld}
                onSplitMeld={onSplitMeld}
                onNormalizeMeld={onNormalizeMeld}
              />
            ))}

            {/* Dedicated Drop / Click Tile Slot to Create a New Meld */}
            {isMyTurn && (
              <button
                type="button"
                onClick={() => {
                  if (hasSelection) onPlaySelectedToNewMeld();
                }}
                data-testid="btn-new-meld-slot"
                className={[
                  'min-w-[135px] sm:min-w-[160px] min-h-[88px] sm:min-h-[112px] px-3 sm:px-4 py-2.5 sm:py-3 rounded-2xl border-2 border-dashed flex flex-col items-center justify-center gap-1 sm:gap-1.5 transition-all touch-manipulation',
                  hasSelection
                    ? 'border-[#D4AF37] bg-[#D4AF37]/15 text-[#E6C65A] hover:bg-[#D4AF37]/25 cursor-pointer shadow-lg'
                    : isOver
                    ? 'border-[#D4AF37] bg-[#D4AF37]/10 text-[#E6C65A]'
                    : 'border-white/15 bg-black/20 text-stone-400 hover:border-white/30',
                ].join(' ')}
              >
                <PlusCircle className="w-4 h-4 sm:w-5 sm:h-5" />
                <span className="text-[11px] sm:text-xs font-semibold">
                  {hasSelection
                    ? `点击新建牌组 (${selectedTileIds.length} 张)`
                    : '点选或拖入新建牌组'}
                </span>
              </button>
            )}
          </div>
        )}
      </div>
    </section>
  );
};
