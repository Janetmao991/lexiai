import { localStorageService } from './localStorageService';
import { firebaseService } from '../firebase';
import { WordEntry } from '../types';

export const syncService = {
  /**
   * Sync local data to Firebase
   * Non-blocking, runs in background
   */
  syncToFirebase: async (userId: string) => {
    try {
      const pendingWords = localStorageService.getPendingWords();
      
      if (pendingWords.length === 0) {
        console.log('[SYNC] No pending words to sync');
        return;
      }

      console.log(`[SYNC] Syncing ${pendingWords.length} words to Firebase...`);

      for (const word of pendingWords) {
        try {
          const wordData = localStorageService.getWord(word);
          if (wordData) {
            await firebaseService.saveWord(userId, word, wordData);
            localStorageService.markAsSynced(word);
          }
        } catch (error) {
          console.error(`[SYNC] Failed to sync word "${word}":`, error);
        }
      }
      console.log('[SYNC] Background sync to Firebase completed');
    } catch (error) {
      console.error('[SYNC] Sync to Firebase failed:', error);
    }
  },

  /**
   * Sync Firebase data to local
   * Only sync if local is empty or outdated
   */
  syncFromFirebase: async (userId: string) => {
    try {
      const localWords = localStorageService.getAllWords();
      
      // Only sync if local is empty to avoid overwriting newer local changes
      if (Object.keys(localWords).length > 0) {
        console.log('[SYNC] Local data exists, skipping initial Firebase restore');
        return;
      }

      console.log('[SYNC] Syncing data from Firebase...');
      const remoteWords = await firebaseService.getWords(userId);
      
      if (remoteWords && Object.keys(remoteWords).length > 0) {
        localStorageService.importData(remoteWords);
        console.log(`[SYNC] Restored ${Object.keys(remoteWords).length} words from Firebase`);
      }
    } catch (error) {
      console.error('[SYNC] Sync from Firebase failed:', error);
    }
  },

  /**
   * Merge local and remote data intelligently
   */
  mergeData: (localData: Record<string, WordEntry>, remoteData: Record<string, WordEntry>) => {
    const merged = { ...localData };

    Object.entries(remoteData).forEach(([word, remoteEntry]) => {
      const localEntry = localData[word];

      if (!localEntry) {
        // Word doesn't exist locally, take remote
        merged[word] = { ...remoteEntry, syncStatus: 'synced' };
      } else {
        const remoteTime = remoteEntry.lastModified || '0';
        const localTime = localEntry.lastModified || '0';
        if (remoteTime > localTime && localEntry.syncStatus !== 'pending') {
          // Remote is newer AND local is not currently waiting to be pushed
          merged[word] = { ...remoteEntry, syncStatus: 'synced' };
        }
      }
    });

    return merged;
  },

  /**
   * Bi-directional sync
   * Takes both local and remote into account
   */
  bidirectionalSync: async (userId: string) => {
    try {
      const localWords = localStorageService.getAllWords();
      const remoteWords = await firebaseService.getWords(userId);

      if (!remoteWords || Object.keys(remoteWords).length === 0) {
        // Remote is empty, push local to remote
        await syncService.syncToFirebase(userId);
        return localStorageService.getAllWords();
      }

      // Merge data intelligently
      const mergedWords = syncService.mergeData(localWords, remoteWords);

      // Update local with merged data
      localStorageService.importData(mergedWords);

      // Push merged data back to Firebase to ensure remote matches merged local
      await firebaseService.saveAllWords(userId, mergedWords);

      // Mark all as synced locally
      Object.keys(mergedWords).forEach(word => {
        localStorageService.markAsSynced(word);
      });

      console.log('[SYNC] Bi-directional sync completed');
      return mergedWords;
    } catch (error) {
      console.error('[SYNC] Bi-directional sync failed:', error);
      return localStorageService.getAllWords();
    }
  }
};