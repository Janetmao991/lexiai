
import { GoogleGenAI, Type, Modality, ThinkingLevel, GenerateContentParameters, GenerateContentResponse } from "@google/genai";
import { WordEntry, PracticeFeedback, ContextExplanation, PodcastScript, SynonymComparison, SentenceAnalysis } from "../types";

// ---- BYOK: the Gemini key lives in this browser only ----
export const getApiKey = (): string =>
  (typeof localStorage !== 'undefined' && localStorage.getItem('lexiai_api_key')) || process.env.API_KEY || '';

export const hasApiKey = (): boolean => Boolean(getApiKey());

export const getTextModel = (): string =>
  (typeof localStorage !== 'undefined' && localStorage.getItem('lexiai_model')) || 'gemini-3-flash-preview';

const getAi = () => {
  const key = getApiKey();
  if (!key) throw new Error('No Gemini API key configured. Open Settings and paste your free key from aistudio.google.com/apikey.');
  // 45s cap so a congested free-tier request fails visibly instead of spinning forever.
  return new GoogleGenAI({ apiKey: key, httpOptions: { timeout: 45000 } });
};

// Free-tier Gemini throws transient 503/429 blips; retry those quietly before
// surfacing an error to the UI.
const TRANSIENT = /503|UNAVAILABLE|overloaded|high demand|fetch failed|network/i;
const generateWithRetry = async (ai: GoogleGenAI, params: GenerateContentParameters, tries = 3): Promise<GenerateContentResponse> => {
  let lastError: unknown;
  for (let attempt = 0; attempt < tries; attempt++) {
    try {
      return await ai.models.generateContent(params);
    } catch (e: any) {
      lastError = e;
      if (attempt < tries - 1 && TRANSIENT.test(String(e?.message || ''))) {
        await new Promise(r => setTimeout(r, 1200 * (attempt + 1)));
        continue;
      }
      throw e;
    }
  }
  throw lastError;
};


// Helper functions for audio decoding based on @google/genai guidelines
function decode(base64: string) {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

async function decodeAudioData(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number,
  numChannels: number,
): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
}

// Schemas for JSON responses
const dictionarySchema = {
  type: Type.OBJECT,
  properties: {
    word: { type: Type.STRING },
    ipa: { type: Type.STRING },
    wasCorrected: { type: Type.BOOLEAN },
    meanings: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          partOfSpeech: { type: Type.STRING },
          definitions: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                definition: { type: Type.STRING },
                synonyms: { type: Type.ARRAY, items: { type: Type.STRING } },
                examples: { type: Type.ARRAY, items: { type: Type.STRING } },
                collocations: { type: Type.ARRAY, items: { type: Type.STRING } },
              },
              required: ["definition", "synonyms", "examples", "collocations"],
            },
          },
        },
        required: ["partOfSpeech", "definitions"],
      },
    },
    candidates: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          word: { type: Type.STRING },
          nuance: { type: Type.STRING },
        },
        required: ["word", "nuance"],
      },
    },
  },
  required: ["word", "ipa", "meanings"],
};

const practiceSchema = {
  type: Type.OBJECT,
  properties: {
    originalSentence: { type: Type.STRING },
    correctedSentence: { type: Type.STRING },
    isCorrect: { type: Type.BOOLEAN },
    score: { type: Type.NUMBER },
    explanation: { type: Type.STRING },
    suggestions: { type: Type.ARRAY, items: { type: Type.STRING } },
  },
  required: ["originalSentence", "correctedSentence", "isCorrect", "score", "explanation", "suggestions"],
};

const contextSchema = {
  type: Type.OBJECT,
  properties: {
    word: { type: Type.STRING },
    sentence: { type: Type.STRING },
    explanation: { type: Type.STRING },
    usageNuance: { type: Type.STRING },
  },
  required: ["word", "sentence", "explanation", "usageNuance"],
};

const podcastScriptSchema = {
  type: Type.OBJECT,
  properties: {
    title: { type: Type.STRING },
    topic: { type: Type.STRING },
    dialogue: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          speaker: { type: Type.STRING },
          text: { type: Type.STRING },
        },
        required: ["speaker", "text"],
      },
    },
  },
  required: ["title", "topic", "dialogue"],
};

