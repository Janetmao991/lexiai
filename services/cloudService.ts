import { supabase } from './supabaseClient';
import { WordEntry } from '../types';

// Cloud word store on Supabase. Same interface shape as the old firebaseService
// so syncService can swap backends without changing its merge logic.
export const cloudService = {
  getWords: async (userId: string): Promise<Record<string, WordEntry>> => {
    if (!supabase) return {};
    const { data, error } = await supabase
      .from('words')
      .select('word, data')
      .eq('user_id', userId);
    if (error) {
      console.error('[CLOUD] getWords failed:', error.message);
      throw new Error(error.message);
    }
    const result: Record<string, WordEntry> = {};
    for (const row of data ?? []) {
      result[row.word] = row.data as WordEntry;
    }
    return result;
  },

  saveWord: async (userId: string, word: string, entry: WordEntry): Promise<void> => {
    if (!supabase) return;
    const { error } = await supabase.from('words').upsert({
      user_id: userId,
      word,
      data: { ...entry, syncStatus: 'synced' },
      updated_at: new Date().toISOString(),
    });
    if (error) throw new Error(error.message);
  },

  deleteWord: async (userId: string, word: string): Promise<void> => {
    if (!supabase) return;
    const { error } = await supabase
      .from('words')
      .delete()
      .eq('user_id', userId)
      .eq('word', word);
    if (error) throw new Error(error.message);
  },

  saveAllWords: async (userId: string, words: Record<string, WordEntry>): Promise<void> => {
    if (!supabase) return;
    const rows = Object.entries(words).map(([word, entry]) => ({
      user_id: userId,
      word,
      data: { ...entry, syncStatus: 'synced' },
      updated_at: new Date().toISOString(),
    }));
    // Upsert in chunks to stay well under request size limits.
    const CHUNK = 200;
    for (let i = 0; i < rows.length; i += CHUNK) {
      const { error } = await supabase.from('words').upsert(rows.slice(i, i + CHUNK));
      if (error) throw new Error(error.message);
    }
  },
};

