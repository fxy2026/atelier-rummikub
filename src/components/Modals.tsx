'use client';

import React, { useEffect, useState } from 'react';
import confetti from 'canvas-confetti';
import {
  BookOpen,
  Check,
  Copy,
  Crown,
  Play,
  RefreshCw,
  Settings,
  Sparkles,
  Trophy,
  Users,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import {
  AIDifficulty,
  calculateHandPenalty,
  GameConfig,
  GameState,
} from '@/engine';
import { SanitizedRoomView } from '@/lib/multiplayer';
import { TileView } from './TileView';

interface RulesModalProps {
  onClose: () => void;
}

export const RulesModal: React.FC<RulesModalProps> = ({ onClose }) => {
  return (
    <div
      className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4"
      data-testid="modal-rules"
    >
      <div className="w-full max-w-2xl max-h-[85vh] bg-[#0F1B17] border border-[#C8A464]/35 rounded-3xl shadow-2xl flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-black/30">
          <div className="flex items-center gap-2.5">
            <BookOpen className="w-5 h-5 text-[#D4AF37]" />
            <h2 className="text-lg font-bold text-stone-100">
              拉密（Rummikub）标准规则指南
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            data-testid="btn-close-rules"
            className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-stone-300"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto space-y-5 text-sm text-stone-300 leading-relaxed">
          <section className="space-y-1.5">
            <h3 className="text-base font-bold text-[#E6C65A]">1. 牌组构成（106 张）</h3>
            <p>
              标准拉密牌组共 <strong>106 张牌</strong>：包含红、蓝、黄、黑四种颜色，每种颜色数字
              1–13 各两张（共 104 张数字牌），外加 <strong>2 张 Joker（万能牌）</strong>。开局每位玩家摸取
              14 张牌。
            </p>
          </section>

          <section className="space-y-2">
            <h3 className="text-base font-bold text-[#E6C65A]">2. 合法牌组类型</h3>
            <div className="grid sm:grid-cols-2 gap-3">
              <div className="p-3.5 rounded-2xl bg-black/35 border border-white/10">
                <div className="font-bold text-stone-100 mb-1">
                  数字组（Group · 同数异色）
                </div>
                <p className="text-xs text-stone-400">
                  由 <strong>3 张或 4 张</strong> 数字相同、但<strong>颜色互不相同</strong>的牌组成。
                  例如：红7 + 蓝7 + 黑7（合法）；红7 + 红7 + 蓝7（非法，颜色重复）。
                </p>
              </div>
              <div className="p-3.5 rounded-2xl bg-black/35 border border-white/10">
                <div className="font-bold text-stone-100 mb-1">
                  顺子（Run · 同色连续）
                </div>
                <p className="text-xs text-stone-400">
                  由 <strong>至少 3 张</strong> 颜色相同、且<strong>数字连续递增</strong>的牌组成。
                  例如：蓝9 + 蓝10 + 蓝11。注意：13 与 1 不能循环相连。
                </p>
              </div>
            </div>
          </section>

          <section className="space-y-1.5">
            <h3 className="text-base font-bold text-[#E6C65A]">
              3. 首次出牌（破冰 · 30 分规则）
            </h3>
            <p>
              每位玩家在本局的第一次出牌称为<strong>「破冰」</strong>：必须完全使用自己手牌中的牌组成一个或多个合法牌组，且打出牌组的<strong>总点数之和至少达到 30 分</strong>（Joker 按其所替代的牌面数字计分）。破冰前不能使用或拆分桌面已有的牌组。
            </p>
          </section>

          <section className="space-y-1.5">
            <h3 className="text-base font-bold text-[#E6C65A]">
              4. 后续回合与桌面重组
            </h3>
            <p>
              完成破冰后，你在回合内可以自由向桌面已有牌组加牌、将长牌组拆开、从 4 张数字组中借牌，或重新组合整个桌面的牌。<strong>关键约束：</strong>每次点击「出牌提交」时，自己本回合必须至少打出一张手牌，且桌面上所有牌都必须处于合法牌组中，不能把桌面原有的牌收回手牌。
            </p>
          </section>

          <section className="space-y-1.5">
            <h3 className="text-base font-bold text-[#E6C65A]">5. Joker 万能牌与终局结算</h3>
            <p>
              Joker 可替代任意颜色与数字。若你用真牌替换了桌面上的 Joker，该 Joker <strong>必须在同一回合用于桌面上的合法牌组，严禁收回手牌</strong>。当任意玩家打空手牌时立即获胜；其余玩家按剩余手牌点数扣分（Joker 在手中未打出罚 <strong>30 分</strong>），胜者获得所有败者扣分之和。
            </p>
          </section>
        </div>

        <div className="px-6 py-4 border-t border-white/10 bg-black/30 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-[#D4AF37] hover:bg-[#E6C65A] text-obsidian font-bold text-sm"
          >
            我已了解
          </button>
        </div>
      </div>
    </div>
  );
};

interface SettingsModalProps {
  config: GameConfig;
  onUpdateConfig: (partial: Partial<GameConfig>) => void;
  onStartNewWithConfig: (partial: Partial<GameConfig>) => void;
  onClose: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  config,
  onUpdateConfig,
  onStartNewWithConfig,
  onClose,
}) => {
  const [aiCount, setAiCount] = useState<1 | 2 | 3>(config.aiCount);
  const [aiDifficulty, setAiDifficulty] = useState<AIDifficulty>(config.aiDifficulty);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(config.soundEnabled);
  const [autoSortRack, setAutoSortRack] = useState<'color' | 'number' | 'manual'>(
    config.autoSortRack
  );

  const handleSaveOnly = () => {
    onUpdateConfig({ aiCount, aiDifficulty, soundEnabled, autoSortRack });
    onClose();
  };

  const handleApplyAndRestart = () => {
    onStartNewWithConfig({ aiCount, aiDifficulty, soundEnabled, autoSortRack });
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4"
      data-testid="modal-settings"
    >
      <div className="w-full max-w-lg bg-[#0F1B17] border border-[#C8A464]/35 rounded-3xl shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-black/30">
          <div className="flex items-center gap-2.5">
            <Settings className="w-5 h-5 text-[#D4AF37]" />
            <h2 className="text-lg font-bold text-stone-100">对局设置与偏好</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            data-testid="btn-close-settings"
            className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-stone-300"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5 text-sm">
          {/* AI Count */}
          <div className="space-y-2">
            <label className="block font-semibold text-stone-200">
              AI 对手数量（总人数 {1 + aiCount} 人）
            </label>
            <div className="grid grid-cols-3 gap-2.5">
              {([1, 2, 3] as const).map((cnt) => (
                <button
                  key={cnt}
                  type="button"
                  data-testid={`setting-ai-count-${cnt}`}
                  onClick={() => setAiCount(cnt)}
                  className={[
                    'py-2.5 px-3 rounded-xl border font-semibold transition-all',
                    aiCount === cnt
                      ? 'bg-[#D4AF37] text-obsidian border-[#D4AF37]'
                      : 'bg-black/35 text-stone-300 border-white/10 hover:border-white/25',
                  ].join(' ')}
                >
                  {cnt} 名 AI（{cnt + 1}人局）
                </button>
              ))}
            </div>
          </div>

          {/* AI Difficulty */}
          <div className="space-y-2">
            <label className="block font-semibold text-stone-200">AI 策略难度</label>
            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                data-testid="setting-difficulty-easy"
                onClick={() => setAiDifficulty('easy')}
                className={[
                  'p-3 rounded-xl border text-left transition-all',
                  aiDifficulty === 'easy'
                    ? 'bg-[#D4AF37]/20 border-[#D4AF37] text-stone-100'
                    : 'bg-black/35 border-white/10 text-stone-300',
                ].join(' ')}
              >
                <div className="font-bold text-[#E6C65A]">简单（休闲学者）</div>
                <div className="text-xs text-stone-400 mt-0.5">
                  专注基础手牌组合与简单加牌，适合熟悉规则
                </div>
              </button>

              <button
                type="button"
                data-testid="setting-difficulty-hard"
                onClick={() => setAiDifficulty('hard')}
                className={[
                  'p-3 rounded-xl border text-left transition-all',
                  aiDifficulty === 'hard'
                    ? 'bg-[#D4AF37]/20 border-[#D4AF37] text-stone-100'
                    : 'bg-black/35 border-white/10 text-stone-300',
                ].join(' ')}
              >
                <div className="font-bold text-[#E6C65A]">困难（曜石宗师）</div>
                <div className="text-xs text-stone-400 mt-0.5">
                  深度组合搜索、桌面拆牌借牌与 Joker 替换博弈
                </div>
              </button>
            </div>
          </div>

          {/* Default Rack Sort */}
          <div className="space-y-2">
            <label className="block font-semibold text-stone-200">手牌架默认排序</label>
            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => setAutoSortRack('color')}
                className={[
                  'py-2 px-3 rounded-xl border font-medium transition-all',
                  autoSortRack === 'color'
                    ? 'bg-[#D4AF37] text-obsidian border-[#D4AF37] font-bold'
                    : 'bg-black/35 text-stone-300 border-white/10',
                ].join(' ')}
              >
                按颜色分组排序
              </button>
              <button
                type="button"
                onClick={() => setAutoSortRack('number')}
                className={[
                  'py-2 px-3 rounded-xl border font-medium transition-all',
                  autoSortRack === 'number'
                    ? 'bg-[#D4AF37] text-obsidian border-[#D4AF37] font-bold'
                    : 'bg-black/35 text-stone-300 border-white/10',
                ].join(' ')}
              >
                按数字大小排序
              </button>
            </div>
          </div>

          {/* Sound Toggle */}
          <div className="flex items-center justify-between p-3.5 rounded-2xl bg-black/35 border border-white/10">
            <div className="flex items-center gap-2.5">
              {soundEnabled ? (
                <Volume2 className="w-5 h-5 text-[#D4AF37]" />
              ) : (
                <VolumeX className="w-5 h-5 text-stone-400" />
              )}
              <div>
                <div className="font-semibold text-stone-200">桌面实体牌音效</div>
                <div className="text-xs text-stone-400">
                  使用 Web Audio 合成清脆落牌与破冰提示音
                </div>
              </div>
            </div>
            <button
              type="button"
              data-testid="setting-sound-toggle"
              onClick={() => setSoundEnabled(!soundEnabled)}
              className={[
                'px-3.5 py-1.5 rounded-xl font-bold text-xs transition-colors',
                soundEnabled
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                  : 'bg-stone-800 text-stone-400 border border-stone-700',
              ].join(' ')}
            >
              {soundEnabled ? '已开启' : '已静音'}
            </button>
          </div>
        </div>

        <div className="px-6 py-4 border-t border-white/10 bg-black/30 flex flex-wrap items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={handleSaveOnly}
            data-testid="btn-save-settings"
            className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-stone-200 font-semibold text-sm"
          >
            保存偏好
          </button>
          <button
            type="button"
            onClick={handleApplyAndRestart}
            data-testid="btn-apply-restart-game"
            className="inline-flex items-center gap-1.5 px-5 py-2 rounded-xl bg-[#D4AF37] hover:bg-[#E6C65A] text-obsidian font-bold text-sm"
          >
            <RefreshCw className="w-4 h-4" />
            按此配置开启新对局
          </button>
        </div>
      </div>
    </div>
  );
};

