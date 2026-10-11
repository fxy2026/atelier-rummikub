'use client';

import React from 'react';
import { useDroppable } from '@dnd-kit/core';
import {
  ArrowDownLeft,
  ArrowUpDown,
  Palette,
  PlusCircle,
  Sparkles,
  X,
} from 'lucide-react';
import { Tile, validateMeld } from '@/engine';
import { TileView } from './TileView';

interface PlayerRackProps {
  hand: Tile[];
  isMyTurn: boolean;
  sortMode: 'color' | 'number' | 'manual';
  selectedTileIds: string[];
  recentTileIds: Set<string>;
  turnStartHandIds: Set<string>;
  allTilesById: Map<string, Tile>;
  onToggleSelectTile: (tileId: string) => void;
  onClearSelection: () => void;
  onPlaySelectedToNewMeld: () => void;
  onReturnSelectedToHand: () => void;
  onSortHand: (mode: 'color' | 'number') => void;
}

export const PlayerRack: React.FC<PlayerRackProps> = ({
  hand,
  isMyTurn,
  sortMode,
  selectedTileIds,
  recentTileIds,
  turnStartHandIds,
  allTilesById,
  onToggleSelectTile,
  onClearSelection,
  onPlaySelectedToNewMeld,
  onReturnSelectedToHand,
  onSortHand,
}) => {
  const { isOver, setNodeRef } = useDroppable({
    id: 'player-rack-drop-zone',
    data: {
      type: 'rack',
    },
  });

  const handIdSet = new Set(hand.map((t) => t.id));
  const selectedTiles = selectedTileIds
    .map((id) => allTilesById.get(id))
    .filter((t): t is Tile => Boolean(t));

  const selectedValidation =
    selectedTiles.length >= 3 ? validateMeld(selectedTiles) : null;

  // Check if any selected tile is currently on the table and originally came from hand this turn
  const canReturnSelectedToRack =
    selectedTileIds.length > 0 &&
    selectedTileIds.some((id) => !handIdSet.has(id) && turnStartHandIds.has(id));

  return (
    <div
      ref={setNodeRef}
      data-testid="player-rack"
      className={[
        'w-full bg-gradient-to-b from-[#171412] to-[#0D0B0A] border-t border-[#C8A464]/30 px-2.5 sm:px-6 py-1.5 sm:py-2.5 transition-colors shrink-0',
        isOver ? 'ring-2 ring-inset ring-[#D4AF37]' : '',
      ].join(' ')}
    >
      <div className="max-w-7xl mx-auto flex flex-col gap-1.5 sm:gap-2">
        {/* Rack Header: Hand Count, Sort Buttons, and Selection Quick Actions */}
        <div className="flex flex-wrap items-center justify-between gap-1.5 sm:gap-2">
          <div className="flex items-center justify-between w-full sm:w-auto gap-2 sm:gap-3">
            <span className="text-xs sm:text-sm font-bold text-stone-200 tracking-wide flex items-center">
              我的手牌架
              <span
                data-testid="rack-tile-count"
                className="ml-1.5 px-1.5 sm:px-2 py-0.5 rounded-md bg-[#D4AF37]/15 text-[#E6C65A] border border-[#D4AF37]/30 tabular-nums text-[11px] sm:text-xs"
              >
                {hand.length} 张
              </span>
            </span>

            {/* Sort Mode Controls */}
            <div className="flex items-center gap-1 bg-black/40 p-0.5 rounded-lg border border-white/10">
              <button
                type="button"
                onClick={() => onSortHand('color')}
                data-testid="btn-sort-color"
                className={[
                  'inline-flex items-center gap-1 px-2 sm:px-2.5 py-0.5 sm:py-1 rounded-md text-[11px] sm:text-xs font-medium transition-colors',
                  sortMode === 'color'
                    ? 'bg-[#D4AF37] text-obsidian font-bold'
                    : 'text-stone-300 hover:text-white hover:bg-white/5',
                ].join(' ')}
              >
                <Palette className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                按颜色
              </button>
              <button
                type="button"
                onClick={() => onSortHand('number')}
                data-testid="btn-sort-number"
                className={[
                  'inline-flex items-center gap-1 px-2 sm:px-2.5 py-0.5 sm:py-1 rounded-md text-[11px] sm:text-xs font-medium transition-colors',
                  sortMode === 'number'
                    ? 'bg-[#D4AF37] text-obsidian font-bold'
                    : 'text-stone-300 hover:text-white hover:bg-white/5',
                ].join(' ')}
              >
                <ArrowUpDown className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                按数字
              </button>
            </div>
          </div>

          {/* Selection Action Strip */}
          {selectedTileIds.length > 0 && (
            <div className="w-full sm:w-auto flex flex-wrap items-center justify-between sm:justify-end gap-1.5 sm:gap-2 bg-black/35 sm:bg-transparent px-2.5 py-1.5 sm:p-0 rounded-xl border border-[#D4AF37]/30 sm:border-0">
              <span className="text-[11px] sm:text-xs text-stone-300">
                已选 <strong className="text-[#E6C65A]">{selectedTileIds.length}</strong> 张
                {selectedValidation?.isValid && (
                  <span className="ml-1 text-emerald-300 font-semibold">
                    （合法{selectedValidation.type === 'group' ? '数字组' : '顺子'} ·{' '}
                    {selectedValidation.score}分）
                  </span>
                )}
              </span>

              <div className="flex items-center gap-1.5">
                {isMyTurn && (
                  <button
                    type="button"
                    onClick={onPlaySelectedToNewMeld}
                    data-testid="btn-play-selected-meld"
                    className="inline-flex items-center gap-1 px-2.5 sm:px-3 py-1 rounded-lg bg-[#D4AF37] hover:bg-[#E6C65A] text-obsidian font-bold text-[11px] sm:text-xs shadow transition-colors"
                  >
                    <PlusCircle className="w-3.5 h-3.5" />
                    <span className="sm:hidden">放上桌面</span>
                    <span className="hidden sm:inline">作为新牌组放到桌面</span>
                  </button>
                )}

                {isMyTurn && canReturnSelectedToRack && (
                  <button
                    type="button"
                    onClick={onReturnSelectedToHand}
                    data-testid="btn-return-selected-to-hand"
                    className="inline-flex items-center gap-1 px-2 sm:px-2.5 py-1 rounded-lg bg-stone-700 hover:bg-stone-600 text-stone-100 font-medium text-[11px] sm:text-xs transition-colors"
                  >
                    <ArrowDownLeft className="w-3.5 h-3.5" />
                    退回手牌
                  </button>
                )}

                <button
                  type="button"
                  onClick={onClearSelection}
                  data-testid="btn-clear-selection"
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-stone-300 text-[11px] sm:text-xs transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">取消选择</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Sculpted Wooden / Obsidian Tile Rack Slot */}
        <div className="relative min-h-[64px] sm:min-h-[86px] max-h-[126px] sm:max-h-none overflow-y-auto rounded-xl sm:rounded-2xl bg-[#090807] border border-[#C8A464]/20 px-2 sm:px-3 py-1.5 sm:py-2.5 shadow-inner flex items-center">
          {hand.length === 0 ? (
            <div className="w-full text-center py-2 sm:py-4 text-emerald-300 font-bold text-xs sm:text-sm flex items-center justify-center gap-2">
              <Sparkles className="w-4 h-4" />
              手牌已全部打出！点击下方「出牌提交」即可获胜！
            </div>
          ) : (
            <div
              data-testid="rack-tiles-list"
              className="flex flex-wrap items-center gap-1 sm:gap-2"
            >
              {hand.map((tile, idx) => (
                <TileView
                  key={tile.id}
                  tile={tile}
                  draggableId={isMyTurn ? tile.id : undefined}
                  dragData={{
                    source: 'rack',
                    index: idx,
                  }}
                  disabled={!isMyTurn}
                  isSelected={selectedTileIds.includes(tile.id)}
                  isRecent={recentTileIds.has(tile.id)}
                  onClick={() => {
                    onToggleSelectTile(tile.id);
                  }}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
