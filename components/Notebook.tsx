
import React, { useState, useRef, useEffect } from 'react';
import { WordEntry, UserContext } from '../types';
import { analyzeContextFromText, playPronunciation, askAboutContext } from '../services/geminiService';
import { srsService, MASTERY_META } from '../services/srsService';
import { Trash2, Book, ArrowRight, TrendingUp, ChevronDown, Plus, FileText, Loader2, X, Maximize2, Layers, CloudOff, RefreshCw, Check, Search, Volume2, MessageSquare, Send, Sparkles, BookOpen, Tag } from 'lucide-react';

interface Message {
  role: 'user' | 'model';
  text: string;
}

interface NotebookProps {
  words: WordEntry[];
  onDelete: (word: string) => void;
  onPractice: (word: WordEntry) => void;
  onUpdateWord: (updatedWord: WordEntry) => void;
}

export const Notebook: React.FC<NotebookProps> = ({ words, onDelete, onPractice, onUpdateWord }) => {
  const [expandedWords, setExpandedWords] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [visibleCount, setVisibleCount] = useState(100);

  // Large notebooks: render incrementally so thousands of words stay snappy.
  useEffect(() => { setVisibleCount(100); }, [searchQuery]);
  
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

  const isFinance = (pos: string) => {
    const lower = pos.toLowerCase();
    return lower.includes('finance') || lower.includes('business') || lower.includes('economic');
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
    } catch (err) {
        console.error(err);
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
  );

  const smartSuggestions = [
    "Analyze the Stylistic Nuance.",
    "Perform a Micro-Nuance Comparison.",
    "What is the Register used here?",
    "Explain the 'Summary for the Learner'."
  ];

  if (words.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-stone-400">
        <Book className="w-12 h-12 mb-4 opacity-20 stroke-[1]" />
        <h3 className="text-xl font-serif mb-2">Your notebook is empty</h3>
        <p className="text-stone-500">Search for words to build your collection.</p>
      </div>
    );
  }

  return (
    <div className={`transition-all duration-500 ease-in-out ${sidebarContext ? 'mr-0 lg:mr-[450px]' : ''}`}>
      <div className="max-w-3xl mx-auto relative px-4">
        {/* Header Section */}
        <div className="flex flex-col sm:flex-row sm:items-end justify-between mb-8 border-b border-stone-200 pb-6 gap-4">
          <div className="flex-1">
            <h2 className="text-3xl font-serif font-bold text-stone-800">Vocabulary</h2>
            <div className="relative mt-4">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
              <input 
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search your notes..."
                className="w-full pl-9 pr-4 py-2 bg-stone-100 border-none rounded-lg text-sm focus:ring-1 focus:ring-stone-300 outline-none transition-all font-medium"
              />
            </div>
          </div>
          <div className="flex items-center gap-4 justify-between sm:justify-end">
             <div className="flex items-center gap-2">
               <button onClick={() => window.location.reload()} className="p-2 text-stone-300 hover:text-stone-900 transition-colors" title="Force Sync Refresh">
                  <RefreshCw className="w-4 h-4" />
               </button>
               <p className="text-[10px] text-stone-400 font-bold uppercase tracking-widest leading-none">
                {words.filter(w => w.syncStatus === 'synced').length} synced / {words.length} total
              </p>
             </div>
             <span className="text-xs font-bold text-stone-500 bg-stone-100 px-3 py-1.5 rounded-full uppercase tracking-tighter">
                {filteredWords.length} results
             </span>
          </div>
        </div>
        
        {/* Word List */}
        <div className="divide-y divide-stone-100 min-h-[400px]">
          {filteredWords.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-stone-400 animate-fade-in">
               <Search className="w-10 h-10 mb-4 opacity-10" />
               <p className="text-sm font-medium">No results found for "{searchQuery}"</p>
            </div>
          ) : (
            filteredWords.slice(0, visibleCount).map((entry) => {
              const isExpanded = expandedWords.has(entry.word);
              return (
                <div key={entry.word} className={`bg-white transition-all duration-300 ${isExpanded ? 'my-4 rounded-xl shadow-lg border border-stone-100' : 'hover:bg-stone-50/50'}`}>
                  <div onClick={() => toggleWord(entry.word)} className="p-6 cursor-pointer flex justify-between items-center">
                    <div className="flex-grow">
                      <div className="flex items-center gap-4 mb-2">
                        <h3 className="text-2xl font-serif font-bold text-stone-900 capitalize">{entry.word}</h3>
                        <button onClick={(e) => { e.stopPropagation(); playPronunciation(entry.word); }} className="p-1.5 text-stone-400 hover:text-stone-900 hover:bg-stone-200/50 rounded-full transition-all">
                          <Volume2 className="w-4 h-4" />
                        </button>
                      </div>
                      <div className="flex items-center flex-wrap gap-2">
                        <span className="text-sm text-stone-400 font-mono tracking-wide opacity-70 mr-2">/{entry.ipa}/</span>
                        <span
                          title={`Mastery: ${MASTERY_META[srsService.masteryLevel(entry)].label}`}
                          className="text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded-full border bg-amber-50/60 text-amber-700 border-amber-100"
                        >
                          {MASTERY_META[srsService.masteryLevel(entry)].icon} {MASTERY_META[srsService.masteryLevel(entry)].label}
                        </span>
                        {entry.meanings.map((m, i) => (
                             <span key={i} className={`text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded-full border ${isFinance(m.partOfSpeech) ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-stone-50 text-stone-500 border-stone-100'}`}>
                                  {m.partOfSpeech}
                              </span>
                        ))}
                      </div>
                    </div>
                    <ChevronDown className={`w-5 h-5 text-stone-400 transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`} />
                  </div>

                  {isExpanded && (
                    <div className="px-6 pb-6 border-t border-stone-50 pt-6 animate-fade-in">
                      {/* Definitions Rendering */}
                      <div className="space-y-8">
                          {entry.meanings.map((meaning, idx) => {
                              const isFinancial = isFinance(meaning.partOfSpeech);
                              return (
                                <div key={idx} className={`relative space-y-6 ${isFinancial ? 'p-6 pb-10 border border-stone-100 rounded-2xl' : ''}`}>
                                    {/* LEFT ACCENT BAR IS NOW GREY */}
                                    {isFinancial && <div className="absolute left-0 top-8 bottom-8 w-1 bg-stone-300 rounded-r-full" />}
                                    
                                    <div className="flex items-center gap-6 mb-2">
                                        <div className="flex items-center gap-2">
                                          {/* HEADER REMAINS GREEN */}
                                          {isFinancial && <TrendingUp className="w-3 h-3 text-emerald-500" />}
                                          <span className={`text-[10px] font-bold uppercase tracking-[0.3em] block ${isFinancial ? 'text-emerald-600' : 'text-stone-400'}`}>
                                              {meaning.partOfSpeech}
                                          </span>
                                        </div>
                                        <div className={`h-[1px] flex-grow ${isFinancial ? 'bg-stone-100' : 'bg-stone-100'}`} />
                                    </div>
                                    
                                    {meaning.definitions.map((def, defIdx) => (
                                        <div key={defIdx} className={`space-y-4 ${isFinancial ? 'pl-2' : 'pl-4 border-l border-stone-200'}`}>
                                            <p className={`font-serif text-2xl leading-tight font-bold tracking-tight text-stone-900`}>
                                                {def.definition}
                                            </p>
                                            
                                            {def.synonyms && def.synonyms.length > 0 && (
                                                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1">
                                                  <div className={`flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest mr-1 text-stone-400`}>
                                                    <Tag className="w-3 h-3" /> Synonyms
                                                  </div>
                                                  <div className="flex flex-wrap gap-1.5">
                                                    {def.synonyms.map((syn, si) => (
                                                      <span key={si} className={`text-sm text-stone-600`}>
                                                        {syn}{si < def.synonyms.length - 1 ? ',' : ''}
                                                      </span>
                                                    ))}
                                                  </div>
                                                </div>
                                            )}

                                            <div className="space-y-2">
                                              {def.examples?.map((ex, ei) => (
                                                <p key={ei} className={`italic font-serif text-lg leading-relaxed text-stone-500 border-l pl-4 ${isFinancial ? 'border-stone-100 py-1' : 'border-stone-50'}`}>
                                                  "{ex}"
                                                </p>
                                              ))}
                                            </div>

                                            {def.collocations && def.collocations.length > 0 && (
                                              <div className="flex flex-wrap items-center gap-x-3 gap-y-2 pt-4">
                                                <div className={`flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest mr-1 text-stone-400`}>
                                                  <Layers className="w-3 h-3" /> Collocations
                                                </div>
                                                <div className="flex flex-wrap gap-2">
                                                  {def.collocations.map((col, ci) => (
                                                    <span key={ci} className={`text-[10px] font-bold px-3 py-1 rounded-lg border text-stone-700 bg-stone-50 border-stone-200`}>
                                                      {col}
                                                    </span>
                                                  ))}
                                                </div>
                                              </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                              );
                          })}
                      </div>

                      {/* Contexts Section */}
                      <div className="mt-8 pt-6 border-t border-stone-100">
                          <div className="flex items-center justify-between mb-4">
                            <h4 className="text-sm font-bold uppercase tracking-wider text-stone-400 flex items-center gap-2">
                                <FileText className="w-4 h-4" /> Usage Contexts
                            </h4>
                            <button onClick={() => { setAddingContextFor(entry.word); setErrorMsg(''); }} className="text-xs text-stone-500 hover:text-stone-900 font-medium transition-colors flex items-center gap-1">
                                <Plus className="w-3 h-3" /> Add Article
                            </button>
                          </div>

                          {addingContextFor === entry.word && (
                              <div className="bg-stone-50 p-4 rounded-xl border border-stone-200 mb-6 animate-fade-in shadow-inner">
                                  <h5 className="font-serif font-bold text-stone-800 mb-3 text-lg">New Article Context</h5>
                                  <input type="text" placeholder="Title — optional (e.g., Bloomberg News)" value={newContextTitle} onChange={(e) => setNewContextTitle(e.target.value)} className="w-full mb-3 p-3 text-sm border border-stone-200 rounded-lg outline-none focus:ring-1 focus:ring-stone-300" />
                                  <textarea placeholder={`Paste text containing "${entry.word}"...`} value={newContextText} onChange={(e) => setNewContextText(e.target.value)} className="w-full h-32 p-3 text-sm border border-stone-200 rounded-lg outline-none focus:ring-1 focus:ring-stone-300 resize-none font-serif text-stone-600" />
                                  {errorMsg && <p className="text-sm text-amber-700 mt-2">{errorMsg}</p>}
                                  <div className="flex justify-end gap-2 mt-3">
                                      <button onClick={() => { setAddingContextFor(null); setErrorMsg(''); }} className="px-3 py-1.5 text-xs font-medium text-stone-500">Cancel</button>
                                      <button onClick={() => handleSaveContext(entry)} disabled={isAnalyzing || !newContextText} className="px-4 py-1.5 bg-stone-900 text-white text-xs font-bold uppercase tracking-widest rounded-lg hover:bg-black disabled:opacity-50 flex items-center gap-2">
                                          {isAnalyzing ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Analyze & Save'}
                                      </button>
                                  </div>
                              </div>
                          )}

                          <div className="space-y-4">
                              {entry.contexts?.map((ctx) => (
                                  <div key={ctx.id} className="bg-white border border-stone-100 rounded-xl overflow-hidden shadow-sm relative group p-5 hover:border-stone-300 transition-all">
                                      <div className="flex justify-between items-start mb-3">
                                          <h5 className="font-serif font-bold text-stone-800 text-lg leading-tight">{ctx.sourceTitle}</h5>
                                          <button onClick={() => setSidebarContext({ word: entry, context: ctx })} className={`flex items-center gap-2 px-4 py-2 text-[10px] font-bold uppercase tracking-[0.2em] rounded-full shadow-lg transition-all active:scale-95 ${sidebarContext?.context.id === ctx.id ? 'bg-stone-100 text-stone-900 border border-stone-300' : 'bg-stone-900 text-white hover:bg-black'}`}>
                                              <Sparkles className="w-3 h-3" /> {sidebarContext?.context.id === ctx.id ? 'Active Assist' : 'Assist'}
                                          </button>
                                      </div>
                                      <p className="text-stone-600 font-serif italic text-sm border-l-2 border-stone-100 pl-3 py-1 mb-2">"{ctx.targetSentence}"</p>
                                      <button onClick={() => handleDeleteContext(entry, ctx.id)} className="text-[10px] text-stone-300 hover:text-red-500 uppercase font-bold tracking-widest">Remove Context</button>
                                  </div>
                              ))}
                          </div>
                      </div>

                      <div className="mt-8 pt-4 flex justify-between items-center border-t border-stone-100">
                        <button onClick={(e) => { e.stopPropagation(); onDelete(entry.word); }} className="text-stone-300 hover:text-red-600 text-[10px] font-bold uppercase tracking-widest transition-colors">Delete Word</button>
                        <button onClick={() => onPractice(entry)} className="flex items-center gap-2 px-6 py-2.5 bg-stone-900 text-white text-xs font-bold uppercase tracking-widest rounded-full hover:bg-black shadow-md transition-all">Practice <ArrowRight className="w-4 h-4" /></button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {filteredWords.length > visibleCount && (
          <div className="text-center py-8">
            <button
              onClick={() => setVisibleCount(n => n + 200)}
              className="px-6 py-3 bg-stone-100 text-stone-700 rounded-full text-sm font-bold hover:bg-stone-200 transition-colors"
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
                <div className="p-6 border-b border-stone-100 bg-[#FDFBF7] relative">
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
