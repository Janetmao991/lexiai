// Every text feature in LexiAI (lookups, feedback, chat, analysis) — powered by Claude.
// Audio (transcription, natural voices, podcast audio) stays on Gemini: geminiService.ts.
import { claudeJson, claudeChat, S, LexiPart } from "./claude";
import { WordEntry, PracticeFeedback, NativeRephrase, ContextExplanation, PodcastScript, SynonymComparison, SentenceAnalysis, ContextMeaning } from "../types";

export { hasClaudeKey as hasApiKey, friendlyError } from "./claude";
export type { LexiPart } from "./claude";

// User-selectable gloss language (Settings → "Definition gloss"). Mirrored in
// localStorage for synchronous reads; the source of truth syncs through
// statsService (user_stats.prefs) so every signed-in device agrees.
// Empty/absent = English-only definitions (the default).
export const GLOSS_STORAGE = 'lexiai_gloss_lang';
export const GLOSS_LANGS: { id: string; label: string; name: string }[] = [
  { id: '',   label: 'Off',       name: '' },
  { id: 'zh', label: '中文',      name: 'Simplified Chinese' },
  { id: 'ja', label: '日本語',    name: 'Japanese' },
  { id: 'ko', label: '한국어',    name: 'Korean' },
  { id: 'es', label: 'Español',   name: 'Spanish' },
  { id: 'fr', label: 'Français',  name: 'French' },
  { id: 'de', label: 'Deutsch',   name: 'German' },
  { id: 'pt', label: 'Português', name: 'Portuguese' },
];
export const getGlossLang = (): string =>
  (typeof localStorage !== 'undefined' && localStorage.getItem(GLOSS_STORAGE)) || '';
const glossInstruction = (lang: string): string => {
  if (!lang) return '';
  const name = GLOSS_LANGS.find(g => g.id === lang)?.name || lang;
  return `\n      5b. NATIVE GLOSS: For EVERY definition, fill "gloss" with a ${name} gloss of THAT specific sense. Requirements: (a) lead with the neutral core meaning as a dictionary would (e.g. for "rehash": 重新表述；重新整理（旧材料）), then, only if the word carries a register or connotation, append it in brackets, e.g. （常含贬义：老调重弹）; (b) never reduce a neutral word to a single idiom or slang gloss — idioms may appear only as the bracketed connotation note, never as the whole gloss; (c) 5–20 characters, separated by "；"; (d) use standard ${name} finance/business terminology for finance senses. Never leave it empty.`;
};

// Schemas for JSON responses
const dictionarySchema = (withGloss: boolean) => S.obj({
  word: S.str(),
  ipa: S.str(),
  wasCorrected: S.bool(),
  meanings: S.arr(S.obj({
    partOfSpeech: S.str(),
    definitions: S.arr(S.obj({
      definition: S.str(),
      ...(withGloss ? { gloss: S.str() } : {}),
      synonyms: S.arr(S.str()),
      examples: S.arr(S.str()),
      collocations: S.arr(S.str()),
    })),
  })),
  candidates: S.arr(S.obj({ word: S.str(), nuance: S.str() })),
  variants: S.arr(S.obj({ form: S.str(), note: S.str() })),
}, ["word", "ipa", "meanings", "wasCorrected", "candidates", "variants"]);

const practiceSchema = S.obj({
  originalSentence: S.str(),
  correctedSentence: S.str(),
  isCorrect: S.bool(),
  score: S.num(),
  explanation: S.str(),
  suggestions: S.arr(S.str()),
});

const contextSchema = S.obj({
  word: S.str(),
  sentence: S.str(),
  explanation: S.str(),
  usageNuance: S.str(),
});

const podcastScriptSchema = S.obj({
  title: S.str(),
  topic: S.str(),
  dialogue: S.arr(S.obj({ speaker: S.str(), text: S.str() })),
});

const synonymComparisonSchema = S.obj({
  word1: S.str(),
  word2: S.str(),
  word3: S.str(),
  keyDifference: S.str(),
  word1Nuance: S.str(),
  word2Nuance: S.str(),
  word3Nuance: S.str(),
  sharedMeaning: S.str(),
  word1Example: S.str(),
  word2Example: S.str(),
  word3Example: S.str(),
}, ["word1", "word2", "keyDifference", "word1Nuance", "word2Nuance", "sharedMeaning", "word1Example", "word2Example"]);

