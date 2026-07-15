import { SentenceEntry } from '../types';

const SENTENCES_KEY = 'lexiai_sentences_v1';

export const sentenceService = {
  getAll: (): Record<string, SentenceEntry> => {
    try {
      const raw = localStorage.getItem(SENTENCES_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  },

  save: (entry: SentenceEntry): void => {
    const all = sentenceService.getAll();
    all[entry.id] = entry;
    localStorage.setItem(SENTENCES_KEY, JSON.stringify(all));
  },

  remove: (id: string): void => {
    const all = sentenceService.getAll();
    delete all[id];
    localStorage.setItem(SENTENCES_KEY, JSON.stringify(all));
  },

  importAll: (entries: Record<string, SentenceEntry>): void => {
    localStorage.setItem(SENTENCES_KEY, JSON.stringify(entries));
  },

  markSynced: (id: string): void => {
    const all = sentenceService.getAll();
    if (all[id]) {
      all[id].syncStatus = 'synced';
      localStorage.setItem(SENTENCES_KEY, JSON.stringify(all));
    }
  },
};
