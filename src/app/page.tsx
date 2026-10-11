'use client';

import React, { useEffect } from 'react';
import {
  BookOpen,
  Bot,
  Play,
  RotateCcw,
  Settings,
  ShieldCheck,
  Sparkles,
  Trophy,
  Users,
} from 'lucide-react';
import { Tile } from '@/engine';
import { useGameStore } from '@/store/useGameStore';
import { GameBoard } from '@/components/GameBoard';
import { TileView } from '@/components/TileView';
import {
  MultiplayerLobbyView,
  RulesModal,
  SettingsModal,
} from '@/components/Modals';

const DEMO_GROUP_TILES: Tile[] = [
  { id: 'demo-r7', color: 'red', number: 7, isJoker: false, copy: 1 },
  { id: 'demo-b7', color: 'blue', number: 7, isJoker: false, copy: 1 },
  { id: 'demo-k7', color: 'black', number: 7, isJoker: false, copy: 1 },
];

const DEMO_RUN_TILES: Tile[] = [
  { id: 'demo-u10', color: 'blue', number: 10, isJoker: false, copy: 1 },
  { id: 'demo-u11', color: 'blue', number: 11, isJoker: false, copy: 1 },
  { id: 'demo-joker', color: 'red', number: 13, isJoker: true, copy: 1 },
  { id: 'demo-u13', color: 'blue', number: 13, isJoker: false, copy: 1 },
];

