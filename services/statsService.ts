import { UserStats, DailyProgress, WordEntry } from '../types';
import { srsService, todayStr, daysFromToday } from './srsService';
import { supabase } from './supabaseClient';

const STATS_KEY = 'lexiai_stats_v1';

export type ActivityEvent = 'review' | 'practice' | 'practiceHigh' | 'save' | 'podcast' | 'speaking' | 'game';

const XP_VALUES: Record<ActivityEvent, number> = {
  review: 5,
  practice: 5,
  practiceHigh: 15, // practice score >= 80 (replaces the base 'practice' XP)
  save: 5,
  podcast: 10,
  speaking: 20,
  game: 20, // winning a synonym match round
};

export interface QuestDef {
  id: string;
  label: string;
  target: number;
  metric: keyof Pick<DailyProgress, 'reviews' | 'practices' | 'savedWords' | 'podcasts' | 'speaking'>;
  bonusXp: number;
}

export const DAILY_QUESTS: QuestDef[] = [
  { id: 'review_10', label: 'Review 10 flashcards', target: 10, metric: 'reviews', bonusXp: 30 },
  { id: 'practice_2', label: 'Write 2 practice sentences', target: 2, metric: 'practices', bonusXp: 30 },
  { id: 'save_1', label: 'Save 1 new word', target: 1, metric: 'savedWords', bonusXp: 15 },
  { id: 'podcast_1', label: 'Generate 1 podcast dialogue', target: 1, metric: 'podcasts', bonusXp: 20 },
];

export interface AchievementDef {
  id: string;
  label: string;
  description: string;
  icon: string;
  check: (stats: UserStats, words: WordEntry[]) => boolean;
}

export const ACHIEVEMENTS: AchievementDef[] = [
  { id: 'words_100', label: 'Century Collector', description: 'Save 100 words', icon: '💯', check: (_s, w) => w.length >= 100 },
  { id: 'words_365', label: 'Word a Day', description: 'Save 365 words', icon: '📅', check: (_s, w) => w.length >= 365 },
  { id: 'first_mastered', label: 'First Light', description: 'Bring a word to Can Write', icon: '✨', check: (_s, w) => w.some(e => srsService.masteryLevel(e) >= 3) },
  { id: 'ten_mastered', label: 'Wordsmith', description: 'Bring 10 words to Can Write', icon: '🔨', check: (_s, w) => w.filter(e => srsService.masteryLevel(e) >= 3).length >= 10 },
  { id: 'streak_7', label: 'One Week Flame', description: '7-day streak', icon: '🔥', check: s => s.streakBest >= 7 },
  { id: 'streak_30', label: 'Monthly Devotion', description: '30-day streak', icon: '🌋', check: s => s.streakBest >= 30 },
  { id: 'reviews_100', label: 'Repetition Ritual', description: '100 total reviews', icon: '🔁', check: s => s.totals.reviews >= 100 },
  { id: 'xp_1000', label: 'Rising Scholar', description: 'Earn 1000 XP', icon: '🎓', check: s => s.xp >= 1000 },
];

export const LEVEL_TITLES: [number, string][] = [
  [0, 'Novice'],
  [3, 'Apprentice'],
  [6, 'Wordsmith'],
  [10, 'Lexicographer'],
  [15, 'Lexicon Master'],
];

export const levelForXp = (xp: number): number => Math.floor(Math.sqrt(xp / 100)) + 1;
export const xpForLevel = (level: number): number => Math.pow(level - 1, 2) * 100;
export const titleForLevel = (level: number): string => {
  let title = LEVEL_TITLES[0][1];
  for (const [minLevel, t] of LEVEL_TITLES) {
    if (level >= minLevel) title = t;
  }
  return title;
};

const emptyDaily = (): DailyProgress => ({
  date: todayStr(),
  reviews: 0,
  practices: 0,
  savedWords: 0,
  podcasts: 0,
  speaking: 0,
  completedQuests: [],
});

const defaultStats = (): UserStats => ({
  xp: 0,
  streakCurrent: 0,
  streakBest: 0,
  lastActiveDate: '',
  achievements: {},
  totals: { reviews: 0, practices: 0, podcasts: 0, speaking: 0 },
  daily: emptyDaily(),
});

type Listener = (stats: UserStats) => void;
const listeners = new Set<Listener>();
let cloudPushTimer: ReturnType<typeof setTimeout> | null = null;
let currentUserId: string | null = null;

