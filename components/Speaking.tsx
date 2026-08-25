
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { WordEntry } from '../types';
import { speechService, containsWord, RecordingHandle } from '../services/speechService';
import { checkSentence, rephraseNatively, friendlyError } from '../services/geminiService';
import { PracticeFeedback, NativeRephrase } from '../types';
import { Mic, Square, Volume2, ArrowRight, Loader2, CheckCircle2, XCircle, MessageCircle, Lightbulb, Award, AlertCircle, Sparkles, RefreshCw } from 'lucide-react';

export type SpeakingKind = 'recall' | 'sentence' | 'native';

const NATIVE_TOPICS = [
  'Describe what you worked on today.',
  'Pitch yourself in 30 seconds — who are you professionally?',
  'Explain a company or product you find interesting right now.',
  'Give your opinion: how is AI changing your industry?',
  'Describe a challenge you faced recently and how you handled it.',
  'Explain a concept from your field as if to a friend.',
  'Talk about a decision you are trying to make.',
  'Describe your ideal weekend in San Francisco.',
];

interface SpeakingProps {
  words: WordEntry[];
  onExerciseDone: (word: WordEntry, kind: SpeakingKind, passed: boolean) => void;
}

type RecState = 'idle' | 'recording' | 'processing';

const pickRandom = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

const definitionOf = (w: WordEntry): string => w.meanings[0]?.definitions[0]?.definition || '';

