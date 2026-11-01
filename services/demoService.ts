// Demo-mode stand-ins for the AI and podcast-library calls. Each answers from the bundled
// fixture, or throws DemoNoteError so the UI shows "This is a demo — sign up…".
import type { WordEntry, ContextMeaning, SynonymComparison } from '../types';
import type { PodcastClip } from './podcastService';
import { demoFixture, DemoNoteError, DEMO_NOTE } from './demo';

type Sense = { meaning: number; definition: number };

const norm = (s: string) =>
  s.toLowerCase().replace(/[’‘]/g, "'").replace(/[“”"?!.,;:？！。，“”]/g, '').replace(/\s+/g, ' ').trim();

const findEntry = (word: string) => {
  const q = norm(word);
  return demoFixture().entries.find(e => norm(e.word) === q || e.aliases?.some(a => norm(a) === q));
};

export const demoLookupWord = async (word: string, exact = false): Promise<WordEntry> => {
  const hit = findEntry(word);
  // "Look it up as typed" on an inflected form would need a fresh AI entry.
  if (!hit || (exact && norm(hit.word) !== norm(word))) throw new DemoNoteError(`${DEMO_NOTE} Try one of the sample words below.`);
  const { aliases, ...entry } = hit;
  return structuredClone({ ...entry, timestamp: Date.now(), originalQuery: word });
};

const findSentence = (sentence: string) =>
  demoFixture().sentences.find(s => norm(s.sentence) === norm(sentence));

export const demoExplainInContext = async (sentence: string, focus?: string): Promise<ContextMeaning> => {
  const s = findSentence(sentence);
  if (!s) throw new DemoNoteError('This is a demo — sign up to explain your own sentences. Try one of the sample sentences below.');
  let result = s.results[0];
  if (focus) {
    const f = norm(focus);
    const tapped = s.results.find(r => norm(r.word) === f || norm(r.surface).split(' ').includes(f));
    if (!tapped) {
      const others = s.results.map(r => `“${r.surface}”`).join(' or ');
      throw new DemoNoteError(`This is a demo — sign up to check any word. In this sentence, try ${others}.`);
    }
    result = tapped;
  }
  const { sense, ...meaning } = result;
  return structuredClone(meaning);
};

/** Which sense a sample sentence uses — pre-tagged in the fixture. */
export const demoPickSense = async (entry: WordEntry, sentence: string): Promise<Sense | null> => {
  const s = findSentence(sentence);
  const r = s?.results.find(x => norm(x.word) === norm(entry.word));
  return r?.sense ?? null;
};

export const demoTagSenses = async (entry: WordEntry, sentences: string[]): Promise<(Sense | null)[]> => {
  const clips = demoFixture().clips[entry.word.toLowerCase()] || [];
  return sentences.map(t => clips.find(c => c.text === t)?.sense ?? null);
};

export const demoCompare = async (words: string[]): Promise<SynonymComparison> => {
  const asked = new Set(words.map(w => findEntry(w)?.word ?? norm(w)));
  const hit = demoFixture().comparisons.find(c => {
    const set = [c.word1, c.word2, c.word3].filter(Boolean) as string[];
    return [...asked].every(w => set.includes(w));
  });
  if (!hit) throw new DemoNoteError('This is a demo — sign up to compare your own words. Try: appall, shock, horrify.');
  return structuredClone(hit);
};

/** Ask Lexi: a canned answer when the question matches one, otherwise the demo note. */
export const demoAskLexi = async (question: string): Promise<string> => {
  const q = norm(question);
  const hit = demoFixture().askLexi.find(a => norm(a.question) === q || a.keys.every(k => q.includes(norm(k))));
  if (hit) return hit.answer;
  const samples = demoFixture().askLexi.map(a => `· ${a.question}`).join('\n');
  return `This is a demo — sign up to ask Lexi your own questions.\n\nIn the demo I can answer:\n${samples}`;
};

export const demoSearchClips = async (term: string): Promise<PodcastClip[]> =>
  (demoFixture().clips[term.trim().toLowerCase()] || []).map(({ sense, ...c }) => c);

export const demoWordsWithClips = async (words: string[]): Promise<Map<string, number>> => {
  const counts = new Map<string, number>();
  for (const w of words) {
    const n = demoFixture().clips[w.trim().toLowerCase()]?.length;
    if (n) counts.set(w.trim().toLowerCase(), n);
  }
  return counts;
};
