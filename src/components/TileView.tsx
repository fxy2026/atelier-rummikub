'use client';

import React from 'react';
import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { JokerAssignment, Tile, TileColor } from '@/engine';
import { Sparkles } from 'lucide-react';

const COLOR_STYLES: Record<
  TileColor,
  {
    text: string;
    pip: string;
    badgeBg: string;
    label: string;
  }
> = {
  red: {
    text: 'text-[#D92D20]',
    pip: '♦',
    badgeBg: 'bg-[#D92D20]/15 text-[#D92D20] border-[#D92D20]/30',
    label: '红',
  },
  blue: {
    text: 'text-[#155EEF]',
    pip: '♠',
    badgeBg: 'bg-[#155EEF]/15 text-[#155EEF] border-[#155EEF]/30',
    label: '蓝',
  },
  yellow: {
    text: 'text-[#B86E00]',
    pip: '●',
    badgeBg: 'bg-[#B86E00]/15 text-[#B86E00] border-[#B86E00]/30',
    label: '黄',
  },
  black: {
    text: 'text-[#18181B]',
    pip: '♣',
    badgeBg: 'bg-[#18181B]/15 text-[#18181B] border-[#18181B]/30',
    label: '黑',
  },
};

export interface TileViewProps {
  tile: Tile;
  draggableId?: string;
  dragData?: Record<string, unknown>;
  disabled?: boolean;
  isSelected?: boolean;
  isFromHandThisTurn?: boolean;
  isRecent?: boolean;
  isHintMoved?: boolean;
  isInFlight?: boolean;
  recentActorLabel?: string;
  jokerAssignment?: JokerAssignment;
  size?: 'sm' | 'md' | 'lg';
  onClick?: (e: React.MouseEvent) => void;
}