const synonymComparisonSchema = {
  type: Type.OBJECT,
  properties: {
    word1: { type: Type.STRING },
    word2: { type: Type.STRING },
    word3: { type: Type.STRING },
    keyDifference: { type: Type.STRING },
    word1Nuance: { type: Type.STRING },
    word2Nuance: { type: Type.STRING },
    word3Nuance: { type: Type.STRING },
    sharedMeaning: { type: Type.STRING },
    word1Example: { type: Type.STRING },
    word2Example: { type: Type.STRING },
    word3Example: { type: Type.STRING },
  },
  required: ["word1", "word2", "keyDifference", "word1Nuance", "word2Nuance", "sharedMeaning", "word1Example", "word2Example"],
};

const sentenceAnalysisSchema = {
  type: Type.OBJECT,
  properties: {
    meaning: { type: Type.STRING },
    vocabularyBreakdown: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          word: { type: Type.STRING },
          definition: { type: Type.STRING },
        },
        required: ["word", "definition"],
      },
    },
    alternatives: { type: Type.ARRAY, items: { type: Type.STRING } },
  },
  required: ["meaning", "vocabularyBreakdown", "alternatives"],
};

export const askAboutContext = async (
  word: string, 
  fullText: string, 
  targetSentence: string, 
  question: string,
  history: { role: 'user' | 'model', text: string }[] = []
): Promise<string> => {
  const ai = getAi();
  try {
    const chat = ai.chats.create({
      model: getTextModel(),
      config: {
        thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
        systemInstruction: `You are a world-class English Lexicographer and Stylistic Analyst. 
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
        temperature: 0.7,
      }
    });

    const response = await chat.sendMessage({ message: question });
    return response.text || "Analysis unavailable.";
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

export const askLexi = async (
  question: string,
  history: { role: 'user' | 'model'; text: string }[] = []
): Promise<string> => {
  const ai = getAi();
  const chat = ai.chats.create({
    model: getTextModel(),
    history: history.map(h => ({ role: h.role, parts: [{ text: h.text }] })),
    config: {
      thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
      systemInstruction: LEXI_PERSONA,
      temperature: 0.6,
    },
  });
  const response = await chat.sendMessage({ message: question });
  return response.text || 'Hmm, no answer came back — try rephrasing?';
};

/** Ask Lexi about an image (screenshot of an article, a book page, a slide…). */
export const askLexiImage = async (base64: string, mimeType: string, question: string): Promise<string> => {
  const ai = getAi();
  const response = await generateWithRetry(ai, {
    model: getTextModel(),
    contents: [{ parts: [
      { inlineData: { data: base64, mimeType } },
      { text: question },
    ] }],
    config: {
      thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
      systemInstruction: LEXI_PERSONA,
      temperature: 0.6,
    },
  });
  return response.text || 'Hmm, no answer came back — try rephrasing?';
};

export interface ImageWordPick { word: string; gloss: string }

const imageWordsSchema = {
  type: Type.OBJECT,
  properties: {
    words: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          word: { type: Type.STRING },
          gloss: { type: Type.STRING },
        },
        required: ["word", "gloss"],
      },
    },
  },
  required: ["words"],
};

/** Pull the advanced vocabulary out of a photo/screenshot of English text. */
export const extractWordsFromImage = async (base64: string, mimeType: string): Promise<ImageWordPick[]> => {
  const ai = getAi();
  const response = await generateWithRetry(ai, {
    model: getTextModel(),
    contents: [{ parts: [
      { inlineData: { data: base64, mimeType } },
      { text: `Read the English text in this image. Pick the advanced words or phrases (C1+) most worth learning for an advanced learner with a business/finance focus — skip common words entirely. At most 10, most valuable first. For each, give a gloss of at most 8 words matching how it is used in this image. If the image contains no readable English text, return an empty list.` },
    ] }],
    config: {
      thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
      responseMimeType: "application/json",
      responseSchema: imageWordsSchema,
      temperature: 0.2,
    },
  });
  const parsed = response.text ? JSON.parse(response.text) : { words: [] };
  return parsed.words || [];
};

export const lookupWord = async (word: string): Promise<WordEntry | null> => {
  const ai = getAi();
  try {
    const response = await generateWithRetry(ai, {
      model: getTextModel(), 
      contents: `Act as a world-class lexicographer. Your goal is to provide accurate entries for advanced English learners.
      
      CRITICAL ACCURACY CHECK:
      The user input is: "${word}".
      1. If this is a malapropism or a non-standard expression, correct it to the standard idiomatic version.
      2. If you correct it, set "wasCorrected" to true.
      3. Provide IPA, detailed meanings, and advanced usage examples.
      4. ESSENTIAL: Provide 4-6 natural collocations for each definition.
      5. FINANCIAL FOCUS: If the word has a specific meaning in Finance, Business, or Economics, ENSURE you include that definition and set the partOfSpeech to exactly "Noun (Finance)", "Verb (Finance)", etc.
      6. REVERSE LOOKUP: The input may be CHINESE (or an English description of a meaning) instead of an English word. In that case, pick the single closest English word/phrase as the headword and fill "candidates" with 2-3 OTHER English words that also express it, ordered closest-in-meaning first, each with a one-line "nuance" explaining when it fits better than the headword. For a normal English-word lookup, leave "candidates" as [].`,
      config: {
        thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
        responseMimeType: "application/json",
        responseSchema: dictionarySchema,
        temperature: 0.1,
      },
    });

    if (response.text) {
      const data = JSON.parse(response.text);
      return { ...data, timestamp: Date.now(), originalQuery: word };
    }
    return null;
  } catch (error) {
    console.error("Error looking up word:", error);
    throw error;
  }
};

export const checkSentence = async (word: string, sentence: string): Promise<PracticeFeedback | null> => {
  const ai = getAi();
  try {
    const response = await generateWithRetry(ai, {
      model: getTextModel(),
      contents: `Act as a constructive and encouraging English tutor for advanced learners.
      
      TARGET WORD: "${word}"
      USER SENTENCE: "${sentence}"
      
      EVALUATION GUIDELINES:
      1. FAIR SCORING: If the user used "${word}" correctly according to its meaning and context (collocations), give at least an 80/100, even if there are minor grammatical errors elsewhere in the sentence.
      2. SEMANTIC FOCUS: Only give a low score (below 60) if the user fundamentally misunderstood the word "${word}" or used it in a nonsensical way.
      3. FEEDBACK: Confirm if the word usage was semantically sound. Praise correct context usage.`,
      config: {
        thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
        responseMimeType: "application/json",
        responseSchema: practiceSchema,
        temperature: 0.5,
      },
    });
    return response.text ? JSON.parse(response.text) : null;
  } catch (error) {
    console.error("Error checking sentence:", error);
    throw error;
  }
};

export const analyzeContextFromText = async (word: string, fullText: string): Promise<ContextExplanation | null> => {
  const ai = getAi();
  try {
    const response = await generateWithRetry(ai, {
      model: getTextModel(),
      contents: `Word: "${word}". Text: "${fullText.substring(0, 8000)}". Task: Find the sentence where "${word}" appears and explain its specific meaning.`,
      config: {
        thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
        responseMimeType: "application/json",
        responseSchema: contextSchema,
        temperature: 0.2
      }
    });
    return response.text ? JSON.parse(response.text) : null;
  } catch (error) {
    console.error("Error analyzing context from text:", error);
    throw error;
  }
};

export const playPronunciation = async (word: string): Promise<void> => {
  try {
    const ai = getAi();
    const response = await generateWithRetry(ai, {
      model: "gemini-2.5-flash-preview-tts",
      contents: [{ parts: [{ text: word }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: 'Kore' },
            },
        },
      },
    });

    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!base64Audio) throw new Error("No audio content returned");

    const AudioContextClass = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;
    
    const audioContext = new AudioContextClass({sampleRate: 24000});
    const audioBuffer = await decodeAudioData(decode(base64Audio), audioContext, 24000, 1);
    const source = audioContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(audioContext.destination);
    source.start();
  } catch (error) {
    // Gemini TTS unavailable (no API key, quota, offline) — fall back to the
    // browser voice so the speaker button always does something.
    console.error("Error playing pronunciation:", error);
    if ('speechSynthesis' in window) {
      const utterance = new SpeechSynthesisUtterance(word);
      utterance.lang = 'en-US';
      window.speechSynthesis.speak(utterance);
    }
  }
};

export const generatePodcastScript = async (words: string[]): Promise<PodcastScript> => {
  const ai = getAi();
  try {
    const response = await generateWithRetry(ai, {
      model: getTextModel(),
      contents: `Create a casual, intellectually stimulating podcast script discussing these specific words: ${words.join(', ')}. 
      
      HOSTS: Alex and Jamie.
      REQUIREMENT: Each speaker should use at least 2 of the target words naturally in their dialogue.
      STYLE: Sophisticated but conversational, like an NPR or TED podcast.`,
      config: {
        thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
        responseMimeType: "application/json",
        responseSchema: podcastScriptSchema,
        temperature: 0.7
      }
    });
    if (!response.text) throw new Error("No script generated");
    return JSON.parse(response.text);
  } catch (error) {
    console.error("Error generating podcast script:", error);
    throw error;
  }
};

export const generatePodcastAudio = async (script: PodcastScript): Promise<ArrayBuffer> => {
  const ai = getAi();
  try {
    const prompt = script.dialogue.map(turn => `${turn.speaker}: ${turn.text}`).join('\n');
    const response = await generateWithRetry(ai, {
      model: "gemini-2.5-flash-preview-tts",
      contents: [{ parts: [{ text: prompt }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          multiSpeakerVoiceConfig: {
            speakerVoiceConfigs: [
              { speaker: 'Alex', voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Fenrir' } } },
              { speaker: 'Jamie', voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Puck' } } }
            ]
          }
        }
      }
    });
    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!base64Audio) throw new Error("No audio generated");
    return decode(base64Audio).buffer;
  } catch (error) {
    console.error("Error generating podcast audio:", error);
    throw error;
  }
};

export const compareSynonyms = async (word1: string, word2: string, word3?: string): Promise<SynonymComparison | null> => {
  const ai = getAi();
  try {
    const response = await generateWithRetry(ai, {
      model: getTextModel(),
      contents: `Compare synonyms: ${word1}, ${word2}${word3 ? ', ' + word3 : ''}.`,
      config: {
        thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
        responseMimeType: "application/json",
        responseSchema: synonymComparisonSchema,
        temperature: 0.3
      }
    });
    return response.text ? JSON.parse(response.text) : null;
  } catch (error) {
    console.error("Error comparing synonyms:", error);
    throw error;
  }
};

export const analyzeSentence = async (sentence: string): Promise<SentenceAnalysis | null> => {
  const ai = getAi();
  try {
    const response = await generateWithRetry(ai, {
      model: getTextModel(),
      contents: `Help an advanced English learner (C1+) understand this sentence they met while reading: "${sentence}"

1. meaning: restate the full meaning in clear, plain English.
2. vocabularyBreakdown: ONLY the genuinely difficult items — rare words, idioms, phrasal verbs, or domain jargon that a C1 learner might not know. Skip common words entirely (words like "tell", "offer", "make" do NOT belong here). If nothing is difficult, return an empty array. Usually 1-3 items.
3. alternatives: 2-3 different natural ways a native speaker could express the same idea — vary the register (e.g. one neutral, one conversational). These are NOT corrections; the original sentence is from published writing.`,
      config: {
        thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
        responseMimeType: "application/json",
        responseSchema: sentenceAnalysisSchema,
        temperature: 0.3
      }
    });
    return response.text ? JSON.parse(response.text) : null;
  } catch (error) {
    console.error("Error analyzing sentence:", error);
    throw error;
  }
};

export const transcribeAudio = async (base64Audio: string, mimeType: string): Promise<string> => {
  const ai = getAi();
  const response = await generateWithRetry(ai, {
    model: getTextModel(),
    contents: [{
      parts: [
        { inlineData: { data: base64Audio, mimeType } },
        { text: "Transcribe this English speech verbatim. Return ONLY the transcribed words, no punctuation commentary, no quotes, no explanations. If there is no intelligible speech, return an empty string." },
      ],
    }],
    config: { thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL }, temperature: 0 },
  });
  return (response.text || '').trim();
};

// ---------- Daily Read: comprehensible input woven from review words ----------

export interface DailyReadResult {
  title: string;
  passage: string;
}

const dailyReadSchema = {
  type: Type.OBJECT,
  properties: {
    title: { type: Type.STRING },
    passage: { type: Type.STRING },
  },
  required: ["title", "passage"],
};

export const generateDailyRead = async (targetWords: string[]): Promise<DailyReadResult> => {
  const ai = getAi();
  const response = await generateWithRetry(ai, {
    model: getTextModel(),
    contents: `Write a short, engaging passage (150-200 words) for an advanced English learner who follows business and finance news.

Requirements:
1. Naturally weave in ALL of these words/phrases exactly once each: ${targetWords.join(', ')}
2. Pick a concrete, contemporary angle (a market story, a workplace scene, a consumer trend) — not a lecture about vocabulary.
3. Sophisticated but readable prose; short paragraphs are fine.
4. Also give it a punchy title (5-8 words). Do not use the target words in the title.`,
    config: {
      responseMimeType: "application/json",
      responseSchema: dailyReadSchema,
      thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
      temperature: 0.9,
    },
  });
  return JSON.parse(response.text!);
};
