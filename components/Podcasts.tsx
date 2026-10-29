import React, { useEffect, useMemo, useState } from 'react';
import { WordEntry, UserContext } from '../types';
import { supabase } from '../services/supabaseClient';
import { wordsWithClips, PodcastClip, formatTime } from '../services/podcastService';
import { PodcastClips } from './PodcastClips';
import { fillGlosses } from '../services/claudeService';
import { ChevronDown, Loader2, Search, Headphones, ArrowRight } from 'lucide-react';

interface PodcastsProps {
  words: WordEntry[];
  onUpdateWord: (updatedWord: WordEntry) => void;
  /** Open the word's full entry in Look up. */
  onOpenWord?: (word: string) => void;
}

const normalizeForm = (s: string) =>
  s.trim().toLowerCase().replace(/\s+/g, ' ').replace(/[.!?,;:]+$/, '');

/** Notebook words that the podcast library has real clips for — one place to listen through them. */
export const Podcasts: React.FC<PodcastsProps> = ({ words, onUpdateWord, onOpenWord }) => {
  const [status, setStatus] = useState<'loading' | 'ready' | 'signedOut' | 'error'>('loading');
  const [counts, setCounts] = useState<Map<string, number>>(new Map());
  const [open, setOpen] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  // Only re-check the library when the set of words changes, not on every edit to a word.
  const wordKey = useMemo(() => words.map(w => w.word.toLowerCase()).sort().join('|'), [words]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!supabase) { setStatus('signedOut'); return; }
      const { data } = await supabase.auth.getSession();
      if (!data.session) { if (!cancelled) setStatus('signedOut'); return; }
      try {
        const found = await wordsWithClips(words.map(w => w.word));
        if (!cancelled) { setCounts(found); setStatus('ready'); }
      } catch {
        if (!cancelled) setStatus('error');
      }
    })();
    return () => { cancelled = true; };
  }, [wordKey]);

  const heard = words
    .filter(w => counts.has(w.word.trim().toLowerCase()))
    .sort((a, b) => a.word.localeCompare(b.word));
  const q = query.trim().toLowerCase();
  const shown = q ? heard.filter(w => w.word.toLowerCase().includes(q)) : heard;

  const saveClip = (entry: WordEntry, clip: PodcastClip, sense: { meaning: number; definition: number } | null) => {
    const ctx: UserContext = {
      id: Date.now().toString(),
      sourceTitle: `${clip.show} · ${formatTime(clip.start)}`,
      fullText: [clip.before, clip.text, clip.after].filter(Boolean).join(' '),
      targetSentence: clip.text,
      explanation: sense ? entry.meanings[sense.meaning]?.definitions[sense.definition]?.definition ?? '' : '',
      usageNuance: `Heard in “${clip.episode}”`,
      timestamp: Date.now(),
      ...(sense ? { sense } : {}),
    };
    const others = (entry.contexts || []).filter(c => normalizeForm(c.targetSentence) !== normalizeForm(clip.text));
    onUpdateWord({ ...entry, contexts: [...others, ctx] });
  };

  return (
    <div className="max-w-[860px] mx-auto space-y-6">
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="font-serif font-bold text-4xl tracking-[-0.02em] text-stone-900">Podcasts</h2>
        {status === 'ready' && (
          <span className="font-serif italic text-[15px] text-[#8C8880]">
            {heard.length.toLocaleString()} of {words.length.toLocaleString()} words heard
          </span>
        )}
      </div>
      <p className="font-serif italic text-[15px] text-[#6B675F] -mt-3">Words from your notebook, said out loud in real shows.</p>

      {status === 'loading' && (
        <p className="flex items-center gap-2 text-sm text-[#8C8880]"><Loader2 className="w-4 h-4 animate-spin" /> Checking your podcast library…</p>
      )}
      {status === 'signedOut' && (
        <p className="font-serif italic text-sm text-[#8C8880]">Sign in to hear your words in real podcast clips.</p>
      )}
      {status === 'error' && (
        <p className="font-serif italic text-sm text-[#8C8880]">Couldn't reach the podcast library right now.</p>
      )}

      {status === 'ready' && (
        <>
          {heard.length > 8 && (
            <div className="flex items-center gap-3 border-b border-[#D9D3C7] focus-within:border-stone-900 transition-colors px-0.5 pb-2.5">
              <Search className="w-[17px] h-[17px] text-[#8C8880] shrink-0" />
              <label htmlFor="pod-search" className="sr-only">Search words</label>
              <input
                id="pod-search"
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search these words…"
                className="flex-1 min-w-0 bg-transparent outline-none font-serif text-lg text-stone-900 placeholder:text-[#B5AFA3]"
              />
            </div>
          )}

          <div className="bg-white border border-[#EDE8DE] rounded-[22px] p-2 min-h-[300px]">
            {shown.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-[#8C8880] text-center px-6">
                <Headphones className="w-10 h-10 mb-4 opacity-10" />
                <p className="text-sm">
                  {q ? `No words match “${query}”` : 'None of your notebook words are in the podcast library yet — it grows every night.'}
                </p>
              </div>
            ) : (
              shown.map(entry => {
                const isOpen = open === entry.word;
                const n = counts.get(entry.word.trim().toLowerCase()) ?? 0;
                return (
                  <div key={entry.word} className={`rounded-[14px] transition-colors ${isOpen ? 'bg-[#FBF9F4] my-1' : ''}`}>
                    <button
                      onClick={() => {
                        setOpen(isOpen ? null : entry.word);
                        if (!isOpen) fillGlosses(entry).then(filled => { if (filled) onUpdateWord(filled); }).catch(() => {});
                      }}
                      aria-expanded={isOpen}
                      className="w-full text-left flex items-center gap-3 min-h-[60px] px-4 py-2.5 rounded-[14px] hover:bg-[#FBF9F4] transition-colors"
                    >
                      <span className="flex-1 min-w-0 flex flex-col gap-0.5">
                        <span className="font-serif text-[21px] text-stone-900 break-words">{entry.word}</span>
                        {!isOpen && entry.meanings[0]?.definitions[0]?.definition && (
                          <span className="text-[13px] text-[#6B675F] truncate">{entry.meanings[0].definitions[0].definition}</span>
                        )}
                      </span>
                      <span className="font-serif italic text-[13px] text-[#9A5420] shrink-0">{n} {n === 1 ? 'clip' : 'clips'}</span>
                      <ChevronDown className={`w-4 h-4 text-[#B5AFA3] transition-transform duration-300 shrink-0 ${isOpen ? 'rotate-180' : ''}`} />
                    </button>

                    {isOpen && (
                      <div className="px-4 sm:px-6 pb-6 pt-2 space-y-4 animate-fade-in">
                        {onOpenWord && (
                          <div className="flex justify-end">
                            <button onClick={() => onOpenWord(entry.word)} className="flex items-center gap-1.5 min-h-[36px] text-[13.5px] font-medium text-stone-900 border-b border-[#D9D3C7] hover:border-stone-900">
                              Full definition <ArrowRight className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                        <PodcastClips
                          entry={entry}
                          savedSentences={(entry.contexts || []).map(c => c.targetSentence)}
                          onSaveClip={(clip, sense) => saveClip(entry, clip, sense)}
                        />
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </>
      )}
    </div>
  );
};
