'use client';

import React from 'react';
import {
  AlertTriangle,
  BookOpen,
  Bot,
  Home,
  Layers,
  Loader2,
  Megaphone,
  Radio,
  Settings,
  User,
  Users,
} from 'lucide-react';
import { GameState } from '@/engine';
import { SanitizedRoomView } from '@/lib/multiplayer';

interface TopHudProps {
  gameState: GameState;
  isMyTurn: boolean;
  isAIThinking: boolean;
  mpRoom: SanitizedRoomView | null;
  onGoHome: () => void;
  onOpenRules: () => void;
  onOpenSettings: () => void;
  onClearError: () => void;
}

const SEAT_COLORS = [
  'border-emerald-400/50 text-emerald-300',
  'border-sky-400/50 text-sky-300',
  'border-violet-400/50 text-violet-300',
  'border-rose-400/50 text-rose-300',
];

export const TopHud: React.FC<TopHudProps> = ({
  gameState,
  isMyTurn,
  isAIThinking,
  mpRoom,
  onGoHome,
  onOpenRules,
  onOpenSettings,
  onClearError,
}) => {
  const activePlayer = gameState.players[gameState.currentPlayerIndex];
  const latestLog = gameState.history[0] ?? null;

  return (
    <header className="w-full bg-[#0A1310]/95 border-b border-[#C8A464]/25 px-2.5 sm:px-6 py-1.5 sm:py-2.5 flex flex-col gap-1.5 sm:gap-2 z-20 shrink-0">
      {/* Top Row: Brand, Player Cards (centered on desktop, full-width scrollable row on mobile), Pool & System Controls */}
      <div className="flex flex-wrap items-center justify-between gap-1.5 sm:gap-2">
        {/* Left: Brand & Back to Home */}
        <div className="flex items-center gap-1.5 sm:gap-3 order-1">
          <button
            type="button"
            onClick={onGoHome}
            data-testid="btn-back-home"
            className="flex items-center gap-1.5 px-2 sm:px-2.5 py-1 sm:py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-stone-200 text-xs sm:text-sm font-medium transition-colors"
            title="返回主页"
          >
            <Home className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[#D4AF37]" />
            <span className="hidden sm:inline">返回大厅</span>
          </button>

          <div className="flex items-center gap-1.5 sm:gap-2">
            <span className="text-xs sm:text-base font-bold tracking-wider text-stone-100">
              曜石拉密
            </span>
            <span className="text-[10px] sm:text-[11px] uppercase tracking-widest px-1.5 sm:px-2 py-0.5 rounded bg-[#D4AF37]/15 text-[#E6C65A] border border-[#D4AF37]/30 font-semibold">
              第 {gameState.turnNumber} 回
            </span>
            {mpRoom && (
              <span className="inline-flex items-center gap-1 text-[10px] sm:text-xs px-1.5 sm:px-2.5 py-0.5 rounded-md bg-sky-500/20 text-sky-200 border border-sky-400/40 font-bold">
                <Users className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                {mpRoom.roomCode}
              </span>
            )}
          </div>
        </div>

        {/* Right: Pool Counter & Modal Triggers (order-2 on mobile so it stays on row 1) */}
        <div className="flex items-center gap-1.5 sm:gap-2 order-2 lg:order-3">
          <div
            data-testid="pool-counter"
            className="flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-1 sm:py-1.5 rounded-xl bg-black/40 border border-[#C8A464]/30 text-[11px] sm:text-sm text-stone-200"
            title="公共摸牌池剩余牌数"
          >
            <Layers className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[#D4AF37]" />
            <span className="hidden xs:inline sm:inline">牌池</span>
            <strong className="tabular-nums text-[#E6C65A] font-bold">
              {gameState.pool.length}
            </strong>
          </div>

          <button
            type="button"
            onClick={onOpenRules}
            data-testid="btn-open-rules"
            className="p-1.5 sm:p-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-stone-200 transition-colors"
            title="游戏规则说明"
            aria-label="游戏规则说明"
          >
            <BookOpen className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
          </button>

          <button
            type="button"
            onClick={onOpenSettings}
            data-testid="btn-open-settings"
            className="p-1.5 sm:p-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-stone-200 transition-colors"
            title="游戏设置"
            aria-label="游戏设置"
          >
            <Settings className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
          </button>
        </div>

        {/* Center: Player Status Pills with Explicit Turn & Last Action */}
        <div
          className="w-full lg:w-auto order-3 lg:order-2 flex items-center gap-1.5 sm:gap-3 overflow-x-auto py-0.5 sm:py-1"
          data-testid="players-status-bar"
        >
          {gameState.players.map((player, idx) => {
            const isCurrent =
              idx === gameState.currentPlayerIndex && gameState.status === 'playing';
            const isHuman = player.type === 'human';
            const playerLastLog = gameState.history.find(
              (h) => h.playerId === player.id
            );

            return (
              <div
                key={player.id}
                data-testid={`player-card-${idx}`}
                data-active-turn={isCurrent ? 'true' : 'false'}
                className={[
                  'relative flex items-center gap-1.5 sm:gap-2.5 px-2 sm:px-3 py-1 sm:py-2 rounded-xl sm:rounded-2xl border transition-all duration-200 shrink-0',
                  isCurrent
                    ? 'bg-gradient-to-r from-[#D4AF37]/30 via-[#D4AF37]/15 to-emerald-950/60 border-2 border-[#E6C65A] shadow-[0_0_16px_rgba(212,175,55,0.35)]'
                    : 'bg-white/[0.04] border-white/10 opacity-80',
                ].join(' ')}
              >
                {/* Seat Avatar */}
                <div
                  className={[
                    'w-6 h-6 sm:w-8 sm:h-8 rounded-lg sm:rounded-xl flex items-center justify-center shrink-0 font-bold',
                    isCurrent
                      ? 'bg-[#D4AF37] text-obsidian shadow-md'
                      : isHuman
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                      : 'bg-stone-800 text-stone-300 border border-white/10',
                  ].join(' ')}
                >
                  {isCurrent && isAIThinking && !isHuman ? (
                    <Loader2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 animate-spin" />
                  ) : isHuman ? (
                    <User className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  ) : (
                    <Bot className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  )}
                </div>

                <div className="flex flex-col min-w-0">
                  <div className="flex items-center gap-1 sm:gap-1.5">
                    <span
                      className={`text-[9px] sm:text-[10px] font-bold px-1 sm:px-1.5 py-0.2 rounded border ${
                        SEAT_COLORS[idx % SEAT_COLORS.length]
                      }`}
                    >
                      {idx + 1}号
                    </span>
                    <span className="text-[11px] sm:text-sm font-bold text-stone-100 truncate max-w-[72px] sm:max-w-[130px]">
                      {player.name}
                    </span>
                    {player.hasInitialMeld ? (
                      <span
                        title="已完成首次 30 分破冰"
                        className="inline-flex items-center text-[9px] sm:text-[10px] px-1 sm:px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-semibold"
                      >
                        已破冰
                      </span>
                    ) : (
                      <span
                        title="尚未完成首次 30 分破冰"
                        className="inline-flex items-center text-[9px] sm:text-[10px] px-1 sm:px-1.5 py-0.2 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30 font-semibold"
                      >
                        未破冰
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5 sm:gap-2 text-[10px] sm:text-[11px] mt-0.5">
                    <span className="tabular-nums font-semibold text-stone-200">
                      余 <strong className="text-[#E6C65A]">{player.hand.length}</strong> 张
                    </span>

                    {isCurrent ? (
                      <span className="inline-flex items-center gap-0.5 px-1 sm:px-1.5 py-0.2 rounded bg-[#D4AF37] text-obsidian font-extrabold text-[9px] sm:text-[10px] animate-pulse">
                        {isAIThinking && !isHuman ? '思考中…' : '▶ 出牌中'}
                      </span>
                    ) : playerLastLog ? (
                      <span className="text-[9px] sm:text-[10px] text-stone-400 truncate max-w-[95px] sm:max-w-[115px]">
                        {playerLastLog.action === 'play'
                          ? `刚出${playerLastLog.tilesPlayedCount}张`
                          : playerLastLog.action === 'draw'
                          ? '刚摸1张'
                          : '跳过'}
                      </span>
                    ) : null}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Bottom High-Visibility Turn Spotlight & Last Action Broadcast Strip */}
      {gameState.lastError ? (
        <div
          role="alert"
          data-testid="error-banner"
          className="flex items-center justify-between gap-2 px-3 sm:px-4 py-1.5 sm:py-2 rounded-xl bg-red-950/95 border-2 border-red-500 text-red-100 text-[11px] sm:text-sm shadow-lg"
        >
          <div className="flex items-center gap-1.5 sm:gap-2">
            <AlertTriangle className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-red-400 shrink-0" />
            <span className="font-bold">{gameState.lastError}</span>
          </div>
          <button
            type="button"
            onClick={onClearError}
            className="text-[11px] sm:text-xs px-2 sm:px-2.5 py-0.5 sm:py-1 rounded-lg bg-red-800 hover:bg-red-700 text-white font-semibold shrink-0"
          >
            知道了
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-1 sm:gap-2">
          {/* Left Box: WHOSE TURN IS IT RIGHT NOW */}
          <div
            data-testid="current-turn-spotlight"
            className={[
              'flex items-center justify-between gap-2 px-2.5 sm:px-3.5 py-1 sm:py-2 rounded-lg sm:rounded-xl border text-[11px] sm:text-sm font-bold',
              isMyTurn
                ? 'bg-emerald-950/80 border-emerald-400/60 text-emerald-200'
                : 'bg-amber-950/70 border-[#D4AF37]/60 text-[#E6C65A]',
            ].join(' ')}
          >
            <div className="flex items-center gap-1.5 sm:gap-2 truncate">
              <Radio
                className={`w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0 ${
                  isMyTurn ? 'text-emerald-400 animate-ping' : 'text-[#D4AF37] animate-spin'
                }`}
              />
              <span className="truncate">
                {isMyTurn
                  ? `当前出牌：轮到你（${activePlayer?.name}）行动！`
                  : `当前出牌：正在等待【${activePlayer?.name}】思考行动…`}
              </span>
            </div>
            <span className="text-[10px] sm:text-[11px] font-medium opacity-90 hidden sm:inline shrink-0">
              {isMyTurn
                ? !activePlayer?.hasInitialMeld
                  ? '首次出牌需满 30 分'
                  : '可自由出牌或重组桌面'
                : '请留意桌面蓝框高亮新牌'}
            </span>
          </div>

          {/* Right Box: WHAT JUST HAPPENED IN THE LAST TURN */}
          <div
            data-testid="action-notice-text"
            className="flex items-center justify-between gap-2 px-2.5 sm:px-3.5 py-1 sm:py-2 rounded-lg sm:rounded-xl bg-black/50 border border-white/15 text-[11px] sm:text-sm text-stone-200"
          >
            <div className="flex items-center gap-1.5 sm:gap-2 truncate">
              <Megaphone className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-sky-400 shrink-0" />
              <span className="font-semibold text-sky-300 shrink-0">最新战况：</span>
              <span className="truncate font-medium text-stone-100">
                {latestLog
                  ? latestLog.action === 'play'
                    ? `【${latestLog.playerName}】${
                        latestLog.brokeIce ? '破冰成功！' : ''
                      }打出了 ${latestLog.tilesPlayedCount} 张牌（${
                        latestLog.pointsPlayed ?? 0
                      } 分）`
                    : latestLog.action === 'draw'
                    ? `【${latestLog.playerName}】未出牌，从牌池摸了 1 张牌`
                    : `【${latestLog.playerName}】选择了跳过回合`
                  : gameState.lastActionNotice ?? '对局刚开始，请出牌或摸牌'}
              </span>
            </div>
          </div>
        </div>
      )}
    </header>
  );
};
