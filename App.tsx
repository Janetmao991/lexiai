
import React, { useState, useEffect, useRef } from 'react';
import { Dictionary } from './components/Dictionary.tsx';
import { Notebook } from './components/Notebook.tsx';
import { Flashcards } from './components/Flashcards.tsx';
import { Practice } from './components/Practice.tsx';
import { Podcast } from './components/Podcast.tsx';
import { Speaking, SpeakingKind } from './components/Speaking.tsx';
import { WordEntry, ViewState, SrsRating, UserStats } from './types.ts';
import { Book, GraduationCap, LayoutGrid, PenTool, X, Cloud, CloudOff, Loader2, Mic2, Database, Terminal, LogOut, Download, Upload, Flame, Settings as SettingsIcon } from 'lucide-react';
import { localStorageService } from './services/localStorageService.ts';
import { syncService } from './services/syncService.ts';
import { cloudService } from './services/cloudService.ts';
import { supabase, isCloudConfigured } from './services/supabaseClient.ts';
import { srsService } from './services/srsService.ts';
import { statsService, levelForXp } from './services/statsService.ts';
import { ProgressPanel } from './components/ProgressPanel.tsx';
import { Settings } from './components/Settings.tsx';
import { AskAI } from './components/AskAI.tsx';
import { hasApiKey } from './services/geminiService.ts';
import type { Session } from '@supabase/supabase-js';

