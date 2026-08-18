
import React, { useState, useEffect } from 'react';
import { WordEntry, SynonymComparison, SentenceAnalysis } from '../types';
import { lookupWord, playPronunciation, compareSynonyms, analyzeSentence } from '../services/geminiService';
import { Search, Volume2, Save, Loader2, GitCompare, FileText, Sparkles, Check, Layers, Tag, TrendingUp } from 'lucide-react';
import { DailyRead } from './DailyRead';

interface DictionaryProps {
  onSave: (word: WordEntry) => void;
  savedWords: WordEntry[];
  /** External lookup request (e.g. a word tapped in Ask Lexi); `n` forces re-runs of the same word. */
  lookupRequest?: { word: string; n: number } | null;
}

type DictionaryMode = 'DEFINE' | 'COMPARE' | 'ANALYZE';

/** Loose compare so "On The Margin " and "on the margin" don't read as a changed headword. */
const normalizeForm = (s: string) =>
  s.trim().toLowerCase().replace(/\s+/g, ' ').replace(/[.!?,;:]+$/, '');

export const Dictionary: React.FC<DictionaryProps> = ({ onSave, savedWords, lookupRequest }) => {
  const [activeMode, setActiveMode] = useState<DictionaryMode>('DEFINE');
  const [loading, setLoading] = useState(false);
  const [savingWord, setSavingWord] = useState<string | null>(null);
  const [error, setError] = useState('');

  // Define Mode States
  const [query, setQuery] = useState('');
  const [lookupResult, setLookupResult] = useState<WordEntry | null>(null);

  // Compare Mode States
  const [compareInputs, setCompareInputs] = useState(['', '', '']);
  const [compareResult, setCompareResult] = useState<SynonymComparison | null>(null);

  // Analyze Mode States
  const [analyzeInput, setAnalyzeInput] = useState('');
  const [analyzeResult, setAnalyzeResult] = useState<SentenceAnalysis | null>(null);

  const resetResults = () => {
    setLookupResult(null);
    setCompareResult(null);
    setAnalyzeResult(null);
    setError('');
  };

  const doLookup = async (word: string) => {
    if (!word.trim()) return;
    setActiveMode('DEFINE');
    setQuery(word);
    setLoading(true);
    setError('');
    setLookupResult(null);
    setCompareResult(null);
    setAnalyzeResult(null);
    try {
      const data = await lookupWord(word);
      if (data) setLookupResult(data);
      else setError('No results found.');
    } catch (err: any) {
      const msg = String(err?.message || '');
      if (/429|RESOURCE_EXHAUSTED|quota/i.test(msg)) {
        setError('Free-tier quota reached for now. Wait a minute and retry — or if it persists, today\'s allowance is used up (resets at midnight PT).');
      } else if (/timeout|deadline|aborted/i.test(msg)) {
        setError('The AI took too long to answer (free-tier congestion). Please try again.');
      } else if (/API key/i.test(msg)) {
        setError(msg);
      } else {
        setError('Connection failed. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (lookupRequest?.word) doLookup(lookupRequest.word);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lookupRequest?.n]);

  const handleLookup = (e: React.FormEvent) => {
    e.preventDefault();
    doLookup(query);
  };

  const handleCompare = async (e: React.FormEvent) => {
    e.preventDefault();
    const words = compareInputs.filter(w => w.trim().length > 0);
    if (words.length < 2) {
      setError('Please enter at least two words.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const data = await compareSynonyms(words[0], words[1], words[2]);
      setCompareResult(data);
    } catch (err) {
      setError('Failed to compare words.');
    } finally {
      setLoading(false);
    }
  };

  const handleAnalyze = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!analyzeInput.trim()) return;
    setLoading(true);
    setError('');
    try {
      const data = await analyzeSentence(analyzeInput);
      setAnalyzeResult(data);
    } catch (err) {
      setError('Failed to analyze sentence.');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveFromComparison = async (word: string) => {
    if (isSaved(word)) return;
    setSavingWord(word);
    try {
      const entry = await lookupWord(word);
      if (entry) onSave(entry);
    } catch (err) {
      console.error("Failed to save word from comparison", err);
    } finally {
      setSavingWord(null);
    }
  };

  const isSaved = (w: string) => savedWords.some(sw => sw.word.toLowerCase() === w.toLowerCase());

  const isFinance = (pos: string) => {
    const lower = pos.toLowerCase();
    return lower.includes('finance') || lower.includes('business') || lower.includes('economic');
  };

  const modes = [
    { 
      id: 'DEFINE', 
      label: 'Define Word', 
      desc: 'Precision lookup',
      icon: <Search className="w-5 h-5" /> 
    },
    { 
      id: 'COMPARE', 
      label: 'Compare Synonyms', 
      desc: 'Master nuances',
      icon: <GitCompare className="w-5 h-5" /> 
    },
    { 
      id: 'ANALYZE', 
      label: 'Analyze Sentence', 
      desc: 'Break down structure',
      icon: <FileText className="w-5 h-5" /> 
    },
  ];

  return (
    <div className="max-w-4xl mx-auto space-y-16 animate-fade-in pb-20">
      <div className="text-center space-y-6">
        <h2 className="text-6xl font-serif font-bold text-stone-900 tracking-tight">LexiAI Toolkit</h2>
        <p className="text-stone-500 font-serif italic text-lg max-w-lg mx-auto">Select a tool below to sharpen your advanced English mastery.</p>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-12 max-w-3xl mx-auto px-4">
           {modes.map((mode) => {
             const isActive = activeMode === mode.id;
             return (
               <button
                 key={mode.id}
                 onClick={() => { setActiveMode(mode.id as DictionaryMode); resetResults(); }}
                 className={`flex flex-col items-center gap-3 p-6 rounded-2xl transition-all border-2 text-center group ${
                   isActive 
                   ? 'bg-white border-stone-800 shadow-xl -translate-y-1' 
                   : 'bg-stone-50 border-transparent hover:bg-stone-100 hover:border-stone-200'
                 }`}
               >
                 <div className={`p-3 rounded-xl transition-colors ${isActive ? 'bg-stone-900 text-white' : 'bg-white text-stone-400 group-hover:text-stone-600 shadow-sm'}`}>
                   {mode.icon}
                 </div>
                 <div>
                   <h3 className={`font-bold text-base ${isActive ? 'text-stone-900' : 'text-stone-600'}`}>{mode.label}</h3>
                   <p className={`text-[11px] uppercase tracking-widest font-bold mt-1 ${isActive ? 'text-stone-400' : 'text-stone-400'}`}>
                     {mode.desc}
                   </p>
                 </div>
               </button>
             );
           })}
        </div>
      </div>

      <div className="mt-8 transition-all duration-500 ease-in-out">
        {activeMode === 'DEFINE' && (
          <div className="space-y-8 animate-fade-in-up">
            <form onSubmit={handleLookup} className="relative max-w-xl mx-auto group">
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Lookup an advanced word..."
                className="w-full pl-8 pr-16 py-6 rounded-3xl bg-white border border-stone-200 focus:border-stone-800 transition-all outline-none text-2xl shadow-lg hover:shadow-xl font-serif"
              />
              <button type="submit" disabled={loading} className="absolute right-4 top-4 bottom-4 w-14 bg-stone-900 text-white rounded-2xl flex items-center justify-center hover:bg-black transition-all hover:scale-105 active:scale-95 shadow-md">
                {loading ? <Loader2 className="animate-spin w-6 h-6" /> : <Search className="w-6 h-6" />}
              </button>
            </form>

            {lookupResult && (
              <div className="animate-fade-in-up bg-white rounded-[2.5rem] border border-stone-100 overflow-hidden shadow-2xl p-12">
                <div className="flex flex-col md:flex-row justify-between items-start mb-12 gap-8">
                  <div>
                    <h1 className="text-6xl font-serif font-bold mb-5 tracking-tight capitalize text-stone-900">{lookupResult.word}</h1>
                    <div className="flex items-center gap-5">
                      <span className="font-mono text-base text-stone-400 bg-stone-50 px-3 py-1 rounded-lg border border-stone-100">/{lookupResult.ipa || '---'}/</span>
                      <button onClick={() => playPronunciation(lookupResult.word)} className="p-3 bg-stone-100 text-stone-900 rounded-full hover:bg-stone-900 hover:text-white transition-all hover:scale-110 shadow-sm">
                        <Volume2 className="w-5 h-5" />
                      </button>
                    </div>
                    {/* The entry was normalized to a different headword — keep the query visible instead of swallowing it. */}
                    {lookupResult.originalQuery
                      && normalizeForm(lookupResult.originalQuery) !== normalizeForm(lookupResult.word)
                      && !lookupResult.candidates?.length && (
                      <p className="mt-5 text-sm text-stone-400">
                        You searched <span className="font-serif italic text-stone-600">“{lookupResult.originalQuery}”</span> — shown under its standard headword.
                      </p>
                    )}
                  </div>
                  <button 
                    onClick={() => onSave(lookupResult)} 
                    disabled={isSaved(lookupResult.word)}
                    className={`px-8 py-4 rounded-xl font-bold flex items-center gap-3 shadow-lg transition-all ${
                      isSaved(lookupResult.word)
                      ? 'bg-stone-50 text-stone-300 shadow-none border border-stone-100 cursor-default' 
                      : 'bg-stone-900 text-white hover:bg-black active:scale-[0.98] hover:-translate-y-1'
                    }`}
                  >
                    <Save className="w-5 h-5" />
                    {isSaved(lookupResult.word) ? 'Saved' : 'Save to Notebook'}
                  </button>
                </div>

                {/* Reverse-lookup candidates (Chinese/description queries) — closest first, click to look up */}
                {lookupResult.candidates && lookupResult.candidates.length > 0 && (
                  <div className="mb-12 p-6 bg-stone-50 rounded-2xl border border-stone-100 space-y-3">
                    <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-stone-400">Other ways to say it</p>
                    {lookupResult.candidates.map((c, ci) => (
                      <button
                        key={ci}
                        onClick={() => doLookup(c.word)}
                        className="w-full text-left p-3 rounded-xl hover:bg-white hover:shadow-sm border border-transparent hover:border-stone-200 transition-all group"
                      >
                        <span className="font-serif font-bold text-lg text-stone-900 group-hover:underline underline-offset-4">{c.word}</span>
                        <span className="text-sm text-stone-500 ml-3">{c.nuance}</span>
                      </button>
                    ))}
                  </div>
                )}

                {/* Easily-confused forms — same words with a different article, preposition or number */}
                {lookupResult.variants && lookupResult.variants.length > 0 && (
                  <div className="mb-12 p-6 bg-stone-50 rounded-2xl border border-stone-100 space-y-3">
                    <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-stone-400">Easily confused forms</p>
                    {lookupResult.variants.map((v, vi) => {
                      const isQuery = !!lookupResult.originalQuery
                        && normalizeForm(v.form) === normalizeForm(lookupResult.originalQuery);
                      // Looking the query form up again would just normalize back to this same entry.
                      if (isQuery) {
                        return (
                          <div key={vi} className="w-full text-left p-3 rounded-xl bg-white border border-stone-200">
                            <span className="font-serif font-bold text-lg text-stone-900">{v.form}</span>
                            <span className="ml-3 text-[10px] font-bold uppercase tracking-[0.2em] text-stone-400 align-middle">you searched</span>
                            <span className="text-sm text-stone-500 ml-3">{v.note}</span>
                          </div>
                        );
                      }
                      return (
                        <button
                          key={vi}
                          onClick={() => doLookup(v.form)}
                          className="w-full text-left p-3 rounded-xl hover:bg-white hover:shadow-sm border border-transparent hover:border-stone-200 transition-all group"
                        >
                          <span className="font-serif font-bold text-lg text-stone-900 group-hover:underline underline-offset-4">{v.form}</span>
                          <span className="text-sm text-stone-500 ml-3">{v.note}</span>
                        </button>
                      );
                    })}
                  </div>
                )}

                <div className="space-y-12">
                  {lookupResult.meanings.map((m, i) => {
                    const isFinancial = isFinance(m.partOfSpeech);
                    return (
                      <div key={i} className={`space-y-6 relative ${isFinancial ? 'p-8 pt-10 border border-stone-100 rounded-[2rem]' : ''}`}>
                         {/* LEFT ACCENT BAR IS NOW GREY */}
                         {isFinancial && <div className="absolute left-0 top-10 bottom-10 w-1.5 bg-stone-300 rounded-r-full" />}
                         
                         <div className="flex items-center gap-6">
                           <div className="flex items-center gap-2">
                             {/* ONLY HEADER IS GREEN */}
                             {isFinancial && <TrendingUp className="w-4 h-4 text-emerald-600" />}
                             <span className={`text-[11px] font-bold uppercase tracking-[0.4em] ${isFinancial ? 'text-emerald-600' : 'text-stone-300'}`}>
                               {m.partOfSpeech}
                             </span>
                           </div>
                           <div className={`h-[1px] flex-grow ${isFinancial ? 'bg-stone-100' : 'bg-stone-100'}`} />
                         </div>

                         <div className="space-y-8">
                          {m.definitions.map((d, di) => (
                            <div key={di} className={`space-y-6 ${isFinancial ? 'pl-2' : 'pl-6 border-l-2 border-stone-900/10'}`}>
                                <p className={`text-2xl font-serif leading-tight font-bold tracking-tight text-stone-900`}>
                                  {d.definition}
                                </p>
                                {d.gloss && (
                                  <p className="gloss leading-snug -mt-3">{d.gloss}</p>
                                )}

                                {d.synonyms && d.synonyms.length > 0 && (
                                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-2">
                                    <div className={`flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest mr-1 text-stone-400`}>
                                      <Tag className="w-3 h-3" /> Synonyms
                                    </div>
                                    <div className="flex flex-wrap gap-1.5">
                                      {d.synonyms.map((syn, si) => (
                                        <span key={si} className={`text-sm font-medium text-stone-600`}>
                                          {syn}{si < d.synonyms.length - 1 ? ',' : ''}
                                        </span>
                                      ))}
                                    </div>
                                  </div>
                                )}

                                <div className="space-y-3">
                                  {d.examples?.map((ex, ei) => (
                                    <p key={ei} className={`italic font-serif text-lg leading-relaxed text-stone-500 border-l pl-4 border-stone-100`}>
                                      "{ex}"
                                    </p>
                                  ))}
                                </div>
                                
                                {d.collocations && d.collocations.length > 0 && (
                                  <div className="flex flex-wrap items-center gap-x-3 gap-y-2 pt-4">
                                    <div className={`flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest mr-1 text-stone-400`}>
                                      <Layers className="w-3 h-3" /> Collocations
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                      {d.collocations.map((col, ci) => (
                                        <span key={ci} className={`text-[11px] font-bold px-3 py-1.5 rounded-lg border text-stone-700 bg-stone-50 transition-all border-stone-200`}>
                                          {col}
                                        </span>
                                      ))}
                                    </div>
                                  </div>
                                )}
                            </div>
                          ))}
                         </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {activeMode === 'COMPARE' && (
          <div className="space-y-12 animate-fade-in">
            <div className="max-w-2xl mx-auto bg-white p-10 rounded-[2rem] border border-stone-100 shadow-xl space-y-8">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                {compareInputs.map((val, idx) => (
                  <div key={idx}>
                    <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-stone-400 px-1 mb-2 block">Word {idx + 1}</label>
                    <input
                      type="text"
                      value={val}
                      onChange={(e) => {
                        const next = [...compareInputs];
                        next[idx] = e.target.value;
                        setCompareInputs(next);
                      }}
                      placeholder="..."
                      className="w-full p-5 bg-stone-50 border border-stone-100 rounded-2xl outline-none focus:border-stone-300 focus:bg-white font-serif font-bold transition-all shadow-inner"
                    />
                  </div>
                ))}
              </div>
              <button 
                onClick={handleCompare}
                disabled={loading || compareInputs.filter(i => i.trim()).length < 2}
                className="w-full py-6 bg-stone-900 text-white rounded-2xl font-bold shadow-2xl active:scale-[0.98] transition-all hover:bg-black hover:-translate-y-1 flex items-center justify-center gap-4 text-lg"
              >
                {loading ? <Loader2 className="animate-spin w-6 h-6" /> : <><GitCompare className="w-6 h-6" /> Analyze Differences</>}
              </button>
            </div>

            {compareResult && (
              <div className="animate-fade-in-up bg-white p-12 rounded-[2.5rem] border border-stone-100 shadow-2xl space-y-12">
                <div className="flex items-center gap-5 border-b border-stone-50 pb-8">
                  <div className="p-5 bg-stone-50 rounded-2xl border border-stone-100"><GitCompare className="w-8 h-8 text-stone-800" /></div>
                  <div>
                    <h3 className="text-3xl font-serif font-bold text-stone-900 tracking-tight">Synonym Breakdown</h3>
                    <p className="text-stone-400 font-serif text-lg">{compareResult.sharedMeaning}</p>
                  </div>
                </div>

                <div className="bg-stone-900 p-8 rounded-[1.5rem] shadow-lg relative overflow-hidden group">
                  <Sparkles className="absolute right-[-20px] top-[-20px] w-40 h-40 text-white opacity-[0.03] group-hover:scale-110 transition-transform duration-700" />
                  <h4 className="text-[10px] font-bold uppercase tracking-[0.3em] text-stone-500 mb-3 flex items-center gap-2">
                    <Sparkles className="w-4 h-4" /> Crucial Distinction
                  </h4>
                  <p className="text-xl font-serif text-stone-100 leading-relaxed font-medium relative z-10">{compareResult.keyDifference}</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-12 pt-4">
                  {[
                    { word: compareResult.word1, nuance: compareResult.word1Nuance, example: compareResult.word1Example },
                    { word: compareResult.word2, nuance: compareResult.word2Nuance, example: compareResult.word2Example },
                    ...(compareResult.word3 ? [{ word: compareResult.word3, nuance: compareResult.word3Nuance, example: compareResult.word3Example }] : [])
                  ].map((item, idx) => (
                    <div key={idx} className="space-y-4">
                      <div className="flex justify-between items-center border-b border-stone-100 pb-2 group/title">
                        <h5 className="text-3xl font-serif font-bold capitalize text-stone-900 tracking-tight">{item.word}</h5>
                        <button 
                          onClick={() => handleSaveFromComparison(item.word)}
                          disabled={isSaved(item.word) || savingWord === item.word}
                          className={`p-2 rounded-full transition-all ${
                            isSaved(item.word) 
                            ? 'text-emerald-500 bg-emerald-50' 
                            : 'text-stone-300 hover:text-stone-900 hover:bg-stone-50'
                          }`}
                        >
                          {savingWord === item.word ? (
                            <Loader2 className="w-5 h-5 animate-spin" />
                          ) : isSaved(item.word) ? (
                            <Check className="w-5 h-5" />
                          ) : (
                            <Save className="w-5 h-5" />
                          )}
                        </button>
                      </div>
                      <p className="text-stone-600 leading-relaxed text-base">{item.nuance}</p>
                      <p className="text-stone-400 italic font-serif bg-stone-50 p-4 rounded-xl text-sm">"{item.example}"</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {activeMode === 'ANALYZE' && (
          <div className="space-y-12 animate-fade-in">
            <div className="max-w-2xl mx-auto bg-white p-10 rounded-[2.5rem] border border-stone-100 shadow-xl space-y-8">
              <div>
                <label className="text-[11px] font-bold uppercase tracking-[0.2em] text-stone-400 px-1 mb-3 block">Complex Sentence Input</label>
                <textarea
                  value={analyzeInput}
                  onChange={(e) => setAnalyzeInput(e.target.value)}
                  placeholder="Paste a complex sentence from an article or book..."
                  className="w-full h-44 p-8 bg-stone-50 border border-stone-100 rounded-[2rem] outline-none focus:border-stone-300 focus:bg-white font-serif leading-relaxed text-xl resize-none shadow-inner"
                />
              </div>
              <button 
                onClick={handleAnalyze}
                disabled={loading || !analyzeInput.trim()}
                className="w-full py-6 bg-stone-900 text-white rounded-2xl font-bold shadow-2xl active:scale-[0.98] transition-all hover:bg-black hover:-translate-y-1 flex items-center justify-center gap-4 text-lg"
              >
                {loading ? <Loader2 className="animate-spin w-6 h-6" /> : <><FileText className="w-6 h-6" /> Deconstruct Syntax</>}
              </button>
            </div>

            {analyzeResult && (
              <div className="animate-fade-in-up bg-white p-12 rounded-[2.5rem] border border-stone-100 shadow-2xl space-y-12">
                <div className="border-b border-stone-50 pb-10">
                  <h3 className="text-[10px] font-bold uppercase tracking-[0.3em] text-stone-300 mb-4">Semantic Core</h3>
                  <p className="text-2xl font-serif text-stone-900 leading-relaxed font-semibold">{analyzeResult.meaning}</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-16">
                  <div className="space-y-10">
                    <h3 className="text-[11px] font-bold uppercase tracking-[0.3em] text-stone-400 flex items-center gap-3">
                      <div className="w-6 h-[1px] bg-stone-200" /> Tricky Bits
                    </h3>
                    {analyzeResult.vocabularyBreakdown.length === 0 && (
                      <p className="text-stone-400 font-serif italic">Nothing unusually difficult here — the complexity is in the structure, not the words.</p>
                    )}
                    <div className="space-y-10">
                      {analyzeResult.vocabularyBreakdown.map((item, idx) => (
                        <div key={idx} className="group relative pl-6 border-l border-stone-100">
                           <div className="flex justify-between items-center mb-2">
                              <button
                                onClick={() => doLookup(item.word)}
                                title="Look up in the dictionary"
                                className="text-xl font-serif font-bold text-stone-900 capitalize tracking-tight hover:text-stone-600 hover:underline decoration-stone-300 decoration-2 underline-offset-4 transition-colors text-left"
                              >
                                {item.word}
                              </button>
                              <button 
                                onClick={async () => {
                                  setSavingWord(item.word);
                                  try {
                                    const entry = await lookupWord(item.word);
                                    if(entry) onSave(entry);
                                  } catch (e) {
                                    console.error('Failed to save word:', e);
                                  } finally {
                                    setSavingWord(null);
                                  }
                                }}
                                disabled={isSaved(item.word) || savingWord === item.word}
                                className={`p-2 rounded-full transition-all ${isSaved(item.word) ? 'text-emerald-500 bg-emerald-50' : 'text-stone-300 hover:text-stone-900 hover:bg-stone-50'}`}
                              >
                                {savingWord === item.word ? <Loader2 className="w-5 h-5 animate-spin" /> : isSaved(item.word) ? <Check className="w-5 h-5" /> : <Save className="w-5 h-5" />}
                              </button>
                           </div>
                           <p className="text-stone-500 text-base leading-relaxed font-serif italic">{item.definition}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  {analyzeResult.alternatives.length > 0 && (
                    <div className="space-y-6">
                      <h3 className="text-[11px] font-bold uppercase tracking-[0.3em] text-stone-400 flex items-center gap-3">
                        <div className="w-6 h-[1px] bg-stone-200" /> Say It Another Way
                      </h3>
                      <div className="space-y-4">
                        {analyzeResult.alternatives.map((alt, i) => (
                          <div key={i} className="bg-stone-50 p-6 rounded-[1.5rem] border border-stone-100 shadow-inner italic font-serif text-lg text-stone-700 leading-relaxed relative">
                            <Sparkles className="absolute top-3 right-3 w-4 h-4 text-stone-200" />
                            "{alt}"
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {error && (
        <div className="max-w-md mx-auto p-6 bg-red-50 border border-red-100 rounded-2xl text-red-600 text-center font-bold animate-fade-in shadow-sm">
          {error}
        </div>
      )}

      <DailyRead words={savedWords} />
    </div>
  );
};
