
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { WordEntry } from '../types';
import { Trophy, TimerReset, Flame, Zap, RotateCcw } from 'lucide-react';

// Win-streak + records, persisted across sessions.
const STATS_KEY = 'lexiai_match_v1';
interface MatchStats { streak: number; bestStreak: number; bestTime: number | null }
const loadStats = (): MatchStats => {
  try { return { streak: 0, bestStreak: 0, bestTime: null, ...JSON.parse(localStorage.getItem(STATS_KEY) || '{}') }; }
  catch { return { streak: 0, bestStreak: 0, bestTime: null }; }
};
const saveStats = (s: MatchStats) => { try { localStorage.setItem(STATS_KEY, JSON.stringify(s)); } catch { /* full */ } };

interface SynonymMatchProps {
  words: WordEntry[];
  onComplete: () => void; // fired once per finished round (all pairs matched)
}

interface Tile {
  id: number;
  pairId: number;
  text: string;
  kind: 'word' | 'synonym';
}

const ROUND_SECONDS = 60;
const PAIR_COUNT = 6;

const shuffle = <T,>(arr: T[]): T[] => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

const buildRound = (words: WordEntry[]): Tile[] => {
  const candidates = words.filter(w =>
    w.meanings?.[0]?.definitions?.[0]?.synonyms?.length
  );
  const picked = shuffle(candidates).slice(0, PAIR_COUNT);
  const tiles: Tile[] = [];
  picked.forEach((w, pairId) => {
    const synonyms = w.meanings[0].definitions[0].synonyms;
    const synonym = synonyms[Math.floor(Math.random() * synonyms.length)];
    tiles.push({ id: pairId * 2, pairId, text: w.word, kind: 'word' });
    tiles.push({ id: pairId * 2 + 1, pairId, text: synonym, kind: 'synonym' });
  });
  return shuffle(tiles);
};