const load = (): UserStats => {
  try {
    const raw = localStorage.getItem(STATS_KEY);
    const stats: UserStats = raw ? { ...defaultStats(), ...JSON.parse(raw) } : defaultStats();
    if (stats.daily.date !== todayStr()) stats.daily = emptyDaily();
    return stats;
  } catch {
    return defaultStats();
  }
};

const persist = (stats: UserStats) => {
  localStorage.setItem(STATS_KEY, JSON.stringify(stats));
  listeners.forEach(l => l(stats));
  if (currentUserId && supabase) {
    if (cloudPushTimer) clearTimeout(cloudPushTimer);
    cloudPushTimer = setTimeout(async () => {
      try {
        await supabase!.from('user_stats').upsert({
          user_id: currentUserId,
          data: stats,
          updated_at: new Date().toISOString(),
        });
      } catch (e) {
        console.warn('[STATS] cloud push deferred', e);
      }
    }, 2000);
  }
};

const touchStreak = (stats: UserStats) => {
  const today = todayStr();
  if (stats.lastActiveDate === today) return;
  const yStr = daysFromToday(-1);
  stats.streakCurrent = stats.lastActiveDate === yStr ? stats.streakCurrent + 1 : 1;
  stats.streakBest = Math.max(stats.streakBest, stats.streakCurrent);
  stats.lastActiveDate = today;
};

export const statsService = {
  get: (): UserStats => load(),

  subscribe: (fn: Listener): (() => void) => {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },

  setUser: (userId: string | null) => {
    currentUserId = userId;
  },

  /**
   * Merge cloud stats on login: whichever side has more XP wins wholesale,
   * then the result is pushed back up. Good enough for a single-owner app.
   */
  syncWithCloud: async (userId: string) => {
    if (!supabase) return;
    currentUserId = userId;
    try {
      const { data, error } = await supabase
        .from('user_stats')
        .select('data')
        .eq('user_id', userId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      const local = load();
      const remote: UserStats | null = data?.data ? { ...defaultStats(), ...data.data } : null;
      const winner = remote && remote.xp > local.xp ? remote : local;
      if (winner.daily.date !== todayStr()) winner.daily = emptyDaily();
      persist(winner);
    } catch (e) {
      console.warn('[STATS] cloud sync failed', e);
    }
  },

  /**
   * Record an activity. Updates XP, streak, daily quest progress and
   * achievements. Returns what changed so the UI can celebrate.
   */
  record: (event: ActivityEvent, words: WordEntry[]): { xpGained: number; questsCompleted: QuestDef[]; newAchievements: AchievementDef[] } => {
    const stats = load();
    let xpGained = XP_VALUES[event];

    const metricByEvent: Record<ActivityEvent, keyof DailyProgress | null> = {
      review: 'reviews',
      practice: 'practices',
      practiceHigh: 'practices',
      save: 'savedWords',
      podcast: 'podcasts',
      speaking: 'speaking',
      game: null,
    };
    const metric = metricByEvent[event];
    if (metric) (stats.daily as any)[metric] += 1;

    const totalsByEvent: Partial<Record<ActivityEvent, keyof UserStats['totals']>> = {
      review: 'reviews',
      practice: 'practices',
      practiceHigh: 'practices',
      podcast: 'podcasts',
      speaking: 'speaking',
    };
    const totalKey = totalsByEvent[event];
    if (totalKey) stats.totals[totalKey] += 1;

    touchStreak(stats);

    // Quest completion (auto-claim)
    const questsCompleted: QuestDef[] = [];
    for (const quest of DAILY_QUESTS) {
      if (stats.daily.completedQuests.includes(quest.id)) continue;
      if ((stats.daily[quest.metric] as number) >= quest.target) {
        stats.daily.completedQuests.push(quest.id);
        xpGained += quest.bonusXp;
        questsCompleted.push(quest);
      }
    }

    stats.xp += xpGained;

    // Achievements
    const newAchievements: AchievementDef[] = [];
    for (const a of ACHIEVEMENTS) {
      if (!stats.achievements[a.id] && a.check(stats, words)) {
        stats.achievements[a.id] = new Date().toISOString();
        newAchievements.push(a);
      }
    }

    persist(stats);
    return { xpGained, questsCompleted, newAchievements };
  },
};
