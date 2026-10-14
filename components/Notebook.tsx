
import React, { useState, useRef, useEffect } from 'react';
import { WordEntry, UserContext } from '../types';
import { analyzeContextFromText, playPronunciation, askAboutContext } from '../services/geminiService';
import { srsService, MASTERY_META } from '../services/srsService';
import { ipaLabel } from '../services/format';
import { Trash2, Book, ArrowRight, ChevronDown, Plus, Loader2, X, RefreshCw, Search, Volume2, MessageSquare, Send, Sparkles, BookOpen } from 'lucide-react';

interface Message {
  role: 'user' | 'model';
  text: string;
}

interface NotebookProps {
  words: WordEntry[];
  onDelete: (word: string) => void;
  onUpdateWord: (updatedWord: WordEntry) => void;
  /** Open the word's full entry in Look up. */
  onOpenWord?: (word: string) => void;
}

export const Notebook: React.FC<NotebookProps> = ({ words, onDelete, onUpdateWord, onOpenWord }) => {
  const [expandedWords, setExpandedWords] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'sentences' | 'due'>('all');
  const [visibleCount, setVisibleCount] = useState(100);

  // Large notebooks: render incrementally so thousands of words stay snappy.
  useEffect(() => { setVisibleCount(100); }, [searchQuery, filter]);
  
  // Sidebar Chat States
  const [sidebarContext, setSidebarContext] = useState<{ word: WordEntry; context: UserContext } | null>(null);
  const [chatMessages, setChatMessages] = useState<Record<string, Message[]>>({});
  const [chatInput, setChatInput] = useState('');
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [showFullReader, setShowFullReader] = useState(false);

  // UseRef for scrolling to bottom of chat
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Scroll effect to keep chat at the bottom
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages, sidebarContext]);

  // States for adding context
  const [addingContextFor, setAddingContextFor] = useState<string | null>(null);
  const [newContextTitle, setNewContextTitle] = useState('');
  const [newContextText, setNewContextText] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const toggleWord = (word: string) => {
    const newSet = new Set(expandedWords);
    if (newSet.has(word)) {
      newSet.delete(word);
    } else {
      newSet.add(word);
    }
    setExpandedWords(newSet);
  };

  const handleSaveContext = async (wordEntry: WordEntry) => {
    if (!newContextText.trim()) return;
    setIsAnalyzing(true);
    setErrorMsg('');
    try {
        const result = await analyzeContextFromText(wordEntry.word, newContextText);
        if (!result) {
            setErrorMsg("Could not find the word in this text.");
            setIsAnalyzing(false);
            return;
        }
        const newContext: UserContext = {
            id: Date.now().toString(),
            sourceTitle: newContextTitle.trim() || 'Personal Note',
            fullText: newContextText,
            targetSentence: result.sentence,
            explanation: result.explanation,
            usageNuance: result.usageNuance,
            timestamp: Date.now()
        };
        const updatedWord: WordEntry = {
            ...wordEntry,
            contexts: [...(wordEntry.contexts || []), newContext],
            lastModified: new Date().toISOString(),
            syncStatus: 'pending'
        };
        onUpdateWord(updatedWord);
        setNewContextTitle('');
        setNewContextText('');
        setAddingContextFor(null);
    } catch (e) {
        setErrorMsg("Failed to analyze text.");
    } finally {
        setIsAnalyzing(false);
    }
  };

  const handleDeleteContext = (wordEntry: WordEntry, contextId: string) => {
      const updatedContexts = wordEntry.contexts?.filter(c => c.id !== contextId) || [];
      const updatedWord: WordEntry = { 
        ...wordEntry, 
        contexts: updatedContexts,
        lastModified: new Date().toISOString(),
        syncStatus: 'pending'
      };
      onUpdateWord(updatedWord);
  };

  const handleSendMessage = async (word: string, ctx: UserContext, textOverride?: string) => {
    const input = textOverride || chatInput;
    if (!input.trim() || isChatLoading) return;
    
    const userMsg = input.trim();
    if (!textOverride) setChatInput('');
    setIsChatLoading(true);

    const currentMsgs = chatMessages[ctx.id] || [];
    const newMsgs: Message[] = [...currentMsgs, { role: 'user', text: userMsg }];
    setChatMessages({ ...chatMessages, [ctx.id]: newMsgs });

    try {
        const response = await askAboutContext(
            word, 
            ctx.fullText, 
            ctx.targetSentence, 
            userMsg, 
            currentMsgs
        );
        setChatMessages(prev => ({
            ...prev,
            [ctx.id]: [...(prev[ctx.id] || []), { role: 'model', text: response }]
        }));
    } catch (err: any) {
        console.error(err);
        setChatMessages(prev => ({
            ...prev,
            [ctx.id]: [...(prev[ctx.id] || []), { role: 'model', text: `Sorry — I couldn't answer that. ${err?.message || 'Please try again.'}` }]
        }));
    } finally {
        setIsChatLoading(false);
    }
  };

  const formatMessage = (text: string) => {
    return text.split('\n').map((line, i) => {
      const trimmedLine = line.trim();
      if (!trimmedLine) return <div key={i} className="h-4" />;

      if (trimmedLine.startsWith('###')) {
        return (
          <h4 key={i} className="text-[10px] font-bold mt-8 mb-4 uppercase tracking-[0.3em] text-stone-900 border-b border-stone-100 pb-2 font-sans">
            {trimmedLine.replace(/###/g, '').trim()}
          </h4>
        );
      }
      
      const isListItem = trimmedLine.startsWith('* ') || trimmedLine.startsWith('- ');
      if (isListItem) {
        let content = trimmedLine.substring(2);
        content = content.replace(/\*{1,2}/g, '');
        return (
          <li key={i} className="ml-5 list-disc text-stone-700 my-2 pl-2 leading-[1.8] font-serif text-sm">
            {content}
          </li>
        );
      }

      const parts = trimmedLine.split(/(\*\*.*?\*\*|\*.*?\*)/);
      
      return (
        <p key={i} className="mb-4 leading-[1.8] text-stone-800 font-serif text-[14px]">
          {parts.map((part, pi) => {
            if (part.startsWith('**') && part.endsWith('**')) {
              return <strong key={pi} className="font-bold text-stone-950">{part.slice(2, -2)}</strong>;
            }
            if (part.startsWith('*') && part.endsWith('*')) {
              return <em key={pi} className="italic text-stone-600">{part.slice(1, -1)}</em>;
            }
            return part.replace(/\*/g, '');
          })}
        </p>
      );
    });
  };

  const filteredWords = words.filter(w =>
    w.word.toLowerCase().includes(searchQuery.toLowerCase())
    && (filter !== 'sentences' || (w.contexts?.length ?? 0) > 0)
    && (filter !== 'due' || (!!w.srs && srsService.isDue(w)))
  );

  const smartSuggestions = [
    "Analyze the Stylistic Nuance.",
    "Perform a Micro-Nuance Comparison.",
    "What is the Register used here?",
    "Explain the 'Summary for the Learner'."
  ];

  const ROMAN = ['i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii', 'ix', 'x'];

  /** Highlighter stroke under the word inside a saved sentence. */
  const markWord = (text: string, word: string): React.ReactNode => {
    const head = word.trim().split(/\s+/)[0] || word;
    const stem = head.length > 4 && head.endsWith('e') ? head.slice(0, -1) : head;
    const re = new RegExp(`(\\b${stem.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\w'-]*)`, 'gi');
    return text.split(re).map((part, i) => i % 2 === 1 ? <span key={i} className="lx-mark">{part}</span> : part);
  };

  const senseOf = (entry: WordEntry, ctx: UserContext) => {
    if (!ctx.sense) return null;
    const def = entry.meanings[ctx.sense.meaning]?.definitions[ctx.sense.definition];
    return def ? { label: ROMAN[ctx.sense.definition] ?? String(ctx.sense.definition + 1), def } : null;
  };

  if (words.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-[#8C8880]">
        <Book className="w-12 h-12 mb-4 opacity-20 stroke-[1]" />
        <h3 className="text-xl font-serif mb-2 text-stone-900">Your notebook is empty</h3>
        <p>Look up a word or paste a sentence to start your collection.</p>
      </div>
    );
  }

  const withSentences = words.filter(w => (w.contexts?.length ?? 0) > 0).length;
  const dueCount = words.filter(w => w.srs && srsService.isDue(w)).length;
  const filterChip = (id: typeof filter, label: string, count?: number) => (
    <button
      onClick={() => setFilter(id)}
      aria-pressed={filter === id}
      className={`min-h-[36px] px-3.5 rounded-full border text-[13px] transition-colors ${
        filter === id ? 'bg-stone-900 border-stone-900 text-[#FBF9F4]' : 'border-[#E2DDD2] text-[#55524C] hover:border-stone-900'
      }`}
    >
      {label}{count !== undefined && <span className={filter === id ? 'text-stone-400' : 'text-[#B5AFA3]'}> · {count}</span>}
    </button>
  );

  return (
    <div className={`transition-all duration-500 ease-in-out ${sidebarContext ? 'mr-0 lg:mr-[450px]' : ''}`}>
      <div className="max-w-[860px] mx-auto relative space-y-6">
        {/* Header */}
        <div className="flex items-baseline justify-between gap-4">
          <h2 className="font-serif font-bold text-4xl tracking-[-0.02em] text-stone-900">Notebook</h2>
          <div className="flex items-center gap-2">
            <button onClick={() => window.location.reload()} className="p-2 text-[#B5AFA3] hover:text-stone-900 transition-colors" title="Force sync refresh">
              <RefreshCw className="w-4 h-4" />
            </button>
            <span className="font-serif italic text-[15px] text-[#8C8880]">{words.length.toLocaleString()} {words.length === 1 ? 'word' : 'words'}</span>
          </div>
        </div>

        <div className="flex items-center gap-3 border-b border-[#D9D3C7] focus-within:border-stone-900 transition-colors px-0.5 pb-2.5">
          <Search className="w-[17px] h-[17px] text-[#8C8880] shrink-0" />
          <label htmlFor="nb-search" className="sr-only">Search your words</label>
          <input
            id="nb-search"
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search your words…"
            className="flex-1 min-w-0 bg-transparent outline-none font-serif text-lg text-stone-900 placeholder:text-[#B5AFA3]"
          />
          {searchQuery && <span className="text-xs text-[#8C8880] shrink-0">{filteredWords.length} found</span>}
        </div>

        <div role="group" aria-label="Filter" className="flex flex-wrap gap-1.5">
          {filterChip('all', 'All')}
          {filterChip('sentences', 'With my sentences', withSentences)}
          {filterChip('due', 'Due today', dueCount)}
        </div>

        {/* Word list */}
        <div className="bg-white border border-[#EDE8DE] rounded-[22px] p-2 min-h-[300px]">
          {filteredWords.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-[#8C8880] animate-fade-in">
              <Search className="w-10 h-10 mb-4 opacity-10" />
              <p className="text-sm">{searchQuery ? `No words match “${searchQuery}”` : 'Nothing here yet.'}</p>
            </div>
          ) : (
            filteredWords.slice(0, visibleCount).map((entry) => {
              const isExpanded = expandedWords.has(entry.word);
              const nSent = entry.contexts?.length ?? 0;
              const first = entry.meanings[0]?.definitions[0]?.definition;
              const isDue = !!entry.srs && srsService.isDue(entry);
              return (
                <div key={entry.word} className={`rounded-[14px] transition-colors ${isExpanded ? 'bg-[#FBF9F4] my-1' : ''}`}>
                  <button onClick={() => toggleWord(entry.word)} aria-expanded={isExpanded} className="w-full text-left flex items-center gap-3 min-h-[60px] px-4 py-2.5 rounded-[14px] hover:bg-[#FBF9F4] transition-colors">
                    <span className="flex-1 min-w-0 flex flex-col gap-0.5">
                      <span className="font-serif text-[21px] text-stone-900 break-words">{entry.word}</span>
                      {!isExpanded && first && <span className="text-[13px] text-[#6B675F] truncate">{first}</span>}
                    </span>
                    {nSent > 0 && <span className="font-serif italic text-[13px] text-[#9A5420] shrink-0">{nSent} {nSent === 1 ? 'sentence' : 'sentences'}</span>}
                    {isDue && <span className="text-xs text-[#8C8880] shrink-0">due</span>}
                    <ChevronDown className={`w-4 h-4 text-[#B5AFA3] transition-transform duration-300 shrink-0 ${isExpanded ? 'rotate-180' : ''}`} />
                  </button>

                  {isExpanded && (
                    <div className="px-4 sm:px-6 pb-6 pt-2 space-y-7 animate-fade-in">
                      <div className="flex flex-wrap items-center gap-3">
                        <span className="font-mono text-sm text-[#6B675F]">{ipaLabel(entry.ipa)}</span>
                        <button onClick={() => playPronunciation(entry.word)} className="flex items-center gap-1.5 min-h-[34px] px-3 rounded-full border border-[#E2DDD2] text-[13px] text-[#2B2A27] hover:border-stone-900 transition-colors">
                          <Volume2 className="w-3.5 h-3.5" /> Listen
                        </button>
                        <span className="text-xs text-[#8C8880]">{MASTERY_META[srsService.masteryLevel(entry)].label}</span>
                        {onOpenWord && (
                          <button onClick={() => onOpenWord(entry.word)} className="ml-auto flex items-center gap-1.5 min-h-[36px] text-[13.5px] font-medium text-stone-900 border-b border-[#D9D3C7] hover:border-stone-900">
                            Full definition <ArrowRight className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>

                      {/* From your reading */}
                      <section className="space-y-3">
                        <div className="flex items-center gap-4">
                          <h4 className="lx-label !text-[#9A5420]">From your reading</h4>
                          <span aria-hidden="true" className="flex-1 h-px bg-[#EDE8DE]" />
                          <button onClick={() => { setAddingContextFor(entry.word); setErrorMsg(''); }} className="text-xs text-[#55524C] hover:text-stone-900 flex items-center gap-1 min-h-[32px]">
                            <Plus className="w-3 h-3" /> Add a passage
                          </button>
                        </div>

                        {addingContextFor === entry.word && (
                          <div className="bg-white p-4 rounded-2xl border border-[#EDE8DE] animate-fade-in space-y-3">
                            <input type="text" placeholder="Source — optional (e.g. Bloomberg)" value={newContextTitle} onChange={(e) => setNewContextTitle(e.target.value)} className="w-full p-3 text-sm border border-[#E2DDD2] rounded-xl outline-none focus:border-stone-900" />
                            <textarea placeholder={`Paste the passage containing “${entry.word}”…`} value={newContextText} onChange={(e) => setNewContextText(e.target.value)} className="w-full h-28 p-3 border border-[#E2DDD2] rounded-xl outline-none focus:border-stone-900 resize-none font-serif text-[15px] text-[#2B2A27]" />
                            {errorMsg && <p className="text-sm text-amber-700">{errorMsg}</p>}
                            <div className="flex justify-end gap-2">
                              <button onClick={() => { setAddingContextFor(null); setErrorMsg(''); }} className="px-3 min-h-[36px] text-sm text-[#55524C]">Cancel</button>
                              <button onClick={() => handleSaveContext(entry)} disabled={isAnalyzing || !newContextText} className="px-4 min-h-[36px] bg-stone-900 text-[#FBF9F4] text-sm rounded-full hover:bg-black disabled:opacity-50 flex items-center gap-2">
                                {isAnalyzing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Save'}
                              </button>
                            </div>
                          </div>
                        )}

                        {nSent === 0 && addingContextFor !== entry.word && (
                          <p className="font-serif italic text-sm text-[#8C8880]">No sentences yet — paste one in Look up › Sentence and save it.</p>
                        )}

                        {entry.contexts?.map((ctx) => {
                          const sense = senseOf(entry, ctx);
                          return (
                            <figure key={ctx.id} className="m-0 bg-[#FBF7EC] border border-[#EFE3C4] rounded-2xl px-5 py-4 space-y-3">
                              <blockquote className="font-serif text-lg sm:text-xl leading-normal text-stone-900">{markWord(ctx.targetSentence, entry.word)}</blockquote>
                              {(sense || ctx.explanation) && (
                                <div className="grid grid-cols-[30px_minmax(0,1fr)] gap-x-1 border-t border-[#EFE3C4] pt-3">
                                  <span aria-hidden="true" className="font-serif italic text-[#B5AFA3]">{sense ? `${sense.label}.` : ''}</span>
                                  <div className="space-y-1">
                                    <p className="font-serif text-base leading-snug text-stone-900">{sense?.def.definition || ctx.explanation}</p>
                                    {sense?.def.gloss && <p className="gloss !text-sm">{sense.def.gloss}</p>}
                                  </div>
                                </div>
                              )}
                              <figcaption className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[#8C8880]">
                                <span>{ctx.sourceTitle} · {new Date(ctx.timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
                                <button onClick={() => setSidebarContext({ word: entry, context: ctx })} className="flex items-center gap-1 text-[#55524C] hover:text-stone-900 min-h-[28px]">
                                  <Sparkles className="w-3 h-3" /> Ask about this
                                </button>
                                <button onClick={() => handleDeleteContext(entry, ctx.id)} className="hover:text-red-600 min-h-[28px]">Remove</button>
                              </figcaption>
                            </figure>
                          );
                        })}
                      </section>

                      {/* Senses, compact */}
                      {entry.meanings.map((meaning, mi) => (
                        <section key={mi} className="space-y-4">
                          <div className="flex items-center gap-4">
                            <h4 className="font-serif italic text-lg text-[#2B2A27] first-letter:lowercase">{meaning.partOfSpeech}</h4>
                            <span aria-hidden="true" className="flex-1 h-px bg-[#EDE8DE]" />
                          </div>
                          {meaning.definitions.map((def, di) => (
                            <div key={di} className="grid grid-cols-[30px_minmax(0,1fr)] gap-x-1">
                              <span aria-hidden="true" className="font-serif italic text-[#B5AFA3] leading-[1.45]">{ROMAN[di] ?? di + 1}.</span>
                              <div className="space-y-2 min-w-0">
                                <p className="font-serif text-lg leading-snug font-bold text-stone-900 break-words">{def.definition}</p>
                                {def.gloss && <p className="gloss !text-[15px]">{def.gloss}</p>}
                                {def.examples?.[0] && (
                                  <p className="font-serif italic text-base leading-relaxed text-[#6B675F] pl-4 border-l border-[#EDE8DE]">“{def.examples[0].replace(/^["“]|["”]$/g, '')}”</p>
                                )}
                              </div>
                            </div>
                          ))}
                        </section>
                      ))}

                      <div className="pt-2 flex justify-end">
                        <button onClick={() => onDelete(entry.word)} className="text-xs text-[#B5AFA3] hover:text-red-600 transition-colors flex items-center gap-1.5 min-h-[32px]">
                          <Trash2 className="w-3.5 h-3.5" /> Delete word
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {filteredWords.length > visibleCount && (
          <div className="text-center py-4">
            <button
              onClick={() => setVisibleCount(n => n + 200)}
              className="min-h-[44px] px-6 rounded-full border border-[#E2DDD2] text-sm text-[#2B2A27] hover:border-stone-900 transition-colors"
            >
              Show more ({filteredWords.length - visibleCount} remaining)
            </button>
          </div>
        )}
      </div>

      {/* SIDEBAR ASSISTANT */}
      <div 
        className={`fixed inset-y-0 right-0 w-full md:w-[450px] bg-white z-[110] shadow-[-15px_0_40px_rgba(0,0,0,0.08)] flex flex-col transform transition-transform duration-500 ease-out border-l border-stone-100 ${sidebarContext ? 'translate-x-0' : 'translate-x-full'}`}
      >
        {sidebarContext && (
            <div className="flex flex-col h-full overflow-hidden">
                <div className="p-6 border-b border-stone-100 bg-[#FBF9F4] relative">
                    <div className="flex justify-between items-start mb-4">
                        <div className="flex items-center gap-3">
                            <div className="p-1.5 bg-stone-900 text-white rounded shadow"><MessageSquare className="w-4 h-4" /></div>
                            <div>
                                <h3 className="text-lg font-serif font-bold text-stone-900 tracking-tight">LexiAI Assistant</h3>
                                <p className="text-[8px] text-stone-400 font-bold uppercase tracking-[0.3em] mt-0.5">Contextual Nuance Analysis</p>
                            </div>
                        </div>
                        <button onClick={() => setSidebarContext(null)} className="p-2 hover:bg-stone-200 rounded-full transition-colors"><X className="w-5 h-5 text-stone-400" /></button>
                    </div>

                    <div className="bg-white p-4 rounded-xl border border-stone-200 shadow-sm relative overflow-hidden">
                        <div className="absolute left-0 top-0 bottom-0 w-1 bg-stone-900" />
                        <h4 className="text-[9px] font-bold uppercase tracking-widest text-stone-400 mb-1 flex items-center gap-2">
                             <BookOpen className="w-2.5 h-2.5" /> Target Passage
                        </h4>
                        <p className="font-serif text-[15px] leading-relaxed text-stone-900 italic line-clamp-3">
                            "{sidebarContext.context.targetSentence}"
                        </p>
                        <button onClick={() => setShowFullReader(!showFullReader)} className="text-[8px] font-bold uppercase tracking-widest text-stone-400 hover:text-stone-900 mt-2 transition-colors">
                            {showFullReader ? 'Hide Context' : 'Read Full Article'}
                        </button>
                    </div>

                    {showFullReader && (
                        <div className="mt-4 p-4 bg-stone-50 border border-stone-200 rounded-xl max-h-40 overflow-y-auto font-serif text-xs leading-relaxed text-stone-700 animate-fade-in scrollbar-hide">
                            {sidebarContext.context.fullText}
                        </div>
                    )}
                </div>

                <div className="flex-1 overflow-y-auto p-6 space-y-6 scrollbar-hide bg-white">
                    <div className="flex justify-start">
                        <div className="bg-stone-50 p-4 rounded-2xl rounded-tl-none border border-stone-100 max-w-[90%] shadow-sm">
                            <p className="font-serif text-[14px] leading-relaxed text-stone-800">
                                Analyzing <strong>"{sidebarContext.word.word}"</strong>. How can I help you master this specific usage?
                            </p>
                        </div>
                    </div>

                    {(!chatMessages[sidebarContext.context.id] || chatMessages[sidebarContext.context.id].length === 0) && (
                        <div className="flex flex-col gap-1.5">
                            {smartSuggestions.map((s, i) => (
                                <button key={i} onClick={() => handleSendMessage(sidebarContext.word.word, sidebarContext.context, s)} className="text-left p-3 bg-white border border-stone-200 rounded-xl text-[10px] font-bold uppercase tracking-widest text-stone-500 hover:bg-stone-900 hover:text-white hover:border-stone-900 transition-all shadow-sm">
                                    {s}
                                </button>
                            ))}
                        </div>
                    )}

                    {(chatMessages[sidebarContext.context.id] || []).map((msg, i) => (
                        <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-fade-in-up`}>
                            <div className={`p-4 rounded-[1.5rem] shadow-sm max-w-[95%] ${
                                msg.role === 'user' 
                                ? 'bg-stone-900 text-white rounded-tr-none border-none' 
                                : 'bg-white text-stone-800 rounded-tl-none border border-stone-100'
                            }`}>
                                <div className="text-[14px] leading-relaxed">
                                    {msg.role === 'model' ? formatMessage(msg.text) : <p className="font-serif italic">{msg.text}</p>}
                                </div>
                            </div>
                        </div>
                    ))}
                    
                    {isChatLoading && (
                        <div className="flex justify-start">
                            <div className="bg-white border border-stone-100 p-4 rounded-2xl rounded-tl-none shadow-sm">
                                <div className="flex items-center gap-1.5">
                                    <div className="w-1.5 h-1.5 bg-stone-300 rounded-full animate-bounce [animation-delay:-0.3s]" />
                                    <div className="w-1.5 h-1.5 bg-stone-300 rounded-full animate-bounce [animation-delay:-0.15s]" />
                                    <div className="w-1.5 h-1.5 bg-stone-300 rounded-full animate-bounce" />
                                </div>
                            </div>
                        </div>
                    )}
                    <div ref={chatEndRef} />
                </div>

                <form 
                    onSubmit={(e) => { e.preventDefault(); handleSendMessage(sidebarContext.word.word, sidebarContext.context); }}
                    className="p-6 bg-stone-50 border-t border-stone-100 flex gap-3"
                >
                    <input 
                        type="text" 
                        value={chatInput}
                        onChange={(e) => setChatInput(e.target.value)}
                        placeholder="Deep dive into this vibe..."
                        className="flex-grow bg-white border border-stone-200 rounded-xl px-4 py-3 text-sm outline-none focus:ring-1 focus:ring-stone-400 font-serif shadow-inner transition-all"
                    />
                    <button 
                        type="submit" 
                        disabled={!chatInput.trim() || isChatLoading}
                        className="bg-stone-900 text-white w-12 h-12 rounded-xl flex items-center justify-center hover:bg-black disabled:opacity-20 transition-all shadow-lg active:scale-95"
                    >
                        <Send className="w-5 h-5" />
                    </button>
                </form>
            </div>
        )}
      </div>
    </div>
  );
};
