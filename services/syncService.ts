import { localStorageService } from './localStorageService';
import { cloudService } from './cloudService';
import { WordEntry } from '../types';

export const syncService = {
  /**
   * Push locally pending words to the cloud.
   */
  syncToCloud: async (userId: string) => {
    const pendingWords = localStorageService.getPendingWords();
    if (pendingWords.length === 0) {
      console.log('[SYNC] No pending words to sync');
      return;
    }
    console.log(`[SYNC] Syncing ${pendingWords.length} words to cloud...`);
    for (const word of pendingWords) {
      try {
        const wordData = localStorageService.getWord(word);
        if (wordData) {
          await cloudService.saveWord(userId, word, wordData);
          localStorageService.markAsSynced(word);
        }
      } catch (error) {
        console.error(`[SYNC] Failed to sync word "${word}":`, error);
      }
    }
    console.log('[SYNC] Background sync to cloud completed');
  },

  /**
   * Merge local and remote data. Newer lastModified wins, but a locally
   * pending entry is never overwritten by remote.
   */
  mergeData: (localData: Record<string, WordEntry>, remoteData: Record<string, WordEntry>) => {
    const merged = { ...localData };
    Object.entries(remoteData).forEach(([word, remoteEntry]) => {
      const localEntry = localData[word];
      if (!localEntry) {
        merged[word] = { ...remoteEntry, syncStatus: 'synced' };
      } else {
        const remoteTime = remoteEntry.lastModified || '0';
        const localTime = localEntry.lastModified || '0';
        if (remoteTime > localTime && localEntry.syncStatus !== 'pending') {
          merged[word] = { ...remoteEntry, syncStatus: 'synced' };
        }
      }
    });
    return merged;
  },

  /**
   * Bi-directional sync between localStorage and Supabase.
   * Returns the merged word map. On first login this doubles as the
   * migration path: every local word is pushed up to the cloud.
   */
  bidirectionalSync: async (userId: string): Promise<Record<string, WordEntry>> => {
    const localWords = localStorageService.getAllWords();
    const remoteWords = await cloudService.getWords(userId);

    const mergedWords = syncService.mergeData(localWords, remoteWords);

    const persisted = localStorageService.importData(mergedWords);

    // Push anything remote is missing or has stale versions of.
    const toPush: Record<string, WordEntry> = {};
    Object.entries(mergedWords).forEach(([word, entry]) => {
      const remote = remoteWords[word];
      if (!remote || (remote.lastModified || '0') < (entry.lastModified || '0') || entry.syncStatus === 'pending') {
        toPush[word] = entry;
      }
    });
    if (Object.keys(toPush).length > 0) {
      console.log(`[SYNC] Pushing ${Object.keys(toPush).length} words to cloud...`);
      await cloudService.saveAllWords(userId, toPush);
    }

    if (!persisted) {
      // The device can't hold the notebook locally (iOS caps localStorage at
      // ~5MB and a large notebook exceeds it). Serve the merged set from
      // memory — the cloud stays the source of truth and every app launch
      // re-pulls it. Without this, the re-read below returns the old (empty)
      // store and the UI shows 0 words despite a successful pull.
      console.warn('[SYNC] Local persistence failed (storage quota) — serving notebook from memory');
      const now = new Date().toISOString();
      for (const entry of Object.values(mergedWords)) {
        entry.syncStatus = 'synced';
        entry.lastSyncTime = now;
      }
      return mergedWords;
    }

    // Stamp everything synced in ONE write — per-word markAsSynced re-parses
    // and rewrites the multi-MB store each call, freezing the tab for minutes.
    const now = new Date().toISOString();
    const finalWords = localStorageService.getAllWords();
    for (const entry of Object.values(finalWords)) {
      if (entry.syncStatus !== 'synced') {
        entry.syncStatus = 'synced';
        entry.lastSyncTime = now;
      }
    }
    localStorageService.importData(finalWords);
    console.log('[SYNC] Bi-directional sync completed');
    return finalWords;
  },
};
