import React, { useEffect, useRef, useState } from 'react';
import { WordEntry } from '../types';
import { supabase } from '../services/supabaseClient';
import { searchClips, PodcastClip, formatTime, inflectionPattern, clipUrl } from '../services/podcastService';
import { tagSenses } from '../services/geminiService';
import { Play, Pause, Loader2, Bookmark, Check } from 'lucide-react';

type Sense = { meaning: number; definition: number } | null;

interface PodcastClipsProps {
  entry: WordEntry;
  /** Sentences already saved on this word, so a clip shows as saved. */
  savedSentences: string[];
  onSaveClip: (clip: PodcastClip, sense: Sense) => void;
}

const ROMAN = ['i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii', 'ix', 'x'];

/** "Heard in podcasts": real lines from indexed shows where the word is said, playable in place. */
export const PodcastClips: React.FC<PodcastClipsProps> = ({ entry, savedSentences, onSaveClip }) => {
  const [status, setStatus] = useState<'loading' | 'ready' | 'signedOut' | 'error'>('loading');
  const [clips, setClips] = useState<PodcastClip[]>([]);
  const [senses, setSenses] = useState<Sense[]>([]);
  const [kind, setKind] = useState<'everyday' | 'work'>('everyday');
  const [playing, setPlaying] = useState<number>(-1);
  const audio = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    setStatus('loading');
    setClips([]);
    setSenses([]);
    setPlaying(-1);
    (async () => {
      if (!supabase) { setStatus('signedOut'); return; }
      const { data } = await supabase.auth.getSession();
      if (!data.session) { if (!cancelled) setStatus('signedOut'); return; }
      try {
        const found = await searchClips(entry.word, 8);
        if (cancelled) return;
        setClips(found);
        setKind(found.some(c => c.kind === 'everyday') ? 'everyday' : 'work');
        setStatus('ready');
        if (found.length) {
          const tagged = await tagSenses(entry, found.map(c => c.text)).catch(() => found.map(() => null));
          if (!cancelled) setSenses(tagged);
        }
      } catch {
        if (!cancelled) setStatus('error');
      }
    })();
    return () => { cancelled = true; audio.current?.pause(); };
  }, [entry.word]);

  const toggle = async (i: number) => {
    const clip = clips[i];
    if (!clip.clipPath) return;
    if (!audio.current) {
      audio.current = new Audio();
      audio.current.addEventListener('pause', () => setPlaying(-1));
      audio.current.addEventListener('ended', () => setPlaying(-1));
    }
    const a = audio.current;
    if (playing === i) { a.pause(); return; }
    // Our own clip, cut from the audio that was transcribed. The publishers' live files carry
    // dynamic ads, so seeking into them by timestamp lands tens of seconds off.
    const url = await clipUrl(clip.clipPath);
    if (!url) return;
    a.src = url;
    a.play().then(() => setPlaying(i)).catch(() => setPlaying(-1));
  };

  const shown = clips.map((c, i) => ({ c, i })).filter(({ c }) => c.kind === kind);
  const hasBoth = clips.some(c => c.kind === 'everyday') && clips.some(c => c.kind === 'work');
  const pat = inflectionPattern(entry.word);
  const highlight = (text: string) => {
    const m = text.match(pat);
    if (!m || m.index === undefined) return text;
    return <>{text.slice(0, m.index)}<span className="lx-mark font-semibold text-stone-900">{m[0]}</span>{text.slice(m.index + m[0].length)}</>;
  };

  return (
    <section aria-labelledby="pod-h" className="space-y-5">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <h2 id="pod-h" className="font-serif italic font-normal text-[22px] text-[#2B2A27]">Heard in podcasts</h2>
        <span aria-hidden="true" className="flex-1 min-w-[40px] h-px bg-[#EDE8DE]" />
        {status === 'ready' && hasBoth && (
          <div role="group" aria-label="Show type" className="flex gap-1.5">
            {(['everyday', 'work'] as const).map(k => (
              <button key={k} onClick={() => setKind(k)} aria-pressed={kind === k}
                className={`min-h-[34px] px-3.5 rounded-full border text-[13px] transition-colors ${kind === k ? 'bg-stone-900 border-stone-900 text-[#FBF9F4]' : 'border-[#E2DDD2] text-[#55524C] hover:border-stone-900'}`}>
                {k === 'everyday' ? 'Everyday' : 'Work'}
              </button>
            ))}
          </div>
        )}
      </div>

      {status === 'loading' && (
        <p className="flex items-center gap-2 text-sm text-[#8C8880]"><Loader2 className="w-4 h-4 animate-spin" /> Listening through your podcasts…</p>
      )}
      {status === 'signedOut' && (
        <p className="font-serif italic text-sm text-[#8C8880]">Sign in to hear this word in real podcast clips.</p>
      )}
      {status === 'error' && (
        <p className="font-serif italic text-sm text-[#8C8880]">Couldn't reach the podcast library right now.</p>
      )}
      {status === 'ready' && clips.length === 0 && (
        <p className="font-serif italic text-sm text-[#8C8880]">Not heard in your podcasts yet — the library grows every night.</p>
      )}

      {status === 'ready' && shown.length > 0 && (
        <ol className="divide-y divide-[#F2EEE6] border-t border-[#F2EEE6]">
          {shown.map(({ c, i }) => {
            const sense = senses[i];
            const def = sense ? entry.meanings[sense.meaning]?.definitions[sense.definition] : undefined;
            const saved = savedSentences.includes(c.text);
            return (
              <li key={i} className="grid grid-cols-[44px_minmax(0,1fr)] sm:grid-cols-[48px_minmax(0,1fr)] gap-x-4 py-5">
                {c.clipPath ? (
                  <button
                    onClick={() => toggle(i)}
                    aria-label={`${playing === i ? 'Pause' : 'Play'} clip from ${c.show}`}
                    className={`w-11 h-11 sm:w-12 sm:h-12 rounded-full border flex items-center justify-center transition-colors ${playing === i ? 'bg-stone-900 border-stone-900 text-[#FBF9F4]' : 'border-[#E2DDD2] bg-white text-stone-900 hover:border-stone-900'}`}
                  >
                    {playing === i ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current ml-0.5" />}
                  </button>
                ) : (
                  <span aria-hidden="true" className="font-serif text-4xl leading-none text-[#D9D3C7] text-center pt-1">“</span>
                )}
                <div className="min-w-0 space-y-2.5">
                  <p className="font-serif text-lg sm:text-xl leading-normal">
                    {c.before && <span className="text-[#A8A399]">{c.before} </span>}
                    <span className="text-[#2B2A27]">{highlight(c.text)}</span>
                    {c.after && <span className="text-[#A8A399]"> {c.after}</span>}
                  </p>
                  <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1 text-[13px]">
                    <span className="font-semibold text-[#2B2A27]">{c.show}</span>
                    <span className="text-[#8C8880] truncate max-w-[320px]">{c.episode}</span>
                    <span className="font-mono text-xs text-[#8C8880]">{formatTime(c.start)}</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-1 -ml-3">
                    {sense && (
                      <span className="min-h-[34px] px-3 flex items-center text-[13px] text-[#55524C]">
                        Sense {ROMAN[sense.definition] ?? sense.definition + 1}.{def?.gloss ? ` · ${def.gloss.split('；')[0]}` : ''}
                      </span>
                    )}
                    <button
                      onClick={() => !saved && onSaveClip(c, sense ?? null)}
                      disabled={saved}
                      className="min-h-[34px] px-3 rounded-full flex items-center gap-1.5 text-[13px] text-[#55524C] hover:text-stone-900 hover:bg-[#F3EFE6] disabled:hover:bg-transparent disabled:text-[#9A5420]"
                    >
                      {saved ? <><Check className="w-3.5 h-3.5" /> Saved with this sentence</> : <><Bookmark className="w-3.5 h-3.5" /> Save with this sentence</>}
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      )}

      {status === 'ready' && clips.length > 0 && (
        <p className="font-serif italic text-sm text-[#8C8880]">Shown with the sentence before and after. Audio clips are being added.</p>
      )}
    </section>
  );
};