const sentenceAnalysisSchema = S.obj({
  meaning: S.str(),
  vocabularyBreakdown: S.arr(S.obj({ word: S.str(), definition: S.str() })),
  alternatives: S.arr(S.str()),
});

export const askAboutContext = async (
  word: string,
  fullText: string,
  targetSentence: string,
  question: string,
  history: { role: 'user' | 'model', text: string }[] = []
): Promise<string> => {
  try {
    const reply = await claudeChat(
      [...history, { role: 'user' as const, text: question }].map(h => ({ role: h.role, parts: [{ text: h.text }] })),
      {
        system: `You are a world-class English Lexicographer and Stylistic Analyst.
        You are assisting an advanced English learner via a side-bar interface.

        CURRENT TARGET: "${word}"
        FULL ARTICLE CONTEXT: "${fullText.substring(0, 4000)}"
        SPECIFIC USAGE SENTENCE: "${targetSentence}"

        STRICT OUTPUT RULES:
        1. NO RAW ASTERISKS: Never output "*" or "**". If you need to emphasize, use standard Markdown formatting (which the UI will strip and style).
        2. MICRO-NUANCE COMPARISON: When explaining, always include a section comparing the current word with 2 synonyms. Describe the 'Vibe' shift for each.
        3. SUMMARY FOR THE LEARNER: Provide a final 2-3 sentence takeaway focusing on the mental model (e.g., "Think of a contract expiring, not a physical object falling").
        4. TONE & REGISTER: Clearly identify if the usage is "Corporate Casual", "Technical", or "Clinical".
        5. PERSUASIVE INTENT: Explain if the choice is designed to 'Softened the blow' or 'Establish authority'.

        STRUCTURE:
        - Use "### Header Name" for sections.
        - Use bullet points for comparisons.
        - Be concise, high-level, and intellectually stimulating.`,
      },
    );
    return reply || "Analysis unavailable.";
  } catch (error) {
    console.error("Error in context chat:", error);
    throw error;
  }
};

// Global "Ask Lexi" chat — reachable from every page for quick word/usage questions.
const LEXI_PERSONA = `You are Lexi — a sharp, warm English tutor living inside a dictionary app, chatting with an advanced learner (Chinese native, C1, finance background).
Rules:
1. Questions may be in English or Chinese; answer primarily in English (simple, clear), adding a short Chinese gloss for the key term when the question was in Chinese.
2. Keep answers SHORT: under 120 words. One idea per line, blank line between points.
3. NO markdown symbols (no *, #, backticks). Plain text only.
4. When explaining a word: meaning in one line, one natural example, one nuance vs its closest synonym.
5. If asked for a word from a Chinese meaning, give the best 2-3 English options, closest first, one line each on how they differ.`;

/** One conversational turn with Lexi. The caller owns the history (including
    image parts), so follow-up questions keep full context — "what does the
    second word mean?" still works after a photo was sent. */
export const askLexiTurn = async (
  history: { role: 'user' | 'model'; parts: LexiPart[] }[],
  parts: LexiPart[]
): Promise<string> => {
  const reply = await claudeChat([...history, { role: 'user', parts }], { system: LEXI_PERSONA });
  return reply || 'Hmm, no answer came back — try rephrasing?';
};

export interface ImageWordPick { word: string; gloss: string }

export interface ImageTextAnalysis {
  explanation: string;
  breakdown: string[];
  words: ImageWordPick[];
}

const imageAnalysisSchema = S.obj({
  explanation: S.str(),
  breakdown: S.arr(S.str()),
  words: S.arr(S.obj({ word: S.str(), gloss: S.str() })),
});

/** Explain + break down the English text in an attachment — a photo, a screenshot,
    a PDF, or a pasted text file — and pull out the advanced vocabulary worth learning.
    `source` is the attachment part(s): an inline image/PDF, or the file's plain text. */
export const analyzeSource = async (source: LexiPart[]): Promise<ImageTextAnalysis> => {
  const parsed = await claudeJson<ImageTextAnalysis>([
    ...source,
    { text: `Read the English text in the attachment above (a sentence, a paragraph, a page, or a whole document). You are helping an advanced learner (C1, Chinese native, business/finance focus) truly understand it.

1. "explanation": restate what the text means in clear, plain English — 1-3 sentences. If it's a long passage, explain the core point. No markdown symbols.
2. "breakdown": break down the key sentence(s) a C1 learner could stumble on — grammar structure, idioms, phrasal verbs, references, or logic. Each item ONE short line in the form "quoted part — what it does / how it works". 2-6 items; fewer if the text is simple.
3. "words": the advanced words or phrases (C1+) most worth learning from this text — skip common words entirely. At most 10, most valuable first, each with a gloss of at most 8 words matching how it is used here.

If it is a long document, cover its core argument in "explanation" and draw "breakdown" and "words" from the passages that matter most.

If there is no readable English text, set explanation to "I couldn't find readable English text in that — try a clearer shot or another file?", and leave breakdown and words empty.` },
  ], imageAnalysisSchema, { timeoutMs: 120000 });
  return parsed || { explanation: 'Hmm, no answer came back — try again?', breakdown: [], words: [] };
};

