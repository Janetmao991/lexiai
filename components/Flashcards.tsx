
import React, { useState } from 'react';
import { WordEntry } from '../types';
import { RotateCcw, ChevronLeft, ChevronRight } from 'lucide-react';

interface FlashcardsProps {
  words: WordEntry[];
}

export const Flashcards: React.FC<FlashcardsProps> = ({ words }) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);

  if (words.length === 0) {
    return (
      <div className="text-center py-20 text-stone-400">
        <p>Your notebook is empty. Add words to start reviewing.</p>
      </div>
    );
  }

  const currentCard = words[currentIndex];

  const handleNext = () => {
    setIsFlipped(false);
    setTimeout(() => {
      setCurrentIndex((prev) => (prev + 1) % words.length);
    }, 200);
  };

  const handlePrev = () => {
    setIsFlipped(false);
    setTimeout(() => {
      setCurrentIndex((prev) => (prev - 1 + words.length) % words.length);
    }, 200);
  };

  const isFinance = (pos: string) => {
    const lower = pos.toLowerCase();
    return lower.includes('finance') || lower.includes('business') || lower.includes('economic');
  };

  // Helper to adjust font size based on word length to keep it on one line
  const getDynamicFontSize = (text: string) => {
    const length = text.length;
    // Aggressive scaling for phrases
    if (length > 35) return 'text-lg md:text-xl';
    if (length > 25) return 'text-xl md:text-2xl';
    // "Right Up Your Alley" is 19 chars. Previously this hit the >12 bucket (3xl).
    // Now we force it smaller.
    if (length > 14) return 'text-2xl md:text-3xl'; 
    if (length > 8) return 'text-3xl md:text-4xl';
    return 'text-4xl md:text-5xl';
  };

  const fontSizeClass = getDynamicFontSize(currentCard.word);

  return (
    <div className="max-w-xl mx-auto flex flex-col items-center space-y-10 py-8">
      
      {/* Progress */}
      <div className="w-full flex justify-between items-center px-2">
         <h2 className="text-2xl font-serif font-bold text-stone-800">Review</h2>
         <span className="font-mono text-sm text-stone-400">{currentIndex + 1} / {words.length}</span>
      </div>

      {/* Card Container */}
      <div 
        className="relative w-full aspect-[4/3] cursor-pointer group perspective-1000"
        onClick={() => setIsFlipped(!isFlipped)}
      >
        <div className={`relative w-full h-full duration-700 transform-style-3d transition-all ${isFlipped ? 'rotate-y-180' : ''}`}>
          
          {/* Front Side (Word) */}
          <div className="absolute w-full h-full bg-white rounded-xl shadow-lg border border-stone-100 p-8 flex flex-col items-center justify-center backface-hidden">
             <div className="text-center space-y-4 w-full px-4">
                <h2 className={`${fontSizeClass} font-serif font-bold text-stone-900 capitalize tracking-tight`}>
                  {currentCard.word}
                </h2>
                <span className="inline-block text-lg text-stone-400 font-mono">
                  /{currentCard.ipa}/
                </span>
             </div>
             <p className="absolute bottom-6 text-xs text-stone-300 uppercase tracking-widest font-semibold">
                Tap to reveal
             </p>
          </div>

          {/* Back Side (Definition) */}
          <div className="absolute w-full h-full bg-stone-900 rounded-xl shadow-xl border border-stone-800 p-8 flex flex-col items-center justify-center backface-hidden rotate-y-180 text-stone-200">
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
            </div>
             <p className="absolute bottom-4 text-xs text-stone-600 uppercase tracking-widest font-semibold flex items-center gap-1">
                <RotateCcw className="w-3 h-3" /> Flip
             </p>
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="flex gap-6">
        <button 
          onClick={(e) => { e.stopPropagation(); handlePrev(); }}
          className="w-14 h-14 rounded-full bg-white border border-stone-200 shadow-sm hover:shadow-md text-stone-500 hover:text-stone-900 flex items-center justify-center transition-all"
        >
          <ChevronLeft className="w-6 h-6" />
        </button>
        <button 
          onClick={(e) => { e.stopPropagation(); handleNext(); }}
          className="w-14 h-14 rounded-full bg-stone-900 shadow-lg text-white hover:bg-black flex items-center justify-center transition-all"
        >
          <ChevronRight className="w-6 h-6" />
        </button>
      </div>
    </div>
  );
};
