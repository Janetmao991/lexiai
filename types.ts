
export interface DefinitionDetail {
  definition: string;
  /** Optional native-language gloss of this sense; only produced when a gloss language is chosen in Settings. */
  gloss?: string;
  synonyms: string[];
  examples: string[];
  collocations: string[];
}

export interface Meaning {
  partOfSpeech: string;
  definitions: DefinitionDetail[];
}

export interface UserContext {
  id: string;
  sourceTitle: string;
  fullText: string;
  targetSentence: string;
  explanation: string;
  usageNuance: string;
  timestamp: number;
}

export type SrsRating = 'again' | 'hard' | 'good' | 'easy';

export interface SrsState {
  interval: number; // days until next review
  ease: number;     // SM-2 ease factor, min 1.3
  due: string;      // ISO date (YYYY-MM-DD) of next review
  reps: number;     // consecutive successful reviews
  lapses: number;   // times forgotten
}

export interface MasteryState {
  bestPracticeScore?: number; // highest Practice score, 0-100
  speakingPassed?: boolean;   // set by Speaking practice (M4)
}

// 1 Collected -> 2 Reviewing -> 3 Can write -> 4 Can speak
export type MasteryLevel = 1 | 2 | 3 | 4;

export interface WordEntry {
  word: string;
  ipa: string;
  meanings: Meaning[];
  contexts?: UserContext[];
  timestamp: number;
  wasCorrected?: boolean;
  originalQuery?: string;
  /** Reverse-lookup (e.g. Chinese → English): other candidate words, closest first. */
  candidates?: { word: string; nuance: string }[];
  /** Near-miss forms easily confused with the headword — a different article, preposition or number
   *  (e.g. "on margin" / "on the margins" vs "at the margin"). When the entry was normalized away from
   *  what the user typed, the raw query is the first item. */
  variants?: { form: string; note: string }[];
  srs?: SrsState;
  mastery?: MasteryState;
  // Sync metadata
  lastModified?: string;
  lastSyncTime?: string;
  syncStatus?: 'synced' | 'pending' | 'failed';
}

export interface DailyProgress {
  date: string; // YYYY-MM-DD
  reviews: number;
  newCards: number;
  practices: number;
  savedWords: number;
  podcasts: number;
  speaking: number;
  completedQuests: string[];
}

export interface UserStats {
  xp: number;
  streakCurrent: number;
  streakBest: number;
  lastActiveDate: string; // YYYY-MM-DD
  achievements: Record<string, string>; // id -> unlock ISO date
  totals: { reviews: number; practices: number; podcasts: number; speaking: number };
  daily: DailyProgress;
  /** Cross-device preferences that ride along in the same cloud blob (API key is NOT one of them). */
  prefs?: UserPrefs;
}

export interface UserPrefs {
  /** Settings → Definition gloss. '' / undefined = English-only. */
  glossLang?: string;
  /** ISO timestamp of the last change; newer wins when devices disagree. */
  updatedAt?: string;
}

export interface PracticeFeedback {
  originalSentence: string;
  correctedSentence: string;
  isCorrect: boolean;
  score: number;
  explanation: string;
  suggestions: string[];
}

export interface NativeRephraseNote {
  /** What the learner actually said (the non-native bit). */
  yours: string;
  /** The natural native phrasing for that bit. */
  native: string;
  /** One-line reason: collocation, register, word choice, structure… */
  why: string;
}

export interface NativeRephrase {
  /** 0–100: how natural the original already sounded. */
  naturalness: number;
  /** The same message the way a native speaker would say it out loud. */
  nativeVersion: string;
  /** A polished, professional-register variant (meetings, interviews). */
  formalVersion: string;
  /** Up to 4 point-by-point fixes; empty when already native. */
  notes: NativeRephraseNote[];
}

export interface ArticleEntry {
  id: string;
  title: string;
  content: string;
  timestamp: number;
}

export interface ContextExplanation {
  word: string;
  sentence: string;
  explanation: string;
  usageNuance: string;
}

export interface VocabularySuggestion {
  word: string;
  definition: string;
  reason: string;
}

export interface PodcastTurn {
  speaker: string;
  text: string;
}

export interface PodcastScript {
  title: string;
  topic: string;
  dialogue: PodcastTurn[];
}

export interface SynonymComparison {
  word1: string;
  word2: string;
  word3?: string;
  keyDifference: string;
  word1Nuance: string;
  word2Nuance: string;
  word3Nuance?: string;
  sharedMeaning: string;
  word1Example: string;
  word2Example: string;
  word3Example?: string;
}

export interface SentenceAnalysis {
  meaning: string;
  vocabularyBreakdown: { word: string; definition: string }[];
  alternatives: string[]; // other natural ways to express the same idea
}

export enum ViewState {
  DICTIONARY = 'DICTIONARY',
  NOTEBOOK = 'NOTEBOOK',
  FLASHCARDS = 'FLASHCARDS',
  PRACTICE = 'PRACTICE',
  SPEAKING = 'SPEAKING',
  PODCAST = 'PODCAST',
}
