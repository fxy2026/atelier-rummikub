'use client';

import React from 'react';
import {
  AlertTriangle,
  BookOpen,
  Bot,
  CheckCircle2,
  Home,
  Layers,
  Loader2,
  Settings,
  ShieldAlert,
  Sparkles,
  User,
  Users,
} from 'lucide-react';
import { GameState } from '@/engine';
import { SanitizedRoomView } from '@/lib/multiplayer';

interface TopHudProps {
  gameState: GameState;
  isAIThinking: boolean;
  mpRoom: SanitizedRoomView | null;
  onGoHome: () => void;
  onOpenRules: () => void;
  onOpenSettings: () => void;
  onClearError: () => void;
}

export const TopHud: React.FC<TopHudProps> = ({
  gameState,
  isAIThinking,
  mpRoom,
  onGoHome,
  onOpenRules,
  onOpenSettings,
  onClearError,
}) => {
  const activePlayer = gameState.players[gameState.currentPlayerIndex];

  return (
    <header className="w-full bg-[#0A1310]/95 border-b border-[#C8A464]/20 px-3 sm:px-6 py-2.5 flex flex-col gap-2 z-20">
      {/* Top Row: Brand, Player Cards, Pool & System Controls */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        {/* Left: Brand & Back to Home */}
        <div className="flex items-center gap-2 sm:gap-3">
          <button
            type="button"
            onClick={onGoHome}
            data-testid="btn-back-home"
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-stone-200 text-xs sm:text-sm font-medium transition-colors"
            title="返回主页"
          >
            <Home className="w-4 h-4 text-[#D4AF37]" />
            <span className="hidden sm:inline">返回大厅</span>
          </button>

          <div className="flex items-center gap-2">
            <span className="text-sm sm:text-base font-bold tracking-wider text-stone-100">
              曜石拉密
            </span>
            <span className="hidden md:inline-block text-[11px] uppercase tracking-widest px-2 py-0.5 rounded bg-[#D4AF37]/15 text-[#E6C65A] border border-[#D4AF37]/30 font-semibold">
              回合 #{gameState.turnNumber}
            </span>
            {mpRoom && (
              <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded bg-sky-500/15 text-sky-300 border border-sky-400/30 font-medium">
                <Users className="w-3.5 h-3.5" />
                房间 {mpRoom.roomCode}
              </span>
            )}
          </div>
        </div>

        {/* Center: Player Status Pills */}
        <div
          className="flex items-center gap-1.5 sm:gap-2.5 overflow-x-auto py-0.5"
          data-testid="players-status-bar"
        >
          {gameState.players.map((player, idx) => {
            const isCurrent = idx === gameState.currentPlayerIndex && gameState.status === 'playing';
            const isHuman = player.type === 'human';

            return (
              <div
                key={player.id}
                data-testid={`player-card-${idx}`}
                data-active-turn={isCurrent ? 'true' : 'false'}
                className={[
                  'flex items-center gap-2 px-2.5 sm:px-3 py-1.5 rounded-xl border transition-all duration-200',
                  isCurrent
                    ? 'bg-gradient-to-r from-[#D4AF37]/25 to-[#D4AF37]/10 border-[#D4AF37] shadow-[0_0_15px_rgba(212,175,55,0.22)]'
                    : 'bg-white/[0.04] border-white/10 opacity-85',
                ].join(' ')}
              >
                <div
                  className={[
                    'w-7 h-7 rounded-lg flex items-center justify-center shrink-0',
                    isCurrent
                      ? 'bg-[#D4AF37] text-obsidian'
                      : isHuman
                      ? 'bg-emerald-500/20 text-emerald-300'
                      : 'bg-stone-700/60 text-stone-300',
                  ].join(' ')}
                >
                  {isCurrent && isAIThinking && !isHuman ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : isHuman ? (
                    <User className="w-4 h-4" />
                  ) : (
                    <Bot className="w-4 h-4" />
                  )}
                </div>

                <div className="flex flex-col min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs sm:text-sm font-semibold text-stone-100 truncate max-w-[90px] sm:max-w-[120px]">
                      {player.name}
                    </span>
                    {player.hasInitialMeld ? (
                      <span
                        title="已完成首次 30 分破冰"
                        className="inline-flex items-center text-[10px] px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-medium"
                      >
                        已破冰
                      </span>
                    ) : (
                      <span
                        title="尚未完成首次 30 分破冰"
                        className="inline-flex items-center text-[10px] px-1.5 py-0.2 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30 font-medium"
                      >
                        未破冰
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2 text-[11px] text-stone-300">
                    <span className="tabular-nums font-semibold text-stone-200">
                      余牌 <strong className="text-[#E6C65A]">{player.hand.length}</strong> 张
                    </span>
                    {isCurrent && (
                      <span className="text-[#E6C65A] font-medium">
                        {isAIThinking && !isHuman ? '思考中…' : '● 当前回合'}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Right: Pool Counter & Modal Triggers */}
        <div className="flex items-center gap-2">
          <div
            data-testid="pool-counter"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-black/40 border border-[#C8A464]/30 text-xs sm:text-sm text-stone-200"
            title="公共摸牌池剩余牌数"
          >
            <Layers className="w-4 h-4 text-[#D4AF37]" />
            <span>牌池</span>
            <strong className="tabular-nums text-[#E6C65A] font-bold">
              {gameState.pool.length}
            </strong>
          </div>

          <button
            type="button"
            onClick={onOpenRules}
            data-testid="btn-open-rules"
            className="p-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-stone-200 transition-colors"
            title="游戏规则说明"
            aria-label="游戏规则说明"
          >
            <BookOpen className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={onOpenSettings}
            data-testid="btn-open-settings"
            className="p-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-stone-200 transition-colors"
            title="游戏设置"
            aria-label="游戏设置"
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Bottom Status / Error / Turn Prompt Strip */}
      {gameState.lastError ? (
        <div
          role="alert"
          data-testid="error-banner"
          className="flex items-center justify-between gap-2 px-3 py-1.5 rounded-lg bg-red-950/90 border border-red-500/60 text-red-100 text-xs sm:text-sm animate-pulse"
        >
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
            <span className="font-medium">{gameState.lastError}</span>
          </div>
          <button
            type="button"
            onClick={onClearError}
            className="text-xs px-2 py-0.5 rounded bg-red-800/70 hover:bg-red-700 text-red-100 shrink-0"
          >
            知道了
          </button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-1 rounded-lg bg-black/30 border border-white/5 text-xs text-stone-300">
          <div className="flex items-center gap-2">
            <Sparkles className="w-3.5 h-3.5 text-[#D4AF37] shrink-0" />
            <span data-testid="action-notice-text">
              {gameState.lastActionNotice ?? '请出牌或摸牌'}
            </span>
          </div>

          <div className="flex items-center gap-3 text-[11px] text-stone-400">
            {activePlayer?.type === 'human' && !activePlayer.hasInitialMeld ? (
              <span className="inline-flex items-center gap-1 text-amber-300 font-medium">
                <ShieldAlert className="w-3.5 h-3.5" />
                首次出牌需完全使用手牌且总分 ≥ 30 分
              </span>
            ) : activePlayer?.type === 'human' ? (
              <span className="inline-flex items-center gap-1 text-emerald-300 font-medium">
                <CheckCircle2 className="w-3.5 h-3.5" />
                已破冰：可自由加牌、拆分或重组桌面牌组
              </span>
            ) : (
              <span className="text-[#E6C65A]">等待 {activePlayer?.name} 行动…</span>
            )}
          </div>
        </div>
      )}
    </header>
  );
};
