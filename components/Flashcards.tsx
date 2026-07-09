
import React, { useState, useMemo } from 'react';
import { WordEntry, SrsRating } from '../types';
import { srsService, MASTERY_META } from '../services/srsService';
import { RotateCcw, ChevronLeft, ChevronRight, CheckCircle2, Layers, Gamepad2, CalendarClock, Keyboard } from 'lucide-react';
import { SynonymMatch } from './SynonymMatch';
import { SpellingBee } from './SpellingBee';

interface FlashcardsProps {
  words: WordEntry[];
  onReview: (entry: WordEntry, rating: SrsRating) => void;
  onGameComplete: () => void;
  onSpellCorrect: () => void;
  newCardsToday: number;
}

type Mode = 'due' | 'all' | 'spell' | 'game';

// Familiar cards flip direction: definition first, recall the word.
// Active recall in the production direction is what speaking draws on.
const isReverseCard = (w: WordEntry) => (w.srs?.reps ?? 0) >= 2 && (w.srs!.reps % 2 === 0);

// New words enter the SRS rotation gradually so the due pile stays humane.
export const DAILY_NEW_CARD_LIMIT = 20;

const RATING_BUTTONS: { rating: SrsRating; label: string; classes: string }[] = [
  { rating: 'again', label: 'Forgot', classes: 'bg-red-50 text-red-700 border-red-200 hover:bg-red-100' },
  { rating: 'hard', label: 'Fuzzy', classes: 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100' },
  { rating: 'good', label: 'Got It', classes: 'bg-stone-100 text-stone-800 border-stone-300 hover:bg-stone-200' },
  { rating: 'easy', label: 'Easy', classes: 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100' },
];

export const Flashcards: React.FC<FlashcardsProps> = ({ words, onReview, onGameComplete, onSpellCorrect, newCardsToday }) => {
  const [mode, setMode] = useState<Mode>('due');
  const [browseIndex, setBrowseIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [sessionDone, setSessionDone] = useState(0);

  // The due queue is recomputed from props; reviewed cards drop out on their own
  // because onReview updates the word's srs.due upstream.
  // Learning cards (already in rotation) always show when due; brand-new cards
  // trickle in at DAILY_NEW_CARD_LIMIT per day.
  const { dueQueue, newCardsRemaining, newBacklog } = useMemo(() => {
    const learningDue = words.filter(w => w.srs && srsService.isDue(w));
    const fresh = words.filter(w => !w.srs);
    const budget = Math.max(0, DAILY_NEW_CARD_LIMIT - newCardsToday);
    return {
      dueQueue: [...learningDue, ...fresh.slice(0, budget)],
      newCardsRemaining: Math.min(budget, fresh.length),
      newBacklog: fresh.length,
    };
  }, [words, newCardsToday]);

  if (words.length === 0) {
    return (
      <div className="text-center py-20 text-stone-400">
        <p>Your notebook is empty. Add words to start reviewing.</p>
      </div>
    );
  }

  const isFinance = (pos: string) => {
    const lower = pos.toLowerCase();
    return lower.includes('finance') || lower.includes('business') || lower.includes('economic');
  };

  const getDynamicFontSize = (text: string) => {
    const length = text.length;
    if (length > 35) return 'text-lg md:text-xl';
    if (length > 25) return 'text-xl md:text-2xl';
    if (length > 14) return 'text-2xl md:text-3xl';
    if (length > 8) return 'text-3xl md:text-4xl';
    return 'text-4xl md:text-5xl';
  };

  const handleRate = (entry: WordEntry, rating: SrsRating) => {
    setIsFlipped(false);
    setSessionDone(n => n + 1);
    setTimeout(() => onReview(entry, rating), 200);
  };

  const handleBrowseNext = () => {
    setIsFlipped(false);
    setTimeout(() => setBrowseIndex(prev => (prev + 1) % words.length), 200);
  };

  const handleBrowsePrev = () => {
    setIsFlipped(false);
    setTimeout(() => setBrowseIndex(prev => (prev - 1 + words.length) % words.length), 200);
  };

  const currentCard = mode === 'due' ? dueQueue[0] : words[browseIndex % words.length];

  const renderModeSwitch = () => (
    <div className="flex items-center gap-1 bg-stone-100 rounded-full p-1">
      {([
        { id: 'due', label: 'Due Today', icon: <CalendarClock className="w-3.5 h-3.5" /> },
        { id: 'all', label: 'Browse All', icon: <Layers className="w-3.5 h-3.5" /> },
        { id: 'spell', label: 'Spelling', icon: <Keyboard className="w-3.5 h-3.5" /> },
        { id: 'game', label: 'Match Game', icon: <Gamepad2 className="w-3.5 h-3.5" /> },
      ] as { id: Mode; label: string; icon: React.ReactNode }[]).map(m => (
        <button
          key={m.id}
          onClick={() => { setMode(m.id); setIsFlipped(false); }}
          className={`px-3 py-1.5 rounded-full text-xs font-bold flex items-center gap-1.5 transition-all ${
            mode === m.id ? 'bg-stone-900 text-white shadow' : 'text-stone-500 hover:text-stone-900'
          }`}
        >
          {m.icon} {m.label}
        </button>
      ))}
    </div>
  );

  if (mode === 'game') {
    return (
      <div className="max-w-xl mx-auto flex flex-col items-center space-y-8 py-8">
        <div className="w-full flex justify-between items-center px-2">
          <h2 className="text-2xl font-serif font-bold text-stone-800">Synonym Match</h2>
          {renderModeSwitch()}
        </div>
        <SynonymMatch words={words} onComplete={onGameComplete} />
      </div>
    );
  }

  if (mode === 'spell') {
    return (
      <div className="max-w-xl mx-auto flex flex-col items-center space-y-8 py-8">
        <div className="w-full flex justify-between items-center px-2">
          <h2 className="text-2xl font-serif font-bold text-stone-800">Spelling</h2>
          {renderModeSwitch()}
        </div>
        <SpellingBee words={words} onCorrect={onSpellCorrect} />
      </div>
    );
  }

  if (mode === 'due' && dueQueue.length === 0) {
    return (
      <div className="max-w-xl mx-auto flex flex-col items-center space-y-8 py-8">
        <div className="w-full flex justify-between items-center px-2">
          <h2 className="text-2xl font-serif font-bold text-stone-800">Review</h2>
          {renderModeSwitch()}
        </div>
        <div className="w-full bg-white rounded-xl shadow-lg border border-stone-100 p-16 text-center space-y-4 animate-fade-in">
          <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto" />
          <h3 className="text-2xl font-serif font-bold text-stone-900">All caught up!</h3>
          <p className="text-stone-500">
            {sessionDone > 0 ? `${sessionDone} cards reviewed this session. ` : ''}
            {newBacklog > 0
              ? `Today's ${DAILY_NEW_CARD_LIMIT} new cards are done — ${newBacklog} more will trickle in over the coming days.`
              : 'No cards due today. Come back tomorrow, or browse the full deck.'}
          </p>
          <button
            onClick={() => setMode('all')}
            className="mt-2 px-6 py-3 bg-stone-900 text-white rounded-full text-sm font-bold hover:bg-black transition-colors"
          >
            Browse All Words
          </button>
        </div>
      </div>
    );
  }

  const fontSizeClass = getDynamicFontSize(currentCard.word);
  const masteryMeta = MASTERY_META[srsService.masteryLevel(currentCard)];
  const reversed = mode === 'due' && isReverseCard(currentCard);
  const firstDef = currentCard.meanings?.[0]?.definitions?.[0]?.definition || '';
  const firstPos = currentCard.meanings?.[0]?.partOfSpeech || '';

  return (
    <div className="max-w-xl mx-auto flex flex-col items-center space-y-8 py-8">

      {/* Header row */}
      <div className="w-full flex justify-between items-center px-2">
         <h2 className="text-2xl font-serif font-bold text-stone-800">Review</h2>
         {renderModeSwitch()}
      </div>
      <div className="w-full flex justify-between items-center px-2 -mt-4">
        <span className="text-xs text-stone-400 font-semibold uppercase tracking-wider" title={`Mastery: ${masteryMeta.label}`}>
          {masteryMeta.icon} {masteryMeta.label}
        </span>
        <span className="font-mono text-sm text-stone-400">
          {mode === 'due'
            ? `${dueQueue.length} due${newCardsRemaining > 0 ? ` (${newCardsRemaining} new)` : ''}`
            : `${(browseIndex % words.length) + 1} / ${words.length}`}
        </span>
      </div>

      {/* Card Container */}
      <div
        className="relative w-full aspect-[4/3] cursor-pointer group perspective-1000"
        onClick={() => setIsFlipped(!isFlipped)}
      >
        <div className={`relative w-full h-full duration-700 transform-style-3d transition-all ${isFlipped ? 'rotate-y-180' : ''}`}>

          {/* Front Side (word — or definition when the card runs in reverse) */}
          <div className="absolute w-full h-full bg-white rounded-xl shadow-lg border border-stone-100 p-8 flex flex-col items-center justify-center backface-hidden">
             {reversed ? (
               <div className="text-center space-y-4 w-full px-4">
                  <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded-full border bg-amber-50 text-amber-700 border-amber-100 inline-block">
                    Reverse · What's the word?
                  </span>
                  <p className="text-xl md:text-2xl font-serif italic text-stone-800 leading-relaxed">“{firstDef}”</p>
                  <p className="text-sm text-stone-400">
                    {firstPos} · starts with <span className="font-bold text-stone-600 uppercase">{currentCard.word[0]}</span>
                  </p>
               </div>
             ) : (
               <div className="text-center space-y-4 w-full px-4">
                  <h2 className={`${fontSizeClass} font-serif font-bold text-stone-900 capitalize tracking-tight`}>
                    {currentCard.word}
                  </h2>
                  <span className="inline-block text-lg text-stone-400 font-mono">
                    /{currentCard.ipa}/
                  </span>
               </div>
             )}
             <p className="absolute bottom-6 text-xs text-stone-300 uppercase tracking-widest font-semibold">
                Tap to reveal
             </p>
          </div>

          {/* Back Side (definition — or the word when the card runs in reverse) */}
          <div className="absolute w-full h-full bg-stone-900 rounded-xl shadow-xl border border-stone-800 p-8 flex flex-col items-center justify-center backface-hidden rotate-y-180 text-stone-200">
            {reversed ? (
              <div className="text-center space-y-4 w-full px-4">
                <h2 className={`${fontSizeClass} font-serif font-bold text-white capitalize tracking-tight`}>
                  {currentCard.word}
                </h2>
                <span className="inline-block text-lg text-stone-400 font-mono">
                  /{currentCard.ipa}/
                </span>
                {currentCard.contexts && currentCard.contexts.length > 0 && (
                  <p className="text-sm font-serif italic text-stone-400 leading-relaxed pt-4 border-t border-stone-800">
                    “{currentCard.contexts[0].targetSentence}”
                  </p>
                )}
              </div>
            ) : (
            <div className="space-y-6 text-center overflow-y-auto max-h-full scrollbar-hide w-full px-2 pb-6">
              {currentCard.meanings.map((m, i) => {
                const financeStyle = isFinance(m.partOfSpeech);
                return (
                  <div key={i} className="mb-6 last:mb-0">
                    <span className={`text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded mb-3 inline-block border ${
                      financeStyle ? 'border-emerald-800 text-emerald-400 bg-emerald-900/30' : 'border-stone-700 text-stone-400 bg-stone-800'
                    }`}>
                        {m.partOfSpeech}
                    </span>
                    <div className="space-y-4">
                      {m.definitions.map((def, j) => (
                        <div key={j}>
                          <p className="text-lg leading-relaxed font-serif text-stone-100">
                             {def.definition}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
              {currentCard.contexts && currentCard.contexts.length > 0 && (
                <div className="border-t border-stone-800 pt-4 mt-2">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-stone-500 mb-2">
                    Where you met it · {currentCard.contexts[0].sourceTitle}
                  </p>
                  <p className="text-sm font-serif italic text-stone-300 leading-relaxed">
                    “{currentCard.contexts[0].targetSentence}”
                  </p>
                </div>
              )}
            </div>
            )}
             <p className="absolute bottom-4 text-xs text-stone-600 uppercase tracking-widest font-semibold flex items-center gap-1">
                <RotateCcw className="w-3 h-3" /> Flip
             </p>
          </div>
        </div>
      </div>

      {/* Controls */}
      {mode === 'due' ? (
        isFlipped ? (
          <div className="grid grid-cols-4 gap-3 w-full animate-fade-in">
            {RATING_BUTTONS.map(({ rating, label, classes }) => (
              <button
                key={rating}
                onClick={(e) => { e.stopPropagation(); handleRate(currentCard, rating); }}
                className={`py-3 rounded-xl border text-sm font-bold transition-all ${classes}`}
              >
                {label}
              </button>
            ))}
          </div>
        ) : (
          <p className="text-sm text-stone-400">Flip the card, then rate how well you remembered it.</p>
        )
      ) : (
        <div className="flex gap-6">
          <button
            onClick={(e) => { e.stopPropagation(); handleBrowsePrev(); }}
            className="w-14 h-14 rounded-full bg-white border border-stone-200 shadow-sm hover:shadow-md text-stone-500 hover:text-stone-900 flex items-center justify-center transition-all"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); handleBrowseNext(); }}
            className="w-14 h-14 rounded-full bg-stone-900 shadow-lg text-white hover:bg-black flex items-center justify-center transition-all"
          >
            <ChevronRight className="w-6 h-6" />
          </button>
        </div>
      )}
    </div>
  );
};
