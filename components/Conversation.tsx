
import React, { useState, useEffect, useRef } from 'react';
import { WordEntry } from '../types';
import { planConversation, createConversationChat, gradeConversation, ConversationPlan, ConversationFeedback } from '../services/geminiService';
import { speechService, RecordingHandle } from '../services/speechService';
import { Mic, Square, Send, Loader2, Volume2, VolumeX, Flag, CheckCircle2, XCircle, RotateCcw, Award } from 'lucide-react';

interface ConversationProps {
  words: WordEntry[];
  onFinished: (usedWellWords: string[], score: number) => void;
}

interface Msg { role: 'user' | 'model'; text: string }

type Phase = 'planning' | 'chatting' | 'grading' | 'done' | 'error';

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9\s']/g, ' ');

export const Conversation: React.FC<ConversationProps> = ({ words, onFinished }) => {
  const [phase, setPhase] = useState<Phase>('planning');
  const [plan, setPlan] = useState<ConversationPlan | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [voiceOn, setVoiceOn] = useState(true);
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [feedback, setFeedback] = useState<ConversationFeedback | null>(null);
  const [error, setError] = useState<string | null>(null);
  const chatRef = useRef<ReturnType<typeof createConversationChat> | null>(null);
  const recRef = useRef<RecordingHandle | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const voiceOnRef = useRef(voiceOn);
  voiceOnRef.current = voiceOn;

  const startSession = async () => {
    setPhase('planning');
    setMessages([]);
    setFeedback(null);
    setError(null);
    try {
      // Prefer words already in review rotation; fall back to whatever exists.
      const pool = [...words].sort(() => Math.random() - 0.5).slice(0, 24).map(w => w.word);
      const newPlan = await planConversation(pool);
      // Guard: only keep target words that actually exist in the notebook.
      newPlan.words = newPlan.words.filter(w => words.some(e => norm(e.word).trim() === norm(w).trim())).slice(0, 5);
      if (newPlan.words.length < 2) throw new Error('Could not pick suitable words — try again.');
      setPlan(newPlan);
      chatRef.current = createConversationChat(newPlan);
      setMessages([{ role: 'model', text: newPlan.opener }]);
      setPhase('chatting');
      if (voiceOnRef.current) speechService.speak(newPlan.opener, 1);
    } catch (e: any) {
      setError(e.message || 'Failed to start the conversation.');
      setPhase('error');
    }
  };

  useEffect(() => {
    startSession();
    return () => { recRef.current?.cancel(); speechService.stopSpeaking(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, sending]);

  const userTurns = messages.filter(m => m.role === 'user').length;
  const allUserText = norm(messages.filter(m => m.role === 'user').map(m => m.text).join(' '));
  // Prefix-match each token so inflections count: "mulling over" hits "mull over".
  const wordUsed = (w: string) => {
    const pattern = norm(w).trim().split(/\s+/)
      .map(t => t.length > 4 ? t.slice(0, t.length - 2) + "\\w*" : t + "\\w*")
      .join("\\s+");
    return new RegExp(`\\b${pattern}`, 'i').test(allUserText);
  };

  const send = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || !chatRef.current || sending) return;
    setInput('');
    setMessages(prev => [...prev, { role: 'user', text: trimmed }]);
    setSending(true);
    speechService.stopSpeaking();
    try {
      const response = await chatRef.current.sendMessage({ message: trimmed });
      const reply = response.text || '…';
      setMessages(prev => [...prev, { role: 'model', text: reply }]);
      if (voiceOnRef.current) speechService.speak(reply, 1);
    } catch (e: any) {
      setError(e.message || 'Message failed — try again.');
    } finally {
      setSending(false);
    }
  };

  const toggleMic = async () => {
    if (recording) {
      setRecording(false);
      setTranscribing(true);
      try {
        const text = await recRef.current!.stop();
        if (text) setInput(prev => (prev ? prev + ' ' : '') + text);
      } catch (e: any) {
        setError(e.message);
      } finally {
        setTranscribing(false);
        recRef.current = null;
      }
    } else {
      setError(null);
      try {
        recRef.current = await speechService.startRecording();
        setRecording(true);
      } catch (e: any) {
        setError(e.message || 'Could not access the microphone.');
      }
    }
  };

  const finish = async () => {
    if (!plan) return;
    setPhase('grading');
    speechService.stopSpeaking();
    try {
      const result = await gradeConversation(messages, plan.words);
      setFeedback(result);
      setPhase('done');
      onFinished(result.wordFeedback.filter(f => f.usedWell).map(f => f.word), result.score);
    } catch (e: any) {
      setError(e.message || 'Grading failed.');
      setPhase('chatting');
    }
  };

  if (phase === 'planning') {
    return (
      <div className="bg-white p-16 rounded-xl shadow-sm border border-stone-100 text-center space-y-4">
        <Loader2 className="w-8 h-8 animate-spin text-stone-400 mx-auto" />
        <p className="text-stone-500 font-serif">Alex is picking today's words and a topic…</p>
      </div>
    );
  }

  if (phase === 'error') {
    return (
      <div className="bg-white p-12 rounded-xl shadow-sm border border-stone-100 text-center space-y-4">
        <p className="text-amber-700 text-sm">{error}</p>
        <button onClick={startSession} className="px-6 py-3 bg-stone-900 text-white rounded-full text-sm font-bold hover:bg-black transition-colors">
          Try Again
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Topic + target words */}
      {plan && (
        <div className="bg-white p-6 rounded-xl shadow-sm border border-stone-100 flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-stone-400 mb-1">Today's Topic</p>
            <p className="font-serif font-bold text-stone-900">{plan.topic}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {plan.words.map(w => (
              <span
                key={w}
                className={`text-xs font-bold px-3 py-1.5 rounded-full border capitalize transition-all ${
                  wordUsed(w)
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200 line-through decoration-2'
                    : 'bg-stone-50 text-stone-600 border-stone-200'
                }`}
              >
                {wordUsed(w) ? '✓ ' : ''}{w}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Chat area */}
      <div className="bg-white rounded-xl shadow-sm border border-stone-100 flex flex-col" style={{ height: '26rem' }}>
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-6 space-y-4 scrollbar-hide">
          {messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[80%] px-4 py-3 rounded-2xl text-[15px] leading-relaxed font-serif ${
                m.role === 'user'
                  ? 'bg-stone-900 text-white rounded-br-sm'
                  : 'bg-stone-100 text-stone-800 rounded-bl-sm'
              }`}>
                {m.text}
              </div>
            </div>
          ))}
          {sending && (
            <div className="flex justify-start">
              <div className="bg-stone-100 px-4 py-3 rounded-2xl rounded-bl-sm">
                <Loader2 className="w-4 h-4 animate-spin text-stone-400" />
              </div>
            </div>
          )}
        </div>

        {/* Composer */}
        {phase === 'chatting' && (
          <div className="border-t border-stone-100 p-4 space-y-2">
            {error && <p className="text-xs text-amber-700">{error}</p>}
            <div className="flex items-center gap-2">
              <button
                onClick={toggleMic}
                disabled={transcribing}
                className={`shrink-0 w-11 h-11 rounded-full flex items-center justify-center transition-all ${
                  recording ? 'bg-red-600 text-white animate-pulse' : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
                }`}
                title={recording ? 'Stop recording' : 'Speak your reply'}
              >
                {transcribing ? <Loader2 className="w-4 h-4 animate-spin" /> : recording ? <Square className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
              </button>
              <input
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') send(input); }}
                placeholder={recording ? 'Listening…' : 'Speak or type your reply…'}
                className="flex-1 p-3 bg-stone-50 border border-stone-200 rounded-xl outline-none focus:ring-1 focus:ring-stone-400 text-[15px]"
              />
              <button
                onClick={() => send(input)}
                disabled={!input.trim() || sending}
                className="shrink-0 w-11 h-11 rounded-full bg-stone-900 text-white flex items-center justify-center hover:bg-black disabled:opacity-40 transition-all"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
            <div className="flex items-center justify-between">
              <button onClick={() => setVoiceOn(!voiceOn)} className="text-xs text-stone-400 hover:text-stone-700 flex items-center gap-1">
                {voiceOn ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
                {voiceOn ? 'Alex speaks aloud' : 'Voice off'}
              </button>
              <button
                onClick={finish}
                disabled={userTurns < 3}
                title={userTurns < 3 ? 'Chat a little more first (3+ replies)' : 'End and get feedback'}
                className="text-xs font-bold text-stone-500 hover:text-stone-900 disabled:opacity-40 flex items-center gap-1"
              >
                <Flag className="w-3.5 h-3.5" /> End & Get Feedback
              </button>
            </div>
          </div>
        )}

        {phase === 'grading' && (
          <div className="border-t border-stone-100 p-6 text-center">
            <Loader2 className="w-5 h-5 animate-spin text-stone-400 mx-auto" />
            <p className="text-xs text-stone-400 mt-2">Alex is writing your feedback…</p>
          </div>
        )}
      </div>

      {/* Feedback */}
      {phase === 'done' && feedback && (
        <div className="rounded-xl overflow-hidden border border-stone-100 animate-fade-in-up">
          <div className="p-6 bg-stone-50/70 border-b border-stone-100 flex justify-between items-center">
            <h3 className="font-bold text-lg font-serif text-stone-900 flex items-center gap-2">
              <Award className="w-5 h-5" /> Conversation Report
            </h3>
            <span className={`px-4 py-1 rounded-full text-sm font-bold ${feedback.score >= 80 ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'}`}>
              {feedback.score}/100
            </span>
          </div>
          <div className="p-8 bg-white space-y-6">
            <p className="text-stone-700 leading-relaxed font-serif">{feedback.overall}</p>
            <div className="space-y-3">
              {feedback.wordFeedback.map(f => (
                <div key={f.word} className="flex gap-3 items-start">
                  {f.usedWell
                    ? <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                    : <XCircle className={`w-5 h-5 shrink-0 mt-0.5 ${f.used ? 'text-amber-500' : 'text-stone-300'}`} />}
                  <div>
                    <p className="font-bold text-stone-900 capitalize text-sm">
                      {f.word}
                      {f.usedWell && <span className="ml-2 text-[10px] font-bold text-emerald-700 uppercase tracking-wide">🗣️ Can Speak</span>}
                    </p>
                    <p className="text-sm text-stone-500">{f.comment}</p>
                  </div>
                </div>
              ))}
            </div>
            <button
              onClick={startSession}
              className="px-5 py-2.5 bg-stone-900 text-white rounded-full text-sm font-bold hover:bg-black transition-colors flex items-center gap-2"
            >
              <RotateCcw className="w-4 h-4" /> New Conversation
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
