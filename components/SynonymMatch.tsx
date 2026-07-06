
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { WordEntry } from '../types';
import { Trophy, TimerReset } from 'lucide-react';

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
  const completedRef = useRef(false);

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
    }
  }, [matched, pairTotal, status, onComplete]);

  const restart = () => {
    completedRef.current = false;
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
      {/* Status bar */}
      <div className="flex justify-between items-center px-2">
        <span className="font-mono text-sm text-stone-500">{matched.size} / {pairTotal} pairs</span>
        <span className={`font-mono text-lg font-bold ${secondsLeft <= 10 ? 'text-red-600' : 'text-stone-700'}`}>
          0:{String(secondsLeft).padStart(2, '0')}
        </span>
      </div>

      {status !== 'playing' && (
        <div className="bg-white rounded-xl shadow-lg border border-stone-100 p-10 text-center space-y-4 animate-fade-in">
          {status === 'won' ? (
            <>
              <Trophy className="w-10 h-10 text-amber-500 mx-auto" />
              <h3 className="text-2xl font-serif font-bold text-stone-900">Perfect Match!</h3>
              <p className="text-stone-500">All {pairTotal} pairs matched with {secondsLeft}s to spare.</p>
            </>
          ) : (
            <>
              <TimerReset className="w-10 h-10 text-stone-400 mx-auto" />
              <h3 className="text-2xl font-serif font-bold text-stone-900">Time's Up</h3>
              <p className="text-stone-500">{matched.size} of {pairTotal} pairs matched. Try another round.</p>
            </>
          )}
          <button
            onClick={restart}
            className="px-6 py-3 bg-stone-900 text-white rounded-full text-sm font-bold hover:bg-black transition-colors"
          >
            Play Again
          </button>
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
