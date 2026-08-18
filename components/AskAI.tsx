import React, { useState, useRef, useEffect } from 'react';
import { askLexiTurn, analyzeSource, hasApiKey, ImageWordPick, LexiPart } from '../services/geminiService';
import { Sparkles, X, Send, Loader2, Eraser, ImagePlus, Search, Paperclip, Upload, FileText } from 'lucide-react';

interface Msg {
  role: 'user' | 'model';
  text: string;
  image?: string;          // dataURL, user messages only — display
  fileName?: string;       // non-image attachment, user messages only
  words?: ImageWordPick[]; // model messages — tappable lookup chips
}

/** One staged attachment. Images and PDFs go to the model as inline bytes;
    text files go as plain text, which is cheaper and keeps line breaks intact. */
interface PendingFile {
  kind: 'image' | 'pdf' | 'text';
  name: string;
  mimeType: string;
  dataUrl?: string;  // image only — the thumbnail shown in the composer and the sent bubble
  base64?: string;   // image + pdf
  text?: string;     // text files
  truncated?: boolean;
}

const MAX_BYTES = 12 * 1024 * 1024;
const MAX_TEXT_CHARS = 200_000;
/** Text formats worth reading — including subtitle files, which are just text. */
const TEXT_EXT = /\.(txt|md|markdown|srt|vtt|csv|tsv|log|json|rtf)$/i;
const isImage = (f: File) => f.type.startsWith('image/');
const isPdf = (f: File) => f.type === 'application/pdf' || /\.pdf$/i.test(f.name);
const isText = (f: File) => f.type.startsWith('text/') || f.type === 'application/json' || TEXT_EXT.test(f.name);

interface AskAIProps {
  /** Open the Dictionary and look this word up (chips from image extraction). */
  onLookup?: (word: string) => void;
}

/** Downscale to ≤1600px JPEG for a fast upload; if the browser can't decode
    the format (e.g. HEIC on desktop Chrome), send the original bytes. */
const readImage = (file: File): Promise<PendingFile> =>
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
        resolve({ kind: 'image', name: file.name || 'image', dataUrl, base64: dataUrl.split(',')[1], mimeType: 'image/jpeg' });
      };
      img.onerror = () => resolve({ kind: 'image', name: file.name || 'image', dataUrl: original, base64: original.split(',')[1], mimeType: file.type || 'image/jpeg' });
      img.src = original;
    };
    fr.readAsDataURL(file);
  });

const readPdf = (file: File): Promise<PendingFile> =>
  new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onerror = () => reject(new Error('Could not read that PDF.'));
    fr.onload = () => resolve({
      kind: 'pdf',
      name: file.name || 'document.pdf',
      mimeType: 'application/pdf',
      base64: String(fr.result).split(',')[1],
    });
    fr.readAsDataURL(file);
  });

const readText = (file: File): Promise<PendingFile> =>
  new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onerror = () => reject(new Error('Could not read that file.'));
    fr.onload = () => {
      const raw = String(fr.result);
      resolve({
        kind: 'text',
        name: file.name || 'text',
        mimeType: file.type || 'text/plain',
        text: raw.slice(0, MAX_TEXT_CHARS),
        truncated: raw.length > MAX_TEXT_CHARS,
      });
    };
    fr.readAsText(file);
  });

const readFile = async (file: File): Promise<PendingFile> => {
  if (file.size > MAX_BYTES) throw new Error(`"${file.name}" is over 12 MB — too big to send.`);
  if (isImage(file)) return readImage(file);
  if (isPdf(file)) return readPdf(file);
  if (isText(file)) return readText(file);
  throw new Error(`I can read images, PDFs and text files — "${file.name}" isn't one of those.`);
};

const ACCEPT = 'image/*,application/pdf,text/plain,text/markdown,text/csv,.txt,.md,.srt,.vtt,.csv,.log,.json';

