
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { WordEntry } from '../types';
import { speechService, diffTranscript, containsWord, ShadowDiff, RecordingHandle } from '../services/speechService';
import { checkSentence } from '../services/geminiService';
import { PracticeFeedback } from '../types';
import { Mic, Square, Volume2, ArrowRight, Loader2, CheckCircle2, XCircle, Ear, MessageCircle, Lightbulb, Award, AlertCircle } from 'lucide-react';

export type SpeakingKind = 'shadow' | 'recall' | 'sentence';

interface SpeakingProps {
  words: WordEntry[];
  onExerciseDone: (word: WordEntry, kind: SpeakingKind, passed: boolean) => void;
}

type RecState = 'idle' | 'recording' | 'processing';

const pickRandom = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

const wordsWithExamples = (words: WordEntry[]) =>
  words.filter(w => w.meanings?.[0]?.definitions?.[0]?.examples?.length);

const exampleOf = (w: WordEntry): string => w.meanings[0].definitions[0].examples[0];
const definitionOf = (w: WordEntry): string => w.meanings[0]?.definitions[0]?.definition || '';

export const Speaking: React.FC<SpeakingProps> = ({ words, onExerciseDone }) => {
  const [mode, setMode] = useState<SpeakingKind>('shadow');
  const [recState, setRecState] = useState<RecState>('idle');
  const [error, setError] = useState<string | null>(null);
  const recordingRef = useRef<RecordingHandle | null>(null);

  // Per-mode current word + results
  const [shadowWord, setShadowWord] = useState<WordEntry | null>(null);
  const [shadowDiff, setShadowDiff] = useState<ShadowDiff | null>(null);
  const [recallWord, setRecallWord] = useState<WordEntry | null>(null);
  const [recallResult, setRecallResult] = useState<{ transcript: string; correct: boolean } | null>(null);
  const [sentenceWord, setSentenceWord] = useState<WordEntry | null>(null);
  const [transcript, setTranscript] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<PracticeFeedback | null>(null);
  const [checking, setChecking] = useState(false);

  const shadowPool = useMemo(() => wordsWithExamples(words), [words]);

  useEffect(() => {
    if (!shadowWord && shadowPool.length) setShadowWord(pickRandom(shadowPool));
    if (!recallWord && words.length) setRecallWord(pickRandom(words));
    if (!sentenceWord && words.length) setSentenceWord(pickRandom(words));
  }, [shadowPool, words, shadowWord, recallWord, sentenceWord]);

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
      setError(e.message || 'Could not access the microphone.');
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
      setError(e.message || 'Transcription failed.');
    } finally {
      setRecState('idle');
      recordingRef.current = null;
    }
  };

  const RecordButton: React.FC<{ onTranscript: (t: string) => void; disabled?: boolean }> = ({ onTranscript, disabled }) => (
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
          onClick={() => startRecording(onTranscript)}
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
    { id: 'shadow', label: 'Shadowing', icon: <Ear className="w-3.5 h-3.5" /> },
    { id: 'recall', label: 'Recall', icon: <Lightbulb className="w-3.5 h-3.5" /> },
    { id: 'sentence', label: 'Speak a Sentence', icon: <MessageCircle className="w-3.5 h-3.5" /> },
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

      {/* ---------- SHADOWING ---------- */}
      {mode === 'shadow' && shadowWord && (
        <div className="bg-white p-8 rounded-xl shadow-sm border border-stone-100 space-y-8">
          <div className="space-y-2">
            <p className="text-xs font-bold uppercase tracking-wider text-stone-400">Listen, then repeat this sentence</p>
            <p className="text-2xl font-serif text-stone-900 leading-relaxed">
              {shadowDiff
                ? shadowDiff.tokens.map((t, i) => (
                    <span key={i} className={t.hit ? 'text-stone-900' : 'text-red-500 underline decoration-red-300 decoration-2'}>{t.text} </span>
                  ))
                : exampleOf(shadowWord)}
            </p>
            <p className="text-sm text-stone-400">Target word: <span className="font-bold text-stone-600 capitalize">{shadowWord.word}</span></p>
          </div>

          <div className="flex items-center justify-center gap-10">
            <div className="flex flex-col items-center gap-3">
              <button
                onClick={() => speechService.speak(exampleOf(shadowWord))}
                className="w-20 h-20 rounded-full bg-white border-2 border-stone-900 text-stone-900 flex items-center justify-center shadow hover:bg-stone-50 transition-all"
                title="Play the sentence"
              >
                <Volume2 className="w-7 h-7" />
              </button>
              <p className="text-xs text-stone-400 uppercase tracking-widest font-semibold">Play</p>
            </div>
            <RecordButton onTranscript={(t) => {
              const diff = diffTranscript(exampleOf(shadowWord), t);
              setShadowDiff(diff);
              onExerciseDone(shadowWord, 'shadow', diff.accuracy >= 80);
            }} />
          </div>

          {shadowDiff && (
            <div className={`rounded-xl p-6 border animate-fade-in flex items-center justify-between ${shadowDiff.accuracy >= 80 ? 'bg-emerald-50/50 border-emerald-100' : 'bg-amber-50/50 border-amber-100'}`}>
              <div className="flex items-center gap-3">
                {shadowDiff.accuracy >= 80 ? <CheckCircle2 className="w-6 h-6 text-emerald-600" /> : <XCircle className="w-6 h-6 text-amber-600" />}
                <div>
                  <p className="font-bold text-stone-900">{shadowDiff.accuracy}% match</p>
                  <p className="text-xs text-stone-500">Red words were missed or unclear — play and try again, or move on.</p>
                </div>
              </div>
              <button
                onClick={() => { setShadowDiff(null); setShadowWord(pickRandom(shadowPool)); }}
                className="px-5 py-2.5 bg-stone-900 text-white rounded-full text-sm font-bold hover:bg-black transition-colors flex items-center gap-2"
              >
                Next <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      )}
      {mode === 'shadow' && !shadowWord && (
        <p className="text-center py-12 text-stone-400">No saved words with example sentences yet.</p>
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
            <RecordButton onTranscript={(t) => {
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
              <RecordButton onTranscript={(t) => { setTranscript(t); setFeedback(null); }} />
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
                        setError(e.message || 'Feedback failed — try again.');
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
    </div>
  );
};