export const Speaking: React.FC<SpeakingProps> = ({ words, onExerciseDone }) => {
  const [mode, setMode] = useState<SpeakingKind>('recall');
  const [recState, setRecState] = useState<RecState>('idle');
  const [error, setError] = useState<string | null>(null);
  const recordingRef = useRef<RecordingHandle | null>(null);

  // Per-mode current word + results
  const [recallWord, setRecallWord] = useState<WordEntry | null>(null);
  const [recallResult, setRecallResult] = useState<{ transcript: string; correct: boolean } | null>(null);
  const [sentenceWord, setSentenceWord] = useState<WordEntry | null>(null);
  const [transcript, setTranscript] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<PracticeFeedback | null>(null);
  const [checking, setChecking] = useState(false);
  const [nativeTopic, setNativeTopic] = useState(() => pickRandom(NATIVE_TOPICS));
  const [nativeTranscript, setNativeTranscript] = useState<string | null>(null);
  const [nativeResult, setNativeResult] = useState<NativeRephrase | null>(null);
  const [nativeChecking, setNativeChecking] = useState(false);

  useEffect(() => {
    if (!recallWord && words.length) setRecallWord(pickRandom(words));
    if (!sentenceWord && words.length) setSentenceWord(pickRandom(words));
  }, [words, recallWord, sentenceWord]);

  useEffect(() => () => { recordingRef.current?.cancel(); speechService.stopSpeaking(); }, []);

  if (words.length === 0) {
    return (
      <div className="text-center py-20 text-stone-400">
        <p>Save words to your notebook to start speaking practice.</p>
      </div>
    );
  }

  // Bumped on mode switch so a recording started before the switch (e.g. while
  // the mic-permission prompt was open) is cancelled instead of orphaned.
  const recGen = useRef(0);

  const startRecording = async (onTranscript: (t: string) => void) => {
    setError(null);
    const gen = recGen.current;
    try {
      setRecState('recording');
      const handle = await speechService.startRecording();
      if (gen !== recGen.current) { handle.cancel(); return; }
      recordingRef.current = handle;
      // store the consumer for stop
      (handle as any)._consume = onTranscript;
    } catch (e: any) {
      setRecState('idle');
      setError(friendlyError(String(e?.message || 'Could not access the microphone.')));
    }
  };

  const stopRecording = async () => {
    const handle = recordingRef.current;
    if (!handle) return;
    setRecState('processing');
    try {
      const text = await handle.stop();
      if (!text) throw new Error("Didn't catch that — please try speaking again, a bit louder.");
      ((handle as any)._consume as (t: string) => void)(text);
    } catch (e: any) {
      setError(friendlyError(String(e?.message || 'Transcription failed.')));
    } finally {
      setRecState('idle');
      recordingRef.current = null;
    }
  };

  const RecordButton: React.FC<{ onTranscript: (t: string) => void; onStart?: () => void; disabled?: boolean }> = ({ onTranscript, onStart, disabled }) => (
    <div className="flex flex-col items-center gap-3">
      {recState === 'recording' ? (
        <button
          onClick={stopRecording}
          className="w-20 h-20 rounded-full bg-red-600 text-white flex items-center justify-center shadow-xl animate-pulse hover:bg-red-700 transition-all"
          title="Stop recording"
        >
          <Square className="w-7 h-7" />
        </button>
      ) : (
        <button
          onClick={() => { onStart?.(); startRecording(onTranscript); }}
          disabled={disabled || recState === 'processing'}
          className="w-20 h-20 rounded-full bg-stone-900 text-white flex items-center justify-center shadow-xl hover:bg-black disabled:opacity-40 transition-all"
          title="Start recording"
        >
          {recState === 'processing' ? <Loader2 className="w-7 h-7 animate-spin" /> : <Mic className="w-7 h-7" />}
        </button>
      )}
      <p className="text-xs text-stone-400 uppercase tracking-widest font-semibold">
        {recState === 'recording' ? 'Listening… tap to stop' : recState === 'processing' ? 'Transcribing…' : 'Tap to speak'}
      </p>
    </div>
  );

  const modeMeta: { id: SpeakingKind; label: string; icon: React.ReactNode }[] = [
    { id: 'recall', label: 'Recall', icon: <Lightbulb className="w-3.5 h-3.5" /> },
    { id: 'sentence', label: 'Speak a Sentence', icon: <MessageCircle className="w-3.5 h-3.5" /> },
    { id: 'native', label: 'Say It Natively', icon: <Sparkles className="w-3.5 h-3.5" /> },
  ];

  const switchMode = (m: SpeakingKind) => {
    recGen.current++;
    recordingRef.current?.cancel();
    speechService.stopSpeaking();
    setMode(m);
    setError(null);
    setRecState('idle');
  };

  return (
    <div className="max-w-3xl mx-auto space-y-8">
      <div className="flex items-center justify-between border-b border-stone-200 pb-4 flex-wrap gap-3">
        <h2 className="text-3xl font-serif font-bold text-stone-800">Speaking Studio</h2>
        <div className="flex items-center gap-1 bg-stone-100 rounded-full p-1">
          {modeMeta.map(m => (
            <button
              key={m.id}
              onClick={() => switchMode(m.id)}
              className={`px-3 py-1.5 rounded-full text-xs font-bold flex items-center gap-1.5 transition-all ${
                mode === m.id ? 'bg-stone-900 text-white shadow' : 'text-stone-500 hover:text-stone-900'
              }`}
            >
              {m.icon} {m.label}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="bg-amber-50 border border-amber-100 text-amber-800 rounded-xl p-4 text-sm flex items-center gap-2 animate-fade-in">
          <AlertCircle className="w-4 h-4 shrink-0" /> {error}
        </div>
      )}

      {/* ---------- RECALL ---------- */}
      {mode === 'recall' && recallWord && (
        <div className="bg-white p-8 rounded-xl shadow-sm border border-stone-100 space-y-8">
          <div className="space-y-2">
            <p className="text-xs font-bold uppercase tracking-wider text-stone-400">Say the word that matches this definition</p>
            <p className="text-2xl font-serif text-stone-900 leading-relaxed italic">“{definitionOf(recallWord)}”</p>
            <p className="text-sm text-stone-400">{recallWord.meanings[0]?.partOfSpeech} · {recallWord.word.length} characters{recallResult ? '' : ` · starts with “${recallWord.word[0].toUpperCase()}”`}</p>
          </div>

          <div className="flex justify-center">
            <RecordButton onStart={() => setRecallResult(null)} onTranscript={(t) => {
              const correct = containsWord(t, recallWord.word);
              setRecallResult({ transcript: t, correct });
              onExerciseDone(recallWord, 'recall', correct);
            }} />
          </div>

          {recallResult && (
            <div className={`rounded-xl p-6 border animate-fade-in flex items-center justify-between ${recallResult.correct ? 'bg-emerald-50/50 border-emerald-100' : 'bg-amber-50/50 border-amber-100'}`}>
              <div className="flex items-center gap-3">
                {recallResult.correct ? <CheckCircle2 className="w-6 h-6 text-emerald-600" /> : <XCircle className="w-6 h-6 text-amber-600" />}
                <div>
                  <p className="font-bold text-stone-900 capitalize">
                    {recallResult.correct ? `Yes — "${recallWord.word}"!` : `It was "${recallWord.word}"`}
                  </p>
                  <p className="text-xs text-stone-500">You said: “{recallResult.transcript}”</p>
                </div>
              </div>
              <button
                onClick={() => { setRecallResult(null); setRecallWord(pickRandom(words)); }}
                className="px-5 py-2.5 bg-stone-900 text-white rounded-full text-sm font-bold hover:bg-black transition-colors flex items-center gap-2"
              >
                Next <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      )}

      {/* ---------- SPEAK A SENTENCE ---------- */}
      {mode === 'sentence' && sentenceWord && (
        <div className="space-y-8">
          <div className="bg-white p-8 rounded-xl shadow-sm border border-stone-100 space-y-8">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-stone-400 mb-2">Target Word</label>
                <select
                  value={sentenceWord.word}
                  onChange={(e) => {
                    const w = words.find(x => x.word === e.target.value);
                    if (w) { setSentenceWord(w); setTranscript(null); setFeedback(null); }
                  }}
                  className="w-full p-3 bg-stone-50 border border-stone-200 rounded-lg outline-none focus:ring-1 focus:ring-stone-400 font-serif text-lg"
                >
                  {words.map(w => <option key={w.word} value={w.word}>{w.word}</option>)}
                </select>
              </div>
              <div className="bg-stone-50 p-4 rounded-lg border border-stone-100">
                <p className="text-2xl font-serif font-bold text-stone-900 capitalize mb-1">{sentenceWord.word}</p>
                <p className="text-stone-600 text-sm italic font-serif leading-relaxed">{definitionOf(sentenceWord)}</p>
              </div>
            </div>

            <div className="flex justify-center">
              <RecordButton onStart={() => { setTranscript(null); setFeedback(null); }} onTranscript={(t) => { setTranscript(t); setFeedback(null); }} />
            </div>

            {transcript && (
              <div className="space-y-4 animate-fade-in">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-stone-400 mb-2">What we heard — edit if needed</label>
                  <textarea
                    value={transcript}
                    onChange={e => setTranscript(e.target.value)}
                    className="w-full h-28 p-5 bg-white border border-stone-200 rounded-lg outline-none focus:border-stone-400 focus:ring-1 focus:ring-stone-400 transition-all resize-none text-lg font-serif text-stone-800"
                  />
                </div>
                <div className="flex justify-end">
                  <button
                    onClick={async () => {
                      if (!transcript.trim()) return;
                      setChecking(true);
                      try {
                        const result = await checkSentence(sentenceWord.word, transcript);
                        if (result) {
                          setFeedback(result);
                          onExerciseDone(sentenceWord, 'sentence', result.score >= 80);
                        }
                      } catch (e: any) {
                        setError(friendlyError(String(e?.message || 'Feedback failed — try again.')));
                      } finally {
                        setChecking(false);
                      }
                    }}
                    disabled={checking || !transcript.trim()}
                    className="px-8 py-3 bg-stone-900 text-white font-medium rounded-full hover:bg-black disabled:opacity-50 transition-colors flex items-center gap-2 shadow-lg"
                  >
                    {checking ? <Loader2 className="animate-spin w-5 h-5" /> : 'Get Feedback'}
                  </button>
                </div>
              </div>
            )}
          </div>

          {feedback && (
            <div className={`rounded-xl overflow-hidden animate-fade-in-up border ${feedback.isCorrect ? 'border-green-100' : 'border-amber-100'}`}>
              <div className={`p-6 border-b flex justify-between items-center ${feedback.isCorrect ? 'bg-green-50/50 border-green-100' : 'bg-amber-50/50 border-amber-100'}`}>
                <h3 className={`font-bold text-lg font-serif flex items-center gap-2 ${feedback.isCorrect ? 'text-green-900' : 'text-amber-900'}`}>
                  {feedback.isCorrect ? <Award className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
                  {feedback.score >= 80 ? 'Fluent! This word is now “Can Speak”' : 'Keep Practicing'}
                </h3>
                <span className={`px-4 py-1 rounded-full text-sm font-bold ${feedback.score > 80 ? 'bg-green-100 text-green-800' : feedback.score > 50 ? 'bg-amber-100 text-amber-800' : 'bg-red-100 text-red-800'}`}>
                  {feedback.score}/100
                </span>
              </div>
              <div className="p-8 bg-white space-y-6">
                <p className="text-stone-700 leading-relaxed font-serif text-lg">{feedback.explanation}</p>
                {!feedback.isCorrect && (
                  <div className="bg-stone-50 p-6 rounded-lg border-l-4 border-amber-400">
                    <h4 className="text-xs font-bold text-stone-500 uppercase tracking-wider mb-2">Try saying</h4>
                    <p className="text-stone-800 font-serif text-lg">{feedback.correctedSentence}</p>
                  </div>
                )}
                <button
                  onClick={() => { setTranscript(null); setFeedback(null); setSentenceWord(pickRandom(words)); }}
                  className="px-5 py-2.5 bg-stone-900 text-white rounded-full text-sm font-bold hover:bg-black transition-colors flex items-center gap-2"
                >
                  Next Word <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ---------- SAY IT NATIVELY ---------- */}
      {mode === 'native' && (
        <div className="space-y-8">
          <div className="bg-white p-8 rounded-xl shadow-sm border border-stone-100 space-y-8">
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs font-bold uppercase tracking-wider text-stone-400">Say anything — or take the prompt</p>
                <button
                  onClick={() => setNativeTopic(pickRandom(NATIVE_TOPICS.filter(t => t !== nativeTopic)))}
                  className="text-xs font-bold text-stone-400 hover:text-stone-900 flex items-center gap-1 transition-colors"
                >
                  <RefreshCw className="w-3 h-3" /> New prompt
                </button>
              </div>
              <p className="text-2xl font-serif text-stone-900 leading-relaxed italic">“{nativeTopic}”</p>
              <p className="text-sm text-stone-400">Speak a few sentences, then see how a native speaker would put it.</p>
            </div>

            <div className="flex justify-center">
              <RecordButton onStart={() => { setNativeTranscript(null); setNativeResult(null); }} onTranscript={(t) => { setNativeTranscript(t); setNativeResult(null); }} />
            </div>

            {nativeTranscript && (
              <div className="space-y-4 animate-fade-in">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-stone-400 mb-2">What we heard — edit if needed</label>
                  <textarea
                    value={nativeTranscript}
                    onChange={e => setNativeTranscript(e.target.value)}
                    className="w-full h-28 p-5 bg-white border border-stone-200 rounded-lg outline-none focus:border-stone-400 focus:ring-1 focus:ring-stone-400 transition-all resize-none text-lg font-serif text-stone-800"
                  />
                </div>
                <div className="flex justify-end">
                  <button
                    onClick={async () => {
                      if (!nativeTranscript.trim()) return;
                      setNativeChecking(true);
                      try {
                        const result = await rephraseNatively(nativeTranscript);
                        if (result) setNativeResult(result);
                      } catch (e: any) {
                        setError(friendlyError(String(e?.message || 'Rephrase failed — try again.')));
                      } finally {
                        setNativeChecking(false);
                      }
                    }}
                    disabled={nativeChecking || !nativeTranscript.trim()}
                    className="px-8 py-3 bg-stone-900 text-white font-medium rounded-full hover:bg-black disabled:opacity-50 transition-colors flex items-center gap-2 shadow-lg"
                  >
                    {nativeChecking ? <Loader2 className="animate-spin w-5 h-5" /> : <>How would a native say it? <Sparkles className="w-4 h-4" /></>}
                  </button>
                </div>
              </div>
            )}
          </div>

          {nativeResult && (
            <div className="rounded-xl overflow-hidden animate-fade-in-up border border-stone-200">
              <div className="p-6 border-b border-stone-100 bg-stone-50/50 flex justify-between items-center">
                <h3 className="font-bold text-lg font-serif text-stone-900 flex items-center gap-2">
                  <Sparkles className="w-5 h-5" />
                  {nativeResult.naturalness >= 90 ? 'Already sounds native!' : nativeResult.naturalness >= 60 ? 'Close — a few tweaks' : 'Here’s the native way'}
                </h3>
                <span className={`px-4 py-1 rounded-full text-sm font-bold ${nativeResult.naturalness >= 90 ? 'bg-green-100 text-green-800' : nativeResult.naturalness >= 60 ? 'bg-amber-100 text-amber-800' : 'bg-red-100 text-red-800'}`}>
                  {nativeResult.naturalness}/100 natural
                </span>
              </div>
              <div className="p-8 bg-white space-y-6">
                <div className="bg-stone-50 p-6 rounded-lg border-l-4 border-emerald-400">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-xs font-bold text-stone-500 uppercase tracking-wider">A native would say</h4>
                    <button onClick={() => speechService.speak(nativeResult.nativeVersion)} title="Play" className="text-stone-400 hover:text-stone-900 transition-colors"><Volume2 className="w-4 h-4" /></button>
                  </div>
                  <p className="text-stone-800 font-serif text-lg leading-relaxed">{nativeResult.nativeVersion}</p>
                </div>
                <div className="bg-stone-50 p-6 rounded-lg border-l-4 border-stone-300">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-xs font-bold text-stone-500 uppercase tracking-wider">In a meeting or interview</h4>
                    <button onClick={() => speechService.speak(nativeResult.formalVersion)} title="Play" className="text-stone-400 hover:text-stone-900 transition-colors"><Volume2 className="w-4 h-4" /></button>
                  </div>
                  <p className="text-stone-800 font-serif text-lg leading-relaxed">{nativeResult.formalVersion}</p>
                </div>
                {nativeResult.notes.length > 0 && (
                  <div className="space-y-3">
                    <h4 className="text-xs font-bold text-stone-500 uppercase tracking-wider">What made it sound non-native</h4>
                    {nativeResult.notes.map((n, i) => (
                      <div key={i} className="flex flex-col sm:flex-row sm:items-baseline gap-1 sm:gap-3 text-sm border-b border-stone-100 pb-3 last:border-0">
                        <span className="text-red-600 line-through decoration-red-300 shrink-0">“{n.yours}”</span>
                        <span className="text-stone-400 hidden sm:inline">→</span>
                        <span className="text-emerald-700 font-semibold shrink-0">“{n.native}”</span>
                        <span className="text-stone-500">{n.why}</span>
                      </div>
                    ))}
                  </div>
                )}
                <button
                  onClick={() => { setNativeTranscript(null); setNativeResult(null); setNativeTopic(pickRandom(NATIVE_TOPICS.filter(t => t !== nativeTopic))); }}
                  className="px-5 py-2.5 bg-stone-900 text-white rounded-full text-sm font-bold hover:bg-black transition-colors flex items-center gap-2"
                >
                  Try Another <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
