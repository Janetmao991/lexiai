
import React, { useState } from 'react';
import { WordEntry, PracticeFeedback } from '../types';
import { checkSentence } from '../services/geminiService';
import { PenTool, Check, AlertCircle, RefreshCw, Loader2, Award } from 'lucide-react';

interface PracticeProps {
  initialWord?: WordEntry;
  words: WordEntry[];
}

export const Practice: React.FC<PracticeProps> = ({ initialWord, words }) => {
  if (words.length === 0) {
    return (
        <div className="text-center py-20 text-stone-400">
            <p>Save words to your notebook to practice sentence building.</p>
        </div>
    )
  }

  const [selectedWord, setSelectedWord] = useState<WordEntry>(initialWord || words[0]);
  const [sentence, setSentence] = useState('');
  const [feedback, setFeedback] = useState<PracticeFeedback | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!sentence.trim()) return;
    setLoading(true);
    setFeedback(null);
    try {
      const result = await checkSentence(selectedWord.word, sentence);
      setFeedback(result);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleWordChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const word = words.find(w => w.word === e.target.value);
    if (word) {
      setSelectedWord(word);
      setSentence('');
      setFeedback(null);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-8">
      
      <div className="flex items-center justify-between border-b border-stone-200 pb-4">
         <h2 className="text-3xl font-serif font-bold text-stone-800">Active Practice</h2>
      </div>

      <div className="bg-white p-8 rounded-xl shadow-sm border border-stone-100">
        <div className="space-y-6">
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-stone-400 mb-2">Target Word</label>
                <select 
                value={selectedWord.word}
                onChange={handleWordChange}
                className="w-full p-3 bg-stone-50 border border-stone-200 rounded-lg outline-none focus:ring-1 focus:ring-stone-400 font-serif text-lg"
                >
                {words.map(w => (
                    <option key={w.word} value={w.word}>{w.word}</option>
                ))}
                </select>
            </div>
            
            <div className="bg-stone-50 p-4 rounded-lg border border-stone-100">
                <p className="text-2xl font-serif font-bold text-stone-900 capitalize mb-1">{selectedWord.word}</p>
                <p className="text-stone-600 text-sm italic font-serif leading-relaxed">
                    {selectedWord.meanings[0]?.definitions[0]?.definition || "Definition unavailable"}
                </p>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-stone-400 mb-2">Your Sentence</label>
            <textarea
              value={sentence}
              onChange={(e) => setSentence(e.target.value)}
              placeholder={`Write a sentence using "${selectedWord.word}"...`}
              className="w-full h-40 p-5 bg-white border border-stone-200 rounded-lg outline-none focus:border-stone-400 focus:ring-1 focus:ring-stone-400 transition-all resize-none text-lg font-serif text-stone-800 placeholder:text-stone-300"
            />
          </div>

          <div className="flex justify-end">
            <button
                onClick={handleSubmit}
                disabled={loading || !sentence}
                className="px-8 py-3 bg-stone-900 text-white font-medium rounded-full hover:bg-black disabled:opacity-50 transition-colors flex items-center gap-2 shadow-lg hover:shadow-xl"
            >
                {loading ? <Loader2 className="animate-spin w-5 h-5" /> : <><Check className="w-5 h-5" /> Check My Usage</>}
            </button>
          </div>
        </div>
      </div>

      {feedback && (
        <div className={`rounded-xl overflow-hidden animate-fade-in-up border ${
          feedback.isCorrect ? 'border-green-100' : 'border-amber-100'
        }`}>
          <div className={`p-6 border-b flex justify-between items-center ${
              feedback.isCorrect ? 'bg-green-50/50 border-green-100' : 'bg-amber-50/50 border-amber-100'
          }`}>
            <h3 className={`font-bold text-lg font-serif flex items-center gap-2 ${feedback.isCorrect ? 'text-green-900' : 'text-amber-900'}`}>
              {feedback.isCorrect ? <Award className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
              {feedback.isCorrect ? 'Excellent Usage' : 'Needs Adjustment'}
            </h3>
            <span className={`px-4 py-1 rounded-full text-sm font-bold tracking-wide ${
              feedback.score > 80 ? 'bg-green-100 text-green-800' : 
              feedback.score > 50 ? 'bg-amber-100 text-amber-800' : 'bg-red-100 text-red-800'
            }`}>
              {feedback.score}/100
            </span>
          </div>
          
          <div className="p-8 bg-white space-y-8">
            <div>
               <h4 className="text-xs font-bold text-stone-400 uppercase tracking-wider mb-3">Analysis</h4>
               <p className="text-stone-700 leading-relaxed font-serif text-lg">{feedback.explanation}</p>
            </div>

            {!feedback.isCorrect && (
              <div className="bg-stone-50 p-6 rounded-lg border-l-4 border-amber-400">
                <h4 className="text-xs font-bold text-stone-500 uppercase tracking-wider mb-2">Correction</h4>
                <p className="text-stone-800 font-serif text-lg">{feedback.correctedSentence}</p>
              </div>
            )}

            {feedback.suggestions.length > 0 && (
                <div>
                     <h4 className="text-xs font-bold text-stone-400 uppercase tracking-wider mb-3">Better Alternatives</h4>
                     <ul className="space-y-2">
                        {feedback.suggestions.map((s, i) => (
                            <li key={i} className="text-stone-600 font-serif italic border-b border-stone-50 pb-2 last:border-0">{s}</li>
                        ))}
                     </ul>
                </div>
            )}
            
            <button 
              onClick={() => { setFeedback(null); setSentence(''); }}
              className="text-stone-500 font-medium flex items-center gap-2 hover:text-stone-900 transition-colors text-sm"
            >
              <RefreshCw className="w-4 h-4" /> Clear and try again
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
