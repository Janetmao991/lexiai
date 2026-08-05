import React, { useState, useRef, useEffect } from 'react';
import { askLexi, hasApiKey } from '../services/geminiService';
import { Sparkles, X, Send, Loader2, Eraser } from 'lucide-react';

interface Msg { role: 'user' | 'model'; text: string }

/** Floating "Ask Lexi" chat — reachable from every view for quick word questions. */
export const AskAI: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, busy]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const send = async () => {
    const q = input.trim();
    if (!q || busy) return;
    setInput('');
    setError(null);
    const history = messages;
    setMessages(prev => [...prev, { role: 'user', text: q }]);
    setBusy(true);
    try {
      const reply = await askLexi(q, history.slice(-10));
      setMessages(prev => [...prev, { role: 'model', text: reply }]);
    } catch (e: any) {
      const raw = String(e?.message || '');
      setError(
        /API key/i.test(raw) ? 'No API key configured — open Settings (gear icon) first.'
        : /429|quota|RESOURCE_EXHAUSTED/i.test(raw) ? 'Rate limit reached — wait a minute and try again.'
        : /503|overloaded/i.test(raw) ? 'The AI service is briefly overloaded — try again in a few seconds.'
        : 'Something went wrong — please try again.'
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {/* Floating trigger — visible on every page */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-6 right-6 z-50 flex items-center gap-2 px-5 py-4 bg-stone-900 text-white rounded-full shadow-2xl hover:bg-black hover:scale-105 active:scale-95 transition-all"
          title="Ask Lexi anything — a word, a phrase, a nuance"
        >
          <Sparkles className="w-5 h-5" />
          <span className="font-bold text-sm hidden sm:inline">Ask Lexi</span>
        </button>
      )}

      {open && (
        <div className="fixed bottom-6 right-6 z-50 w-[min(26rem,calc(100vw-2rem))] bg-white rounded-3xl shadow-2xl border border-stone-200 flex flex-col overflow-hidden animate-fade-in-up" style={{ maxHeight: 'min(34rem, 75vh)' }}>
          <div className="flex items-center justify-between px-5 py-4 border-b border-stone-100 bg-stone-50/60">
            <div className="flex items-center gap-2">
              <div className="p-1.5 bg-stone-900 text-white rounded-lg"><Sparkles className="w-3.5 h-3.5" /></div>
              <div>
                <h3 className="font-serif font-bold text-stone-900 leading-none">Ask Lexi</h3>
                <p className="text-[10px] text-stone-400 uppercase tracking-widest mt-0.5">Any word, any time</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              {messages.length > 0 && (
                <button onClick={() => { setMessages([]); setError(null); }} className="p-2 text-stone-300 hover:text-stone-900" title="Clear conversation">
                  <Eraser className="w-4 h-4" />
                </button>
              )}
              <button onClick={() => setOpen(false)} className="p-2 text-stone-400 hover:text-stone-900"><X className="w-4 h-4" /></button>
            </div>
          </div>

          <div ref={bodyRef} className="flex-1 overflow-y-auto px-5 py-4 space-y-3 min-h-[10rem]">
            {messages.length === 0 && !busy && (
              <div className="text-sm text-stone-400 font-serif italic space-y-2 pt-2">
                <p>Ask me anything, e.g.:</p>
                <p>· what does "hedge" mean here?</p>
                <p>· 表示"审慎乐观"用英文怎么说?</p>
                <p>· difference between raise and rise?</p>
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} className={`max-w-[88%] px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap ${
                m.role === 'user'
                  ? 'ml-auto bg-stone-900 text-white rounded-2xl rounded-br-md'
                  : 'mr-auto bg-stone-100 text-stone-800 rounded-2xl rounded-bl-md font-serif'
              }`}>
                {m.text}
              </div>
            ))}
            {busy && (
              <div className="mr-auto bg-stone-100 rounded-2xl rounded-bl-md px-4 py-3">
                <Loader2 className="w-4 h-4 animate-spin text-stone-400" />
              </div>
            )}
            {error && <p className="text-sm text-amber-700">{error}</p>}
          </div>

          <form
            onSubmit={(e) => { e.preventDefault(); send(); }}
            className="flex items-center gap-2 p-3 border-t border-stone-100"
          >
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={hasApiKey() ? 'Ask about any word or phrase…' : 'Add your API key in Settings first'}
              className="flex-1 px-4 py-3 bg-stone-50 border border-stone-200 rounded-full outline-none focus:ring-2 focus:ring-stone-900 text-sm"
            />
            <button type="submit" disabled={busy || !input.trim()} className="p-3 bg-stone-900 text-white rounded-full hover:bg-black disabled:opacity-40 transition-all">
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>
      )}
    </>
  );
};
