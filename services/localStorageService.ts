import { WordEntry } from '../types';

const WORDS_KEY = 'lexiai_words_v1';
const METADATA_KEY = 'lexiai_metadata';

/*
 * The notebook lives in IndexedDB, not localStorage. localStorage is capped at
 * ~5 MB per site, and a big notebook (full AI entries per word) outgrows it, so
 * saves start failing. IndexedDB is the browser's database and allows hundreds
 * of MB. It is async, so we keep the notebook in memory (loaded once by init()
 * before the app renders) and write it back to IndexedDB in the background —
 * every method below stays synchronous for callers.
 * If IndexedDB can't be opened (some private-browsing modes) we fall back to
 * localStorage as before.
 */
const DB_NAME = 'lexiai';
const STORE = 'kv';

let words: Record<string, WordEntry> = {};
let db: IDBDatabase | null = null;

const openDb = () => new Promise<IDBDatabase>((resolve, reject) => {
  const req = indexedDB.open(DB_NAME, 1);
  req.onupgradeneeded = () => req.result.createObjectStore(STORE);
  req.onsuccess = () => resolve(req.result);
  req.onerror = () => reject(req.error);
});

const idbGet = (key: string) => new Promise<any>((resolve, reject) => {
  const req = db!.transaction(STORE).objectStore(STORE).get(key);
  req.onsuccess = () => resolve(req.result);
  req.onerror = () => reject(req.error);
});

const idbPut = (key: string, value: unknown) => new Promise<void>((resolve, reject) => {
  const tx = db!.transaction(STORE, 'readwrite');
  tx.objectStore(STORE).put(value, key); // value is copied right here, so later edits don't leak in
  tx.oncomplete = () => resolve();
  tx.onerror = () => reject(tx.error);
  tx.onabort = () => reject(tx.error);
});

const readLegacy = (): Record<string, WordEntry> => {
  try {
    const data = localStorage.getItem(WORDS_KEY);
    return data ? JSON.parse(data) : {};
  } catch {
    return {};
  }
};

// Writes are coalesced: many saves in a row become one IndexedDB write of the latest notebook.
let writing = false;
let dirty = false;
const flush = async () => {
  writing = true;
  while (dirty) {
    dirty = false;
    try {
      await idbPut(WORDS_KEY, words);
    } catch (error) {
      console.error('Failed to write notebook to IndexedDB:', error);
    }
  }
  writing = false;
};

/** Persist the in-memory notebook. Returns false only when nothing could store it. */
const persist = (): boolean => {
  if (db) {
    dirty = true;
    if (!writing) flush();
    return true;
  }
  try {
    localStorage.setItem(WORDS_KEY, JSON.stringify(words));
    return true;
  } catch (error) {
    console.error('Failed to save notebook to localStorage:', error);
    return false;
  }
};

export const localStorageService = {
  /**
   * Load the notebook into memory. Call once before the app renders.
   * First run after the switch moves the old localStorage copy into IndexedDB
   * and frees the localStorage space.
   */
  init: async (): Promise<void> => {
    try {
      db = await openDb();
      const stored = await idbGet(WORDS_KEY);
      if (stored) {
        words = stored;
      } else {
        words = readLegacy();
        await idbPut(WORDS_KEY, words);
      }
      localStorage.removeItem(WORDS_KEY);
    } catch (error) {
      console.warn('IndexedDB unavailable — keeping the notebook in localStorage.', error);
      db = null;
      words = readLegacy();
    }
  },

  /**
   * Get all local words
   * @returns Object with word as key and WordEntry as value (a copy — safe to mutate)
   */
  getAllWords: (): Record<string, WordEntry> => structuredClone(words),

  /**
   * Save a single word locally
   * @param word The word to save
   * @param entry Word entry and metadata
   * @returns true if successful, false otherwise
   */
  saveWord: (word: string, entry: WordEntry): boolean => {
    if (!word || word.trim().length === 0) {
      console.warn('Cannot save empty word');
      return false;
    }
    words[word] = {
      ...structuredClone(entry),
      lastModified: new Date().toISOString(),
      syncStatus: entry.syncStatus || 'pending'
    };
    localStorageService.updateMetadata({
      lastUpdate: new Date().toISOString(),
      totalWords: Object.keys(words).length
    });
    return persist();
  },

  /**
   * Delete a word from local storage
   * @param word The word to delete
   * @returns true if successful, false otherwise
   */
  deleteWord: (word: string): boolean => {
    if (!words[word]) return false;
    delete words[word];
    localStorageService.updateMetadata({
      lastUpdate: new Date().toISOString(),
      totalWords: Object.keys(words).length
    });
    return persist();
  },

  /**
   * Get a single word
   * @param word The word to retrieve
   * @returns Word entry or null if not found
   */
  getWord: (word: string): WordEntry | null => {
    return words[word] ? structuredClone(words[word]) : null;
  },

  /**
   * Check if word exists
   * @param word The word to check
   * @returns true if word exists, false otherwise
   */
  hasWord: (word: string): boolean => {
    return word in words;
  },

  /**
   * Clear all local data
   * WARNING: This cannot be undone
   * @returns true if successful, false otherwise
   */
  clearAll: (): boolean => {
    try {
      words = {};
      persist();
      localStorage.removeItem(WORDS_KEY);
      localStorage.removeItem(METADATA_KEY);
      return true;
    } catch (error) {
      console.error('Failed to clear local storage:', error);
      return false;
    }
  },

  /**
   * Export all data as JSON
   * @returns Object containing all words
   */
  exportData: () => {
    return {
      words: localStorageService.getAllWords(),
      metadata: localStorageService.getMetadata(),
      exportDate: new Date().toISOString()
    };
  },

  /**
   * Import data from backup
   * @param data Data to import
   * @returns true if successful, false otherwise
   */
  importData: (data: Record<string, WordEntry>): boolean => {
    words = structuredClone(data);
    localStorageService.updateMetadata({
      lastImport: new Date().toISOString(),
      totalWords: Object.keys(words).length
    });
    return persist();
  },

  /**
   * Get words pending sync
   * @returns Array of words that haven't been synced to Firebase
   */
  getPendingWords: (): string[] => {
    return Object.entries(words)
      .filter(([_, entry]) => entry.syncStatus === 'pending')
      .map(([word]) => word);
  },

  /**
   * Mark word as synced
   * @param word The word that was synced
   */
  markAsSynced: (word: string): void => {
    if (words[word]) {
      words[word].syncStatus = 'synced';
      words[word].lastSyncTime = new Date().toISOString();
      persist();
    }
  },

  /**
   * Get local metadata
   */
  getMetadata: () => {
    try {
      const data = localStorage.getItem(METADATA_KEY);
      return data ? JSON.parse(data) : {};
    } catch (error) {
      console.error('Failed to get metadata:', error);
      return {};
    }
  },

  /**
   * Update local metadata
   */
  updateMetadata: (metadata: Record<string, any>): void => {
    try {
      const current = localStorageService.getMetadata();
      const updated = { ...current, ...metadata };
      localStorage.setItem(METADATA_KEY, JSON.stringify(updated));
    } catch (error) {
      console.error('Failed to update metadata:', error);
    }
  },

  /**
   * Get storage statistics
   */
  getStats: () => {
    const metadata = localStorageService.getMetadata();
    
    return {
      totalWords: Object.keys(words).length,
      pendingSync: localStorageService.getPendingWords().length,
      lastUpdate: metadata.lastUpdate || 'Never',
      storageUsage: JSON.stringify(words).length + ' bytes'
    };
  }
};