const App: React.FC = () => {
  const [view, setView] = useState<ViewState>(ViewState.DICTIONARY);
  const [practiceTarget, setPracticeTarget] = useState<WordEntry | undefined>(undefined);

  const [savedWords, setSavedWords] = useState<WordEntry[]>([]);

  const [session, setSession] = useState<Session | null>(null);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'error'>('idle');
  const [lastError, setLastError] = useState<string | null>(null);
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(null);
  const [showDebug, setShowDebug] = useState(false);

  // Auth / account modal state
  const [showAccount, setShowAccount] = useState(false);
  const [authMode, setAuthMode] = useState<'signin' | 'signup' | 'forgot'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authBusy, setAuthBusy] = useState(false);
  const [authMessage, setAuthMessage] = useState<string | null>(null);
  const [codeSent, setCodeSent] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const importInputRef = useRef<HTMLInputElement>(null);

  // Password recovery (arrived via reset-email link)
  const [showReset, setShowReset] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [resetBusy, setResetBusy] = useState(false);
  const [resetMessage, setResetMessage] = useState<string | null>(null);

  const [stats, setStats] = useState<UserStats>(() => statsService.get());
  const [showProgress, setShowProgress] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [keyConfigured, setKeyConfigured] = useState(() => hasApiKey());

  const refreshFromLocal = () => {
    const localWordsMap = localStorageService.getAllWords();
    const sorted = Object.values(localWordsMap).sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    setSavedWords(sorted);
  };

  useEffect(() => {
    refreshFromLocal();
    const unsubscribe = statsService.subscribe(setStats);
    statsService.touch(); // opening the app keeps the day-streak alive
    setStats(statsService.get());
    return unsubscribe;
  }, []);

  // Track auth session
  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((event, newSession) => {
      setSession(newSession);
      if (event === 'PASSWORD_RECOVERY') setShowReset(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  // Recovery links can be processed before the listener above subscribes, and
  // expired/used links come back as #error_description=… — handle both from the URL.
  useEffect(() => {
    const hash = window.location.hash;
    if (!hash) return;
    if (/type=recovery/.test(hash)) setShowReset(true);
    const err = hash.match(/error_description=([^&]+)/);
    if (err) {
      setShowAccount(true);
      setAuthMode('forgot');
      setAuthMessage(`This reset link no longer works (${decodeURIComponent(err[1].replace(/\+/g, ' '))}). Links are single-use — send yourself a fresh one below and open it right away.`);
      window.history.replaceState(null, '', window.location.pathname);
    }
  }, []);

  // Sync whenever we have a logged-in user
  useEffect(() => {
    if (!session) {
      statsService.setUser(null);
      return;
    }
    statsService.syncWithCloud(session.user.id);
    const runSync = async () => {
      setSyncStatus('syncing');
      try {
        const merged = await syncService.bidirectionalSync(session.user.id);
        const wordsArray = Object.values(merged).sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
        setSavedWords(wordsArray);
        setLastSyncTime(new Date().toLocaleTimeString());
        setSyncStatus('idle');
        setLastError(null);
      } catch (e: any) {
        setLastError(e.message);
        setSyncStatus('error');
      }
    };
    runSync();
  }, [session?.user.id]);

  const handleSaveWord = async (w: WordEntry) => {
    const isNew = !localStorageService.hasWord(w.word);
    const entry: WordEntry = {
      ...w,
      timestamp: w.timestamp || Date.now(), // preserve original save date on updates
      lastModified: new Date().toISOString(),
      syncStatus: 'pending'
    };

    localStorageService.saveWord(w.word, entry);
    setSavedWords(prev => {
      const filtered = prev.filter(item => item.word !== w.word);
      return [entry, ...filtered].sort((a, b) => b.timestamp - a.timestamp);
    });

    if (isNew) {
      statsService.record('save', Object.values(localStorageService.getAllWords()));
    }

    if (session) {
      cloudService.saveWord(session.user.id, w.word, entry)
        .then(() => {
          localStorageService.markAsSynced(w.word);
          setSavedWords(prev => prev.map(item => item.word === w.word ? { ...item, syncStatus: 'synced' } : item));
        })
        .catch(e => console.warn('Background cloud sync deferred.', e));
    }
  };

  const allWords = () => Object.values(localStorageService.getAllWords());

  const handleReview = (entry: WordEntry, rating: SrsRating) => {
    if (!entry.srs) statsService.recordNewCard(); // first time in rotation counts against today's new-card budget
    const updated: WordEntry = { ...entry, srs: srsService.schedule(entry.srs, rating) };
    handleSaveWord(updated);
    statsService.record('review', allWords());
  };

  const handlePracticeScored = (word: WordEntry, score: number) => {
    const best = Math.max(word.mastery?.bestPracticeScore ?? 0, score);
    if (best !== word.mastery?.bestPracticeScore) {
      handleSaveWord({ ...word, mastery: { ...word.mastery, bestPracticeScore: best } });
    }
    statsService.record(score >= 80 ? 'practiceHigh' : 'practice', allWords());
  };

  const handleGameComplete = () => statsService.record('game', allWords());
  const handleSpellCorrect = () => statsService.record('review', allWords());
  const handlePodcastGenerated = () => statsService.record('podcast', allWords());

  const handleSpeakingDone = (word: WordEntry, kind: SpeakingKind, passed: boolean) => {
    if (kind === 'sentence' && passed && !word.mastery?.speakingPassed) {
      handleSaveWord({ ...word, mastery: { ...word.mastery, speakingPassed: true } });
    }
    if (passed) statsService.record('speaking', allWords());
  };

  const handleConversationDone = (usedWellWords: string[], _score: number) => {
    const wordsMap = localStorageService.getAllWords();
    for (const name of usedWellWords) {
      const entry = Object.values(wordsMap).find(w => w.word.toLowerCase() === name.toLowerCase());
      if (entry && !entry.mastery?.speakingPassed) {
        handleSaveWord({ ...entry, mastery: { ...entry.mastery, speakingPassed: true } });
      }
    }
    statsService.record('speaking', allWords());
  };

  const handleDeleteWord = async (wordId: string) => {
    localStorageService.deleteWord(wordId);
    setSavedWords(prev => prev.filter(w => w.word !== wordId));
    if (session) {
      cloudService.deleteWord(session.user.id, wordId)
        .catch(e => console.error('Background delete deferred.', e));
    }
  };

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase) return;
    setAuthBusy(true);
    setAuthMessage(null);
    try {
      if (authMode === 'signup') {
        const { data, error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        if (!data.session) {
          setAuthMessage('Check your inbox to confirm your email, then sign in.');
        } else {
          setShowAccount(false);
        }
      } else if (authMode === 'forgot') {
        if (!codeSent) {
          const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin });
          if (error) throw error;
          setCodeSent(true);
          setAuthMessage('Email sent! Enter the 6-digit code from it below. (Check spam if you don\'t see it.)');
        } else {
          const { error } = await supabase.auth.verifyOtp({ email, token: otpCode.trim(), type: 'recovery' });
          if (error) throw error;
          setShowAccount(false);
          setOtpCode('');
          setCodeSent(false);
          setAuthMode('signin');
          setShowReset(true);
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        setShowAccount(false);
      }
      setPassword('');
    } catch (err: any) {
      setAuthMessage(err.message || 'Authentication failed.');
    } finally {
      setAuthBusy(false);
    }
  };

  const handleSetNewPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase) return;
    setResetBusy(true);
    setResetMessage(null);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      setNewPassword('');
      setShowReset(false);
    } catch (err: any) {
      setResetMessage(err.message || 'Could not update password.');
    } finally {
      setResetBusy(false);
    }
  };

  const handleSignOut = async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
    setShowAccount(false);
  };

  const handleExport = () => {
    const payload = localStorageService.exportData();
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `lexiai-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      const words: Record<string, WordEntry> = parsed.words || parsed;
      // Single-pass bulk merge + one write: thousands of entries import in
      // milliseconds instead of freezing the tab with per-word rewrites.
      const merged = syncService.mergeData(localStorageService.getAllWords(), words);
      for (const key of Object.keys(words)) {
        if (merged[key]) merged[key] = { ...merged[key], syncStatus: 'pending' };
      }
      if (!localStorageService.importData(merged)) {
        throw new Error('Browser storage rejected the data (likely full).');
      }
      refreshFromLocal();
      setAuthMessage(`Imported ${Object.keys(words).length} words.` + (session ? ' Uploading to cloud…' : ''));
      if (session) {
        setSyncStatus('syncing');
        const pending = Object.fromEntries(Object.entries(merged).filter(([, w]) => w.syncStatus === 'pending'));
        await cloudService.saveAllWords(session.user.id, pending);
        const all = localStorageService.getAllWords();
        for (const key of Object.keys(pending)) {
          if (all[key]) { all[key].syncStatus = 'synced'; all[key].lastSyncTime = new Date().toISOString(); }
        }
        localStorageService.importData(all);
        setSyncStatus('idle');
        refreshFromLocal();
        setAuthMessage(`Imported ${Object.keys(words).length} words and synced to cloud.`);
      }
    } catch (err: any) {
      setAuthMessage(`Import failed: ${err.message}`);
    } finally {
      e.target.value = '';
    }
  };

  const navItems = [
    { id: ViewState.DICTIONARY, label: 'Dictionary', icon: <Book className="w-4 h-4" /> },
    { id: ViewState.NOTEBOOK, label: 'Notebook', icon: <LayoutGrid className="w-4 h-4" /> },
    { id: ViewState.FLASHCARDS, label: 'Flashcards', icon: <PenTool className="w-4 h-4" /> },
    { id: ViewState.PRACTICE, label: 'Practice', icon: <PenTool className="w-4 h-4" /> },
    { id: ViewState.SPEAKING, label: 'Speaking', icon: <Mic2 className="w-4 h-4" /> },
    { id: ViewState.PODCAST, label: 'Podcast', icon: <Mic2 className="w-4 h-4" /> },
  ];

  const accountLabel = session ? (session.user.email || '').split('@')[0] : 'Guest';

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
              onClick={() => setShowProgress(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-stone-200 bg-white text-xs font-bold text-stone-600 hover:border-stone-400 transition-all"
              title="Your progress"
            >
              <Flame className={`w-3.5 h-3.5 ${stats.streakCurrent > 0 ? 'text-orange-500' : 'text-stone-300'}`} />
              {stats.streakCurrent}
              <span className="text-stone-300">·</span>
              <span className="text-stone-500">Lv{levelForXp(stats.xp)}</span>
            </button>
            <button
              onClick={() => setShowAccount(true)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-bold uppercase tracking-wider transition-all ${
                syncStatus === 'syncing' ? 'bg-amber-50 border-amber-100 text-amber-600' :
                session ? 'bg-emerald-50 border-emerald-100 text-emerald-700' : 'bg-stone-100 border-stone-200 text-stone-400'
              }`}
            >
              {syncStatus === 'syncing' ? <Loader2 className="w-3 h-3 animate-spin" /> : session ? <Cloud className="w-3 h-3" /> : <CloudOff className="w-3 h-3" />}
              {accountLabel}
            </button>
            <button
              onClick={() => setShowSettings(true)}
              className="p-2 rounded-lg text-stone-400 hover:text-stone-900 transition-colors"
              title="Settings"
            >
               <SettingsIcon className="w-4 h-4" />
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
                  {lastError && <p className="text-red-400"><span className="text-stone-600">Error:</span> {lastError}</p>}
                </div>
                <div className="space-y-2">
                  <p><span className="text-stone-600">Account:</span> {session ? session.user.email : 'Guest (local only)'}</p>
                  {lastSyncTime && <p><span className="text-stone-600">Last Sync:</span> {lastSyncTime}</p>}
                </div>
             </div>
          </div>
        </div>
      )}

      {showAccount && (
        <div className="fixed inset-0 bg-stone-900/60 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl p-8 space-y-6 animate-fade-in-up">
              <div className="flex justify-between items-center">
                <h3 className="text-2xl font-serif font-bold">{session ? 'Account' : authMode === 'signin' ? 'Sign In' : authMode === 'signup' ? 'Create Account' : 'Reset Password'}</h3>
                <button onClick={() => { setShowAccount(false); setAuthMessage(null); }} className="text-stone-400 hover:text-stone-900"><X /></button>
              </div>

              {session ? (
                <div className="space-y-4">
                  <p className="text-stone-500 text-sm">Signed in as <span className="font-bold text-stone-900">{session.user.email}</span>. Your notebook syncs to your private cloud space automatically.</p>
                  <div className="grid grid-cols-2 gap-3">
                    <button onClick={handleExport} className="flex items-center justify-center gap-2 py-3 bg-stone-100 rounded-xl text-sm font-bold hover:bg-stone-200 transition-colors">
                      <Download className="w-4 h-4" /> Export JSON
                    </button>
                    <button onClick={() => importInputRef.current?.click()} className="flex items-center justify-center gap-2 py-3 bg-stone-100 rounded-xl text-sm font-bold hover:bg-stone-200 transition-colors">
                      <Upload className="w-4 h-4" /> Import JSON
                    </button>
                  </div>
                  {authMessage && <p className="text-sm text-emerald-700">{authMessage}</p>}
                  <button onClick={handleSignOut} className="w-full flex items-center justify-center gap-2 py-4 bg-stone-900 text-white rounded-xl font-bold hover:bg-black transition-colors">
                    <LogOut className="w-4 h-4" /> Sign Out
                  </button>
                </div>
              ) : !isCloudConfigured ? (
                <p className="text-stone-500 text-sm">Cloud sync is not configured. Add SUPABASE_URL and SUPABASE_KEY to your .env.local to enable accounts. Your words are stored safely in this browser meanwhile.</p>
              ) : (
                <form onSubmit={handleAuthSubmit} className="space-y-4">
                  <p className="text-stone-500 text-sm">
                    {authMode === 'forgot'
                      ? (codeSent ? 'Check your email for a 6-digit code and enter it below.' : "Enter your account email and we'll send you a reset code.")
                      : 'Sync your notebook across devices. Words stay on this device until you sign in.'}
                  </p>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Email"
                    className="w-full p-4 bg-stone-50 border border-stone-200 rounded-xl outline-none focus:ring-2 focus:ring-stone-900"
                  />
                  {authMode !== 'forgot' && (
                    <input
                      type="password"
                      required
                      minLength={6}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Password (min 6 characters)"
                      className="w-full p-4 bg-stone-50 border border-stone-200 rounded-xl outline-none focus:ring-2 focus:ring-stone-900"
                    />
                  )}
                  {authMode === 'forgot' && codeSent && (
                    <input
                      type="text"
                      required
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      maxLength={6}
                      value={otpCode}
                      onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ''))}
                      placeholder="6-digit code"
                      autoFocus
                      className="w-full p-4 bg-stone-50 border border-stone-200 rounded-xl outline-none focus:ring-2 focus:ring-stone-900 text-center text-2xl tracking-[0.5em] font-mono"
                    />
                  )}
                  {authMessage && <p className="text-sm text-amber-700">{authMessage}</p>}
                  <button
                    type="submit"
                    disabled={authBusy}
                    className="w-full py-4 bg-stone-900 text-white rounded-xl font-bold hover:bg-black transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {authBusy && <Loader2 className="w-4 h-4 animate-spin" />}
                    {authMode === 'signin' ? 'Sign In' : authMode === 'signup' ? 'Sign Up' : codeSent ? 'Verify Code' : 'Email Me a Reset Code'}
                  </button>
                  {authMode === 'forgot' && codeSent && (
                    <button
                      type="button"
                      onClick={() => { setCodeSent(false); setOtpCode(''); setAuthMessage(null); }}
                      className="w-full text-sm text-stone-500 hover:text-stone-900"
                    >
                      Didn't get it? Send again
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => { setAuthMode(authMode === 'signin' ? 'signup' : 'signin'); setCodeSent(false); setOtpCode(''); setAuthMessage(null); }}
                    className="w-full text-sm text-stone-500 hover:text-stone-900"
                  >
                    {authMode === 'signin' ? "No account yet? Create one" : authMode === 'signup' ? 'Already have an account? Sign in' : '← Back to sign in'}
                  </button>
                  {authMode === 'signin' && (
                    <button
                      type="button"
                      onClick={() => { setAuthMode('forgot'); setAuthMessage(null); }}
                      className="w-full text-sm text-stone-400 hover:text-stone-900"
                    >
                      Forgot password?
                    </button>
                  )}
                </form>
              )}
              <input ref={importInputRef} type="file" accept="application/json" className="hidden" onChange={handleImportFile} />
          </div>
        </div>
      )}

      {/* Set-new-password modal (opened by the reset-email link) */}
      {showReset && (
        <div className="fixed inset-0 bg-stone-900/60 backdrop-blur-sm z-[70] flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl p-8 space-y-5 animate-fade-in-up">
            <div className="flex justify-between items-center">
              <h3 className="text-2xl font-serif font-bold">Set New Password</h3>
              <button onClick={() => setShowReset(false)} className="text-stone-400 hover:text-stone-900"><X /></button>
            </div>
            <p className="text-stone-500 text-sm">Your reset link signed you in. Choose a new password to finish.</p>
            <form onSubmit={handleSetNewPassword} className="space-y-4">
              <input
                type="password"
                required
                minLength={6}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="New password (min 6 characters)"
                autoFocus
                className="w-full p-4 bg-stone-50 border border-stone-200 rounded-xl outline-none focus:ring-2 focus:ring-stone-900"
              />
              {resetMessage && <p className="text-sm text-amber-700">{resetMessage}</p>}
              <button
                type="submit"
                disabled={resetBusy}
                className="w-full py-4 bg-stone-900 text-white rounded-xl font-bold hover:bg-black transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {resetBusy && <Loader2 className="w-4 h-4 animate-spin" />} Save New Password
              </button>
            </form>
          </div>
        </div>
      )}

      {showProgress && <ProgressPanel stats={stats} words={savedWords} onClose={() => setShowProgress(false)} />}
      {showSettings && <Settings onClose={() => { setShowSettings(false); setKeyConfigured(hasApiKey()); }} />}
      <AskAI />

      {!keyConfigured && (
        <div className="bg-amber-50 border-b border-amber-100">
          <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
            <p className="text-sm text-amber-800">
              AI features need a Gemini API key (free). It stays in this browser only.
            </p>
            <button
              onClick={() => setShowSettings(true)}
              className="shrink-0 px-4 py-1.5 bg-stone-900 text-white rounded-full text-xs font-bold hover:bg-black transition-colors"
            >
              Open Settings
            </button>
          </div>
        </div>
      )}

      <main className="max-w-5xl mx-auto px-4 py-12">
        {view === ViewState.DICTIONARY && <Dictionary onSave={handleSaveWord} savedWords={savedWords} />}
        {view === ViewState.NOTEBOOK && <Notebook words={savedWords} onDelete={handleDeleteWord} onPractice={(w) => { setPracticeTarget(w); setView(ViewState.PRACTICE); }} onUpdateWord={handleSaveWord} />}
        {view === ViewState.FLASHCARDS && <Flashcards words={savedWords} onReview={handleReview} onGameComplete={handleGameComplete} onSpellCorrect={handleSpellCorrect} newCardsToday={stats.daily.newCards ?? 0} />}
        {view === ViewState.PRACTICE && <Practice initialWord={practiceTarget} words={savedWords} onScored={handlePracticeScored} />}
        {view === ViewState.SPEAKING && <Speaking words={savedWords} onExerciseDone={handleSpeakingDone} onConversationDone={handleConversationDone} />}
        {view === ViewState.PODCAST && <Podcast words={savedWords} onGenerated={handlePodcastGenerated} />}
      </main>
    </div>
  );
};

export default App;
