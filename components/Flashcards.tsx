
import React, { useState, useMemo } from 'react';
import { WordEntry, SrsRating } from '../types';
import { srsService, MASTERY_META } from '../services/srsService';
import { ChevronLeft, ChevronRight, CheckCircle2, Layers, Gamepad2, CalendarClock, Keyboard, Volume2 } from 'lucide-react';
import { playPronunciation } from '../services/geminiService';
import { ipaLabel } from '../services/format';
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

const ROMAN = ['i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii', 'ix', 'x'];

/** Highlighter stroke under the word inside the learner's saved sentence. */
const markWord = (text: string, word: string): React.ReactNode => {
  const head = word.trim().split(/\s+/)[0] || word;
  const stem = head.length > 4 && head.endsWith('e') ? head.slice(0, -1) : head;
  const re = new RegExp(`(\\b${stem.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\w'-]*)`, 'gi');
  return text.split(re).map((part, i) => i % 2 === 1 ? <span key={i} className="lx-mark font-semibold text-stone-900">{part}</span> : part);
};

const RATING_BUTTONS: { rating: SrsRating; label: string }[] = [
  { rating: 'again', label: 'Forgot' },
  { rating: 'hard', label: 'Fuzzy' },
  { rating: 'good', label: 'Got it' },
  { rating: 'easy', label: 'Easy' },
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
    <div className="flex items-center gap-1 bg-[#F3EFE6] rounded-full p-1 max-w-full overflow-x-auto">
      {([
        { id: 'due', label: 'Due Today', icon: <CalendarClock className="w-3.5 h-3.5" /> },
        { id: 'all', label: 'Browse All', icon: <Layers className="w-3.5 h-3.5" /> },
        { id: 'spell', label: 'Spelling', icon: <Keyboard className="w-3.5 h-3.5" /> },
        { id: 'game', label: 'Match Game', icon: <Gamepad2 className="w-3.5 h-3.5" /> },
      ] as { id: Mode; label: string; icon: React.ReactNode }[]).map(m => (
        <button
          key={m.id}
          onClick={() => { setMode(m.id); setIsFlipped(false); }}
          className={`px-3 min-h-[34px] rounded-full text-xs flex items-center gap-1.5 transition-all whitespace-nowrap shrink-0 ${
            mode === m.id ? 'bg-white text-stone-900 font-semibold shadow-[0_1px_2px_rgba(40,30,10,.08)]' : 'text-[#55524C] hover:text-stone-900'
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
        <div className="w-full flex flex-wrap justify-between items-center gap-3 px-2">
          <h2 className="font-serif font-medium text-4xl tracking-[-0.02em] text-stone-900">Synonym Match</h2>
          {renderModeSwitch()}
        </div>
        <SynonymMatch words={words} onComplete={onGameComplete} />
      </div>
    );
  }

  if (mode === 'spell') {
    return (
      <div className="max-w-xl mx-auto flex flex-col items-center space-y-8 py-8">
        <div className="w-full flex flex-wrap justify-between items-center gap-3 px-2">
          <h2 className="font-serif font-medium text-4xl tracking-[-0.02em] text-stone-900">Spelling</h2>
          {renderModeSwitch()}
        </div>
        <SpellingBee words={words} onCorrect={onSpellCorrect} />
      </div>
    );
  }

  if (mode === 'due' && dueQueue.length === 0) {
    return (
      <div className="max-w-xl mx-auto flex flex-col items-center space-y-8 py-8">
        <div className="w-full flex flex-wrap justify-between items-center gap-3 px-2">
          <h2 className="font-serif font-medium text-4xl tracking-[-0.02em] text-stone-900">Review</h2>
          {renderModeSwitch()}
        </div>
        <div className="w-full bg-white rounded-[26px] border border-[#EDE8DE] p-10 sm:p-16 text-center space-y-4 animate-fade-in">
          <CheckCircle2 className="w-10 h-10 text-[#9A5420] mx-auto stroke-[1.5]" />
          <h3 className="text-3xl font-serif font-medium text-stone-900">All caught up</h3>
          <p className="text-stone-500">
            {sessionDone > 0 ? `${sessionDone} ${sessionDone === 1 ? 'card' : 'cards'} reviewed this session. ` : ''}
            {newBacklog > 0
              ? `Today's ${DAILY_NEW_CARD_LIMIT} new cards are done — ${newBacklog} more will trickle in over the coming days.`
              : 'No cards due today. Come back tomorrow, or browse the full deck.'}
          </p>
          <button
            onClick={() => setMode('all')}
            className="mt-2 px-6 min-h-[44px] bg-stone-900 text-[#FBF9F4] rounded-full text-sm font-medium hover:bg-black transition-colors"
          >
            Browse All Words
          </button>
        </div>
      </div>
    );
  }

  const fontSizeClass = getDynamicFontSize(currentCard.word);
  const masteryMeta = MASTERY_META[srsService.masteryLevel(currentCard)];
  // A word with a saved sentence is quizzed in that sentence: "what does it mean HERE?"
  const ctx = currentCard.contexts?.length ? currentCard.contexts[currentCard.contexts.length - 1] : undefined;
  const ctxSense = ctx?.sense ? currentCard.meanings[ctx.sense.meaning]?.definitions[ctx.sense.definition] : undefined;
  const reversed = mode === 'due' && !ctx && isReverseCard(currentCard);
  const firstDef = currentCard.meanings?.[0]?.definitions?.[0]?.definition || '';
  const firstPos = currentCard.meanings?.[0]?.partOfSpeech || '';
  const intervalHint = (rating: SrsRating) => {
    const days = srsService.schedule(currentCard.srs, rating).interval;
    return days <= 1 ? (rating === 'again' ? 'today' : '1 day') : `${days} days`;
  };

  return (
    <div className="max-w-xl mx-auto flex flex-col space-y-6 py-4 sm:py-8">
      {/* Header row */}
      <div className="flex flex-wrap justify-between items-center gap-3">
        <h2 className="font-serif font-medium text-4xl tracking-[-0.02em] text-stone-900">Review</h2>
        {renderModeSwitch()}
      </div>
      <div className="flex items-center gap-3.5">
        <div aria-hidden="true" className="flex-1 h-0.5 rounded-full bg-[#EDE8DE] overflow-hidden">
          {mode === 'due' && <div className="h-full bg-stone-900 transition-all" style={{ width: `${Math.round(sessionDone / Math.max(1, sessionDone + dueQueue.length) * 100)}%` }} />}
        </div>
        <span className="font-serif italic text-sm text-[#8C8880] shrink-0">
          {mode === 'due'
            ? `${dueQueue.length} left${newCardsRemaining > 0 ? ` · ${newCardsRemaining} new` : ''}`
            : `${(browseIndex % words.length) + 1} of ${words.length}`}
        </span>
      </div>

      {/* Card */}
      <section
        aria-live="polite"
        onClick={() => !isFlipped && setIsFlipped(true)}
        className={`bg-white border border-[#EDE8DE] rounded-[26px] px-6 sm:px-10 py-8 sm:py-10 shadow-[0_18px_36px_-24px_rgba(40,30,10,.14)] space-y-6 min-h-[340px] ${isFlipped ? '' : 'cursor-pointer'}`}
      >
        {ctx ? (
          <>
            <p className="lx-label">What does <span className="normal-case tracking-normal font-serif italic text-sm text-stone-900">{currentCard.word}</span> mean here?</p>
            <p className="font-serif text-2xl leading-normal text-[#6B675F]">{markWord(ctx.targetSentence, currentCard.word)}</p>
            <p className="font-serif italic text-[13px] text-[#8C8880]">{ctx.sourceTitle} · {new Date(ctx.timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</p>
            {isFlipped && (
              <div className="border-t border-[#F2EEE6] pt-5 grid grid-cols-[32px_minmax(0,1fr)] gap-x-1.5 animate-fade-in">
                <span aria-hidden="true" className="font-serif italic text-[17px] text-[#B5AFA3] leading-[1.45]">{ctx.sense ? `${ROMAN[ctx.sense.definition] ?? ctx.sense.definition + 1}.` : ''}</span>
                <div className="space-y-2">
                  <p className="font-serif text-xl leading-[1.38] font-medium text-stone-900">{ctxSense?.definition || ctx.explanation}</p>
                  {ctxSense?.gloss && <p className="gloss">{ctxSense.gloss}</p>}
                  {ctxSense && ctx.explanation && ctx.explanation !== ctxSense.definition && (
                    <p className="text-sm text-[#6B675F] leading-relaxed">In your sentence: {ctx.explanation}</p>
                  )}
                </div>
              </div>
            )}
          </>
        ) : reversed ? (
          <>
            <p className="lx-label">What's the word?</p>
            <p className="font-serif italic text-xl sm:text-2xl leading-relaxed text-stone-900">“{firstDef}”</p>
            <p className="text-sm text-[#8C8880]"><span className="font-serif italic">{firstPos}</span> · starts with <span className="font-semibold text-[#2B2A27] uppercase">{currentCard.word[0]}</span></p>
            {isFlipped && (
              <div className="border-t border-[#F2EEE6] pt-5 animate-fade-in space-y-2">
                <h3 className={`${fontSizeClass} font-serif font-medium tracking-[-0.02em] text-stone-900 break-words`}>{currentCard.word}</h3>
                <span className="font-mono text-sm text-[#6B675F]">{ipaLabel(currentCard.ipa)}</span>
              </div>
            )}
          </>
        ) : (
          <>
            <div className="space-y-3">
              <h3 className={`${fontSizeClass} font-serif font-medium tracking-[-0.025em] text-stone-900 break-words`}>{currentCard.word}</h3>
              <div className="flex items-center gap-3">
                <span className="font-mono text-sm text-[#6B675F]">{ipaLabel(currentCard.ipa)}</span>
                <button
                  onClick={(e) => { e.stopPropagation(); playPronunciation(currentCard.word); }}
                  aria-label="Hear it"
                  className="w-9 h-9 rounded-full border border-[#E2DDD2] text-[#2B2A27] flex items-center justify-center hover:border-stone-900 transition-colors"
                >
                  <Volume2 className="w-4 h-4" />
                </button>
              </div>
            </div>
            {isFlipped && (
              <div className="border-t border-[#F2EEE6] pt-5 space-y-5 animate-fade-in">
                {currentCard.meanings.slice(0, 2).map((m, mi) => (
                  <div key={mi} className="space-y-3">
                    <p className="font-serif italic text-[#2B2A27] first-letter:lowercase">{m.partOfSpeech}</p>
                    {m.definitions.slice(0, 3).map((d, di) => (
                      <div key={di} className="grid grid-cols-[28px_minmax(0,1fr)] gap-x-1">
                        <span aria-hidden="true" className="font-serif italic text-[#B5AFA3] leading-[1.45]">{ROMAN[di]}.</span>
                        <div className="space-y-1">
                          <p className="font-serif text-lg leading-snug text-stone-900">{d.definition}</p>
                          {d.gloss && <p className="gloss !text-[15px]">{d.gloss}</p>}
                        </div>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </section>

      {/* Controls */}
      {mode === 'due' ? (
        isFlipped ? (
          <div role="group" aria-label="How well did you remember?" className="grid grid-cols-4 gap-2 animate-fade-in">
            {RATING_BUTTONS.map(({ rating, label }) => (
              <button
                key={rating}
                onClick={() => handleRate(currentCard, rating)}
                className={`flex flex-col items-center justify-center gap-0.5 min-h-[60px] rounded-2xl text-[15px] font-medium transition-colors ${
                  rating === 'good' ? 'bg-stone-900 text-[#FBF9F4] hover:bg-black' : 'border border-[#E2DDD2] text-stone-900 hover:border-stone-900'
                }`}
              >
                {label}
                <span className={`text-[11px] font-normal ${rating === 'good' ? 'text-stone-400' : 'text-[#8C8880]'}`}>{intervalHint(rating)}</span>
              </button>
            ))}
          </div>
        ) : (
          <button onClick={() => setIsFlipped(true)} className="min-h-[56px] rounded-full bg-stone-900 text-[#FBF9F4] text-[15px] font-medium hover:bg-black transition-colors">
            Show meaning
          </button>
        )
      ) : (
        <div className="flex justify-center gap-4">
          <button
            onClick={handleBrowsePrev}
            aria-label="Previous card"
            className="w-14 h-14 rounded-full border border-[#E2DDD2] text-[#55524C] hover:text-stone-900 hover:border-stone-900 flex items-center justify-center transition-colors"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
          <button
            onClick={handleBrowseNext}
            aria-label="Next card"
            className="w-14 h-14 rounded-full bg-stone-900 text-white hover:bg-black flex items-center justify-center transition-colors"
          >
            <ChevronRight className="w-6 h-6" />
          </button>
        </div>
      )}
      <p className="text-center text-xs text-[#B5AFA3] flex items-center justify-center gap-1.5">
        <span>{masteryMeta.label}</span>
      </p>
    </div>
  );
};
