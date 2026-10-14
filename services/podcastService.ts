import { supabase } from './supabaseClient';

/** A line from an indexed podcast episode where the word is actually said. */
export interface PodcastClip {
  text: string;
  start: number;
  end: number;
  show: string;
  kind: 'everyday' | 'work';
  episode: string;
  published: string;
  audioUrl: string;
}

/**
 * Regex for the term and its inflections only (gauge → gauges/gauged/gauging). The server's
 * Postgres stemming is loose (integral ~ integrity), so candidates are re-checked with this.
 * Mirrors podcast/search.py.
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

/** Real clips of `term`, everyday shows first, at most two per episode. Empty when signed out. */
export const searchClips = async (term: string, limit = 5): Promise<PodcastClip[]> => {
  if (!supabase) return [];
  const { data, error } = await supabase.rpc('search_podcast_clips', { term, max_rows: 80 });
  if (error) throw error;
  const pat = inflectionPattern(term);
  const perEpisode = new Map<string, number>();
  const clips: PodcastClip[] = [];
  for (const r of (data || []) as any[]) {
    if (!pat.test(r.text)) continue;
    const n = perEpisode.get(r.audio_url) ?? 0;
    if (n >= 2) continue;
    perEpisode.set(r.audio_url, n + 1);
    clips.push({
      text: r.text, start: r.start_s, end: r.end_s, show: r.show, kind: r.kind,
      episode: r.title, published: r.published, audioUrl: r.audio_url,
    });
    if (clips.length >= limit) break;
  }
  return clips;
};

export const formatTime = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
