import React, { useState, useEffect } from 'react';
import { WordEntry, SynonymComparison, ContextMeaning, UserContext } from '../types';
import { lookupWord, compareSynonyms, explainInContext, pickSense } from '../services/claudeService';
import { playPronunciation } from '../services/geminiService';
import { ipaLabel } from '../services/format';
import { preparePronunciation } from '../services/pronunciation';
import { Search, Volume2, Loader2, GitCompare, Sparkles, Check, Save, Bookmark, ArrowRight, ArrowLeft } from 'lucide-react';

interface DictionaryProps {
  onSave: (word: WordEntry) => void;
  savedWords: WordEntry[];
  /** External lookup request (e.g. a word tapped in Ask Lexi); `n` forces re-runs of the same word.
   *  A sentence-sized `word` opens Meaning in context, with `focus` as the word to explain. */
  lookupRequest?: { word: string; n: number; focus?: string } | null;
}

type DictionaryMode = 'DEFINE' | 'CONTEXT' | 'COMPARE';

/** Loose compare so "On The Margin " and "on the margin" don't read as a changed headword. */
const normalizeForm = (s: string) =>
  s.trim().toLowerCase().replace(/\s+/g, ' ').replace(/[.!?,;:]+$/, '');

const IS_EMBED = new URLSearchParams(window.location.search).has('embed');

const ROMAN = ['i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii', 'ix', 'x', 'xi', 'xii'];
const roman = (n: number) => `${ROMAN[n] ?? n + 1}.`;

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Bold the headword (and its inflections) inside an example sentence. */
const emphasize = (text: string, word: string): React.ReactNode => {
  const head = word.trim().split(/\s+/)[0];
  if (!head) return text;
  const stem = head.length > 4 && head.endsWith('e') ? head.slice(0, -1) : head;
  const re = new RegExp(`(\\b${escapeRe(stem)}[\\w'-]*)`, 'gi');
  return text.split(re).map((part, i) =>
    i % 2 === 1 ? <b key={i} className="font-medium text-stone-900">{part}</b> : part);
};

/** Split a sentence around the explained phrase so every other word stays tappable. */
const splitAround = (sentence: string, surface: string) => {
  const at = surface ? sentence.toLowerCase().indexOf(surface.toLowerCase()) : -1;
  if (at < 0) return { before: sentence, hit: '', after: '' };
  return { before: sentence.slice(0, at), hit: sentence.slice(at, at + surface.length), after: sentence.slice(at + surface.length) };
};

