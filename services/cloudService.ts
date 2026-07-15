import { supabase } from './supabaseClient';
import { WordEntry, SentenceEntry } from '../types';

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

// ---- Sentences: separate table, same owner-only RLS ----
export const sentenceCloud = {
  getAll: async (userId: string): Promise<Record<string, SentenceEntry>> => {
    if (!supabase) return {};
    const { data, error } = await supabase
      .from('sentences')
      .select('id, data')
      .eq('user_id', userId);
    if (error) {
      // Table may not exist yet on older self-hosted setups — degrade to local-only.
      console.warn('[CLOUD] sentences fetch failed:', error.message);
      return {};
    }
    const result: Record<string, SentenceEntry> = {};
    for (const row of data ?? []) result[row.id] = row.data as SentenceEntry;
    return result;
  },

  save: async (userId: string, entry: SentenceEntry): Promise<void> => {
    if (!supabase) return;
    const { error } = await supabase.from('sentences').upsert({
      user_id: userId,
      id: entry.id,
      data: { ...entry, syncStatus: 'synced' },
      updated_at: new Date().toISOString(),
    });
    if (error) throw new Error(error.message);
  },

  remove: async (userId: string, id: string): Promise<void> => {
    if (!supabase) return;
    const { error } = await supabase.from('sentences').delete().eq('user_id', userId).eq('id', id);
    if (error) throw new Error(error.message);
  },
};
