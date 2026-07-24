import { supabase } from './supabaseClient';
import { WordEntry } from '../types';

// Cloud word store on Supabase. Same interface shape as the old firebaseService
// so syncService can swap backends without changing its merge logic.
export const cloudService = {
  getWords: async (userId: string): Promise<Record<string, WordEntry>> => {
    if (!supabase) return {};
    // Page through: Supabase caps a single select at 1,000 rows, and the
    // notebook is 3,500+ words — an unpaged read silently drops the rest.
    const result: Record<string, WordEntry> = {};
    const PAGE = 1000;
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await supabase
        .from('words')
        .select('word, data')
        .eq('user_id', userId)
        .order('word')
        .range(from, from + PAGE - 1);
      if (error) {
        console.error('[CLOUD] getWords failed:', error.message);
        throw new Error(error.message);
      }
      for (const row of data ?? []) {
        result[row.word] = row.data as WordEntry;
      }
      if (!data || data.length < PAGE) break;
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

