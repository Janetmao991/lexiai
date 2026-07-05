
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

export interface WordEntry {
  word: string;
  ipa: string;
  meanings: Meaning[];
  contexts?: UserContext[];
  timestamp: number;
  wasCorrected?: boolean;
  originalQuery?: string;
  // Sync metadata
  lastModified?: string;
  lastSyncTime?: string;
  syncStatus?: 'synced' | 'pending' | 'failed';
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
  improvedVersion?: string;
}

export enum ViewState {
  DICTIONARY = 'DICTIONARY',
  NOTEBOOK = 'NOTEBOOK',
  FLASHCARDS = 'FLASHCARDS',
  PRACTICE = 'PRACTICE',
  PODCAST = 'PODCAST',
}