export default function HomePage() {
  const {
    hydrated,
    screen,
    config,
    gameState,
    activeModal,
    mpRoom,
    mpError,
    hydrateFromStorage,
    setScreen,
    setActiveModal,
    updateConfig,
    startNewGame,
    resumeSavedGame,
    createMultiplayerRoom,
    joinMultiplayerRoom,
    startMultiplayerGame,
    refreshMultiplayerRoom,
    leaveMultiplayerRoom,
  } = useGameStore();

  useEffect(() => {
    hydrateFromStorage();
  }, [hydrateFromStorage]);

  // Auto-detect `?room=XXXXXX` invite link on initial mount
  useEffect(() => {
    if (!hydrated || typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const roomParam = params.get('room');
    if (roomParam && roomParam.trim().length >= 4) {
      joinMultiplayerRoom(roomParam.trim().toUpperCase(), '受邀玩家');
    }
  }, [hydrated, joinMultiplayerRoom]);

  // Listen for Cross-Tab BroadcastChannel room updates while in multiplayer waiting lobby
  useEffect(() => {
    if (screen !== 'multiplayer' || !mpRoom) return;

    const handleBroadcast = (event: MessageEvent) => {
      if (
        event.data?.type === 'room_updated' &&
        event.data?.roomCode === mpRoom.roomCode
      ) {
        refreshMultiplayerRoom(mpRoom.roomCode);
      }
    };

    let bc: BroadcastChannel | null = null;
    if (typeof BroadcastChannel !== 'undefined') {
      bc = new BroadcastChannel('atelier_rummikub_mp_channel');
      bc.addEventListener('message', handleBroadcast);
    }

    const timer = window.setInterval(() => {
      refreshMultiplayerRoom(mpRoom.roomCode);
    }, 2000);

    return () => {
      if (bc) {
        bc.removeEventListener('message', handleBroadcast);
        bc.close();
      }
      window.clearInterval(timer);
    };
  }, [screen, mpRoom, refreshMultiplayerRoom]);

  if (screen === 'game' && gameState) {
    return <GameBoard />;
  }

  if (screen === 'multiplayer') {
    return (
      <MultiplayerLobbyView
        mpRoom={mpRoom}
        mpError={mpError}
        onCreateRoom={createMultiplayerRoom}
        onJoinRoom={joinMultiplayerRoom}
        onStartRoomGame={startMultiplayerGame}
        onLeaveRoom={leaveMultiplayerRoom}
      />
    );
  }

  const hasSavedGame = Boolean(gameState && gameState.status === 'playing');

  return (
    <main
      data-testid="home-screen"
      className="min-h-screen w-full bg-[radial-gradient(ellipse_at_top,_#163329_0%,_#0B1814_55%,_#070D0B_100%)] text-stone-100 flex flex-col justify-between p-4 sm:p-8"
    >
      {/* Top Navigation Bar */}
      <nav className="max-w-6xl w-full mx-auto flex items-center justify-between py-2">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#D4AF37] to-[#9A7B1C] text-obsidian flex items-center justify-center font-black text-lg shadow-md">
            R
          </div>
          <div>
            <span className="font-bold tracking-wider text-base sm:text-lg text-stone-100">
              曜石拉密
            </span>
            <span className="hidden sm:inline-block ml-2 text-xs text-[#E6C65A] uppercase tracking-widest">
              Atelier Rummikub
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => setActiveModal('rules')}
            data-testid="btn-home-rules"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs sm:text-sm font-medium text-stone-200 transition-colors"
          >
            <BookOpen className="w-4 h-4 text-[#D4AF37]" />
            <span>规则介绍</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveModal('settings')}
            data-testid="btn-home-settings"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs sm:text-sm font-medium text-stone-200 transition-colors"
          >
            <Settings className="w-4 h-4 text-[#D4AF37]" />
            <span>游戏设置</span>
          </button>
        </div>
      </nav>

      {/* Center Hero & Match Configuration */}
      <div className="max-w-6xl w-full mx-auto my-auto py-8 grid lg:grid-cols-12 gap-8 items-center">
        {/* Left Column: Brand Thesis & Tactile Tile Specimen */}
        <div className="lg:col-span-7 space-y-6">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#D4AF37]/15 border border-[#D4AF37]/30 text-[#E6C65A] text-xs font-semibold">
            <Sparkles className="w-3.5 h-3.5" />
            <span>106 张标准实体牌规则 · 严谨破冰与桌面重组引擎</span>
          </div>

          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black tracking-tight text-stone-100 leading-[1.1]">
            指尖上的数字博弈，
            <span className="block text-transparent bg-clip-text bg-gradient-to-r from-[#E6C65A] via-[#D4AF37] to-[#F3E3A3] mt-1">
              重塑经典拉密桌游体验
            </span>
          </h1>

          <p className="text-sm sm:text-base text-stone-300 max-w-xl leading-relaxed">
            集齐同数异色的<strong>「数字组」</strong>与同色连续的<strong>「顺子」</strong>。在完成首次
            30 分破冰后，自由拆分、挪移与重组桌面上的每一张牌，率先清空手牌架即可获胜。
          </p>

          {/* Interactive Specimen Tray */}
          <div className="p-4 sm:p-5 rounded-3xl bg-[#091410]/90 border border-[#C8A464]/25 shadow-tray space-y-3">
            <div className="flex items-center justify-between text-xs text-stone-400">
              <span>牌组示例预览</span>
              <span className="text-emerald-400 font-semibold">
                ● 支持鼠标拖拽与触屏点击双模式
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-6">
              <div className="space-y-1.5">
                <div className="text-[11px] font-semibold text-emerald-300">
                  数字组（Group · 21分）
                </div>
                <div className="flex items-center gap-1.5">
                  {DEMO_GROUP_TILES.map((t) => (
                    <TileView key={t.id} tile={t} size="sm" disabled />
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="text-[11px] font-semibold text-emerald-300">
                  含 Joker 顺子（Run · 46分）
                </div>
                <div className="flex items-center gap-1.5">
                  {DEMO_RUN_TILES.map((t) => (
                    <TileView
                      key={t.id}
                      tile={t}
                      size="sm"
                      disabled
                      jokerAssignment={
                        t.isJoker
                          ? {
                              tileId: t.id,
                              representedColor: 'blue',
                              representedNumber: 12,
                            }
                          : undefined
                      }
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Feature Highlights */}
          <div className="grid grid-cols-3 gap-3 pt-1">
            <div className="p-3 rounded-2xl bg-black/30 border border-white/10">
              <Bot className="w-4 h-4 text-[#D4AF37] mb-1" />
              <div className="text-xs font-bold text-stone-200">双难度智能 AI</div>
              <div className="text-[11px] text-stone-400">
                支持桌面拆牌重组与公平博弈
              </div>
            </div>
            <div className="p-3 rounded-2xl bg-black/30 border border-white/10">
              <ShieldCheck className="w-4 h-4 text-[#D4AF37] mb-1" />
              <div className="text-xs font-bold text-stone-200">事务级规则校验</div>
              <div className="text-[11px] text-stone-400">
                支持随时撤销、重置与实时计分
              </div>
            </div>
            <div className="p-3 rounded-2xl bg-black/30 border border-white/10">
              <Trophy className="w-4 h-4 text-[#D4AF37] mb-1" />
              <div className="text-xs font-bold text-stone-200">自动本地存档</div>
              <div className="text-[11px] text-stone-400">
                刷新浏览器可无缝恢复未完对局
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Quick Start Card */}
        <div className="lg:col-span-5">
          <div className="p-6 sm:p-7 rounded-3xl bg-[#0D1C17]/95 border border-[#C8A464]/35 shadow-2xl space-y-5">
            <div>
              <h2 className="text-xl font-bold text-stone-100">开始拉密对局</h2>
              <p className="text-xs text-stone-400 mt-0.5">
                选择 AI 对手人数与策略强度，即刻发牌开局
              </p>
            </div>

            {/* Resume Saved Game Banner if present */}
            {hasSavedGame && gameState && (
              <div
                data-testid="saved-game-card"
                className="p-4 rounded-2xl bg-gradient-to-r from-emerald-950/90 to-[#112A22] border border-emerald-500/40 space-y-2.5"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-emerald-300">
                    检测到未结束的本地对局
                  </span>
                  <span className="text-[11px] text-stone-300 tabular-nums">
                    第 {gameState.turnNumber} 回合 · {gameState.players.length} 人局
                  </span>
                </div>
                <button
                  type="button"
                  onClick={resumeSavedGame}
                  data-testid="btn-resume-game"
                  className="w-full py-2.5 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-obsidian font-bold text-sm flex items-center justify-center gap-2 shadow transition-colors"
                >
                  <RotateCcw className="w-4 h-4" />
                  继续上一局游戏
                </button>
              </div>
            )}

            {/* Quick AI Count Selector */}
            <div className="space-y-2">
              <label className="block text-xs font-semibold text-stone-300">
                对局人数设置
              </label>
              <div className="grid grid-cols-3 gap-2">
                {([1, 2, 3] as const).map((cnt) => (
                  <button
                    key={cnt}
                    type="button"
                    data-testid={`home-ai-count-${cnt}`}
                    onClick={() => updateConfig({ aiCount: cnt })}
                    className={[
                      'py-2.5 px-2 rounded-xl border text-xs font-bold transition-all',
                      config.aiCount === cnt
                        ? 'bg-[#D4AF37] text-obsidian border-[#D4AF37] shadow'
                        : 'bg-black/40 text-stone-300 border-white/10 hover:border-white/25',
                    ].join(' ')}
                  >
                    {cnt + 1} 人局（{cnt} AI）
                  </button>
                ))}
              </div>
            </div>

            {/* Quick AI Difficulty Selector */}
            <div className="space-y-2">
              <label className="block text-xs font-semibold text-stone-300">
                AI 难度等级
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  data-testid="home-difficulty-easy"
                  onClick={() => updateConfig({ aiDifficulty: 'easy' })}
                  className={[
                    'py-2.5 px-3 rounded-xl border text-xs font-bold transition-all',
                    config.aiDifficulty === 'easy'
                      ? 'bg-[#D4AF37] text-obsidian border-[#D4AF37]'
                      : 'bg-black/40 text-stone-300 border-white/10 hover:border-white/25',
                  ].join(' ')}
                >
                  简单 · 休闲模式
                </button>
                <button
                  type="button"
                  data-testid="home-difficulty-hard"
                  onClick={() => updateConfig({ aiDifficulty: 'hard' })}
                  className={[
                    'py-2.5 px-3 rounded-xl border text-xs font-bold transition-all',
                    config.aiDifficulty === 'hard'
                      ? 'bg-[#D4AF37] text-obsidian border-[#D4AF37]'
                      : 'bg-black/40 text-stone-300 border-white/10 hover:border-white/25',
                  ].join(' ')}
                >
                  困难 · 宗师博弈
                </button>
              </div>
            </div>

            {/* Start New Single-Player Game Button */}
            <button
              type="button"
              onClick={() => startNewGame()}
              data-testid="btn-start-game"
              className="w-full py-3.5 px-6 rounded-2xl bg-gradient-to-r from-[#D4AF37] to-[#E6C65A] hover:brightness-110 text-obsidian font-black text-base flex items-center justify-center gap-2 shadow-xl transition-all"
            >
              <Play className="w-5 h-5 fill-current" />
              开始新对局
            </button>

            {/* Online Multiplayer Room Entry */}
            <div className="pt-2 border-t border-white/10">
              <button
                type="button"
                onClick={() => setScreen('multiplayer')}
                data-testid="btn-open-multiplayer"
                className="w-full py-2.5 px-4 rounded-xl bg-white/5 hover:bg-white/10 border border-white/15 text-stone-200 font-semibold text-xs sm:text-sm flex items-center justify-center gap-2 transition-colors"
              >
                <Users className="w-4 h-4 text-[#D4AF37]" />
                在线多人房间对战（邀请码 / 链接联机）
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="max-w-6xl w-full mx-auto pt-4 border-t border-white/10 flex flex-wrap items-center justify-between gap-2 text-xs text-stone-400">
        <span>曜石拉密 Atelier Rummikub · 标准 106 张牌规则引擎</span>
        <span>支持桌面拖拽与移动端点击选牌双模操作</span>
      </footer>

      {/* Modals on Home Screen */}
      {activeModal === 'rules' && (
        <RulesModal onClose={() => setActiveModal('none')} />
      )}
      {activeModal === 'settings' && (
        <SettingsModal
          config={config}
          onUpdateConfig={updateConfig}
          onStartNewWithConfig={(partial) => startNewGame(partial)}
          onClose={() => setActiveModal('none')}
        />
      )}
    </main>
  );
}