export const TileView: React.FC<TileViewProps> = ({
  tile,
  draggableId,
  dragData,
  disabled = false,
  isSelected = false,
  isFromHandThisTurn = false,
  isRecent = false,
  isHintMoved = false,
  isInFlight = false,
  recentActorLabel,
  jokerAssignment,
  size = 'md',
  onClick,
}) => {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: draggableId ?? tile.id,
    data: {
      tile,
      ...dragData,
    },
    disabled: disabled || !draggableId,
  });

  const style: React.CSSProperties = transform
    ? {
        transform: CSS.Translate.toString(transform),
        zIndex: isDragging ? 60 : undefined,
      }
    : {};

  const effectiveColor = jokerAssignment ? jokerAssignment.representedColor : tile.color;
  const colorMeta = COLOR_STYLES[effectiveColor];

  const dimensions =
    size === 'sm'
      ? 'w-9 h-[50px] sm:w-10 sm:h-14 rounded-lg p-1 sm:p-1.5'
      : size === 'lg'
      ? 'w-14 h-20 rounded-xl p-1.5'
      : 'w-[38px] h-[54px] sm:w-[52px] sm:h-[74px] rounded-lg sm:rounded-xl p-1 sm:p-1.5';

  const numberSize =
    size === 'sm'
      ? 'text-base sm:text-lg'
      : size === 'lg'
      ? 'text-2xl'
      : 'text-lg sm:text-2xl';

  const zoneAttr = dragData?.source ? String(dragData.source) : undefined;
  const meldAttr = dragData?.meldId ? String(dragData.meldId) : undefined;

  return (
    <button
      ref={setNodeRef}
      type="button"
      style={style}
      data-testid={`tile-${tile.id}`}
      data-tile-id={tile.id}
      data-tile-zone={zoneAttr}
      data-tile-meld={meldAttr}
      data-tile-selected={isSelected ? 'true' : 'false'}
      onClick={onClick}
      disabled={disabled && !onClick}
      {...(draggableId && !disabled ? listeners : {})}
      {...(draggableId && !disabled ? attributes : {})}
      className={[
        'group relative select-none touch-manipulation flex flex-col items-center justify-between transition-all duration-150',
        'bg-gradient-to-b from-[#FFFDF9] via-[#F7F4EB] to-[#EAE3D2]',
        'border border-[#DED6C1]',
        dimensions,
        isInFlight ? 'opacity-20 scale-95' : '',
        isDragging ? 'opacity-40 scale-105 shadow-tile-dragging cursor-grabbing' : '',
        !isDragging && isSelected
          ? '-translate-y-1.5 sm:-translate-y-2.5 ring-2 ring-[#D4AF37] shadow-tile-selected'
          : !isDragging
          ? 'shadow-tile sm:hover:-translate-y-1'
          : '',
        !isSelected && isHintMoved
          ? 'ring-2 ring-amber-400 shadow-[0_0_16px_rgba(251,191,36,0.65)] -translate-y-1'
          : '',
        isRecent && !isSelected && !isHintMoved
          ? 'ring-2 ring-sky-400 shadow-[0_0_12px_rgba(56,189,248,0.55)] -translate-y-0.5 sm:-translate-y-1'
          : '',
        disabled && !onClick ? 'cursor-default' : 'cursor-grab active:cursor-grabbing',
      ]
        .filter(Boolean)
        .join(' ')}
      aria-label={
        tile.isJoker
          ? jokerAssignment
            ? `万能牌 Joker（当前代表${colorMeta.label}${jokerAssignment.representedNumber}）`
            : '万能牌 Joker'
          : `${colorMeta.label}${tile.number}`
      }
    >
      {/* Top micro row: color pip + turn indicator */}
      <div className="w-full flex items-center justify-between px-0.5 leading-none">
        <span className={`text-[8px] sm:text-[9px] font-bold opacity-75 ${colorMeta.text}`}>
          {tile.isJoker ? '★' : colorMeta.pip}
        </span>
        {isHintMoved ? (
          <span
            title="智能提示刚刚移动或重组的牌"
            className="px-1 py-0.2 rounded bg-amber-500 text-obsidian text-[7px] sm:text-[8px] font-extrabold leading-none"
          >
            提示
          </span>
        ) : isFromHandThisTurn ? (
          <span
            title="本回合你从手牌打出的牌（可退回手牌）"
            className="px-1 py-0.2 rounded bg-emerald-600 text-white text-[7px] sm:text-[8px] font-bold leading-none"
          >
            本回
          </span>
        ) : isRecent ? (
          <span
            title={recentActorLabel ? `${recentActorLabel} 刚刚打出或摸入的牌` : '最新变动的牌'}
            className="px-1 py-0.2 rounded bg-sky-600 text-white text-[7px] sm:text-[8px] font-bold leading-none"
          >
            新牌
          </span>
        ) : null}
      </div>

      {/* Center Engraved Numeral or Joker Icon */}
      <div className="flex-1 flex flex-col items-center justify-center -mt-0.5">
        {tile.isJoker ? (
          <div className="flex flex-col items-center justify-center">
            <Sparkles className={`w-4 h-4 sm:w-6 sm:h-6 ${colorMeta.text}`} />
            {jokerAssignment ? (
              <span
                className={`mt-0.5 px-1 py-0.2 text-[8px] sm:text-[10px] font-extrabold rounded border leading-tight tabular-nums ${colorMeta.badgeBg}`}
              >
                ={jokerAssignment.representedNumber}
              </span>
            ) : (
              <span
                className={`text-[8px] sm:text-[9px] font-black tracking-tighter uppercase mt-0.5 ${colorMeta.text}`}
              >
                JOKER
              </span>
            )}
          </div>
        ) : (
          <span
            className={`font-black tracking-tight tabular-nums leading-none ${numberSize} ${colorMeta.text}`}
            style={{
              textShadow: '0 1px 0 rgba(255,255,255,0.85)',
            }}
          >
            {tile.number}
          </span>
        )}
      </div>

      {/* Bottom Rummikub recessed circular dimple */}
      <div className="w-2.5 h-2.5 sm:w-3.5 sm:h-3.5 rounded-full bg-gradient-to-b from-[#DFD8C5] to-[#FBF9F2] shadow-inner border border-[#D4CCB8]/70 mb-0.5" />
    </button>
  );
};
