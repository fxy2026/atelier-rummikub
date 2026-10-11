'use client';

export interface CareerStats {
  gamesPlayed: number;
  wins: number;
  totalScore: number;
  bestGameScore: number;
  bestTurnScore: number;
  totalTilesPlayed: number;
  icebreakersCount: number;
}

const STATS_STORAGE_KEY = 'atelier_rummikub_stats_v1';

export const DEFAULT_CAREER_STATS: CareerStats = {
  gamesPlayed: 0,
  wins: 0,
  totalScore: 0,
  bestGameScore: 0,
  bestTurnScore: 0,
  totalTilesPlayed: 0,
  icebreakersCount: 0,
};

export function loadCareerStats(): CareerStats {
  if (typeof window === 'undefined') return DEFAULT_CAREER_STATS;
  try {
    const raw = window.localStorage.getItem(STATS_STORAGE_KEY);
    if (!raw) return DEFAULT_CAREER_STATS;
    const parsed = JSON.parse(raw);
    return {
      ...DEFAULT_CAREER_STATS,
      ...parsed,
    };
  } catch {
    return DEFAULT_CAREER_STATS;
  }
}

export function saveCareerStats(stats: CareerStats): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STATS_STORAGE_KEY, JSON.stringify(stats));
  } catch {}
}

export function recordTurnPlayStats(params: {
  tilesPlayedCount: number;
  pointsPlayed: number;
  brokeIce: boolean;
}): CareerStats {
  const current = loadCareerStats();
  const next: CareerStats = {
    ...current,
    totalTilesPlayed: current.totalTilesPlayed + Math.max(0, params.tilesPlayedCount),
    bestTurnScore: Math.max(current.bestTurnScore, params.pointsPlayed || 0),
    icebreakersCount: current.icebreakersCount + (params.brokeIce ? 1 : 0),
  };
  saveCareerStats(next);
  return next;
}

export function recordGameEndStats(params: {
  won: boolean;
  finalScore: number;
}): CareerStats {
  const current = loadCareerStats();
  const next: CareerStats = {
    ...current,
    gamesPlayed: current.gamesPlayed + 1,
    wins: current.wins + (params.won ? 1 : 0),
    totalScore: current.totalScore + params.finalScore,
    bestGameScore: Math.max(current.bestGameScore, params.finalScore),
  };
  saveCareerStats(next);
  return next;
}
