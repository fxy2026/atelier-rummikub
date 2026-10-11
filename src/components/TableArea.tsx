'use client';

import React from 'react';
import { useDroppable } from '@dnd-kit/core';
import {
  AlertCircle,
  ArrowDownToLine,
  CheckCircle2,
  PlusCircle,
  Scissors,
  Sparkles,
} from 'lucide-react';
import { Meld, validateMeld } from '@/engine';
import { TileView } from './TileView';

interface MeldTrayProps {
  meld: Meld;
  index: number;
  isMyTurn: boolean;
  selectedTileIds: string[];
  turnStartHandIds: Set<string>;
  recentTileIds: Set<string>;
  onToggleSelectTile: (tileId: string) => void;
  onMoveSelectedToMeld: (meldId: string, targetIndex?: number) => void;
  onSplitMeld: (meldId: string, splitIndex: number) => void;
}

const MeldTray: React.FC<MeldTrayProps> = ({
  meld,
  index,
  isMyTurn,
  selectedTileIds,
  turnStartHandIds,
  recentTileIds,
  onToggleSelectTile,
  onMoveSelectedToMeld,
  onSplitMeld,
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

  return (
    <div
      ref={setNodeRef}
      data-testid={`table-meld-${index}`}
      data-meld-id={meld.id}
      data-meld-valid={validation.isValid ? 'true' : 'false'}
      className={[
        'relative flex flex-col gap-1.5 p-2.5 sm:p-3 rounded-2xl border transition-all duration-150 shadow-tray',
        isOver
          ? 'bg-[#D4AF37]/20 border-[#D4AF37] scale-[1.02]'
          : validation.isValid
          ? 'bg-[#091511]/85 border-emerald-500/30 hover:border-emerald-400/50'
          : 'bg-red-950/35 border-amber-500/60',
      ].join(' ')}
    >
      {/* Meld Header: Status Badge + Quick Insert / Split Controls */}
      <div className="flex items-center justify-between gap-2 text-[11px]">
        <div className="flex items-center gap-1.5">
          {validation.isValid ? (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 font-semibold tabular-nums">
              <CheckCircle2 className="w-3 h-3" />
              {validation.type === 'group' ? '数字组' : '顺子'} · {validation.score}分
            </span>
          ) : (
            <span
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-200 border border-amber-500/40 font-semibold"
              title={validation.errorReason}
            >
              <AlertCircle className="w-3 h-3 text-amber-400" />
              {validation.errorReason ?? '组合未完成'}
            </span>
          )}
        </div>

        {/* Click-to-Insert button when tiles are selected */}
        {hasSelection && (
          <button
            type="button"
            onClick={() => onMoveSelectedToMeld(meld.id)}
            data-testid={`btn-insert-into-meld-${index}`}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[#D4AF37] hover:bg-[#E6C65A] text-obsidian font-bold text-[11px] shadow-sm transition-colors"
          >
            <ArrowDownToLine className="w-3 h-3" />
            加入此组 ({selectedTileIds.length})
          </button>
        )}
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
                  className="opacity-30 hover:opacity-100 focus:opacity-100 -mx-0.5 px-0.5 py-2 rounded text-stone-300 hover:text-[#D4AF37] hover:bg-white/10 transition-all"
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
  onToggleSelectTile: (tileId: string) => void;
  onPlaySelectedToNewMeld: () => void;
  onMoveSelectedToMeld: (meldId: string, targetIndex?: number) => void;
  onSplitMeld: (meldId: string, splitIndex: number) => void;
}

export const TableArea: React.FC<TableAreaProps> = ({
  melds,
  isMyTurn,
  selectedTileIds,
  turnStartHandIds,
  recentTileIds,
  onToggleSelectTile,
  onPlaySelectedToNewMeld,
  onMoveSelectedToMeld,
  onSplitMeld,
}) => {
  const { isOver, setNodeRef } = useDroppable({
    id: 'table-new-meld-zone',
    data: {
      type: 'new-meld',
    },
  });

  const hasSelection = isMyTurn && selectedTileIds.length > 0;

  return (
    <section
      ref={setNodeRef}
      data-testid="table-area"
      className={[
        'relative flex-1 w-full overflow-y-auto px-3 sm:px-6 py-4 transition-colors duration-200',
        'bg-[radial-gradient(ellipse_at_center,_#163229_0%,_#0D1F19_65%,_#081410_100%)]',
        isOver ? 'ring-2 ring-inset ring-[#D4AF37]/70' : '',
      ].join(' ')}
    >
      {/* Subtle decorative tournament table border line */}
      <div className="pointer-events-none absolute inset-3 rounded-3xl border border-[#C8A464]/15" />

      <div className="relative z-10 max-w-7xl mx-auto min-h-full flex flex-col justify-between gap-4">
        {/* Active Melds Grid */}
        {melds.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center py-10 px-4">
            <div className="w-14 h-14 rounded-2xl bg-[#D4AF37]/10 border border-[#D4AF37]/30 flex items-center justify-center mb-3">
              <Sparkles className="w-7 h-7 text-[#D4AF37]" />
            </div>
            <h2 className="text-base sm:text-lg font-bold text-stone-200 mb-1">
              桌面尚无牌组
            </h2>
            <p className="text-xs sm:text-sm text-stone-400 max-w-md">
              从下方手牌架中拖拽牌到此处，或点击选中 3 张及以上手牌后点击「作为新牌组打出」。首次破冰出牌需满 30 分。
            </p>
            {hasSelection && (
              <button
                type="button"
                onClick={onPlaySelectedToNewMeld}
                data-testid="btn-empty-table-play-selected"
                className="mt-4 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#D4AF37] hover:bg-[#E6C65A] text-obsidian font-bold text-sm shadow-lg transition-all"
              >
                <PlusCircle className="w-4 h-4" />
                将已选的 {selectedTileIds.length} 张牌放到桌面
              </button>
            )}
          </div>
        ) : (
          <div
            data-testid="table-melds-grid"
            className="flex flex-wrap items-start gap-3 sm:gap-4"
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
                onToggleSelectTile={onToggleSelectTile}
                onMoveSelectedToMeld={onMoveSelectedToMeld}
                onSplitMeld={onSplitMeld}
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
                  'min-w-[160px] min-h-[112px] px-4 py-3 rounded-2xl border-2 border-dashed flex flex-col items-center justify-center gap-1.5 transition-all',
                  hasSelection
                    ? 'border-[#D4AF37] bg-[#D4AF37]/15 text-[#E6C65A] hover:bg-[#D4AF37]/25 cursor-pointer shadow-lg'
                    : isOver
                    ? 'border-[#D4AF37] bg-[#D4AF37]/10 text-[#E6C65A]'
                    : 'border-white/15 bg-black/20 text-stone-400 hover:border-white/30',
                ].join(' ')}
              >
                <PlusCircle className="w-5 h-5" />
                <span className="text-xs font-semibold">
                  {hasSelection
                    ? `点击新建牌组 (${selectedTileIds.length} 张)`
                    : '拖入此处或选中手牌新建牌组'}
                </span>
              </button>
            )}
          </div>
        )}
      </div>
    </section>
  );
};