export const SynonymMatch: React.FC<SynonymMatchProps> = ({ words, onComplete }) => {
  const [tiles, setTiles] = useState<Tile[]>(() => buildRound(words));
  const [selected, setSelected] = useState<Tile | null>(null);
  const [matched, setMatched] = useState<Set<number>>(new Set());
  const [wrongPair, setWrongPair] = useState<Set<number>>(new Set());
  const [secondsLeft, setSecondsLeft] = useState(ROUND_SECONDS);
  const [status, setStatus] = useState<'playing' | 'won' | 'lost'>('playing');
  const [stats, setStats] = useState<MatchStats>(loadStats);
  const [roundTime, setRoundTime] = useState(0); // frozen at the winning click
  const completedRef = useRef(false);
  const lostRef = useRef(false);

  const pairTotal = useMemo(() => tiles.length / 2, [tiles]);

  useEffect(() => {
    if (status !== 'playing') return;
    const t = setInterval(() => {
      setSecondsLeft(s => {
        if (s <= 1) {
          setStatus('lost');
          clearInterval(t);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [status]);

  useEffect(() => {
    if (status === 'playing' && pairTotal > 0 && matched.size === pairTotal && !completedRef.current) {
      completedRef.current = true;
      setStatus('won');
      onComplete();
      const used = ROUND_SECONDS - secondsLeft;
      setRoundTime(used);
      setStats(prev => {
        const next: MatchStats = {
          streak: prev.streak + 1,
          bestStreak: Math.max(prev.bestStreak, prev.streak + 1),
          bestTime: prev.bestTime === null ? used : Math.min(prev.bestTime, used),
        };
        saveStats(next);
        return next;
      });
    }
  }, [matched, pairTotal, status, onComplete, secondsLeft]);

  // Time's up breaks the streak.
  useEffect(() => {
    if (status === 'lost' && !lostRef.current) {
      lostRef.current = true;
      setStats(prev => {
        const next = { ...prev, streak: 0 };
        saveStats(next);
        return next;
      });
    }
  }, [status]);

  const restart = () => {
    completedRef.current = false;
    lostRef.current = false;
    setTiles(buildRound(words));
    setSelected(null);
    setMatched(new Set());
    setWrongPair(new Set());
    setSecondsLeft(ROUND_SECONDS);
    setStatus('playing');
  };

  const handleTileClick = (tile: Tile) => {
    if (status !== 'playing' || matched.has(tile.pairId)) return;
    if (!selected) {
      setSelected(tile);
      return;
    }
    if (selected.id === tile.id) {
      setSelected(null);
      return;
    }
    if (selected.pairId === tile.pairId && selected.kind !== tile.kind) {
      setMatched(prev => new Set(prev).add(tile.pairId));
      setSelected(null);
    } else {
      const wrong = new Set([selected.id, tile.id]);
      setWrongPair(wrong);
      setSelected(null);
      setTimeout(() => setWrongPair(new Set()), 500);
    }
  };

  if (tiles.length < 4) {
    return (
      <div className="text-center py-16 text-stone-400">
        <p>Not enough words with synonyms yet. Save a few more words first.</p>
      </div>
    );
  }

  return (
    <div className="w-full space-y-6">
      {/* Status bar: pairs · streak · timer */}
      <div className="flex justify-between items-center px-2">
        <div className="flex items-center gap-3">
          <span className="font-mono text-sm text-stone-500">{matched.size} / {pairTotal} pairs</span>
          {stats.streak > 0 && (
            <span className="flex items-center gap-1 text-xs font-bold text-amber-700 bg-amber-50 border border-amber-100 px-2.5 py-1 rounded-full">
              <Flame className="w-3.5 h-3.5" /> {stats.streak} win streak
            </span>
          )}
        </div>
        <span className={`font-mono text-lg font-bold tabular-nums ${secondsLeft <= 10 ? 'text-red-600' : 'text-stone-700'}`}>
          0:{String(secondsLeft).padStart(2, '0')}
        </span>
      </div>

      {status !== 'playing' && (
        <div className="bg-white rounded-[2rem] shadow-xl border border-stone-100 p-10 text-center animate-fade-in-up">
          <div className={`w-20 h-20 mx-auto rounded-full flex items-center justify-center mb-5 ${
            status === 'won' ? 'bg-amber-50 border border-amber-100' : 'bg-stone-50 border border-stone-100'
          }`}>
            {status === 'won'
              ? <Trophy className="w-9 h-9 text-amber-500" />
              : <TimerReset className="w-9 h-9 text-stone-400" />}
          </div>

          <h3 className="text-3xl font-serif font-bold text-stone-900 mb-2">
            {status === 'won' ? 'Perfect Match!' : "Time's Up"}
          </h3>
          <p className="text-stone-500 mb-8">
            {status === 'won'
              ? `All ${pairTotal} pairs matched in ${roundTime} seconds.`
              : `${matched.size} of ${pairTotal} pairs matched — one more go?`}
          </p>

          {/* Scoreboard */}
          <div className="grid grid-cols-3 gap-3 max-w-md mx-auto mb-8">
            <div className="bg-stone-50 border border-stone-100 rounded-2xl py-4 px-2">
              <p className="text-2xl font-serif font-bold text-stone-900">{matched.size}<span className="text-base text-stone-400">/{pairTotal}</span></p>
              <p className="text-[10px] font-bold uppercase tracking-widest text-stone-400 mt-1">Pairs</p>
            </div>
            <div className={`rounded-2xl py-4 px-2 border ${stats.streak > 0 ? 'bg-amber-50 border-amber-100' : 'bg-stone-50 border-stone-100'}`}>
              <p className={`text-2xl font-serif font-bold flex items-center justify-center gap-1 ${stats.streak > 0 ? 'text-amber-700' : 'text-stone-900'}`}>
                <Flame className={`w-5 h-5 ${stats.streak > 0 ? 'text-amber-500' : 'text-stone-300'}`} />{stats.streak}
              </p>
              <p className="text-[10px] font-bold uppercase tracking-widest text-stone-400 mt-1">Win Streak · Best {stats.bestStreak}</p>
            </div>
            <div className="bg-stone-50 border border-stone-100 rounded-2xl py-4 px-2">
              <p className="text-2xl font-serif font-bold text-stone-900 flex items-center justify-center gap-1">
                <Zap className="w-5 h-5 text-stone-300" />{stats.bestTime !== null ? `${stats.bestTime}s` : '—'}
              </p>
              <p className="text-[10px] font-bold uppercase tracking-widest text-stone-400 mt-1">Fastest Win</p>
            </div>
          </div>

          <button
            onClick={restart}
            className="px-8 py-4 bg-stone-900 text-white rounded-full font-bold hover:bg-black transition-all hover:-translate-y-0.5 shadow-lg inline-flex items-center gap-2"
          >
            <RotateCcw className="w-4 h-4" /> Play Again
          </button>
          {status === 'lost' && stats.bestStreak > 0 && (
            <p className="text-xs text-stone-400 mt-4">Streak reset — your record of {stats.bestStreak} is waiting to be beaten.</p>
          )}
        </div>
      )}

      {status === 'playing' && (
        <div className="grid grid-cols-3 gap-3">
          {tiles.map(tile => {
            const isMatched = matched.has(tile.pairId);
            const isSelected = selected?.id === tile.id;
            const isWrong = wrongPair.has(tile.id);
            return (
              <button
                key={tile.id}
                onClick={() => handleTileClick(tile)}
                disabled={isMatched}
                className={`min-h-20 p-3 rounded-xl border text-sm font-serif font-bold capitalize transition-all ${
                  isMatched ? 'opacity-0 pointer-events-none' :
                  isWrong ? 'bg-red-50 border-red-300 text-red-700 animate-pulse' :
                  isSelected ? 'bg-stone-900 text-white border-stone-900 shadow-lg scale-105' :
                  tile.kind === 'word'
                    ? 'bg-white border-stone-200 text-stone-900 hover:border-stone-400 shadow-sm'
                    : 'bg-stone-50 border-stone-200 text-stone-600 italic hover:border-stone-400'
                }`}
              >
                {tile.text}
              </button>
            );
          })}
        </div>
      )}

      <p className="text-center text-xs text-stone-400">Match each word (upright) with its synonym (italic) before the timer runs out.</p>
    </div>
  );
};
