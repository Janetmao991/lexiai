
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { WordEntry } from '../types';
import { speechService } from '../services/speechService';
import { Volume2, CheckCircle2, XCircle, ArrowRight, CornerDownLeft } from 'lucide-react';

interface SpellingBeeProps {
  words: WordEntry[];
  onCorrect: () => void;
}

type Result = 'correct' | 'wrong' | null;

const pickNext = (words: WordEntry[], exclude?: string): WordEntry => {
  // Prefer words already in review rotation — spelling reinforces what you're memorizing.
  const rotation = words.filter(w => w.srs && w.word !== exclude);
  const pool = rotation.length >= 5 ? rotation : words.filter(w => w.word !== exclude);
  return pool[Math.floor(Math.random() * pool.length)] ?? words[0];
};

const normalize = (s: string) => s.toLowerCase().replace(/[^a-z']/g, ' ').replace(/\s+/g, ' ').trim();

export const SpellingBee: React.FC<SpellingBeeProps> = ({ words, onCorrect }) => {
  const [current, setCurrent] = useState<WordEntry>(() => pickNext(words));
  const [attempt, setAttempt] = useState('');
  const [result, setResult] = useState<Result>(null);
  const [sessionCorrect, setSessionCorrect] = useState(0);
  const [sessionTotal, setSessionTotal] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => () => speechService.stopSpeaking(), []);

  const definition = current.meanings?.[0]?.definitions?.[0]?.definition || '';
  const partOfSpeech = current.meanings?.[0]?.partOfSpeech || '';

  // Blank hint: first letter shown, rest as underscores, word-by-word for phrases.
  const hint = useMemo(
    () =>
      current.word
        .split(/\s+/)
        .map(token => token[0] + ' _'.repeat(Math.max(0, token.length - 1)))
        .join('   '),
    [current.word],
  );

  const check = () => {
    if (!attempt.trim() || result) return;
    const ok = normalize(attempt) === normalize(current.word);
    setResult(ok ? 'correct' : 'wrong');
    setSessionTotal(n => n + 1);
    if (ok) {
      setSessionCorrect(n => n + 1);
      onCorrect();
      setTimeout(next, 1100);
    }
  };

  const next = () => {
    speechService.stopSpeaking();
    setCurrent(prev => pickNext(words, prev.word));
    setAttempt('');
    setResult(null);
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  if (words.length === 0) return null;

  return (
    <div className="w-full space-y-6">
      <div className="flex justify-between items-center px-2">
        <span className="text-xs text-stone-400 font-semibold uppercase tracking-wider">Type the word you hear or recognize</span>
        <span className="font-mono text-sm text-stone-400">{sessionCorrect} / {sessionTotal} correct</span>
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
            <CheckCircle2 className="w-4 h-4" /> Spot on! +5 XP
          </p>
        )}
        {result === 'wrong' && (
          <p className="flex items-center gap-2 text-stone-600 text-sm animate-fade-in">
            <XCircle className="w-4 h-4 text-red-500 shrink-0" />
            It's spelled <span className="font-bold font-serif text-stone-900 capitalize">{current.word}</span> — hit Next and it'll come around again.
          </p>
        )}
      </div>
    </div>
  );
};