/** `opts.exact` — the learner insists on their own wording; never substitute a headword. */
export const lookupWord = async (word: string, opts?: { exact?: boolean }): Promise<WordEntry | null> => {
  const glossLang = getGlossLang();
  try {
    const data = await claudeJson<Omit<WordEntry, 'timestamp' | 'originalQuery'>>(`Act as a world-class lexicographer. Your goal is to provide accurate entries for advanced English learners.

      CRITICAL ACCURACY CHECK:
      The user input is: "${word}".
      1. Correct the input ONLY when it is a genuine error: a misspelling, or a malapropism ("for all intensive purposes" → "for all intents and purposes"). A term that is actually used in finance, business or tech is NOT an error however unusual it looks — keep it EXACTLY as typed, word order included. "lead left" is a real syndicate/IPO term and must never be turned into "left lead". Never reorder, re-hyphenate or otherwise tidy a phrase just to make it look more familiar, and when you are unsure whether a form is attested, keep the learner's form as the headword and explain its status in the definition.
      2. If you correct it, set "wasCorrected" to true.${opts?.exact ? `
      OVERRIDE — the learner has already been shown a different headword and has asked for "${word}" exactly as typed: use it verbatim as the headword, set "wasCorrected" to false, and if it is rare, informal or non-standard, say so inside the first definition instead of substituting another form.` : ''}
      3. Provide IPA, detailed meanings, and advanced usage examples.
      4. ESSENTIAL: Provide 4-6 natural collocations for each definition.
      5. FINANCIAL FOCUS: If the word has a specific meaning in Finance, Business, or Economics, ENSURE you include that definition and set the partOfSpeech to exactly "Noun (Finance)", "Verb (Finance)", etc.${glossInstruction(glossLang)}
      6. REVERSE LOOKUP: The input may be CHINESE (or an English description of a meaning) instead of an English word. In that case, pick the single closest English word/phrase as the headword and fill "candidates" with 2-3 OTHER English words that also express it, ordered closest-in-meaning first, each with a one-line "nuance" explaining when it fits better than the headword. For a normal English-word lookup, leave "candidates" as [].
      7. VARIANT NOTES: Fill "variants" with the forms most easily confused with the headword — the same words with a different article, preposition, or number (e.g. for "at the margin": "on margin", "on the margins", "in the margin"). 2-4 items, each with "form" = the exact form and "note" = ONE line on how its meaning or register differs from the headword. Never repeat the headword itself, and never list a form that means exactly the same thing with no difference in register. If the input "${word}" is an English expression that you did NOT use verbatim as the headword, its own form MUST be the first item, saying plainly whether it is a true synonym, a looser or more colloquial variant, or a different expression altogether. If nothing is genuinely confusable, leave "variants" as [].`,
      dictionarySchema(Boolean(glossLang)));
    return data ? { ...data, timestamp: Date.now(), originalQuery: word } as WordEntry : null;
  } catch (error) {
    console.error("Error looking up word:", error);
    throw error;
  }
};

export const checkSentence = async (word: string, sentence: string): Promise<PracticeFeedback | null> => {
  try {
    return await claudeJson<PracticeFeedback>(`Act as a constructive and encouraging English tutor for advanced learners.

      TARGET WORD: "${word}"
      USER SENTENCE: "${sentence}"

      EVALUATION GUIDELINES:
      1. FAIR SCORING: If the user used "${word}" correctly according to its meaning and context (collocations), give at least an 80/100, even if there are minor grammatical errors elsewhere in the sentence.
      2. SEMANTIC FOCUS: Only give a low score (below 60) if the user fundamentally misunderstood the word "${word}" or used it in a nonsensical way.
      3. FEEDBACK: Confirm if the word usage was semantically sound. Praise correct context usage.`,
      practiceSchema);
  } catch (error) {
    console.error("Error checking sentence:", error);
    throw error;
  }
};

