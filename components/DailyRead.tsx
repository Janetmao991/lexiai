
import React, { useState, useMemo } from 'react';
import { WordEntry } from '../types';
import { generateDailyRead, DailyReadResult } from '../services/geminiService';
import { todayStr } from '../services/srsService';
import { Newspaper, Loader2, RefreshCw, Sparkles } from 'lucide-react';

interface DailyReadProps {
  words: WordEntry[];
}

interface CachedRead extends DailyReadResult {
  date: string;
  words: string[];
}

const CACHE_KEY = 'lexiai_daily_read_v1';

const loadCache = (): CachedRead | null => {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed: CachedRead = JSON.parse(raw);
    return parsed.date === todayStr() ? parsed : null;
  } catch {
    return null;
  }
};

// Words you're actively memorizing come first; freshest saves fill the rest.
const pickTargets = (words: WordEntry[]): string[] => {
  const inRotation = words.filter(w => w.srs).sort((a, b) => (a.srs!.due < b.srs!.due ? -1 : 1));
  const rest = words.filter(w => !w.srs);
  return [...inRotation, ...rest].slice(0, 5).map(w => w.word);
};

const friendlyError = (raw: string): string => {
  if (/429|RESOURCE_EXHAUSTED|quota/i.test(raw)) return 'Free-tier quota reached — try again in a minute, or come back tomorrow.';
  if (/503|high demand|overloaded/i.test(raw)) return 'The AI service is briefly overloaded — try again in a few seconds.';
  if (/API key/i.test(raw)) return raw;
  return 'Could not generate today\'s read. Please try again.';
};

export const DailyRead: React.FC<DailyReadProps> = ({ words }) => {
  const [read, setRead] = useState<CachedRead | null>(() => loadCache());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const highlight = useMemo(() => {
    if (!read) return null;
    const sorted = [...read.words].sort((a, b) => b.length - a.length);
    const stem = (t: string) => (t.length > 4 ? t.slice(0, t.length - 2) : t);
    const pattern = sorted
      .map(w => w.trim().split(/\s+/).map(t => stem(t).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + "[a-z']*").join("\\s+"))
      .join('|');
    return new RegExp(`\\b(${pattern})`, 'gi');
  }, [read]);

  const renderPassage = (text: string) => {
    if (!highlight) return text;
    const parts = text.split(highlight);
    return parts.map((part, i) =>
      i % 2 === 1 ? (
        <span key={i} className="bg-emerald-50 text-emerald-900 px-1 rounded font-bold border-b-2 border-emerald-400">
          {part}
        </span>
      ) : (
        <React.Fragment key={i}>{part}</React.Fragment>
      )
    );
  };

  const generate = async () => {
    setLoading(true);
    setError(null);
    try {
      const targets = pickTargets(words);
      if (targets.length < 3) throw new Error('Save a few more words first — the daily read needs at least 3.');
      const result = await generateDailyRead(targets);
      const cached: CachedRead = { ...result, date: todayStr(), words: targets };
      localStorage.setItem(CACHE_KEY, JSON.stringify(cached));
      setRead(cached);
    } catch (e: any) {
      setError(friendlyError(String(e?.message || '')));
    } finally {
      setLoading(false);
    }
  };

  if (words.length === 0) return null;

  return (
    <div className="max-w-2xl mx-auto w-full">
      <div className="bg-white rounded-[2rem] border border-stone-100 shadow-lg overflow-hidden">
        <div className="px-8 py-5 border-b border-stone-100 flex items-center justify-between">
          <h3 className="font-serif font-bold text-lg text-stone-900 flex items-center gap-2">
            <Newspaper className="w-5 h-5" /> Today's Read
          </h3>
          {read && (
            <button
              onClick={generate}
              disabled={loading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-stone-200 bg-stone-50 text-xs font-bold text-stone-500 hover:text-stone-900 hover:border-stone-400 transition-all disabled:opacity-40"
              title="Generate a fresh passage"
            >
              {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />} New Passage
            </button>
          )}
        </div>

        <div className="p-8">
          {!read && !loading && (
            <div className="text-center space-y-4 py-4">
              <p className="text-stone-500 text-sm max-w-md mx-auto">
                A short passage written just for you, weaving in 5 words from your review rotation — seeing them again in fresh context is how they stick.
              </p>
              {error && <p className="text-amber-700 text-sm">{error}</p>}
              <button
                onClick={generate}
                className="px-6 py-3 bg-stone-900 text-white rounded-full text-sm font-bold hover:bg-black transition-colors inline-flex items-center gap-2"
              >
                <Sparkles className="w-4 h-4" /> Generate Today's Read
              </button>
            </div>
          )}

          {loading && !read && (
            <div className="text-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-stone-400 mx-auto" />
              <p className="text-xs text-stone-400 mt-3">Writing your passage…</p>
            </div>
          )}

          {read && (
            <article className="space-y-4 animate-fade-in">
              <h4 className="text-2xl font-serif font-bold text-stone-900">{read.title}</h4>
              <p className="text-lg font-serif text-stone-700 leading-loose whitespace-pre-line">
                {renderPassage(read.passage)}
              </p>
              {error && <p className="text-amber-700 text-sm">{error}</p>}
              <p className="text-xs text-stone-400 pt-2 border-t border-stone-50">
                Featuring: {read.words.join(' · ')}
              </p>
            </article>
          )}
        </div>
      </div>
    </div>
  );
};
