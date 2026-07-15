
export interface DefinitionDetail {
  definition: string;
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
}

export interface PracticeFeedback {
  originalSentence: string;
  correctedSentence: string;
  isCorrect: boolean;
  score: number;
  explanation: string;
  suggestions: string[];
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
