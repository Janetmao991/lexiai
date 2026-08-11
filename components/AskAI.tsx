import React, { useState, useRef, useEffect } from 'react';
import { askLexiTurn, analyzeImageText, hasApiKey, ImageWordPick, LexiPart } from '../services/geminiService';
import { Sparkles, X, Send, Loader2, Eraser, ImagePlus, Search } from 'lucide-react';

interface Msg {
  role: 'user' | 'model';
  text: string;
  image?: string;          // dataURL, user messages only — display
  words?: ImageWordPick[]; // model messages — tappable lookup chips
}

interface PendingImage { dataUrl: string; base64: string; mimeType: string }

interface AskAIProps {
  /** Open the Dictionary and look this word up (chips from image extraction). */
  onLookup?: (word: string) => void;
}

/** Downscale to ≤1600px JPEG for a fast upload; if the browser can't decode
    the format (e.g. HEIC on desktop Chrome), send the original bytes. */
const readImage = (file: File): Promise<PendingImage> =>
  new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onerror = () => reject(new Error('Could not read the image.'));
    fr.onload = () => {
      const original = String(fr.result);
      const img = new Image();
      img.onload = () => {
        const MAX = 1600;
        const scale = Math.min(1, MAX / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
        resolve({ dataUrl, base64: dataUrl.split(',')[1], mimeType: 'image/jpeg' });
      };
      img.onerror = () => resolve({ dataUrl: original, base64: original.split(',')[1], mimeType: file.type || 'image/jpeg' });
      img.src = original;
    };
    fr.readAsDataURL(file);
  });

