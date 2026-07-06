import { SrsState, SrsRating, WordEntry, MasteryLevel } from '../types';

const MIN_EASE = 1.3;
const DEFAULT_EASE = 2.5;

// Local-timezone dates: streaks, quests and due dates should roll over at the
// user's midnight, not UTC midnight.
const toLocalDateStr = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export const todayStr = (): string => toLocalDateStr(new Date());

export const daysFromToday = (days: number): string => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return toLocalDateStr(d);
};

const addDays = daysFromToday;

export const srsService = {
  /**
   * A card is due when it has never been reviewed or its due date has arrived.
   */
  isDue: (entry: WordEntry): boolean => {
    if (!entry.srs) return true;
    return entry.srs.due <= todayStr();
  },

  dueWords: (words: WordEntry[]): WordEntry[] => words.filter(srsService.isDue),

  /**
   * Simplified SM-2. Returns the next SRS state for a rating.
   * 'again' keeps the card due today so it comes back in the same session.
   */
  schedule: (current: SrsState | undefined, rating: SrsRating): SrsState => {
    const s: SrsState = current ?? { interval: 0, ease: DEFAULT_EASE, due: todayStr(), reps: 0, lapses: 0 };

    if (rating === 'again') {
      return {
        interval: 1,
        ease: Math.max(MIN_EASE, s.ease - 0.2),
        due: todayStr(), // retry this session
        reps: 0,
        lapses: s.lapses + 1,
      };
    }

    let interval: number;
    let ease = s.ease;

    if (s.reps === 0) {
      // First successful review (new card or after a lapse)
      interval = rating === 'easy' ? 3 : 1;
    } else if (rating === 'hard') {
      interval = Math.max(1, Math.round(s.interval * 1.2));
      ease = Math.max(MIN_EASE, ease - 0.15);
    } else if (rating === 'good') {
      interval = Math.max(1, Math.round(s.interval * ease));
    } else {
      // easy
      interval = Math.max(1, Math.round(s.interval * ease * 1.3));
      ease = ease + 0.15;
    }

    return {
      interval,
      ease,
      due: addDays(interval),
      reps: s.reps + 1,
      lapses: s.lapses,
    };
  },

  /**
   * Mastery ladder: collected -> reviewing (3+ SRS passes) -> can write
   * (practice score >= 80) -> can speak (speaking practice passed).
   * Each stage requires the previous one.
   */
  masteryLevel: (entry: WordEntry): MasteryLevel => {
    const reviewing = (entry.srs?.reps ?? 0) >= 3;
    const canWrite = reviewing && (entry.mastery?.bestPracticeScore ?? 0) >= 80;
    const canSpeak = canWrite && entry.mastery?.speakingPassed === true;
    if (canSpeak) return 4;
    if (canWrite) return 3;
    if (reviewing) return 2;
    return 1;
  },
};

export const MASTERY_META: Record<MasteryLevel, { label: string; icon: string }> = {
  1: { label: 'Collected', icon: '📖' },
  2: { label: 'Reviewing', icon: '🔁' },
  3: { label: 'Can Write', icon: '✍️' },
  4: { label: 'Can Speak', icon: '🗣️' },
};
