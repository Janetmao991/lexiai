
import { WordEntry } from '../types';

const WORDS_KEY = 'lexiai_words_v1';
const METADATA_KEY = 'lexiai_metadata';

export const localStorageService = {
  /**
   * Get all local words
   * @returns Object with word as key and WordEntry as value
   */
  getAllWords: (): Record<string, WordEntry> => {
    try {
      const data = localStorage.getItem(WORDS_KEY);
      return data ? JSON.parse(data) : {};
    } catch (error) {
      console.error('Failed to get local words:', error);
      return {};
    }
  },

  /**
   * Save a single word locally
   * @param word The word to save
   * @param entry Word entry and metadata
   * @returns true if successful, false otherwise
   */
  saveWord: (word: string, entry: WordEntry): boolean => {
    try {
      if (!word || word.trim().length === 0) {
        console.warn('Cannot save empty word');
        return false;
      }

      const words = localStorageService.getAllWords();
      const updatedEntry: WordEntry = {
        ...entry,
        lastModified: new Date().toISOString(),
        syncStatus: entry.syncStatus || 'pending' 
      };
      words[word] = updatedEntry;
      localStorage.setItem(WORDS_KEY, JSON.stringify(words));
      
      // Update metadata
      localStorageService.updateMetadata({
        lastUpdate: new Date().toISOString(),
        totalWords: Object.keys(words).length
      });
      
      return true;
    } catch (error) {
      console.error('Failed to save word locally:', error);
      return false;
    }
  },

  /**
   * Delete a word from local storage
   * @param word The word to delete
   * @returns true if successful, false otherwise
   */
  deleteWord: (word: string): boolean => {
    try {
      const words = localStorageService.getAllWords();
      if (words[word]) {
        delete words[word];
        localStorage.setItem(WORDS_KEY, JSON.stringify(words));
        
        // Update metadata
        localStorageService.updateMetadata({
          lastUpdate: new Date().toISOString(),
          totalWords: Object.keys(words).length
        });
        
        return true;
      }
      return false;
    } catch (error) {
      console.error('Failed to delete word locally:', error);
      return false;
    }
  },

  /**
   * Get a single word
   * @param word The word to retrieve
   * @returns Word entry or null if not found
   */
  getWord: (word: string): WordEntry | null => {
    const words = localStorageService.getAllWords();
    return words[word] || null;
  },

  /**
   * Check if word exists
   * @param word The word to check
   * @returns true if word exists, false otherwise
   */
  hasWord: (word: string): boolean => {
    return localStorageService.getWord(word) !== null;
  },

  /**
   * Clear all local data
   * WARNING: This cannot be undone
   * @returns true if successful, false otherwise
   */
  clearAll: (): boolean => {
    try {
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
    try {
      localStorage.setItem(WORDS_KEY, JSON.stringify(data));
      localStorageService.updateMetadata({
        lastImport: new Date().toISOString(),
        totalWords: Object.keys(data).length
      });
      return true;
    } catch (error) {
      console.error('Failed to import data:', error);
      return false;
    }
  },

  /**
   * Get words pending sync
   * @returns Array of words that haven't been synced to Firebase
   */
  getPendingWords: (): string[] => {
    const words = localStorageService.getAllWords();
    return Object.entries(words)
      .filter(([_, entry]) => entry.syncStatus === 'pending')
      .map(([word]) => word);
  },

  /**
   * Mark word as synced
   * @param word The word that was synced
   */
  markAsSynced: (word: string): void => {
    try {
      const words = localStorageService.getAllWords();
      if (words[word]) {
        words[word].syncStatus = 'synced';
        words[word].lastSyncTime = new Date().toISOString();
        localStorage.setItem(WORDS_KEY, JSON.stringify(words));
      }
    } catch (error) {
      console.error('Failed to mark word as synced:', error);
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
    const words = localStorageService.getAllWords();
    const metadata = localStorageService.getMetadata();
    
    return {
      totalWords: Object.keys(words).length,
      pendingSync: localStorageService.getPendingWords().length,
      lastUpdate: metadata.lastUpdate || 'Never',
      storageUsage: JSON.stringify(words).length + ' bytes'
    };
  }
};