/** Floating "Ask Lexi" chat — reachable from every view for quick word questions. */
export const AskAI: React.FC<AskAIProps> = ({ onLookup }) => {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingImage, setPendingImage] = useState<PendingImage | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  // True while a CJK IME is composing — Enter then confirms the characters,
  // it must not submit the form.
  const composingRef = useRef(false);
  // Full model-side conversation (text + image parts) so follow-ups keep
  // context. Only the most recent image's bytes are retained; older ones
  // collapse to placeholders to keep requests small.
  const historyRef = useRef<{ role: 'user' | 'model'; parts: LexiPart[] }[]>([]);

  const pushHistory = (role: 'user' | 'model', parts: LexiPart[]) => {
    historyRef.current.push({ role, parts });
    let latestImageKept = false;
    for (let i = historyRef.current.length - 1; i >= 0; i--) {
      historyRef.current[i].parts = historyRef.current[i].parts.map(p => {
        if ('inlineData' in p) {
          if (latestImageKept) return { text: '[an image the learner sent earlier]' };
          latestImageKept = true;
        }
        return p;
      });
    }
    if (historyRef.current.length > 16) historyRef.current = historyRef.current.slice(-16);
  };

  useEffect(() => {
    bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, busy]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const attachFile = async (file: File | undefined | null) => {
    if (!file || !file.type.startsWith('image/')) return;
    setError(null);
    try {
      setPendingImage(await readImage(file));
    } catch (e: any) {
      setError(e.message || 'Could not read the image.');
    }
  };

  const friendlyError = (e: any) => {
    const raw = String(e?.message || '');
    return /API key/i.test(raw) ? 'No API key configured — open Settings (gear icon) first.'
      : /429|quota|RESOURCE_EXHAUSTED/i.test(raw) ? 'Rate limit reached — wait a minute and try again.'
      : /503|overloaded/i.test(raw) ? 'The AI service is briefly overloaded — try again in a few seconds.'
      : 'Something went wrong — please try again.';
  };

  const send = async () => {
    const q = input.trim();
    if (busy || (!q && !pendingImage)) return;
    setInput('');
    setError(null);
    const img = pendingImage;
    setPendingImage(null);
    const label = q || 'Explain this and pick out the advanced words';
    setMessages(prev => [...prev, { role: 'user', text: label, image: img?.dataUrl }]);
    setBusy(true);

    const turnParts: LexiPart[] = [];
    if (img) turnParts.push({ inlineData: { data: img.base64, mimeType: img.mimeType } });
    turnParts.push({ text: label });

    try {
      if (img && !q) {
        // No question → default action: explain the text, break it down,
        // then surface the advanced vocabulary as lookup chips.
        const a = await analyzeImageText(img.base64, img.mimeType);
        const parts = [a.explanation];
        if (a.breakdown?.length) parts.push(a.breakdown.map(b => `· ${b}`).join('\n'));
        if (a.words?.length) parts.push('Worth learning — tap a word to look it up:');
        const replyText = parts.filter(Boolean).join('\n\n');
        setMessages(prev => [...prev, { role: 'model', text: replyText, words: a.words?.length ? a.words : undefined }]);
        pushHistory('user', turnParts);
        pushHistory('model', [{ text: replyText }]);
      } else {
        const reply = await askLexiTurn(historyRef.current, turnParts);
        setMessages(prev => [...prev, { role: 'model', text: reply }]);
        pushHistory('user', turnParts);
        pushHistory('model', [{ text: reply }]);
      }
    } catch (e: any) {
      setError(friendlyError(e));
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
          className="fixed bottom-24 md:bottom-6 right-6 z-50 flex items-center gap-2 px-5 py-4 bg-stone-900 text-white rounded-full shadow-2xl hover:bg-black hover:scale-105 active:scale-95 transition-all"
          title="Ask Lexi anything — a word, a phrase, a nuance"
        >
          <Sparkles className="w-5 h-5" />
          <span className="font-bold text-sm hidden sm:inline">Ask Lexi</span>
        </button>
      )}

      {open && (
        <div className="fixed bottom-24 md:bottom-6 right-4 md:right-6 z-50 w-[min(26rem,calc(100vw-2rem))] bg-white rounded-3xl shadow-2xl border border-stone-200 flex flex-col overflow-hidden animate-fade-in-up" style={{ maxHeight: 'min(34rem, 70vh)' }}>
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
                <button onClick={() => { setMessages([]); setError(null); historyRef.current = []; }} className="p-2 text-stone-300 hover:text-stone-900" title="Clear conversation">
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
                <p className="not-italic flex items-center gap-1.5 text-stone-500"><ImagePlus className="w-3.5 h-3.5" /> or send a photo of any English text — I'll explain it, break it down, and pick out the advanced words.</p>
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} className={`max-w-[88%] text-sm leading-relaxed ${
                m.role === 'user'
                  ? 'ml-auto bg-stone-900 text-white rounded-2xl rounded-br-md px-4 py-2.5'
                  : 'mr-auto bg-stone-100 text-stone-800 rounded-2xl rounded-bl-md font-serif px-4 py-2.5'
              }`}>
                {m.image && <img src={m.image} alt="uploaded" className="rounded-xl mb-2 max-h-40 w-auto" />}
                <span className="whitespace-pre-wrap">{m.text}</span>
                {m.words && (
                  <div className="mt-3 space-y-1.5 font-sans">
                    {m.words.map((w, j) => (
                      <button
                        key={j}
                        onClick={() => { onLookup?.(w.word); setOpen(false); }}
                        className="w-full text-left flex items-center gap-2 px-3 py-2 bg-white border border-stone-200 rounded-xl hover:border-stone-900 hover:shadow-sm transition-all group"
                      >
                        <Search className="w-3.5 h-3.5 text-stone-300 group-hover:text-stone-900 shrink-0" />
                        <span className="font-bold text-stone-900">{w.word}</span>
                        <span className="text-xs text-stone-400 truncate">{w.gloss}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
            {busy && (
              <div className="mr-auto bg-stone-100 rounded-2xl rounded-bl-md px-4 py-3">
                <Loader2 className="w-4 h-4 animate-spin text-stone-400" />
              </div>
            )}
            {error && <p className="text-sm text-amber-700">{error}</p>}
          </div>

          {pendingImage && (
            <div className="px-4 pt-2 flex items-center gap-2">
              <div className="relative">
                <img src={pendingImage.dataUrl} alt="attached" className="h-14 w-14 object-cover rounded-lg border border-stone-200" />
                <button
                  onClick={() => setPendingImage(null)}
                  className="absolute -top-1.5 -right-1.5 p-0.5 bg-stone-900 text-white rounded-full"
                  title="Remove image"
                ><X className="w-3 h-3" /></button>
              </div>
              <p className="text-xs text-stone-400">Send with a question — or send as-is and I'll explain it, break it down, and pull out the advanced words.</p>
            </div>
          )}

          <form
            onSubmit={(e) => { e.preventDefault(); send(); }}
            className="flex items-center gap-2 p-3 border-t border-stone-100"
          >
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => { attachFile(e.target.files?.[0]); e.target.value = ''; }}
            />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className={`p-3 rounded-full transition-all ${pendingImage ? 'bg-stone-900 text-white' : 'text-stone-400 hover:text-stone-900 hover:bg-stone-100'}`}
              title="Attach a photo or screenshot of English text"
            >
              <ImagePlus className="w-4 h-4" />
            </button>
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onCompositionStart={() => { composingRef.current = true; }}
              onCompositionEnd={() => { composingRef.current = false; }}
              onKeyDown={(e) => {
                // While a Chinese/Japanese IME is composing, Enter confirms the
                // characters — swallow it so the form doesn't submit pinyin.
                if (e.key === 'Enter' && (composingRef.current || (e.nativeEvent as any).isComposing)) e.preventDefault();
              }}
              onPaste={(e) => { const f = e.clipboardData?.files?.[0]; if (f) { e.preventDefault(); attachFile(f); } }}
              placeholder={!hasApiKey() ? 'Add your API key in Settings first' : pendingImage ? 'Ask about the image (optional)…' : 'Ask about any word or phrase…'}
              className="flex-1 px-4 py-3 bg-stone-50 border border-stone-200 rounded-full outline-none focus:ring-2 focus:ring-stone-900 text-sm min-w-0"
            />
            <button type="submit" disabled={busy || (!input.trim() && !pendingImage)} className="p-3 bg-stone-900 text-white rounded-full hover:bg-black disabled:opacity-40 transition-all">
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>
      )}
    </>
  );
};
