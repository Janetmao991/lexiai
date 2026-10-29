import { supabase } from './supabaseClient';

/** A line from an indexed podcast episode where the word is actually said. */
export interface PodcastClip {
  text: string;
  /** The sentences just before and after, so the line can be read in context. */
  before: string;
  after: string;
  /** Path of our own audio clip in the private "podcast-clips" bucket; null until it is cut. */
  clipPath: string | null;
  start: number;
  end: number;
  show: string;
  kind: 'everyday' | 'work';
  episode: string;
  published: string;
  audioUrl: string;
}

/**
 * Regex for the term and its inflections only (gauge → gauges/gauged/gauging) — used to
 * highlight the word inside a clip. Mirrors podcast/search.py.
 */
export const inflectionPattern = (term: string): RegExp => {
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const forms = (word: string) => {
    const w = esc(word.toLowerCase());
    const alts = new Set([w, `${w}s`, `${w}es`, `${w}ed`, `${w}d`, `${w}ing`, `${w}'s`, `${w}’s`]);
    if (w.endsWith('e')) alts.add(`${w.slice(0, -1)}ing`);
    if (w.endsWith('y')) { alts.add(`${w.slice(0, -1)}ies`); alts.add(`${w.slice(0, -1)}ied`); }
    if (/[^aeiou][aeiou][bdgmnprt]$/.test(w)) { alts.add(`${w}${w.slice(-1)}ed`); alts.add(`${w}${w.slice(-1)}ing`); }
    return `(?:${[...alts].sort((a, b) => b.length - a.length).join('|')})`;
  };
  const words = term.trim().split(/\s+/);
  const parts = [forms(words[0]), ...words.slice(1).map(x => esc(x.toLowerCase()))];
  return new RegExp(`(?<![\\w-])${parts.join('[\\s-]+')}(?![\\w-])`, 'i');
};

/**
 * Curated clips of `term` (its base form or a notebook phrase): a few lines per word picked
 * offline by podcast/build_examples.py — everyday shows first, one per episode. Empty when signed out.
 */
export const searchClips = async (term: string, limit = 8): Promise<PodcastClip[]> => {
  if (!supabase) return [];
  const { data, error } = await supabase.rpc('podcast_examples_for', { term });
  if (error) throw error;
  return ((data || []) as any[]).slice(0, limit).map(r => ({
    text: r.text, before: r.before_text || '', after: r.after_text || '', clipPath: r.clip_path ?? null,
    start: r.start_s, end: r.end_s, show: r.show, kind: r.kind,
    episode: r.title, published: r.published, audioUrl: r.audio_url,
  }));
};

/**
 * Which of these words have curated clips, with how many each. One query per 150 words
 * (keeps the request URL short); returns an empty map when signed out.
 */
export const wordsWithClips = async (words: string[]): Promise<Map<string, number>> => {
  const counts = new Map<string, number>();
  if (!supabase) return counts;
  const lemmas = [...new Set(words.map(w => w.trim().toLowerCase()).filter(Boolean))];
  for (let i = 0; i < lemmas.length; i += 150) {
    const { data, error } = await supabase.from('podcast_examples').select('lemma').in('lemma', lemmas.slice(i, i + 150));
    if (error) throw error;
    for (const r of (data || []) as { lemma: string }[]) counts.set(r.lemma, (counts.get(r.lemma) ?? 0) + 1);
  }
  return counts;
};

/**
 * Short-lived URL for one of our own clips. Clips are cut from the exact audio that was
 * transcribed — the publishers' live files carry dynamic ads that shift every timestamp.
 */
export const clipUrl = async (path: string): Promise<string | null> => {
  if (!supabase) return null;
  const { data } = await supabase.storage.from('podcast-clips').createSignedUrl(path, 3600);
  return data?.signedUrl ?? null;
};

export const formatTime = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
