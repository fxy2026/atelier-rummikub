'use client';

import React from 'react';
import {
  Check,
  Lightbulb,
  Layers,
  RotateCcw,
  Undo2,
} from 'lucide-react';
import { GameState, INITIAL_MELD_MIN_POINTS, validateTurnCommit } from '@/engine';

interface ActionBarProps {
  gameState: GameState;
  isMyTurn: boolean;
  onUndo: () => void;
  onResetTurn: () => void;
  onSmartHint: () => void;
  onDrawTile: () => void;
  onSubmitTurn: () => void;
}

export const ActionBar: React.FC<ActionBarProps> = ({
  gameState,
  isMyTurn,
  onUndo,
  onResetTurn,
  onSmartHint,
  onDrawTile,
  onSubmitTurn,
}) => {
  const currentPlayer = gameState.players[gameState.currentPlayerIndex];
  const hasUndoHistory = gameState.undoStack.length > 0;

  // Live pre-validation of the working turn state
  const liveCommitCheck = validateTurnCommit({
    turnStartSnapshot: gameState.turnStartSnapshot,
    currentHand: currentPlayer.hand,
    currentTable: gameState.table,
    hasInitialMeld: currentPlayer.hasInitialMeld,
  });

  const playedFromHandCount =
    gameState.turnStartSnapshot.hand.length - currentPlayer.hand.length;

  return (
    <footer className="w-full bg-[#080D0B] border-t border-white/10 px-3 sm:px-6 py-2.5 z-20">
      <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-2.5">
        {/* Left: Icebreaker 30-Point Meter / Turn Readiness Indicator */}
        <div className="flex items-center gap-3">
          {!currentPlayer.hasInitialMeld ? (
            <div
              data-testid="icebreaker-meter"
              className="flex items-center gap-2.5 px-3 py-1.5 rounded-xl bg-black/50 border border-white/10"
            >
              <div className="flex flex-col">
                <span className="text-[11px] text-stone-400">
                  首次出牌破冰要求（需 ≥ {INITIAL_MELD_MIN_POINTS} 分）
                </span>
                <div className="flex items-center gap-2">
                  <div className="w-24 sm:w-32 h-2 rounded-full bg-stone-800 overflow-hidden">
                    <div
                      className={[
                        'h-full transition-all duration-300',
                        liveCommitCheck.totalPlayedScore >= INITIAL_MELD_MIN_POINTS
                          ? 'bg-emerald-400'
                          : 'bg-[#D4AF37]',
                      ].join(' ')}
                      style={{
                        width: `${Math.min(
                          100,
                          Math.round(
                            (liveCommitCheck.totalPlayedScore / INITIAL_MELD_MIN_POINTS) *
                              100
                          )
                        )}%`,
                      }}
                    />
                  </div>
                  <span className="text-xs font-bold tabular-nums text-[#E6C65A]">
                    {liveCommitCheck.totalPlayedScore} / {INITIAL_MELD_MIN_POINTS} 分
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-black/50 border border-white/10 text-xs text-stone-300">
              <span>
                本回合已出：
                <strong className="text-[#E6C65A] mx-1 tabular-nums">
                  {Math.max(0, playedFromHandCount)}
                </strong>
                张手牌
              </span>
              {playedFromHandCount > 0 && (
                <span
                  className={
                    liveCommitCheck.isValid
                      ? 'text-emerald-400 font-semibold'
                      : 'text-amber-400 font-semibold'
                  }
                >
                  · {liveCommitCheck.isValid ? '桌面牌组全部合法' : '桌面尚有未完成牌组'}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Right: Primary Turn Controls */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={!isMyTurn}
            onClick={onSmartHint}
            data-testid="btn-smart-hint"
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 disabled:opacity-40 disabled:pointer-events-none text-[#E6C65A] border border-[#D4AF37]/30 text-xs sm:text-sm font-semibold transition-colors"
            title="自动搜索手牌与桌面可出的合法组合"
          >
            <Lightbulb className="w-4 h-4" />
            <span>智能提示</span>
          </button>

          <button
            type="button"
            disabled={!isMyTurn || !hasUndoHistory}
            onClick={onUndo}
            data-testid="btn-undo"
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 disabled:opacity-35 disabled:pointer-events-none text-stone-200 border border-white/10 text-xs sm:text-sm font-medium transition-colors"
          >
            <Undo2 className="w-4 h-4" />
            <span>撤销</span>
          </button>

          <button
            type="button"
            disabled={!isMyTurn || !hasUndoHistory}
            onClick={onResetTurn}
            data-testid="btn-reset-turn"
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 disabled:opacity-35 disabled:pointer-events-none text-stone-200 border border-white/10 text-xs sm:text-sm font-medium transition-colors"
          >
            <RotateCcw className="w-4 h-4" />
            <span>重置本回合</span>
          </button>

          <button
            type="button"
            disabled={!isMyTurn}
            onClick={onDrawTile}
            data-testid="btn-draw-tile"
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-stone-800 hover:bg-stone-700 disabled:opacity-40 disabled:pointer-events-none text-stone-100 border border-stone-600 text-xs sm:text-sm font-bold transition-colors"
          >
            <Layers className="w-4 h-4 text-[#D4AF37]" />
            <span>{gameState.pool.length > 0 ? '摸牌结束回合' : '跳过回合'}</span>
          </button>

          <button
            type="button"
            disabled={!isMyTurn}
            onClick={onSubmitTurn}
            data-testid="btn-submit-turn"
            className={[
              'inline-flex items-center gap-1.5 px-5 py-2 rounded-xl font-bold text-xs sm:text-sm transition-all shadow-lg disabled:opacity-40 disabled:pointer-events-none',
              liveCommitCheck.isValid
                ? 'bg-gradient-to-r from-[#D4AF37] to-[#E6C65A] hover:brightness-110 text-obsidian ring-2 ring-[#D4AF37]/50'
                : 'bg-[#D4AF37]/80 hover:bg-[#D4AF37] text-obsidian',
            ].join(' ')}
          >
            <Check className="w-4 h-4 stroke-[2.5]" />
            <span>出牌提交</span>
          </button>
        </div>
      </div>
    </footer>
  );
};