export const Dictionary: React.FC<DictionaryProps> = ({ onSave, savedWords, lookupRequest }) => {
  const [activeMode, setActiveMode] = useState<DictionaryMode>('DEFINE');
  const [loading, setLoading] = useState(false);
  const [savingWord, setSavingWord] = useState<string | null>(null);
  const [error, setError] = useState('');

  // Define (word)
  const [query, setQuery] = useState('');
  const [lookupResult, setLookupResult] = useState<WordEntry | null>(null);

  // Meaning in context (sentence)
  const [contextInput, setContextInput] = useState('');
  const [contextSentence, setContextSentence] = useState('');
  const [contextResult, setContextResult] = useState<ContextMeaning | null>(null);
  const [contextSave, setContextSave] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [savedSense, setSavedSense] = useState<string>('');

  // Compare
  const [compareInputs, setCompareInputs] = useState(['', '', '']);
  const [compareResult, setCompareResult] = useState<SynonymComparison | null>(null);

  const isSaved = (w: string) => savedWords.some(sw => sw.word.toLowerCase() === w.toLowerCase());
  const savedEntry = (w: string) => savedWords.find(sw => sw.word.toLowerCase() === w.trim().toLowerCase());

  const switchMode = (mode: DictionaryMode) => {
    setActiveMode(mode);
    setError('');
  };

  const showError = (err: any, fallback: string) => {
    const msg = String(err?.message || '');
    if (/429|RESOURCE_EXHAUSTED|quota/i.test(msg)) {
      setError('Free-tier quota reached for now. Wait a minute and retry — or if it persists, today\'s allowance is used up (resets at midnight PT).');
    } else if (/timeout|deadline|aborted/i.test(msg)) {
      setError('The AI took too long to answer (free-tier congestion). Please try again.');
    } else if (/Failed to fetch|fetch failed|Load failed|network/i.test(msg)) {
      setError('Can\'t reach Claude — check your internet or VPN, then try again.');
    } else if (/API key/i.test(msg)) {
      setError(msg);
    } else {
      setError(fallback);
    }
  };

  const doLookup = async (word: string, exact = false) => {
    if (!word.trim()) return;
    setActiveMode('DEFINE');
    setQuery(word);
    setError('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
    // A word already in the Notebook opens instantly from there — and its saved
    // sentences line up with the senses they were filed under.
    const saved = !exact && savedEntry(word);
    if (saved) {
      setLookupResult(saved);
      return;
    }
    setLoading(true);
    setLookupResult(null);
    try {
      const data = await lookupWord(word, { exact });
      if (data) setLookupResult(data);
      else setError('No results found.');
    } catch (err: any) {
      showError(err, 'Connection failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const runContext = async (sentence: string, focus?: string) => {
    if (!sentence.trim()) return;
    setActiveMode('CONTEXT');
    setContextInput(sentence);
    setContextSentence(sentence.trim());
    setContextResult(null);
    setContextSave('idle');
    setLoading(true);
    setError('');
    try {
      const data = await explainInContext(sentence.trim(), focus);
      if (data) setContextResult(data);
      else setError('Could not explain this sentence.');
    } catch (err: any) {
      showError(err, 'Failed to explain the sentence. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const w = lookupRequest?.word?.trim();
    if (!w) return;
    // Sentence-sized request (e.g. ?q= deep link from a reading app) → Meaning in context
    if (w.split(/\s+/).length > 4) runContext(w, lookupRequest?.focus);
    else doLookup(w);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lookupRequest?.n]);

  const handleLookup = (e: React.FormEvent) => {
    e.preventDefault();
    // Pasting a whole sentence into the word box means "what does it mean here?"
    if (query.trim().split(/\s+/).length > 4) runContext(query);
    else doLookup(query);
  };

  const handleContext = (e: React.FormEvent) => {
    e.preventDefault();
    runContext(contextInput);
  };

  /** Save the word together with this sentence, filed under the sense the sentence uses. */
  const saveWithSentence = async () => {
    if (!contextResult) return;
    setContextSave('saving');
    setError('');
    try {
      const entry = savedEntry(contextResult.word) ?? await lookupWord(contextResult.word, { exact: true });
      if (!entry) throw new Error('No dictionary entry');
      const sense = await pickSense(entry, contextSentence, contextResult.meaningHere).catch(() => null);
      const ctx: UserContext = {
        id: Date.now().toString(),
        sourceTitle: 'From your reading',
        fullText: contextSentence,
        targetSentence: contextSentence,
        explanation: contextResult.meaningHere,
        usageNuance: contextResult.clues.map(c => `${c.quote} — ${c.why}`).join('; '),
        timestamp: Date.now(),
        ...(sense ? { sense } : {}),
      };
      // Same sentence saved again replaces the old note instead of piling up duplicates.
      const others = (entry.contexts || []).filter(c => normalizeForm(c.targetSentence) !== normalizeForm(contextSentence));
      onSave({ ...entry, contexts: [...others, ctx] });
      setSavedSense(sense ? roman(sense.definition) : '');
      setContextSave('saved');
    } catch (err: any) {
      setContextSave('idle');
      showError(err, 'Could not save. Please try again.');
    }
  };

  /** Save the looked-up word with a podcast line as one of its sentences. */
  const handleCompare = async (e: React.FormEvent) => {
    e.preventDefault();
    const words = compareInputs.filter(w => w.trim().length > 0);
    if (words.length < 2) {
      setError('Please enter at least two words.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const data = await compareSynonyms(words[0], words[1], words[2]);
      setCompareResult(data);
    } catch (err) {
      setError('Failed to compare words.');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveFromComparison = async (word: string) => {
    if (isSaved(word)) return;
    setSavingWord(word);
    try {
      const entry = await lookupWord(word);
      if (entry) onSave(entry);
    } catch (err) {
      console.error("Failed to save word from comparison", err);
    } finally {
      setSavingWord(null);
    }
  };

  const card = 'bg-white border border-[#EDE8DE] rounded-[22px] sm:rounded-[28px] shadow-[0_1px_2px_rgba(40,30,10,.03),0_24px_48px_-28px_rgba(40,30,10,.12)]';

  // ---------- Define: one sense ----------
  const renderSense = (entry: WordEntry, mi: number, di: number) => {
    const d = entry.meanings[mi].definitions[di];
    const mine = (entry.contexts || []).filter(c => c.sense?.meaning === mi && c.sense?.definition === di);
    return (
      <section key={`${mi}-${di}`} className="grid grid-cols-[32px_minmax(0,1fr)] sm:grid-cols-[44px_minmax(0,1fr)] gap-x-2">
        <span aria-hidden="true" className="font-serif italic text-xl text-[#B5AFA3] leading-[1.45]">{roman(di)}</span>
        <div className="space-y-5 min-w-0">
          <div className="space-y-2.5">
            <p className="font-serif text-xl sm:text-2xl leading-[1.38] font-bold text-stone-900 break-words">{d.definition}</p>
            {d.gloss && <p className="gloss">{d.gloss}</p>}
          </div>

          {d.synonyms?.length > 0 && (
            <div className="flex flex-wrap items-baseline gap-x-3.5 gap-y-1.5">
              <span className="lx-label sm:min-w-[88px]">Synonyms</span>
              {d.synonyms.map((syn, si) => (
                <button key={si} onClick={() => doLookup(syn)} className="text-sm font-medium text-stone-600 border-b border-[#D9D3C7] hover:border-stone-900 hover:text-stone-900 transition-colors">
                  {syn}
                </button>
              ))}
            </div>
          )}

          {d.examples?.length > 0 && (
            <div className="space-y-2.5 pl-5 border-l border-[#EDE8DE]">
              {d.examples.map((ex, ei) => (
                <p key={ei} className="font-serif italic text-lg leading-relaxed text-[#6B675F]">“{emphasize(ex.replace(/^["“]|["”]$/g, ''), entry.word)}”</p>
              ))}
            </div>
          )}

          {d.collocations?.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="lx-label sm:min-w-[88px]">Collocations</span>
              {d.collocations.map((col, ci) => (
                <button key={ci} onClick={() => doLookup(col)} className="min-h-[34px] px-3.5 rounded-full border border-[#E2DDD2] text-[13.5px] font-medium text-[#2B2A27] hover:border-stone-900 hover:bg-white transition-colors">
                  {col}
                </button>
              ))}
            </div>
          )}

          {mine.map(c => (
            <figure key={c.id} className="m-0 bg-[#FBF7EC] border border-[#EFE3C4] rounded-2xl px-5 py-4 space-y-2">
              <figcaption className="lx-label !text-[#9A5420]">From your reading</figcaption>
              <blockquote className="font-serif text-lg sm:text-xl leading-normal text-stone-900">{emphasizeMark(c.targetSentence, entry.word)}</blockquote>
              <p className="text-xs text-[#8C8880]">{c.sourceTitle !== 'From your reading' && `${c.sourceTitle} · `}Saved {new Date(c.timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</p>
            </figure>
          ))}
        </div>
      </section>
    );
  };

  /** Highlighter stroke (not bold) for the word inside the learner's own sentence. */
  const emphasizeMark = (text: string, word: string): React.ReactNode => {
    const head = word.trim().split(/\s+/)[0];
    const stem = head.length > 4 && head.endsWith('e') ? head.slice(0, -1) : head;
    const re = new RegExp(`(\\b${escapeRe(stem)}[\\w'-]*)`, 'gi');
    return text.split(re).map((part, i) => i % 2 === 1 ? <span key={i} className="lx-mark">{part}</span> : part);
  };

  const modeTab = (mode: DictionaryMode, label: string, sub: string) => {
    const active = activeMode === mode;
    return (
      <button
        role="tab"
        aria-selected={active}
        onClick={() => switchMode(mode)}
        className={`flex items-center justify-center gap-2 min-h-[40px] px-3 sm:px-5 rounded-full text-sm transition-all ${
          active ? 'bg-white shadow-[0_1px_2px_rgba(40,30,10,.08)] text-stone-900 font-semibold' : 'text-[#55524C] hover:text-stone-900'
        }`}
      >
        {label}<span className={`hidden sm:inline font-normal text-[#8C8880]`}>· {sub}</span>
      </button>
    );
  };

  useEffect(() => { if (lookupResult) preparePronunciation(lookupResult.word); }, [lookupResult?.word]);

  const unassigned = lookupResult ? (lookupResult.contexts || []).filter(c => !c.sense) : [];

  return (
    <div className="max-w-[860px] mx-auto space-y-8 animate-fade-in pb-20">
      {/* Word / Sentence */}
      {activeMode !== 'COMPARE' ? (
        <div className="flex flex-col items-center gap-2">
          <div role="tablist" aria-label="Look up mode" className="grid grid-cols-2 gap-1 w-full max-w-[520px] bg-[#F3EFE6] rounded-full p-1">
            {modeTab('DEFINE', 'Word', 'definition')}
            {modeTab('CONTEXT', 'Sentence', 'meaning in context')}
          </div>
          {!IS_EMBED && (
            <button onClick={() => switchMode('COMPARE')} className="text-xs text-[#8C8880] hover:text-stone-900 flex items-center gap-1.5 min-h-[32px]">
              <GitCompare className="w-3.5 h-3.5" /> Compare similar words
            </button>
          )}
        </div>
      ) : (
        <button onClick={() => switchMode('DEFINE')} className="text-sm text-[#55524C] hover:text-stone-900 flex items-center gap-2 min-h-[40px]">
          <ArrowLeft className="w-4 h-4" /> Back to look up
        </button>
      )}

      {activeMode === 'DEFINE' && (
        <div className="space-y-8 animate-fade-in-up">
          <form onSubmit={handleLookup} className="flex items-center gap-3.5 border-b border-[#D9D3C7] focus-within:border-stone-900 transition-colors px-0.5 pb-2.5 pt-1.5">
            <Search className="w-5 h-5 text-[#8C8880] shrink-0" />
            <label htmlFor="lx-q" className="sr-only">Look up a word</label>
            <input
              id="lx-q"
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Type a word or phrase…"
              className="flex-1 min-w-0 bg-transparent outline-none font-serif text-xl sm:text-[22px] text-stone-900 placeholder:text-[#B5AFA3]"
            />
            <button type="submit" disabled={loading} aria-label="Look up" className="w-11 h-11 rounded-full bg-stone-900 text-white flex items-center justify-center hover:bg-black transition-colors shrink-0">
              {loading ? <Loader2 className="animate-spin w-5 h-5" /> : <ArrowRight className="w-5 h-5" />}
            </button>
          </form>

          {lookupResult && (
            <article className={`${card} animate-fade-in-up px-5 sm:px-16 py-9 sm:py-14 space-y-10 sm:space-y-12`}>
              <header className="flex flex-col sm:flex-row sm:items-end justify-between gap-6">
                <div className="space-y-4 min-w-0">
                  <h1 className="font-serif font-bold text-5xl sm:text-[84px] leading-[0.95] tracking-[-0.03em] text-stone-900 break-words">{lookupResult.word}</h1>
                  <div className="flex items-center gap-3.5">
                    <span className="font-mono text-sm text-[#6B675F]">{ipaLabel(lookupResult.ipa, '/---/')}</span>
                    <span aria-hidden="true" className="w-px h-3.5 bg-[#E2DDD2]" />
                    <button onClick={() => playPronunciation(lookupResult.word)} className="flex items-center gap-2 min-h-[36px] pl-2.5 pr-3.5 rounded-full border border-[#E2DDD2] text-[13px] text-[#2B2A27] hover:border-stone-900 transition-colors">
                      <Volume2 className="w-4 h-4" /> Listen
                    </button>
                  </div>
                  {/* The entry was normalized to a different headword — keep the query visible instead of swallowing it. */}
                  {lookupResult.originalQuery
                    && normalizeForm(lookupResult.originalQuery) !== normalizeForm(lookupResult.word)
                    && !lookupResult.candidates?.length && (
                    <p className="text-sm text-[#8C8880]">
                      You searched <span className="font-serif italic text-[#55524C]">“{lookupResult.originalQuery}”</span> — shown under its standard headword.
                      {/* The correction is a judgement call and it can be wrong — jargon
                          like "lead left" is real. Always leave a way back. */}
                      <button
                        onClick={() => doLookup(lookupResult.originalQuery!, true)}
                        className="ml-2 text-[#55524C] underline underline-offset-4 hover:text-stone-900"
                      >
                        Look it up as typed
                      </button>
                    </p>
                  )}
                </div>
                <button
                  onClick={() => onSave(lookupResult)}
                  disabled={isSaved(lookupResult.word)}
                  className={`self-start sm:self-auto flex items-center gap-2.5 min-h-[46px] px-5 rounded-full text-sm font-medium transition-colors ${
                    isSaved(lookupResult.word) ? 'bg-[#F3EFE6] text-[#55524C] cursor-default' : 'bg-stone-900 text-[#FBF9F4] hover:bg-black'
                  }`}
                >
                  <Bookmark className={`w-4 h-4 ${isSaved(lookupResult.word) ? 'fill-current' : ''}`} />
                  {isSaved(lookupResult.word) ? 'In Notebook' : 'Save to Notebook'}
                </button>
              </header>

              {/* Reverse-lookup candidates (Chinese/description queries) — closest first, click to look up */}
              {lookupResult.candidates && lookupResult.candidates.length > 0 && (
                <div className="p-5 sm:p-6 bg-[#FBF9F4] rounded-2xl border border-[#EDE8DE] space-y-2">
                  <p className="lx-label">Other ways to say it</p>
                  {lookupResult.candidates.map((c, ci) => (
                    <button key={ci} onClick={() => doLookup(c.word)} className="w-full text-left p-3 rounded-xl hover:bg-white transition-colors group">
                      <span className="font-serif font-bold text-lg text-stone-900 group-hover:underline underline-offset-4">{c.word}</span>
                      <span className="text-sm text-[#6B675F] ml-3">{c.nuance}</span>
                    </button>
                  ))}
                </div>
              )}

              {/* Easily-confused forms — same words with a different article, preposition or number */}
              {lookupResult.variants && lookupResult.variants.length > 0 && (
                <div className="p-5 sm:p-6 bg-[#FBF9F4] rounded-2xl border border-[#EDE8DE] space-y-2">
                  <p className="lx-label">Easily confused forms</p>
                  {lookupResult.variants.map((v, vi) => {
                    const isQuery = !!lookupResult.originalQuery
                      && normalizeForm(v.form) === normalizeForm(lookupResult.originalQuery);
                    // Looking the query form up again would just normalize back to this same entry.
                    if (isQuery) {
                      return (
                        <div key={vi} className="w-full text-left p-3 rounded-xl bg-white border border-[#EDE8DE]">
                          <span className="font-serif font-bold text-lg text-stone-900">{v.form}</span>
                          <span className="ml-3 lx-label align-middle">you searched</span>
                          <span className="text-sm text-[#6B675F] ml-3">{v.note}</span>
                        </div>
                      );
                    }
                    return (
                      <button key={vi} onClick={() => doLookup(v.form)} className="w-full text-left p-3 rounded-xl hover:bg-white transition-colors group">
                        <span className="font-serif font-bold text-lg text-stone-900 group-hover:underline underline-offset-4">{v.form}</span>
                        <span className="text-sm text-[#6B675F] ml-3">{v.note}</span>
                      </button>
                    );
                  })}
                </div>
              )}

              {lookupResult.meanings.map((m, mi) => (
                <div key={mi} className="space-y-10 sm:space-y-12">
                  <div className="flex items-center gap-4">
                    <h2 className="font-serif italic font-normal text-[22px] text-[#2B2A27] first-letter:lowercase">{m.partOfSpeech}</h2>
                    <span aria-hidden="true" className="flex-1 h-px bg-[#EDE8DE]" />
                    <span className="lx-label">{m.definitions.length} {m.definitions.length === 1 ? 'sense' : 'senses'}</span>
                  </div>
                  {m.definitions.map((_, di) => (
                    <React.Fragment key={di}>
                      {di > 0 && <div aria-hidden="true" className="ml-10 sm:ml-[52px] h-px bg-[#F2EEE6]" />}
                      {renderSense(lookupResult, mi, di)}
                    </React.Fragment>
                  ))}
                </div>
              ))}

              {unassigned.length > 0 && (
                <div className="space-y-3 pt-2">
                  <p className="lx-label !text-[#9A5420]">From your reading</p>
                  {unassigned.map(c => (
                    <blockquote key={c.id} className="font-serif text-lg leading-normal text-[#2B2A27] pl-5 border-l border-[#EFE3C4]">{emphasizeMark(c.targetSentence, lookupResult.word)}</blockquote>
                  ))}
                </div>
              )}
            </article>
          )}

          {!lookupResult && !loading && (
            <p className="text-center font-serif italic text-[15px] text-[#8C8880]">Reading something? Paste the whole sentence to see which sense it uses.</p>
          )}
        </div>
      )}

      {activeMode === 'CONTEXT' && (
        <div className="space-y-8 animate-fade-in-up">
          <form onSubmit={handleContext} className="flex items-end gap-3.5 border-b border-[#D9D3C7] focus-within:border-stone-900 transition-colors px-0.5 pb-2.5 pt-1.5">
            <label htmlFor="lx-sentence" className="sr-only">Paste the sentence you're reading</label>
            <textarea
              id="lx-sentence"
              rows={2}
              value={contextInput}
              onChange={(e) => setContextInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); runContext(contextInput); } }}
              placeholder="Paste the sentence you're reading…"
              className="flex-1 min-w-0 bg-transparent outline-none resize-none font-serif text-xl sm:text-[22px] leading-snug text-stone-900 placeholder:text-[#B5AFA3]"
            />
            <button type="submit" disabled={loading || !contextInput.trim()} aria-label="Explain" className="w-11 h-11 rounded-full bg-stone-900 text-white flex items-center justify-center hover:bg-black transition-colors shrink-0 disabled:opacity-40">
              {loading ? <Loader2 className="animate-spin w-5 h-5" /> : <ArrowRight className="w-5 h-5" />}
            </button>
          </form>

          {contextResult && (() => {
            const { before, hit, after } = splitAround(contextSentence, contextResult.surface);
            const tappable = (text: string) => text.split(/(\s+)/).map((tok, i) => {
              const bare = tok.replace(/^[^\w']+|[^\w']+$/g, '');
              if (!bare || /^\s+$/.test(tok)) return tok;
              const lead = tok.slice(0, tok.indexOf(bare));
              const tail = tok.slice(tok.indexOf(bare) + bare.length);
              return (
                <React.Fragment key={i}>
                  {lead}
                  <button onClick={() => runContext(contextSentence, bare)} className="text-[#6B675F] hover:text-stone-900 border-b border-dotted border-transparent hover:border-[#B5AFA3] transition-colors">{bare}</button>
                  {tail}
                </React.Fragment>
              );
            });
            return (
              <article className={`${card} animate-fade-in-up px-5 sm:px-16 py-9 sm:py-14 space-y-10`}>
                <div className="space-y-3">
                  <p className="font-serif text-2xl sm:text-[32px] leading-[1.5] tracking-[-0.01em]">
                    {tappable(before)}
                    {hit && (
                      <button onClick={() => doLookup(contextResult.word)} title="Open the full definition" className="lx-mark font-semibold text-stone-900">{hit}</button>
                    )}
                    {tappable(after)}
                  </p>
                  <p className="font-serif italic text-sm text-[#8C8880]">Tap any word to check it in this sentence</p>
                </div>

                <section className="grid grid-cols-[32px_minmax(0,1fr)] sm:grid-cols-[44px_minmax(0,1fr)] gap-x-2">
                  <Sparkles aria-hidden="true" className="w-4 h-4 mt-1.5 text-[#B5AFA3]" />
                  <div className="space-y-3">
                    <div className="flex flex-wrap justify-between items-baseline gap-2">
                      <h2 className="lx-label">
                        Here, <span className="normal-case tracking-normal font-serif italic text-[15px] font-medium text-stone-900">{contextResult.word}</span> means
                      </h2>
                      <button onClick={() => doLookup(contextResult.word)} className="flex items-center gap-1.5 min-h-[36px] text-[13.5px] font-medium text-stone-900 border-b border-[#D9D3C7] hover:border-stone-900">
                        Full definition <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <p className="font-serif text-xl sm:text-2xl leading-[1.38] font-bold">{contextResult.meaningHere}</p>
                    {contextResult.glossHere && <p className="gloss">{contextResult.glossHere}</p>}
                  </div>
                </section>

                {contextResult.usualMeaning && (
                  <section className="sm:ml-[52px] grid grid-cols-1 sm:grid-cols-2 border border-[#EDE8DE] rounded-[18px] overflow-hidden">
                    <div className="px-5 py-4 bg-[#FBF9F4] space-y-1.5">
                      <p className="lx-label">Not the usual meaning</p>
                      <p className="font-serif text-lg leading-snug text-[#8C8880] line-through decoration-[#C9C2B4]">{contextResult.usualMeaning}</p>
                      {contextResult.usualGloss && <p className="font-['PingFang_SC','Hiragino_Sans_GB','Microsoft_YaHei',sans-serif] font-light text-sm tracking-[0.06em] text-[#8C8880]">{contextResult.usualGloss}</p>}
                    </div>
                    <div className="px-5 py-4 border-t sm:border-t-0 sm:border-l border-[#EDE8DE] space-y-1.5">
                      <p className="lx-label !text-[#9A5420]">But in this sentence</p>
                      <p className="font-serif text-lg leading-snug">{contextResult.glossHere || contextResult.meaningHere}</p>
                    </div>
                  </section>
                )}

                {contextResult.clues.length > 0 && (
                  <section className="sm:ml-[52px] space-y-3.5">
                    <h2 className="lx-label">How you can tell</h2>
                    <ul className="space-y-2.5">
                      {contextResult.clues.map((c, i) => (
                        <li key={i} className="flex flex-wrap items-baseline gap-x-3.5 gap-y-1">
                          <span className="font-serif italic text-lg text-stone-900">“{c.quote}”</span>
                          <span className="text-[15px] text-[#6B675F]">{c.why}</span>
                        </li>
                      ))}
                    </ul>
                  </section>
                )}

                <section className="sm:ml-[52px] pl-5 border-l border-[#EDE8DE] space-y-2">
                  <h2 className="lx-label">The whole sentence, plainly</h2>
                  <p className="font-serif italic text-lg sm:text-[19px] leading-relaxed text-[#2B2A27]">“{contextResult.paraphrase}”</p>
                  {contextResult.paraphraseGloss && <p className="font-['PingFang_SC','Hiragino_Sans_GB','Microsoft_YaHei',sans-serif] font-light text-[15px] leading-loose tracking-[0.04em] text-[#6B675F]">{contextResult.paraphraseGloss}</p>}
                </section>

                <div className="sm:ml-[52px]">
                  {contextSave !== 'saved' ? (
                    <div className="flex flex-wrap items-center gap-3.5">
                      <button onClick={saveWithSentence} disabled={contextSave === 'saving'} className="flex items-center gap-2.5 min-h-[48px] px-5 rounded-full bg-stone-900 text-[#FBF9F4] text-sm font-medium hover:bg-black transition-colors disabled:opacity-60">
                        {contextSave === 'saving' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Bookmark className="w-4 h-4" />}
                        <span>Save <span className="font-serif italic">{contextResult.word}</span> with this sentence</span>
                      </button>
                      <span className="font-serif italic text-sm text-[#8C8880]">filed under its sense in your Notebook</span>
                    </div>
                  ) : (
                    <div role="status" className="flex flex-wrap items-center justify-between gap-3 min-h-[56px] pl-5 pr-1.5 py-1.5 rounded-full bg-[#FBF7EC] border border-[#EFE3C4]">
                      <span className="flex items-center gap-2.5 text-sm text-[#2B2A27]">
                        <Check className="w-4 h-4 text-[#9A5420]" />
                        <span>Saved to Notebook — <span className="font-serif italic text-base">{contextResult.word}</span>{savedSense ? `, sense ${savedSense}` : ''}</span>
                      </span>
                      <button onClick={() => doLookup(contextResult.word)} className="min-h-[44px] px-4 rounded-full bg-stone-900 text-[#FBF9F4] text-[13.5px] font-medium hover:bg-black">
                        See it in the definition
                      </button>
                    </div>
                  )}
                </div>
              </article>
            );
          })()}

          {!contextResult && !loading && (
            <p className="text-center font-serif italic text-[15px] text-[#8C8880]">Know the word but not what it means here? Paste the sentence — Lexi explains the sense it uses.</p>
          )}
        </div>
      )}

      {activeMode === 'COMPARE' && (
        <div className="space-y-12 animate-fade-in">
          <div className="max-w-2xl mx-auto bg-white p-5 sm:p-10 rounded-2xl sm:rounded-[2rem] border border-stone-100 shadow-xl space-y-8">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6">
              {compareInputs.map((val, idx) => (
                <div key={idx}>
                  <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-stone-400 px-1 mb-2 block">Word {idx + 1}</label>
                  <input
                    type="text"
                    value={val}
                    onChange={(e) => {
                      const next = [...compareInputs];
                      next[idx] = e.target.value;
                      setCompareInputs(next);
                    }}
                    placeholder="..."
                    className="w-full p-5 bg-stone-50 border border-stone-100 rounded-2xl outline-none focus:border-stone-300 focus:bg-white font-serif font-bold transition-all shadow-inner"
                  />
                </div>
              ))}
            </div>
            <button 
              onClick={handleCompare}
              disabled={loading || compareInputs.filter(i => i.trim()).length < 2}
              className="w-full py-6 bg-stone-900 text-white rounded-2xl font-bold shadow-2xl active:scale-[0.98] transition-all hover:bg-black hover:-translate-y-1 flex items-center justify-center gap-4 text-lg"
            >
              {loading ? <Loader2 className="animate-spin w-6 h-6" /> : <><GitCompare className="w-6 h-6" /> Analyze Differences</>}
            </button>
          </div>

          {compareResult && (
            <div className="animate-fade-in-up bg-white p-5 sm:p-12 rounded-3xl sm:rounded-[2.5rem] border border-stone-100 shadow-2xl space-y-8 sm:space-y-12">
              <div className="flex items-center gap-5 border-b border-stone-50 pb-8">
                <div className="p-5 bg-stone-50 rounded-2xl border border-stone-100"><GitCompare className="w-8 h-8 text-stone-800" /></div>
                <div>
                  <h3 className="text-3xl font-serif font-bold text-stone-900 tracking-tight">Synonym Breakdown</h3>
                  <p className="text-stone-400 font-serif text-lg">{compareResult.sharedMeaning}</p>
                </div>
              </div>

              <div className="bg-stone-900 p-5 sm:p-8 rounded-[1.5rem] shadow-lg relative overflow-hidden group">
                <Sparkles className="absolute right-[-20px] top-[-20px] w-40 h-40 text-white opacity-[0.03] group-hover:scale-110 transition-transform duration-700" />
                <h4 className="text-[10px] font-bold uppercase tracking-[0.3em] text-stone-500 mb-3 flex items-center gap-2">
                  <Sparkles className="w-4 h-4" /> Crucial Distinction
                </h4>
                <p className="text-xl font-serif text-stone-100 leading-relaxed font-bold relative z-10">{compareResult.keyDifference}</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 md:gap-12 pt-4">
                {[
                  { word: compareResult.word1, nuance: compareResult.word1Nuance, example: compareResult.word1Example },
                  { word: compareResult.word2, nuance: compareResult.word2Nuance, example: compareResult.word2Example },
                  ...(compareResult.word3 ? [{ word: compareResult.word3, nuance: compareResult.word3Nuance, example: compareResult.word3Example }] : [])
                ].map((item, idx) => (
                  <div key={idx} className="space-y-4">
                    <div className="flex justify-between items-center gap-2 border-b border-stone-100 pb-2 group/title">
                      <h5 className="text-2xl sm:text-3xl font-serif font-bold capitalize text-stone-900 tracking-tight break-words min-w-0">{item.word}</h5>
                      <button 
                        onClick={() => handleSaveFromComparison(item.word)}
                        disabled={isSaved(item.word) || savingWord === item.word}
                        className={`p-2 rounded-full transition-all shrink-0 ${
                          isSaved(item.word)
                          ? 'text-emerald-500 bg-emerald-50'
                          : 'text-stone-300 hover:text-stone-900 hover:bg-stone-50'
                        }`}
                      >
                        {savingWord === item.word ? (
                          <Loader2 className="w-5 h-5 animate-spin" />
                        ) : isSaved(item.word) ? (
                          <Check className="w-5 h-5" />
                        ) : (
                          <Save className="w-5 h-5" />
                        )}
                      </button>
                    </div>
                    <p className="text-stone-600 leading-relaxed text-base">{item.nuance}</p>
                    <p className="text-stone-400 italic font-serif bg-stone-50 p-4 rounded-xl text-sm">"{item.example}"</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="max-w-md mx-auto p-5 bg-red-50 border border-red-100 rounded-2xl text-red-700 text-center text-sm font-medium animate-fade-in">
          {error}
        </div>
      )}

    </div>
  );
};