const nativeRephraseSchema = S.obj({
  naturalness: S.num(),
  nativeVersion: S.str(),
  formalVersion: S.str(),
  notes: S.arr(S.obj({ yours: S.str(), native: S.str(), why: S.str() })),
});

export const rephraseNatively = async (text: string): Promise<NativeRephrase | null> => {
  try {
    return await claudeJson<NativeRephrase>(`You are a native American English speech coach for an advanced ESL learner (business school student, AI/finance career).

THE LEARNER SAID (transcribed speech): "${text}"

Rewrite what they said the way a native speaker would ACTUALLY SAY IT OUT LOUD — same meaning, same information, natural spoken register (contractions, natural connectors, idiomatic collocations). Do not add new content or make it longer than it needs to be.

Return:
1. naturalness — 0-100 for how native the original already sounds (90+ = essentially native; below 60 = clearly translated-sounding).
2. nativeVersion — the everyday conversational way to say it.
3. formalVersion — a polished professional-register version (meeting/interview appropriate), still spoken language, not written prose.
4. notes — up to 4 point fixes for the MOST non-native bits only: quote the learner's exact phrase (yours), the native phrasing (native), and a short reason (why: wrong collocation / too formal / word-for-word translation / unnatural structure…). If the original is already natural, return fewer notes or none — never invent problems.`,
      nativeRephraseSchema);
  } catch (error) {
    console.error("Error rephrasing natively:", error);
    throw error;
  }
};

export const analyzeContextFromText = async (word: string, fullText: string): Promise<ContextExplanation | null> => {
  try {
    return await claudeJson<ContextExplanation>(
      `Word: "${word}". Text: "${fullText.substring(0, 8000)}". Task: Find the sentence where "${word}" appears and explain its specific meaning.`,
      contextSchema);
  } catch (error) {
    console.error("Error analyzing context from text:", error);
    throw error;
  }
};

export const generatePodcastScript = async (words: string[]): Promise<PodcastScript> => {
  try {
    const script = await claudeJson<PodcastScript>(`Create a casual, intellectually stimulating podcast script discussing these specific words: ${words.join(', ')}.

      HOSTS: Alex and Jamie.
      REQUIREMENT: Each speaker should use at least 2 of the target words naturally in their dialogue.
      STYLE: Sophisticated but conversational, like an NPR or TED podcast.`,
      podcastScriptSchema, { timeoutMs: 120000 });
    if (!script) throw new Error("No script generated");
    return script;
  } catch (error) {
    console.error("Error generating podcast script:", error);
    throw error;
  }
};

export const compareSynonyms = async (word1: string, word2: string, word3?: string): Promise<SynonymComparison | null> => {
  try {
    return await claudeJson<SynonymComparison>(`Compare synonyms: ${word1}, ${word2}${word3 ? ', ' + word3 : ''}.`, synonymComparisonSchema);
  } catch (error) {
    console.error("Error comparing synonyms:", error);
    throw error;
  }
};

export const analyzeSentence = async (sentence: string): Promise<SentenceAnalysis | null> => {
  try {
    return await claudeJson<SentenceAnalysis>(`Help an advanced English learner (C1+) understand this sentence they met while reading: "${sentence}"

1. meaning: restate the full meaning in clear, plain English.
2. vocabularyBreakdown: ONLY the genuinely difficult items — rare words, idioms, phrasal verbs, or domain jargon that a C1 learner might not know. Skip common words entirely (words like "tell", "offer", "make" do NOT belong here). If nothing is difficult, return an empty array. Usually 1-3 items.
3. alternatives: 2-3 different natural ways a native speaker could express the same idea — vary the register (e.g. one neutral, one conversational). These are NOT corrections; the original sentence is from published writing.`,
      sentenceAnalysisSchema);
  } catch (error) {
    console.error("Error analyzing sentence:", error);
    throw error;
  }
};

// ---- Meaning in context ----

const contextMeaningSchema = (withGloss: boolean) => S.obj({
  word: S.str(),
  surface: S.str(),
  meaningHere: S.str(),
  usualMeaning: S.str(),
  clues: S.arr(S.obj({ quote: S.str(), why: S.str() })),
  paraphrase: S.str(),
  ...(withGloss ? {
    glossHere: S.str(),
    usualGloss: S.str(),
    paraphraseGloss: S.str(),
  } : {}),
}, ["word", "surface", "meaningHere", "usualMeaning", "clues", "paraphrase",
  ...(withGloss ? ["glossHere", "paraphraseGloss"] : [])]);

