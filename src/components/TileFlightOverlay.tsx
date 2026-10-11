'use client';

import React, { useEffect, useRef } from 'react';
import { Tile, TileColor } from '@/engine';
import { TileView } from './TileView';

export interface FlyingTileItem {
  key: string;
  tile: Tile;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  width: number;
  height: number;
  fromZone: 'rack' | 'table';
  toZone: 'rack' | 'table';
  delayMs: number;
  durationMs: number;
  showTrajectory: boolean;
}

const COLOR_HEX: Record<TileColor, string> = {
  red: '#F04438',
  blue: '#3B82F6',
  yellow: '#F59E0B',
  black: '#E4E4E7',
};

interface SingleFlyingTileProps {
  item: FlyingTileItem;
}

const SingleFlyingTile: React.FC<SingleFlyingTileProps> = ({ item }) => {
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = wrapperRef.current;
    if (!el || typeof el.animate !== 'function') return;

    const dx = item.toX - item.fromX;
    const dy = item.toY - item.fromY;
    // Add a natural parabolic arc perpendicular/upward during flight
    const midLiftY = Math.min(-28, -Math.abs(dy) * 0.18);

    const anim = el.animate(
      [
        {
          transform: 'translate3d(0px, 0px, 0) scale(1)',
          opacity: 1,
          offset: 0,
        },
        {
          transform: `translate3d(${dx * 0.45}px, ${dy * 0.45 + midLiftY}px, 0) scale(1.16) rotate(-3deg)`,
          opacity: 1,
          offset: 0.45,
        },
        {
          transform: `translate3d(${dx}px, ${dy}px, 0) scale(1.04) rotate(0deg)`,
          opacity: 1,
          offset: 0.9,
        },
        {
          transform: `translate3d(${dx}px, ${dy}px, 0) scale(1)`,
          opacity: 1,
          offset: 1,
        },
      ],
      {
        duration: item.durationMs,
        delay: item.delayMs,
        easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
        fill: 'both',
      }
    );

    return () => {
      anim.cancel();
    };
  }, [item]);

  return (
    <div
      ref={wrapperRef}
      style={{
        position: 'fixed',
        left: `${item.fromX}px`,
        top: `${item.fromY}px`,
        width: `${item.width}px`,
        height: `${item.height}px`,
        zIndex: 80,
      }}
      className="pointer-events-none"
    >
      <div className="ring-2 ring-[#E6C65A] rounded-lg sm:rounded-xl shadow-[0_12px_28px_rgba(212,175,55,0.55)]">
        <TileView tile={item.tile} disabled />
      </div>
    </div>
  );
};

interface TileFlightOverlayProps {
  flights: FlyingTileItem[];
}

export const TileFlightOverlay: React.FC<TileFlightOverlayProps> = ({
  flights,
}) => {
  if (flights.length === 0) return null;

  const trajectoryFlights = flights.filter((f) => f.showTrajectory);

  return (
    <div
      data-testid="tile-flight-overlay"
      className="fixed inset-0 pointer-events-none z-[75] overflow-hidden"
    >
      {/* 1. SVG Trajectory Lines & Origin Ghost Markers for Smart Hint / Replay */}
      {trajectoryFlights.length > 0 && (
        <svg className="absolute inset-0 w-full h-full">
          <defs>
            <marker
              id="hint-arrow-gold"
              viewBox="0 0 10 10"
              refX="7"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#E6C65A" />
            </marker>
            <marker
              id="hint-arrow-cyan"
              viewBox="0 0 10 10"
              refX="7"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#38BDF8" />
            </marker>
          </defs>

          {trajectoryFlights.map((item) => {
            const sx = item.fromX + item.width / 2;
            const sy = item.fromY + item.height / 2;
            const ex = item.toX + item.width / 2;
            const ey = item.toY + item.height / 2;
            const mx = (sx + ex) / 2;
            const my = (sy + ey) / 2 - Math.min(48, Math.hypot(ex - sx, ey - sy) * 0.2);
            const isFromRack = item.fromZone === 'rack';
            const strokeColor = isFromRack ? '#E6C65A' : '#38BDF8';

            return (
              <g key={`traj-${item.key}`}>
                {/* Soft glow path */}
                <path
                  d={`M ${sx} ${sy} Q ${mx} ${my} ${ex} ${ey}`}
                  fill="none"
                  stroke={strokeColor}
                  strokeWidth="5"
                  strokeOpacity="0.22"
                  strokeLinecap="round"
                />
                {/* Dashed directional path */}
                <path
                  d={`M ${sx} ${sy} Q ${mx} ${my} ${ex} ${ey}`}
                  fill="none"
                  stroke={strokeColor}
                  strokeWidth="2.2"
                  strokeDasharray="6 4"
                  strokeLinecap="round"
                  markerEnd={
                    isFromRack ? 'url(#hint-arrow-gold)' : 'url(#hint-arrow-cyan)'
                  }
                />
                {/* Origin dot */}
                <circle
                  cx={sx}
                  cy={sy}
                  r="4"
                  fill={strokeColor}
                  fillOpacity="0.85"
                />
              </g>
            );
          })}
        </svg>
      )}

      {/* 2. Origin Ghost Outlines showing where each tile started */}
      {trajectoryFlights.map((item) => {
        const isFromRack = item.fromZone === 'rack';
        return (
          <div
            key={`ghost-${item.key}`}
            style={{
              position: 'fixed',
              left: `${item.fromX}px`,
              top: `${item.fromY}px`,
              width: `${item.width}px`,
              height: `${item.height}px`,
            }}
            className={[
              'rounded-lg sm:rounded-xl border-2 border-dashed flex flex-col items-center justify-center bg-black/45 backdrop-blur-[1px]',
              isFromRack
                ? 'border-[#E6C65A]/80 text-[#E6C65A]'
                : 'border-sky-400/80 text-sky-300',
            ].join(' ')}
          >
            <span
              className="text-xs sm:text-sm font-black tabular-nums leading-none"
              style={{ color: COLOR_HEX[item.tile.color] }}
            >
              {item.tile.isJoker ? '★J' : item.tile.number}
            </span>
            <span className="text-[8px] font-bold opacity-85 mt-0.5">
              {isFromRack ? '手牌移出' : '重组原位'}
            </span>
          </div>
        );
      })}

      {/* 3. Flying Tile Clones */}
      {flights.map((item) => (
        <SingleFlyingTile key={item.key} item={item} />
      ))}
    </div>
  );
};
