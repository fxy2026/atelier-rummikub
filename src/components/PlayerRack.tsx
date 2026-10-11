'use client';

import React, { useMemo } from 'react';
import { useDroppable } from '@dnd-kit/core';
import {
  ArrowDownLeft,
  ArrowUpDown,
  Palette,
  PlusCircle,
  Sparkles,
  Wand2,
  X,
  Zap,
} from 'lucide-react';
import {
  generateCandidateMeldsFromTiles,
  Tile,
  TileColor,
  validateMeld,
} from '@/engine';
import { TileView } from './TileView';

const COLOR_PIP: Record<TileColor, { pip: string; cls: string }> = {
  red: { pip: '♦', cls: 'text-[#FF6B5E]' },
  blue: { pip: '♠', cls: 'text-[#60A5FA]' },
  yellow: { pip: '●', cls: 'text-[#FBBF24]' },
  black: { pip: '♣', cls: 'text-stone-300' },
};

interface PlayerRackProps {
  hand: Tile[];
  isMyTurn: boolean;
  sortMode: 'color' | 'number' | 'smart' | 'manual';
  selectedTileIds: string[];
  recentTileIds: Set<string>;
  inFlightTileIds: Set<string>;
  turnStartHandIds: Set<string>;
  allTilesById: Map<string, Tile>;
  onToggleSelectTile: (tileId: string) => void;
  onClearSelection: () => void;
  onPlaySelectedToNewMeld: () => void;
  onPlayCandidateMeld: (tileIds: string[]) => void;
  onReturnSelectedToHand: () => void;
  onSortHand: (mode: 'color' | 'number' | 'smart') => void;
}

export const PlayerRack: React.FC<PlayerRackProps> = ({
  hand,
  isMyTurn,
  sortMode,
  selectedTileIds,
  recentTileIds,
  inFlightTileIds,
  turnStartHandIds,
  allTilesById,
  onToggleSelectTile,
  onClearSelection,
  onPlaySelectedToNewMeld,
  onPlayCandidateMeld,
  onReturnSelectedToHand,
  onSortHand,
}) => {
  const { isOver, setNodeRef } = useDroppable({
    id: 'player-rack-drop-zone',
    data: {
      type: 'rack',
    },
  });

  const handIdSet = useMemo(() => new Set(hand.map((t) => t.id)), [hand]);
  const selectedTiles = selectedTileIds
    .map((id) => allTilesById.get(id))
    .filter((t): t is Tile => Boolean(t));

  const selectedValidation =
    selectedTiles.length >= 3 ? validateMeld(selectedTiles) : null;

  // Check if any selected tile is currently on the table and originally came from hand this turn
  const canReturnSelectedToRack =
    selectedTileIds.length > 0 &&
    selectedTileIds.some((id) => !handIdSet.has(id) && turnStartHandIds.has(id));

  // Detect up to 4 distinct ready-to-play melds in hand so player can play a full meld in 1 tap
  const readyCandidateMelds = useMemo(() => {
    if (!isMyTurn || hand.length < 3) return [];
    const raw = generateCandidateMeldsFromTiles(hand);
    const unique: { key: string; tiles: Tile[]; score: number }[] = [];
    const seen = new Set<string>();

    for (const c of raw) {
      const sig = c.tiles
        .map((t) => (t.isJoker ? 'J' : `${t.color[0]}${t.number}`))
        .join('-');
      if (seen.has(sig)) continue;
      seen.add(sig);
      unique.push({
        key: c.tiles.map((t) => t.id).join(','),
        tiles: c.tiles,
        score: c.score,
      });
      if (unique.length >= 4) break;
    }
    return unique;
  }, [hand, isMyTurn]);

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
            <span className="text-xs sm:text-sm font-bold text-stone-200 tracking-wide flex items-center shrink-0">
              我的手牌架
              <span
                data-testid="rack-tile-count"
                className="ml-1.5 px-1.5 sm:px-2 py-0.5 rounded-md bg-[#D4AF37]/15 text-[#E6C65A] border border-[#D4AF37]/30 tabular-nums text-[11px] sm:text-xs"
              >
                {hand.length} 张
              </span>
            </span>

            {/* Sort Mode Controls */}
            <div className="flex items-center gap-0.5 sm:gap-1 bg-black/40 p-0.5 rounded-lg border border-white/10">
              <button
                type="button"
                onClick={() => onSortHand('color')}
                data-testid="btn-sort-color"
                className={[
                  'inline-flex items-center gap-1 px-1.5 sm:px-2.5 py-0.5 sm:py-1 rounded-md text-[10px] sm:text-xs font-medium transition-colors',
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
                  'inline-flex items-center gap-1 px-1.5 sm:px-2.5 py-0.5 sm:py-1 rounded-md text-[10px] sm:text-xs font-medium transition-colors',
                  sortMode === 'number'
                    ? 'bg-[#D4AF37] text-obsidian font-bold'
                    : 'text-stone-300 hover:text-white hover:bg-white/5',
                ].join(' ')}
              >
                <ArrowUpDown className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                按数字
              </button>
              <button
                type="button"
                onClick={() => onSortHand('smart')}
                data-testid="btn-sort-smart"
                title="自动将手中可组成合法顺子或数字组的牌排在最前面"
                className={[
                  'inline-flex items-center gap-1 px-1.5 sm:px-2.5 py-0.5 sm:py-1 rounded-md text-[10px] sm:text-xs font-medium transition-colors',
                  sortMode === 'smart'
                    ? 'bg-[#D4AF37] text-obsidian font-bold'
                    : 'text-[#E6C65A] hover:text-white hover:bg-white/5',
                ].join(' ')}
              >
                <Wand2 className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                智能理牌
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

        {/* One-Tap Ready Meld Quick-Play Chips */}
        {isMyTurn && selectedTileIds.length === 0 && readyCandidateMelds.length > 0 && (
          <div
            data-testid="quick-meld-chips"
            className="flex items-center gap-1.5 overflow-x-auto py-0.5 text-[11px] shrink-0"
          >
            <span className="inline-flex items-center gap-1 text-[#E6C65A] font-bold shrink-0">
              <Zap className="w-3 h-3 fill-current" />
              <span>成组快打：</span>
            </span>
            {readyCandidateMelds.map((cand, idx) => (
              <button
                key={cand.key}
                type="button"
                data-testid={`btn-quick-meld-${idx}`}
                onClick={() => onPlayCandidateMeld(cand.tiles.map((t) => t.id))}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-emerald-950/80 hover:bg-emerald-900/90 border border-emerald-400/40 text-stone-100 font-semibold shrink-0 transition-all active:scale-95"
                title="点击直接将这组牌放到桌面"
              >
                <span className="inline-flex items-center gap-0.5">
                  {cand.tiles.map((t) => {
                    const meta = COLOR_PIP[t.color];
                    return (
                      <span
                        key={t.id}
                        className={`font-black tabular-nums ${meta.cls}`}
                      >
                        {t.isJoker ? '★J' : `${meta.pip}${t.number}`}
                      </span>
                    );
                  })}
                </span>
                <span className="text-[10px] text-emerald-300 ml-0.5">
                  ({cand.score}分)
                </span>
              </button>
            ))}
          </div>
        )}

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
                  isInFlight={inFlightTileIds.has(tile.id)}
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
