
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { WordEntry } from '../types';
import { speechService } from '../services/speechService';
import { Volume2, CheckCircle2, XCircle, ArrowRight, CornerDownLeft, Trophy, RotateCcw } from 'lucide-react';

interface SpellingBeeProps {
  words: WordEntry[];
  onCorrect: () => void;
}

type Result = 'correct' | 'wrong' | null;

const SESSION_SIZE = 10;
const GRADUATE_STREAK = 2; // spell it right twice (across sessions) and it retires
const RECORD_KEY = 'lexiai_spelling_v1';

interface SpellRecord { streak: number; wrong: number; lastSeen: number }

const loadRecords = (): Record<string, SpellRecord> => {
  try { return JSON.parse(localStorage.getItem(RECORD_KEY) || '{}'); } catch { return {}; }
};
const saveRecords = (r: Record<string, SpellRecord>) => {
  try { localStorage.setItem(RECORD_KEY, JSON.stringify(r)); } catch { /* full */ }
};

/**
 * Build one session's queue with clear priorities:
 *   1. words you've misspelled before (redemption first)
 *   2. words in SRS rotation not yet graduated
 *   3. fresh words never attempted
 * Graduated words (streak >= GRADUATE_STREAK) stay out — the pool truly shrinks.
 */
const buildQueue = (words: WordEntry[], records: Record<string, SpellRecord>): WordEntry[] => {
  const shuffle = <T,>(a: T[]) => [...a].sort(() => Math.random() - 0.5);
  const active = words.filter(w => (records[w.word]?.streak ?? 0) < GRADUATE_STREAK);
  const missed = active.filter(w => (records[w.word]?.wrong ?? 0) > 0);
  const rotation = active.filter(w => w.srs && !(records[w.word]?.wrong));
  const fresh = active.filter(w => !w.srs && !(records[w.word]?.wrong));
  const queue = [...shuffle(missed), ...shuffle(rotation), ...shuffle(fresh)].slice(0, SESSION_SIZE);
  // Everything graduated? Celebrate by revisiting the least-recently-seen ones.
  if (queue.length === 0) {
    return shuffle(words).sort((a, b) => (records[a.word]?.lastSeen ?? 0) - (records[b.word]?.lastSeen ?? 0)).slice(0, SESSION_SIZE);
  }
  return queue;
};

