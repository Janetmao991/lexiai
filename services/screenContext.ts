/**
 * What the learner is looking at right now, in plain text, so Ask Lexi can answer
 * "why is this sense ii?" without the learner pasting anything. Pages publish a
 * snapshot whenever their content changes; the chat reads it at send time.
 */
import type { WordEntry } from '../types';
import { senseLabel } from './format';

type Listener = (summary: string) => void;
let snapshot = { summary: '', detail: '' };
const listeners = new Set<Listener>();

/** summary = a few words shown in the chat ("Look up · presumption"); detail = what Claude reads. */
export const setScreenContext = (summary: string, detail: string) => {
  snapshot = { summary, detail: detail.slice(0, 6000) };
  listeners.forEach(l => l(summary));
};

export const getScreenContext = () => snapshot;

export const onScreenContext = (l: Listener) => {
  listeners.add(l);
  return () => { listeners.delete(l); };
};

/** A saved word as Lexi should read it: numbered senses as on screen, plus the learner's sentences. */
export const entryText = (e: WordEntry): string => [
  `"${e.word}"`,
  ...e.meanings.flatMap((m, mi) => m.definitions.map((d, di) =>
    `  Sense ${senseLabel(e, mi, di)}. (${m.partOfSpeech}) ${d.definition}${d.gloss ? ` [${d.gloss}]` : ''}`)),
  ...(e.contexts || []).map(c => `  Saved sentence${c.sense ? ` (sense ${senseLabel(e, c.sense.meaning, c.sense.definition)})` : ''}: "${c.targetSentence || c.fullText}"`),
].join('\n');
