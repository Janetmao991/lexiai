
import React from 'react';
import { SentenceEntry } from '../types';
import { Trash2, Quote, Search, Sparkles } from 'lucide-react';

interface SentenceListProps {
  sentences: SentenceEntry[];
  onDelete: (id: string) => void;
  onLookup: (word: string) => void;
}

export const SentenceList: React.FC<SentenceListProps> = ({ sentences, onDelete, onLookup }) => {
  if (sentences.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-stone-400 animate-fade-in min-h-[400px]">
        <Quote className="w-10 h-10 mb-4 opacity-10" />
        <p className="text-sm font-medium">No sentences saved yet.</p>
        <p className="text-xs mt-1">Analyze a sentence in the Dictionary and hit “Save Sentence”.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 min-h-[400px] py-2">
      {sentences.map(entry => (
        <article key={entry.id} className="bg-white rounded-2xl border border-stone-100 shadow-sm hover:shadow-md transition-shadow p-8 space-y-6 animate-fade-in">
          {/* The sentence itself is the hero — magazine pull-quote style */}
          <blockquote className="border-l-4 border-stone-900 pl-6">
            <p className="text-xl font-serif text-stone-900 leading-relaxed">“{entry.sentence}”</p>
          </blockquote>

          <div>
            <h4 className="text-[10px] font-bold uppercase tracking-[0.25em] text-stone-400 mb-2">In Plain English</h4>
            <p className="text-stone-600 font-serif leading-relaxed">{entry.meaning}</p>
          </div>

          {entry.vocabulary.length > 0 && (
            <div>
              <h4 className="text-[10px] font-bold uppercase tracking-[0.25em] text-stone-400 mb-3">Tricky Bits — tap to look up</h4>
              <div className="space-y-2">
                {entry.vocabulary.map((v, i) => (
                  <p key={i} className="text-sm leading-relaxed">
                    <button
                      onClick={() => onLookup(v.word)}
                      className="font-serif font-bold text-stone-900 capitalize hover:underline decoration-stone-300 decoration-2 underline-offset-4 inline-flex items-center gap-1"
                      title="Look up in the dictionary"
                    >
                      <Search className="w-3 h-3 text-stone-300" />{v.word}
                    </button>
                    <span className="text-stone-500 italic font-serif"> — {v.definition}</span>
                  </p>
                ))}
              </div>
            </div>
          )}

          {entry.alternatives.length > 0 && (
            <div>
              <h4 className="text-[10px] font-bold uppercase tracking-[0.25em] text-stone-400 mb-2 flex items-center gap-1">
                <Sparkles className="w-3 h-3" /> Say It Another Way
              </h4>
              <ul className="space-y-1.5">
                {entry.alternatives.map((alt, i) => (
                  <li key={i} className="text-sm text-stone-500 italic font-serif border-b border-stone-50 pb-1.5 last:border-0">"{alt}"</li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex justify-between items-center pt-2 border-t border-stone-50">
            <span className="text-[10px] text-stone-300 font-bold uppercase tracking-widest">
              Saved {new Date(entry.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </span>
            <button
              onClick={() => onDelete(entry.id)}
              className="p-2 text-stone-300 hover:text-red-500 hover:bg-red-50 rounded-full transition-all"
              title="Delete sentence"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </article>
      ))}
    </div>
  );
};