interface SettlementModalProps {
  gameState: GameState;
  onPlayAgain: () => void;
  onGoHome: () => void;
}

export const SettlementModal: React.FC<SettlementModalProps> = ({
  gameState,
  onPlayAgain,
  onGoHome,
}) => {
  useEffect(() => {
    try {
      confetti({
        particleCount: 70,
        spread: 65,
        origin: { y: 0.6 },
      });
    } catch {}
  }, []);

  const winner = gameState.players.find((p) => p.id === gameState.winnerId);
  const sortedPlayers = [...gameState.players].sort((a, b) => b.score - a.score);
  const tableTileCount = gameState.table.reduce((sum, m) => sum + m.tiles.length, 0);

  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4"
      data-testid="modal-settlement"
    >
      <div className="w-full max-w-2xl max-h-[90vh] bg-[#0F1B17] border border-[#D4AF37]/50 rounded-3xl shadow-2xl flex flex-col overflow-hidden">
        {/* Victory Header */}
        <div className="px-6 py-6 bg-gradient-to-b from-[#D4AF37]/20 to-transparent border-b border-white/10 text-center">
          <div className="w-14 h-14 rounded-2xl bg-[#D4AF37] text-obsidian flex items-center justify-center mx-auto mb-3 shadow-lg">
            <Trophy className="w-8 h-8" />
          </div>
          <h2
            data-testid="settlement-winner-title"
            className="text-2xl font-black text-stone-100"
          >
            {winner?.name ?? '玩家'} 赢得对局胜利！
          </h2>
          <p className="text-xs sm:text-sm text-[#E6C65A] mt-1 font-medium">
            {gameState.endReason === 'empty_hand'
              ? '成功打空全部手牌，完美收官！'
              : '公共牌池已摸空且全员跳过，凭最低剩余手牌点数取胜！'}
          </p>

          {/* Match Summary Pills */}
          <div className="flex flex-wrap items-center justify-center gap-3 mt-4 text-xs text-stone-300">
            <span className="px-3 py-1 rounded-full bg-black/40 border border-white/10">
              总回合数：<strong className="text-white">{gameState.turnNumber}</strong>
            </span>
            <span className="px-3 py-1 rounded-full bg-black/40 border border-white/10">
              桌面牌组：<strong className="text-white">{gameState.table.length} 组（{tableTileCount} 张）</strong>
            </span>
            <span className="px-3 py-1 rounded-full bg-black/40 border border-white/10">
              剩余牌池：<strong className="text-white">{gameState.pool.length} 张</strong>
            </span>
          </div>
        </div>

        {/* Player Standings & Remaining Tiles */}
        <div className="p-6 overflow-y-auto space-y-3">
          {sortedPlayers.map((player, rankIdx) => {
            const isWinner = player.id === gameState.winnerId;
            const penalty = calculateHandPenalty(player.hand);

            return (
              <div
                key={player.id}
                data-testid={`settlement-player-row-${rankIdx}`}
                className={[
                  'p-4 rounded-2xl border flex flex-col gap-2.5',
                  isWinner
                    ? 'bg-[#D4AF37]/15 border-[#D4AF37]'
                    : 'bg-black/35 border-white/10',
                ].join(' ')}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <span
                      className={[
                        'w-6 h-6 rounded-full text-xs font-black flex items-center justify-center',
                        isWinner
                          ? 'bg-[#D4AF37] text-obsidian'
                          : 'bg-white/10 text-stone-300',
                      ].join(' ')}
                    >
                      {isWinner ? <Crown className="w-3.5 h-3.5" /> : rankIdx + 1}
                    </span>
                    <span className="font-bold text-stone-100 text-base">
                      {player.name}
                    </span>
                    {isWinner && (
                      <span className="text-xs px-2 py-0.5 rounded bg-[#D4AF37] text-obsidian font-bold">
                        本局胜者
                      </span>
                    )}
                  </div>

                  <div className="text-right">
                    <span
                      data-testid={`settlement-score-${player.id}`}
                      className={[
                        'text-lg font-black tabular-nums',
                        player.score >= 0 ? 'text-emerald-400' : 'text-rose-400',
                      ].join(' ')}
                    >
                      {player.score > 0 ? `+${player.score}` : player.score} 分
                    </span>
                    <div className="text-[11px] text-stone-400">
                      剩余 {player.hand.length} 张牌（罚点 {penalty}）
                    </div>
                  </div>
                </div>

                {/* Remaining Hand Tiles Display */}
                {player.hand.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {player.hand.map((tile) => (
                      <TileView key={tile.id} tile={tile} size="sm" disabled />
                    ))}
                  </div>
                ) : (
                  <div className="text-xs text-emerald-300 font-medium flex items-center gap-1">
                    <Sparkles className="w-3.5 h-3.5" />
                    手牌已全部清空（0 罚点）
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 border-t border-white/10 bg-black/40 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onGoHome}
            data-testid="btn-settlement-home"
            className="px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 text-stone-200 font-semibold text-sm"
          >
            返回主页
          </button>
          <button
            type="button"
            onClick={onPlayAgain}
            data-testid="btn-settlement-play-again"
            className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-[#D4AF37] hover:bg-[#E6C65A] text-obsidian font-bold text-sm shadow-lg"
          >
            <Play className="w-4 h-4 fill-current" />
            再来一局
          </button>
        </div>
      </div>
    </div>
  );
};

interface MultiplayerLobbyViewProps {
  mpRoom: SanitizedRoomView | null;
  mpError: string | null;
  onCreateRoom: (playerName: string, maxPlayers: 2 | 3 | 4) => Promise<string | null>;
  onJoinRoom: (roomCode: string, playerName: string) => Promise<boolean>;
  onStartRoomGame: () => Promise<void>;
  onLeaveRoom: () => void;
}

export const MultiplayerLobbyView: React.FC<MultiplayerLobbyViewProps> = ({
  mpRoom,
  mpError,
  onCreateRoom,
  onJoinRoom,
  onStartRoomGame,
  onLeaveRoom,
}) => {
  const [playerName, setPlayerName] = useState('旅行者');
  const [joinCode, setJoinCode] = useState('');
  const [maxPlayers, setMaxPlayers] = useState<2 | 3 | 4>(2);
  const [copied, setCopied] = useState(false);

  const shareUrl =
    typeof window !== 'undefined' && mpRoom
      ? `${window.location.origin}${window.location.pathname}?room=${mpRoom.roomCode}`
      : '';

  const handleCopyInvite = () => {
    if (!shareUrl) return;
    navigator.clipboard?.writeText(shareUrl).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      className="min-h-screen w-full bg-[#08120F] text-stone-100 flex items-center justify-center p-4"
      data-testid="multiplayer-lobby"
    >
      <div className="w-full max-w-xl bg-[#0F1E19] border border-[#C8A464]/35 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-6">
        <div className="flex items-center justify-between border-b border-white/10 pb-4">
          <div className="flex items-center gap-2.5">
            <Users className="w-6 h-6 text-[#D4AF37]" />
            <div>
              <h1 className="text-xl font-bold">在线多人房间对战</h1>
              <p className="text-xs text-stone-400">
                服务端权威规则判定 · 隐藏其他玩家手牌 · 支持断线重连
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onLeaveRoom}
            data-testid="btn-leave-mp"
            className="px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-xs text-stone-300"
          >
            返回大厅
          </button>
        </div>

        {mpError && (
          <div className="p-3 rounded-xl bg-red-950/80 border border-red-500/50 text-xs text-red-200">
            {mpError}
          </div>
        )}

        {!mpRoom ? (
          <div className="space-y-6">
            <div>
              <label className="block text-xs font-semibold text-stone-300 mb-1.5">
                你的玩家昵称
              </label>
              <input
                type="text"
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
                data-testid="input-mp-name"
                className="w-full px-3.5 py-2.5 rounded-xl bg-black/40 border border-white/15 text-stone-100 text-sm focus:outline-none focus:border-[#D4AF37]"
                placeholder="输入昵称"
              />
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              {/* Create Room Box */}
              <div className="p-4 rounded-2xl bg-black/30 border border-white/10 space-y-3">
                <h2 className="font-bold text-[#E6C65A] text-sm">创建新房间</h2>
                <div className="flex items-center gap-1.5">
                  {([2, 3, 4] as const).map((cnt) => (
                    <button
                      key={cnt}
                      type="button"
                      onClick={() => setMaxPlayers(cnt)}
                      className={[
                        'flex-1 py-1.5 rounded-lg text-xs font-semibold border',
                        maxPlayers === cnt
                          ? 'bg-[#D4AF37] text-obsidian border-[#D4AF37]'
                          : 'bg-black/40 text-stone-300 border-white/10',
                      ].join(' ')}
                    >
                      {cnt}人房
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  data-testid="btn-create-room"
                  onClick={() => onCreateRoom(playerName, maxPlayers)}
                  className="w-full py-2.5 rounded-xl bg-[#D4AF37] hover:bg-[#E6C65A] text-obsidian font-bold text-sm"
                >
                  立即创建房间
                </button>
              </div>

              {/* Join Room Box */}
              <div className="p-4 rounded-2xl bg-black/30 border border-white/10 space-y-3">
                <h2 className="font-bold text-[#E6C65A] text-sm">通过邀请码加入</h2>
                <input
                  type="text"
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                  data-testid="input-join-code"
                  placeholder="输入 6 位房间码"
                  maxLength={6}
                  className="w-full px-3 py-2 rounded-xl bg-black/50 border border-white/15 text-stone-100 text-sm uppercase tracking-widest font-mono"
                />
                <button
                  type="button"
                  data-testid="btn-join-room"
                  onClick={() => onJoinRoom(joinCode, playerName)}
                  disabled={joinCode.trim().length < 4}
                  className="w-full py-2.5 rounded-xl bg-stone-800 hover:bg-stone-700 disabled:opacity-40 text-stone-100 border border-stone-600 font-bold text-sm"
                >
                  加入房间
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-5">
            <div className="p-4 rounded-2xl bg-black/40 border border-[#D4AF37]/40 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div>
                <div className="text-xs text-stone-400">当前房间邀请码</div>
                <div
                  data-testid="mp-room-code"
                  className="text-2xl font-black tracking-widest font-mono text-[#E6C65A]"
                >
                  {mpRoom.roomCode}
                </div>
                <div className="text-[11px] text-stone-400 mt-0.5">
                  通道模式：
                  {mpRoom.transportMode === 'supabase-cloud'
                    ? 'Supabase 云端实时同步'
                    : '同机多窗口 BroadcastChannel 实时同步'}
                </div>
              </div>

              <button
                type="button"
                onClick={handleCopyInvite}
                data-testid="btn-copy-invite"
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-xs font-semibold text-stone-100"
              >
                {copied ? (
                  <>
                    <Check className="w-4 h-4 text-emerald-400" />
                    已复制邀请链接
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4 text-[#D4AF37]" />
                    复制房间分享链接
                  </>
                )}
              </button>
            </div>

            {/* Seats List */}
            <div className="space-y-2">
              <div className="text-xs font-semibold text-stone-300">
                房间座位（{mpRoom.seats.length} / {mpRoom.maxPlayers}，空缺座位开局自动由 AI 补位）
              </div>
              <div className="grid grid-cols-2 gap-2.5">
                {Array.from({ length: mpRoom.maxPlayers }, (_, idx) => {
                  const seat = mpRoom.seats[idx];
                  return (
                    <div
                      key={idx}
                      className="p-3 rounded-xl bg-black/30 border border-white/10 flex items-center gap-2.5"
                    >
                      <div className="w-8 h-8 rounded-lg bg-[#D4AF37]/20 text-[#E6C65A] flex items-center justify-center font-bold text-xs">
                        #{idx + 1}
                      </div>
                      <div>
                        <div className="text-sm font-bold text-stone-100">
                          {seat ? seat.playerName : '等待玩家加入 / AI 补位'}
                        </div>
                        <div className="text-[11px] text-stone-400">
                          {seat
                            ? seat.playerId === mpRoom.myPlayerId
                              ? '● 你自己（已就绪）'
                              : '● 在线玩家'
                            : '空位'}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {mpRoom.myPlayerId === mpRoom.hostPlayerId ? (
              <button
                type="button"
                data-testid="btn-mp-start-game"
                onClick={onStartRoomGame}
                className="w-full py-3 rounded-xl bg-[#D4AF37] hover:bg-[#E6C65A] text-obsidian font-bold text-sm shadow-lg"
              >
                开始多人对局（空位由 AI 自动补齐）
              </button>
            ) : (
              <div className="text-center py-3 text-xs text-[#E6C65A]">
                等待房主开始对局…
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