/** Floating "Ask Lexi" chat — reachable from every view for quick word questions. */
export const AskAI: React.FC<AskAIProps> = ({ onLookup }) => {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingFile | null>(null);
  const [dragging, setDragging] = useState(false);
  // dragenter/dragleave also fire for every child element — count depth so the
  // overlay doesn't flicker as the cursor crosses the message list.
  const dragDepth = useRef(0);
  const bodyRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  // True while a CJK IME is composing — Enter then confirms the characters,
  // it must not submit the form. Safari fires compositionend BEFORE the
  // confirming keydown (opposite of Chrome), so we also remember WHEN
  // composition ended and swallow Enter within a grace window.
  const composingRef = useRef(false);
  const compEndAtRef = useRef(0);
  // Height of the software keyboard (iOS PWA) so the panel can lift above it.
  const [kbOffset, setKbOffset] = useState(0);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const onResize = () => setKbOffset(Math.max(0, window.innerHeight - vv.height - vv.offsetTop));
    vv.addEventListener('resize', onResize);
    vv.addEventListener('scroll', onResize);
    return () => { vv.removeEventListener('resize', onResize); vv.removeEventListener('scroll', onResize); };
  }, []);
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
    if (open) {
      inputRef.current?.focus();
      // Reopening should land on the latest messages, not the top.
      bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight });
    }
  }, [open]);

  const attachFile = async (file: File | undefined | null) => {
    if (!file) return;
    setError(null);
    try {
      setPending(await readFile(file));
    } catch (e: any) {
      setError(e.message || 'Could not read that file.');
    }
  };

  /** An image dragged straight off a web page arrives as a URL, not a file. */
  const attachFromUrl = async (url: string) => {
    setError(null);
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error();
      const blob = await res.blob();
      const name = decodeURIComponent(url.split('/').pop()?.split('?')[0] || 'image');
      await attachFile(new File([blob], name, { type: blob.type }));
    } catch {
      setError("That site won't hand the image over directly — save it first and drop the file, or copy it and press ⌘V here.");
    }
  };

  const dragHasFiles = (e: React.DragEvent) => Array.from(e.dataTransfer?.types || []).includes('Files');

  const onDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    dragDepth.current += 1;
    setDragging(true);
  };
  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
  };
  const onDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setDragging(false);
  };
  const onDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    dragDepth.current = 0;
    setDragging(false);
    const file = e.dataTransfer?.files?.[0];
    if (file) { await attachFile(file); inputRef.current?.focus(); return; }
    const url = e.dataTransfer?.getData('text/uri-list') || e.dataTransfer?.getData('text/plain') || '';
    if (/^https?:\/\//i.test(url.trim())) await attachFromUrl(url.trim().split('\n')[0]);
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
    if (busy || (!q && !pending)) return;
    setInput('');
    setError(null);
    const att = pending;
    setPending(null);
    const label = q || 'Explain this and pick out the advanced words';
    setMessages(prev => [...prev, {
      role: 'user',
      text: label,
      image: att?.dataUrl,
      fileName: att && att.kind !== 'image' ? att.name : undefined,
    }]);
    setBusy(true);

    // The attachment itself: inline bytes for images/PDFs, plain text otherwise.
    const sourceParts: LexiPart[] = !att ? []
      : att.kind === 'text'
        ? [{ text: `--- ${att.name} ---\n${att.text}${att.truncated ? '\n[…truncated]' : ''}\n--- end of file ---` }]
        : [{ inlineData: { data: att.base64!, mimeType: att.mimeType } }];
    const turnParts: LexiPart[] = [...sourceParts, { text: label }];

    try {
      if (att && !q) {
        // No question → default action: explain the text, break it down,
        // then surface the advanced vocabulary as lookup chips.
        const a = await analyzeSource(sourceParts);
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
          onDragEnter={onDragEnter}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          // Dropping on the closed bubble opens the panel with the file already staged.
          onDrop={(e) => { setOpen(true); onDrop(e); }}
          className={`fixed bottom-24 md:bottom-6 right-6 z-50 flex items-center gap-2 px-5 py-4 bg-stone-900 text-white rounded-full shadow-2xl hover:bg-black hover:scale-105 active:scale-95 transition-all ${
            dragging ? 'ring-4 ring-stone-900/20 scale-110' : ''
          }`}
          title="Ask Lexi anything — a word, a phrase, a nuance. You can drop a file here too."
        >
          {dragging ? <Upload className="w-5 h-5" /> : <Sparkles className="w-5 h-5" />}
          <span className="font-bold text-sm hidden sm:inline">{dragging ? 'Drop it' : 'Ask Lexi'}</span>
        </button>
      )}

      {open && (
        <div
          onDragEnter={onDragEnter}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          className="fixed bottom-24 md:bottom-6 right-4 md:right-6 z-50 w-[min(26rem,calc(100vw-2rem))] bg-white rounded-3xl shadow-2xl border border-stone-200 flex flex-col overflow-hidden animate-fade-in-up"
          style={{ maxHeight: `min(34rem, calc(70vh - ${kbOffset}px))`, transform: kbOffset ? `translateY(-${kbOffset}px)` : undefined, transition: 'transform 0.15s ease-out' }}
        >
          {/* Drop target covering the whole panel. The panel's own `fixed` is
              already the containing block for this, so do NOT add `relative`
              here: Tailwind emits .relative after .fixed, so it wins whatever
              the class order, and the panel falls back into normal flow.
              pointer-events off so the drag keeps reaching the panel's own
              dragleave/drop handlers. */}
          {dragging && (
            <div className="absolute inset-2 z-20 rounded-[1.4rem] border-2 border-dashed border-stone-900 bg-stone-50/95 flex flex-col items-center justify-center gap-1.5 pointer-events-none">
              <Upload className="w-7 h-7 text-stone-900" />
              <p className="font-serif font-bold text-lg text-stone-900">Drop it here</p>
              <p className="text-xs text-stone-400">Image · PDF · text file</p>
            </div>
          )}
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
                <p className="not-italic flex items-center gap-1.5 text-stone-500"><Upload className="w-3.5 h-3.5" /> drag a file straight in, or press ⌘V — images, PDFs, .txt/.md/.srt.</p>
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} className={`max-w-[88%] text-sm leading-relaxed ${
                m.role === 'user'
                  ? 'ml-auto bg-stone-900 text-white rounded-2xl rounded-br-md px-4 py-2.5'
                  : 'mr-auto bg-stone-100 text-stone-800 rounded-2xl rounded-bl-md font-serif px-4 py-2.5'
              }`}>
                {m.image && <img src={m.image} alt="uploaded" className="rounded-xl mb-2 max-h-40 w-auto" />}
                {m.fileName && (
                  <span className="mb-2 flex items-center gap-1.5 text-xs opacity-80">
                    <FileText className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">{m.fileName}</span>
                  </span>
                )}
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

          {pending && (
            <div className="px-4 pt-2 flex items-center gap-2">
              <div className="relative shrink-0">
                {pending.kind === 'image' ? (
                  <img src={pending.dataUrl} alt="attached" className="h-14 w-14 object-cover rounded-lg border border-stone-200" />
                ) : (
                  <div className="h-14 w-14 rounded-lg border border-stone-200 bg-stone-50 flex flex-col items-center justify-center gap-1">
                    <FileText className="w-5 h-5 text-stone-400" />
                    <span className="text-[9px] font-bold uppercase tracking-wider text-stone-400">
                      {pending.kind === 'pdf' ? 'PDF' : (pending.name.split('.').pop() || 'TXT').slice(0, 4)}
                    </span>
                  </div>
                )}
                <button
                  onClick={() => setPending(null)}
                  className="absolute -top-1.5 -right-1.5 p-0.5 bg-stone-900 text-white rounded-full"
                  title="Remove attachment"
                ><X className="w-3 h-3" /></button>
              </div>
              <div className="min-w-0">
                {pending.kind !== 'image' && (
                  <p className="text-xs font-bold text-stone-700 truncate">
                    {pending.name}
                    {pending.truncated && <span className="font-normal text-stone-400"> · trimmed to fit</span>}
                  </p>
                )}
                <p className="text-xs text-stone-400">Send with a question — or send as-is and I'll explain it, break it down, and pull out the advanced words.</p>
              </div>
            </div>
          )}

          <form
            onSubmit={(e) => { e.preventDefault(); send(); }}
            className="flex items-center gap-2 p-3 border-t border-stone-100"
          >
            <input
              ref={fileRef}
              type="file"
              accept={ACCEPT}
              className="hidden"
              onChange={(e) => { attachFile(e.target.files?.[0]); e.target.value = ''; }}
            />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className={`p-3 rounded-full transition-all ${pending ? 'bg-stone-900 text-white' : 'text-stone-400 hover:text-stone-900 hover:bg-stone-100'}`}
              title="Attach a photo, screenshot, PDF or text file — or just drag one in"
            >
              <Paperclip className="w-4 h-4" />
            </button>
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onCompositionStart={() => { composingRef.current = true; }}
              onCompositionEnd={() => { composingRef.current = false; compEndAtRef.current = Date.now(); }}
              onKeyDown={(e) => {
                // While a Chinese/Japanese IME is composing (or just confirmed —
                // Safari's event order differs from Chrome's), Enter selects the
                // characters — swallow it so the form doesn't submit mid-typing.
                const imeActive = composingRef.current
                  || (e.nativeEvent as any).isComposing
                  || (e.nativeEvent as any).keyCode === 229
                  || Date.now() - compEndAtRef.current < 200;
                if (e.key === 'Enter' && imeActive) e.preventDefault();
              }}
              onPaste={(e) => { const f = e.clipboardData?.files?.[0]; if (f) { e.preventDefault(); attachFile(f); } }}
              placeholder={!hasApiKey() ? 'Add your API key in Settings first' : pending ? 'Ask about the file (optional)…' : 'Ask, or drop a file in…'}
              className="flex-1 px-4 py-3 bg-stone-50 border border-stone-200 rounded-full outline-none focus:ring-2 focus:ring-stone-900 text-sm min-w-0"
            />
            <button type="submit" disabled={busy || (!input.trim() && !pending)} className="p-3 bg-stone-900 text-white rounded-full hover:bg-black disabled:opacity-40 transition-all">
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>
      )}
    </>
  );
};