const normalize = (s: string) => s.toLowerCase().replace(/[^a-z']/g, ' ').replace(/\s+/g, ' ').trim();

export const SpellingBee: React.FC<SpellingBeeProps> = ({ words, onCorrect }) => {
  const [records, setRecords] = useState<Record<string, SpellRecord>>(loadRecords);
  const [queue, setQueue] = useState<WordEntry[]>(() => buildQueue(words, loadRecords()));
  const [index, setIndex] = useState(0);
  const [attempt, setAttempt] = useState('');
  const [result, setResult] = useState<Result>(null);
  const [sessionCorrect, setSessionCorrect] = useState(0);
  const [sessionTotal, setSessionTotal] = useState(0);
  const [retried, setRetried] = useState<Set<string>>(new Set());
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => () => speechService.stopSpeaking(), []);

  const current = queue[index];
  const done = !current;
  const graduatedCount = useMemo(
    () => words.filter(w => (records[w.word]?.streak ?? 0) >= GRADUATE_STREAK).length,
    [words, records],
  );

  const definition = current?.meanings?.[0]?.definitions?.[0]?.definition || '';
  const partOfSpeech = current?.meanings?.[0]?.partOfSpeech || '';

  // Blank hint: first letter shown, rest as underscores, word-by-word for phrases.
  const hint = useMemo(
    () =>
      (current?.word || '')
        .split(/\s+/)
        .map(token => token[0] + ' _'.repeat(Math.max(0, token.length - 1)))
        .join('   '),
    [current?.word],
  );

  const record = (word: string, ok: boolean) => {
    const next = { ...records };
    const r = next[word] ?? { streak: 0, wrong: 0, lastSeen: 0 };
    next[word] = ok
      ? { ...r, streak: r.streak + 1, lastSeen: Date.now() }
      : { ...r, streak: 0, wrong: r.wrong + 1, lastSeen: Date.now() };
    setRecords(next);
    saveRecords(next);
  };

  const check = () => {
    if (!current || !attempt.trim() || result) return;
    const ok = normalize(attempt) === normalize(current.word);
    setResult(ok ? 'correct' : 'wrong');
    setSessionTotal(n => n + 1);
    record(current.word, ok);
    if (ok) {
      setSessionCorrect(n => n + 1);
      onCorrect();
      setTimeout(next, 1100);
    } else if (!retried.has(current.word)) {
      // One in-session retry: the word comes back at the end of this round.
      setRetried(prev => new Set(prev).add(current.word));
      setQueue(prev => [...prev, current]);
    }
  };

  const next = () => {
    speechService.stopSpeaking();
    setIndex(i => i + 1);
    setAttempt('');
    setResult(null);
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const newSession = () => {
    setQueue(buildQueue(words, records));
    setIndex(0);
    setAttempt('');
    setResult(null);
    setSessionCorrect(0);
    setSessionTotal(0);
    setRetried(new Set());
  };

  if (words.length === 0) return null;

  if (done) {
    const perfect = sessionTotal > 0 && sessionCorrect === sessionTotal;
    return (
      <div className="w-full">
        <div className="bg-white rounded-xl shadow-lg border border-stone-100 p-10 text-center space-y-5">
          <Trophy className={`w-10 h-10 mx-auto ${perfect ? 'text-amber-500' : 'text-stone-300'}`} />
          <h3 className="text-3xl font-serif font-bold text-stone-900">
            {perfect ? 'Perfect round!' : 'Round complete'}
          </h3>
          <p className="text-stone-500">
            {sessionCorrect} / {sessionTotal} correct this round.
          </p>
          <p className="text-sm text-stone-400">
            🎓 <span className="font-bold text-stone-600">{graduatedCount}</span> of {words.length} words spelling-mastered
            <span className="block mt-1">(spell a word right twice and it retires for good — the pool keeps shrinking)</span>
          </p>
          <button
            onClick={newSession}
            className="px-8 py-4 bg-stone-900 text-white rounded-xl font-bold hover:bg-black transition-colors inline-flex items-center gap-2"
          >
            <RotateCcw className="w-4 h-4" /> Next 10 Words
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full space-y-6">
      <div className="flex justify-between items-center px-2">
        <span className="text-xs text-stone-400 font-semibold uppercase tracking-wider">Type the word you hear or recognize</span>
        <span className="font-mono text-sm text-stone-400">{Math.min(index + 1, queue.length)} / {queue.length} · {sessionCorrect} correct</span>
      </div>

      {/* Progress bar — a session has a real finish line */}
      <div className="h-1.5 bg-stone-100 rounded-full overflow-hidden">
        <div className="h-full bg-stone-900 rounded-full transition-all duration-500" style={{ width: `${(index / queue.length) * 100}%` }} />
      </div>

      <div className="bg-white rounded-xl shadow-lg border border-stone-100 p-8 space-y-6">
        <div className="space-y-3">
          <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded-full border bg-stone-50 text-stone-500 border-stone-100 inline-block">
            {partOfSpeech}
          </span>
          <p className="text-xl font-serif italic text-stone-800 leading-relaxed">“{definition}”</p>
          <p className="font-mono text-lg text-stone-400 tracking-wider select-none">{hint}</p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => speechService.speak(current.word, 0.85)}
            className="shrink-0 w-12 h-12 rounded-full bg-white border-2 border-stone-900 text-stone-900 flex items-center justify-center hover:bg-stone-50 transition-all"
            title="Hear the word"
          >
            <Volume2 className="w-5 h-5" />
          </button>
          <input
            ref={inputRef}
            value={attempt}
            onChange={e => { setAttempt(e.target.value); if (result === 'wrong') setResult(null); }}
            onKeyDown={e => { if (e.key === 'Enter') result === 'wrong' ? next() : check(); }}
            placeholder="Spell it…"
            autoFocus
            spellCheck={false}
            autoComplete="off"
            className={`flex-1 p-4 rounded-xl border-2 outline-none text-xl font-serif transition-all ${
              result === 'correct' ? 'border-emerald-400 bg-emerald-50 text-emerald-900' :
              result === 'wrong' ? 'border-red-300 bg-red-50 text-red-900' :
              'border-stone-200 bg-stone-50 focus:border-stone-900'
            }`}
          />
          <button
            onClick={result === 'wrong' ? next : check}
            className="shrink-0 px-5 h-12 rounded-xl bg-stone-900 text-white text-sm font-bold hover:bg-black transition-colors flex items-center gap-2"
          >
            {result === 'wrong' ? <>Next <ArrowRight className="w-4 h-4" /></> : <>Check <CornerDownLeft className="w-4 h-4" /></>}
          </button>
        </div>

        {result === 'correct' && (
          <p className="flex items-center gap-2 text-emerald-700 text-sm font-bold animate-fade-in">
            <CheckCircle2 className="w-4 h-4" /> Spot on! +5 XP {(records[current.word]?.streak ?? 0) >= GRADUATE_STREAK && <span className="text-stone-500 font-normal">· 🎓 mastered — retired from spelling</span>}
          </p>
        )}
        {result === 'wrong' && (
          <p className="flex items-center gap-2 text-stone-600 text-sm animate-fade-in">
            <XCircle className="w-4 h-4 text-red-500 shrink-0" />
            It's spelled <span className="font-bold font-serif text-stone-900 capitalize">{current.word}</span> — it'll come back at the end of this round.
          </p>
        )}
      </div>
    </div>
  );
};