/**
 * Explain what one word/phrase means in THIS sentence — the sense actually used, contrasted
 * with the sense a learner probably already knows. With no `focus`, the model picks the item
 * most likely to mislead (a familiar word used in an unfamiliar sense beats a merely rare word).
 */
export const explainInContext = async (sentence: string, focus?: string): Promise<ContextMeaning | null> => {
  const glossLang = getGlossLang();
  const glossName = GLOSS_LANGS.find(g => g.id === glossLang)?.name || glossLang;
  return claudeJson<ContextMeaning>(`An advanced English learner (C1+) knows the common meanings of most words but gets confused when a sentence uses a word in a different sense. Sentence they are reading: "${sentence}"

${focus
  ? `FOCUS: "${focus}". If it is part of a larger phrasal verb, idiom or fixed expression in this sentence (e.g. "crop" in "crop up"), explain the whole expression.`
  : `Pick the ONE word or expression in this sentence most likely to mislead them: prefer a familiar word used in a less common sense (e.g. "coup" meaning a big win, "gauge" meaning to estimate) over a word that is merely rare. Phrasal verbs and idioms count as one item.`}

Fill:
- word: its dictionary headword (base form, e.g. "gauges" → "gauge").
- surface: the exact text as it appears in the sentence.
- meaningHere: the sense used in THIS sentence, as a clear dictionary-style definition (one sentence).
- usualMeaning: the more common sense this learner probably knows, in a few words — but ONLY if it differs from meaningHere; otherwise "".
- clues: 1-3 items. "quote" = a short verbatim fragment of the sentence (use "…" to skip words) that signals this sense; "why" = a few plain words on what it tells you (e.g. "business, not politics").
- paraphrase: the whole sentence restated in plain, simple English.${glossLang ? `
- glossHere: a ${glossName} gloss of meaningHere (5-15 characters, "；"-separated).
- usualGloss: a ${glossName} gloss of usualMeaning, or "" if usualMeaning is "".
- paraphraseGloss: a natural ${glossName} translation of the whole sentence.` : ''}`,
    contextMeaningSchema(Boolean(glossLang)));
};

/** Which sense of a dictionary entry a sentence uses — so a saved sentence can sit under its sense. */
export const pickSense = async (entry: WordEntry, sentence: string, meaningHere: string): Promise<{ meaning: number; definition: number } | null> => {
  const senses = entry.meanings.flatMap((m, mi) =>
    m.definitions.map((d, di) => ({ mi, di, text: `${m.partOfSpeech}: ${d.definition}` })));
  if (senses.length === 0) return null;
  if (senses.length === 1) return { meaning: 0, definition: 0 };
  const res = await claudeJson<{ sense: number }>(`Sentence: "${sentence}"
In it, "${entry.word}" means: ${meaningHere}
Which numbered sense below is that? Answer with its number.
${senses.map((s, i) => `${i + 1}. ${s.text}`).join('\n')}`,
    S.obj({ sense: S.num() }), { maxTokens: 4000 });
  const hit = senses[Number(res?.sense) - 1];
  return hit ? { meaning: hit.mi, definition: hit.di } : null;
};

/** Which sense each sentence uses — one call for a batch (e.g. podcast clips). null = no clear match. */
export const tagSenses = async (entry: WordEntry, sentences: string[]): Promise<({ meaning: number; definition: number } | null)[]> => {
  const senses = entry.meanings.flatMap((m, mi) =>
    m.definitions.map((d, di) => ({ mi, di, text: `${m.partOfSpeech}: ${d.definition}` })));
  if (senses.length === 0 || sentences.length === 0) return sentences.map(() => null);
  if (senses.length === 1) return sentences.map(() => ({ meaning: 0, definition: 0 }));
  const res = await claudeJson<{ senses: number[] }>(`Senses of "${entry.word}":
${senses.map((s, i) => `${i + 1}. ${s.text}`).join('\n')}

For each sentence below, give the number of the sense "${entry.word}" has in it (0 if none fits).
${sentences.map((s, i) => `[${i + 1}] ${s}`).join('\n')}`,
    S.obj({ senses: S.arr(S.num()) }), { maxTokens: 4000 });
  const picks = res?.senses || [];
  return sentences.map((_, i) => {
    const hit = senses[(picks[i] ?? 0) - 1];
    return hit ? { meaning: hit.mi, definition: hit.di } : null;
  });
};
