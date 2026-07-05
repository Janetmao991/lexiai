
import React, { useState } from 'react';
import { ArticleEntry, WordEntry, ContextExplanation, VocabularySuggestion } from '../types';
import { explainContext, analyzeVocabulary, lookupWord } from '../services/geminiService';
import { BookOpen, Plus, Save, ChevronLeft, Sparkles, Loader2, X, FileText, Search, GraduationCap, Trash2 } from 'lucide-react';

interface ArticlesProps {
  articles: ArticleEntry[];
  savedWords: WordEntry[];
  onSaveArticle: (article: ArticleEntry) => void;
  onDeleteArticle: (id: string) => void;
  onSaveWord: (word: WordEntry) => void;
}

export const Articles: React.FC<ArticlesProps> = ({ 
  articles, 
  savedWords, 
  onSaveArticle, 
  onDeleteArticle,
  onSaveWord 
}) => {
  const [view, setView] = useState<'LIST' | 'ADD' | 'READ'>('LIST');
  const [currentArticle, setCurrentArticle] = useState<ArticleEntry | null>(null);
  const [newTitle, setNewTitle] = useState('');
  const [newContent, setNewContent] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  
  // Reading Mode States
  const [selectedWord, setSelectedWord] = useState<string | null>(null);
  const [contextData, setContextData] = useState<ContextExplanation | null>(null);
  const [loadingContext, setLoadingContext] = useState(false);
  const [vocabSuggestions, setVocabSuggestions] = useState<VocabularySuggestion[]>([]);
  const [analyzingVocab, setAnalyzingVocab] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Filter articles
  const filteredArticles = articles.filter(a => 
    a.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
    a.content.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleAddArticle = () => {
    if (!newTitle.trim() || !newContent.trim()) return;
    const article: ArticleEntry = {
      id: Date.now().toString(),
      title: newTitle,
      content: newContent,
      timestamp: Date.now()
    };
    onSaveArticle(article);
    setNewTitle('');
    setNewContent('');
    setView('LIST');
  };

  const handleOpenArticle = (article: ArticleEntry) => {
    setCurrentArticle(article);
    setView('READ');
    setVocabSuggestions([]);
    setSidebarOpen(false);
  };

  const handleWordClick = async (word: string, sentence: string) => {
    // Basic normalization
    const cleanWord = word.replace(/[^\w]/g, '');
    if (!cleanWord) return;

    setSelectedWord(cleanWord);
    setLoadingContext(true);
    setContextData(null);
    
    try {
      const data = await explainContext(cleanWord, sentence);
      setContextData(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingContext(false);
    }
  };

  const handleAnalyzeVocabulary = async () => {
    if (!currentArticle) return;
    setSidebarOpen(true);
    if (vocabSuggestions.length > 0) return; // Don't re-analyze if we have data

    setAnalyzingVocab(true);
    try {
      const suggestions = await analyzeVocabulary(currentArticle.content);
      setVocabSuggestions(suggestions);
    } catch (e) {
      console.error(e);
    } finally {
      setAnalyzingVocab(false);
    }
  };

  const handleSaveSuggestion = async (suggestion: VocabularySuggestion) => {
    try {
      // We need to fetch the full dictionary entry to save it properly
      const fullEntry = await lookupWord(suggestion.word);
      if (fullEntry) {
        onSaveWord(fullEntry);
      }
    } catch (e) {
      console.error("Failed to save suggested word", e);
    }
  };

  const isWordSaved = (word: string) => {
    return savedWords.some(w => w.word.toLowerCase() === word.toLowerCase());
  };

  // Helper to split text into sentences for click detection
  const renderContent = (text: string) => {
    // Simple split by sentences for the sake of context extraction
    // In a real app, this would be more robust
    const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
    
    return sentences.map((sentence, sIdx) => (
      <span key={sIdx} className="mr-1">
        {sentence.split(' ').map((word, wIdx) => {
            const cleanWord = word.replace(/[^\w'-]/g, '');
            const isSaved = isWordSaved(cleanWord);

            return (
                <span key={`${sIdx}-${wIdx}`}>
                    <span 
                        onClick={() => handleWordClick(cleanWord, sentence)}
                        className={`cursor-pointer hover:bg-stone-200 rounded px-0.5 transition-colors ${
                            isSaved ? 'text-stone-900 border-b-2 border-stone-800' : 'text-stone-700'
                        }`}
                    >
                        {word}
                    </span>
                    {' '}
                </span>
            );
        })}
      </span>
    ));
  };

  // VIEW: LIST ARTICLES
  if (view === 'LIST') {
    return (
      <div className="max-w-3xl mx-auto space-y-8">
        <div className="flex flex-col md:flex-row justify-between items-end md:items-center gap-4 border-b border-stone-200 pb-6">
          <div>
            <h2 className="text-3xl font-serif font-bold text-stone-800">Library</h2>
            <p className="text-stone-500 mt-1">Read and analyze your texts</p>
          </div>
          <button 
            onClick={() => setView('ADD')}
            className="flex items-center gap-2 px-5 py-2.5 bg-stone-900 text-white rounded-full hover:bg-black transition-colors shadow-sm"
          >
            <Plus className="w-4 h-4" /> Add Article
          </button>
        </div>

        {/* Search */}
        <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
            <input 
                type="text" 
                placeholder="Filter articles..." 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-3 bg-white border border-stone-200 rounded-lg outline-none focus:ring-1 focus:ring-stone-400 transition-all placeholder:text-stone-400"
            />
        </div>

        <div className="grid gap-4">
          {filteredArticles.length === 0 ? (
            <div className="text-center py-20 text-stone-400 border border-dashed border-stone-200 rounded-xl">
              <FileText className="w-12 h-12 mx-auto mb-3 opacity-20" />
              <p>No articles found.</p>
            </div>
          ) : (
            filteredArticles.map(article => (
              <div 
                key={article.id}
                onClick={() => handleOpenArticle(article)}
                className="group bg-white p-6 rounded-xl border border-stone-100 hover:border-stone-300 shadow-sm hover:shadow-md transition-all cursor-pointer relative"
              >
                <h3 className="text-xl font-serif font-bold text-stone-900 mb-2 group-hover:text-stone-700 transition-colors">
                    {article.title}
                </h3>
                <p className="text-stone-500 line-clamp-2 font-serif text-sm leading-relaxed">
                    {article.content}
                </p>
                <div className="mt-4 flex items-center justify-between text-xs text-stone-400 uppercase tracking-widest font-medium">
                    <span>{new Date(article.timestamp).toLocaleDateString()}</span>
                    <span className="flex items-center gap-1 group-hover:translate-x-1 transition-transform text-stone-900">
                        Read <ChevronLeft className="w-3 h-3 rotate-180" />
                    </span>
                </div>
                <button 
                    onClick={(e) => { e.stopPropagation(); onDeleteArticle(article.id); }}
                    className="absolute top-4 right-4 p-2 text-stone-300 hover:text-red-500 hover:bg-red-50 rounded-full transition-colors opacity-0 group-hover:opacity-100"
                >
                    <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    );
  }

  // VIEW: ADD ARTICLE
  if (view === 'ADD') {
    return (
      <div className="max-w-2xl mx-auto">
        <button 
          onClick={() => setView('LIST')}
          className="flex items-center gap-2 text-stone-500 hover:text-stone-900 mb-6 transition-colors"
        >
          <ChevronLeft className="w-4 h-4" /> Back to Library
        </button>
        
        <div className="bg-white p-8 rounded-xl border border-stone-200 shadow-sm">
          <h2 className="text-2xl font-serif font-bold text-stone-800 mb-6">New Article</h2>
          <div className="space-y-6">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-stone-400 mb-2">Title</label>
              <input 
                type="text"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                className="w-full p-3 bg-stone-50 border border-stone-200 rounded-lg outline-none focus:border-stone-400 font-serif text-lg"
                placeholder="e.g., The Future of AI"
              />
            </div>
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-stone-400 mb-2">Content</label>
              <textarea 
                value={newContent}
                onChange={(e) => setNewContent(e.target.value)}
                className="w-full h-64 p-4 bg-stone-50 border border-stone-200 rounded-lg outline-none focus:border-stone-400 font-serif leading-relaxed text-stone-700 resize-none"
                placeholder="Paste your article text here..."
              />
            </div>
            <div className="flex justify-end">
              <button 
                onClick={handleAddArticle}
                disabled={!newTitle || !newContent}
                className="px-6 py-3 bg-stone-900 text-white rounded-full hover:bg-black disabled:opacity-50 flex items-center gap-2 font-medium"
              >
                <Save className="w-4 h-4" /> Save Article
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // VIEW: READ ARTICLE
  return (
    <div className="relative min-h-[calc(100vh-100px)]">
       {/* Reader Header */}
       <div className="sticky top-20 z-10 bg-[#FDFBF7]/95 backdrop-blur border-b border-stone-200 pb-4 mb-8 flex justify-between items-center">
         <button 
            onClick={() => setView('LIST')}
            className="flex items-center gap-2 text-stone-500 hover:text-stone-900 transition-colors"
         >
            <ChevronLeft className="w-4 h-4" /> Back
         </button>
         
         <div className="flex gap-2">
            <button
                onClick={handleAnalyzeVocabulary}
                className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all border ${
                    sidebarOpen 
                    ? 'bg-stone-900 text-white border-stone-900' 
                    : 'bg-white text-stone-600 border-stone-200 hover:border-stone-400'
                }`}
            >
                <Sparkles className="w-4 h-4" /> Analyze Vocabulary
            </button>
         </div>
       </div>

       <div className="grid md:grid-cols-[1fr_350px] gap-12 relative">
          {/* Main Text */}
          <div className="prose prose-lg prose-stone max-w-none pb-20">
             <h1 className="font-serif text-4xl font-bold text-stone-900 mb-8">{currentArticle?.title}</h1>
             <div className="font-serif text-xl leading-loose text-stone-800">
                {currentArticle && renderContent(currentArticle.content)}
             </div>
          </div>

          {/* Sidebar / Overlay */}
          {(sidebarOpen || contextData || loadingContext) && (
              <div className="fixed inset-y-0 right-0 w-full md:w-[400px] bg-white shadow-2xl border-l border-stone-200 p-6 overflow-y-auto transform transition-transform duration-300 z-50">
                  <div className="flex justify-between items-center mb-8">
                     <h3 className="font-serif font-bold text-xl text-stone-800">
                         {contextData ? 'Word Context' : 'Vocabulary Analysis'}
                     </h3>
                     <button 
                        onClick={() => { setSidebarOpen(false); setContextData(null); }}
                        className="p-2 hover:bg-stone-100 rounded-full text-stone-500"
                     >
                        <X className="w-5 h-5" />
                     </button>
                  </div>

                  {/* Single Word Context Mode */}
                  {loadingContext ? (
                      <div className="flex flex-col items-center justify-center py-20 space-y-4">
                          <Loader2 className="w-8 h-8 animate-spin text-stone-400" />
                          <p className="text-stone-500 font-serif italic">Analyzing context...</p>
                      </div>
                  ) : contextData ? (
                      <div className="space-y-6 animate-fade-in">
                          <div className="bg-stone-50 p-6 rounded-lg border border-stone-100">
                              <h4 className="text-3xl font-serif font-bold text-stone-900 capitalize mb-2">{contextData.word}</h4>
                              <p className="text-stone-600 font-serif italic mb-4">"{contextData.sentence}"</p>
                              
                              <div className="space-y-4">
                                <div>
                                    <span className="text-xs font-bold uppercase tracking-wider text-stone-400">Meaning here</span>
                                    <p className="text-stone-800 text-lg leading-relaxed mt-1">{contextData.explanation}</p>
                                </div>
                                <div>
                                    <span className="text-xs font-bold uppercase tracking-wider text-stone-400">Nuance & Tone</span>
                                    <p className="text-stone-700 mt-1">{contextData.usageNuance}</p>
                                </div>
                              </div>
                          </div>
                          
                          <button
                            onClick={async () => {
                                const entry = await lookupWord(contextData.word);
                                if(entry) onSaveWord(entry);
                            }}
                            disabled={isWordSaved(contextData.word)}
                            className="w-full py-3 bg-stone-900 text-white rounded-full hover:bg-black disabled:opacity-50 disabled:bg-stone-100 disabled:text-stone-400 transition-all font-medium"
                          >
                             {isWordSaved(contextData.word) ? 'Saved to Notebook' : 'Add to Notebook'}
                          </button>
                      </div>
                  ) : (
                      // Full Vocabulary Analysis Mode
                      <div className="space-y-6">
                          {analyzingVocab ? (
                              <div className="flex flex-col items-center justify-center py-20 space-y-4">
                                <Loader2 className="w-8 h-8 animate-spin text-stone-400" />
                                <p className="text-stone-500 font-serif italic">Finding advanced words...</p>
                              </div>
                          ) : (
                              vocabSuggestions.map((item, idx) => (
                                  <div key={idx} className="border-b border-stone-100 pb-6 last:border-0">
                                      <div className="flex justify-between items-start mb-2">
                                          <h4 className="text-lg font-bold font-serif text-stone-900 capitalize">{item.word}</h4>
                                          <button 
                                            onClick={() => handleSaveSuggestion(item)}
                                            disabled={isWordSaved(item.word)}
                                            className="text-stone-400 hover:text-stone-900 disabled:opacity-20 transition-colors"
                                          >
                                              {isWordSaved(item.word) ? <GraduationCap className="w-5 h-5 text-stone-900" /> : <Plus className="w-5 h-5" />}
                                          </button>
                                      </div>
                                      <p className="text-stone-600 text-sm mb-2">{item.definition}</p>
                                      <span className="inline-block px-2 py-1 bg-stone-100 text-stone-500 text-[10px] uppercase tracking-wider font-bold rounded">
                                          {item.reason}
                                      </span>
                                  </div>
                              ))
                          )}
                          {!analyzingVocab && vocabSuggestions.length === 0 && (
                             <p className="text-center text-stone-400 italic">Click "Analyze Vocabulary" to find words.</p>
                          )}
                      </div>
                  )}
              </div>
          )}
       </div>
    </div>
  );
};
