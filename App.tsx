
import React, { useState, useEffect } from 'react';
import { Dictionary } from './components/Dictionary.tsx';
import { Notebook } from './components/Notebook.tsx';
import { Flashcards } from './components/Flashcards.tsx';
import { Practice } from './components/Practice.tsx';
import { Podcast } from './components/Podcast.tsx';
import { WordEntry, ViewState } from './types.ts';
import { Book, GraduationCap, LayoutGrid, PenTool, X, Cloud, Loader2, Mic2, Database, Terminal } from 'lucide-react';
import { firebaseService } from './firebase.ts';
import { localStorageService } from './services/localStorageService.ts';
import { syncService } from './services/syncService.ts';

const App: React.FC = () => {
  const [view, setView] = useState<ViewState>(ViewState.DICTIONARY);
  const [practiceTarget, setPracticeTarget] = useState<WordEntry | undefined>(undefined);
  
  const [savedWords, setSavedWords] = useState<WordEntry[]>([]);

  const [userId, setUserId] = useState<string>(() => {
    return localStorage.getItem('lexiai_device_user_id') || 'lexiai_personal_user';
  });
  
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'error' | 'permission-denied'>('idle');
  const [lastError, setLastError] = useState<string | null>(null);
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(null);
  const [showCloudConfig, setShowCloudConfig] = useState(false);
  const [newCloudId, setNewCloudId] = useState('');
  const [showDebug, setShowDebug] = useState(false);

  useEffect(() => {
    const localWordsMap = localStorageService.getAllWords();
    const sorted = Object.values(localWordsMap).sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    setSavedWords(sorted);
  }, []);

  useEffect(() => {
    if (!userId) return;
    
    const handleInitialSync = async () => {
      setSyncStatus('syncing');
      try {
        const mergedData = await syncService.bidirectionalSync(userId);
        const wordsArray = Object.values(mergedData).sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
        setSavedWords(wordsArray);
        setLastSyncTime(new Date().toLocaleTimeString());
        setSyncStatus('idle');
      } catch (e: any) {
        setLastError(e.message);
        setSyncStatus('error');
      }
    };

    handleInitialSync();
  }, [userId]);

  const handleSaveWord = async (w: WordEntry) => {
    const entry: WordEntry = { 
      ...w, 
      timestamp: Date.now(), 
      lastModified: new Date().toISOString(),
      syncStatus: 'pending' 
    };
    
    localStorageService.saveWord(w.word, entry);
    setSavedWords(prev => {
      const filtered = prev.filter(item => item.word !== w.word);
      return [entry, ...filtered].sort((a, b) => b.timestamp - a.timestamp);
    });

    firebaseService.saveWord(userId, w.word, entry)
      .then(() => {
        localStorageService.markAsSynced(w.word);
        setSavedWords(prev => prev.map(item => item.word === w.word ? { ...item, syncStatus: 'synced' } : item));
      })
      .catch(e => {
        console.warn("Background cloud sync deferred.", e);
      });
  };

  const handleDeleteWord = async (wordId: string) => {
    localStorageService.deleteWord(wordId);
    setSavedWords(prev => prev.filter(w => w.word !== wordId));

    firebaseService.deleteWord(userId, wordId)
      .catch(e => {
        console.error("Background delete deferred.", e);
      });
  };

  const handleConnectCloud = () => {
    if (newCloudId.trim()) {
      const sanitized = newCloudId.trim().toLowerCase().replace(/[^a-z0-9_]/g, '');
      setUserId(sanitized);
      localStorage.setItem('lexiai_device_user_id', sanitized);
      setShowCloudConfig(false);
      setNewCloudId('');
    }
  };

  const navItems = [
    { id: ViewState.DICTIONARY, label: 'Dictionary', icon: <Book className="w-4 h-4" /> },
    { id: ViewState.NOTEBOOK, label: 'Notebook', icon: <LayoutGrid className="w-4 h-4" /> },
    { id: ViewState.FLASHCARDS, label: 'Flashcards', icon: <PenTool className="w-4 h-4" /> },
    { id: ViewState.PRACTICE, label: 'Practice', icon: <PenTool className="w-4 h-4" /> },
    { id: ViewState.PODCAST, label: 'Podcast', icon: <Mic2 className="w-4 h-4" /> },
  ];

  return (
    <div className="min-h-screen bg-[#FDFBF7] text-stone-900 font-sans">
      <header className="bg-white/80 backdrop-blur-md border-b border-stone-200 sticky top-0 z-50">
        <div className="max-w-5xl mx-auto px-4 h-20 flex justify-between items-center">
          <div className="flex items-center gap-3 cursor-pointer group" onClick={() => setView(ViewState.DICTIONARY)}>
            <div className="p-2 border border-stone-800 rounded-lg bg-stone-900 text-white shadow-inner">
              <GraduationCap className="w-5 h-5" />
            </div>
            <span className="text-2xl font-serif font-bold tracking-tight">LexiAI</span>
          </div>

          <nav className="hidden md:flex items-center gap-1">
            {navItems.map(item => (
              <button
                key={item.id}
                onClick={() => setView(item.id)}
                className={`px-4 py-2 rounded-full text-sm font-medium transition-all flex items-center gap-2 ${
                  view === item.id ? 'bg-stone-800 text-white shadow-md' : 'text-stone-500 hover:bg-stone-100'
                }`}
              >
                {item.label}
              </button>
            ))}
          </nav>
          
          <div className="flex items-center gap-2">
            <button 
              onClick={() => setShowCloudConfig(true)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-bold uppercase tracking-wider transition-all ${
                syncStatus === 'syncing' ? 'bg-amber-50 border-amber-100 text-amber-600' :
                userId === 'lexiai_personal_user' ? 'bg-stone-100 text-stone-400' : 'bg-emerald-50 border-emerald-100 text-emerald-700'
              }`}
            >
              {syncStatus === 'syncing' ? <Loader2 className="w-3 h-3 animate-spin" /> : <Cloud className="w-3 h-3" />}
              {userId === 'lexiai_personal_user' ? 'Default' : userId}
            </button>
            <button 
              onClick={() => setShowDebug(!showDebug)} 
              className={`p-2 rounded-lg transition-colors ${showDebug ? 'bg-stone-800 text-white' : 'text-stone-300 hover:text-stone-900'}`}
              title="Debug Sync"
            >
               <Terminal className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {showDebug && (
        <div className="bg-stone-900 text-stone-300 border-b border-stone-800 animate-fade-in shadow-inner">
          <div className="max-w-5xl mx-auto p-6 space-y-4">
             <div className="flex items-center justify-between border-b border-stone-800 pb-3">
                <div className="flex items-center gap-2">
                   <Database className="w-4 h-4 text-emerald-500" />
                   <h4 className="text-xs font-bold uppercase tracking-[0.2em] text-stone-500">Sync Monitor</h4>
                </div>
                <button onClick={() => setShowDebug(false)} className="text-stone-500 hover:text-white"><X className="w-4 h-4" /></button>
             </div>
             <div className="grid md:grid-cols-2 gap-8 text-xs font-mono">
                <div className="space-y-2">
                  <p><span className="text-stone-600">Sync:</span> {syncStatus.toUpperCase()}</p>
                </div>
                <div className="space-y-2">
                  <p><span className="text-stone-600">Remote:</span> {userId}</p>
                  {lastSyncTime && <p><span className="text-stone-600">Last Sync:</span> {lastSyncTime}</p>}
                </div>
             </div>
          </div>
        </div>
      )}

      {showCloudConfig && (
        <div className="fixed inset-0 bg-stone-900/60 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl p-8 space-y-6 animate-fade-in-up">
              <div className="flex justify-between items-center">
                <h3 className="text-2xl font-serif font-bold">Cloud Sync</h3>
                <button onClick={() => setShowCloudConfig(false)} className="text-stone-400 hover:text-stone-900"><X /></button>
              </div>
              <p className="text-stone-500 text-sm">Backup your notebook across devices using a custom ID.</p>
              <input 
                type="text" 
                value={newCloudId}
                onChange={(e) => setNewCloudId(e.target.value)}
                placeholder="Custom Cloud ID"
                className="w-full p-4 bg-stone-50 border border-stone-200 rounded-xl outline-none focus:ring-2 focus:ring-stone-900"
              />
              <button 
                onClick={handleConnectCloud} 
                className="w-full py-4 bg-stone-900 text-white rounded-xl font-bold hover:bg-black transition-colors"
              >
                Connect & Sync
              </button>
          </div>
        </div>
      )}

      <main className="max-w-5xl mx-auto px-4 py-12">
        {view === ViewState.DICTIONARY && <Dictionary onSave={handleSaveWord} savedWords={savedWords} />}
        {view === ViewState.NOTEBOOK && <Notebook words={savedWords} onDelete={handleDeleteWord} onPractice={(w) => { setPracticeTarget(w); setView(ViewState.PRACTICE); }} onUpdateWord={handleSaveWord} />}
        {view === ViewState.FLASHCARDS && <Flashcards words={savedWords} />}
        {view === ViewState.PRACTICE && <Practice initialWord={practiceTarget} words={savedWords} />}
        {view === ViewState.PODCAST && <Podcast words={savedWords} />}
      </main>
    </div>
  );
};

export default App;
