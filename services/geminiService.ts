
import { GoogleGenAI, Type, Modality } from "@google/genai";
import { WordEntry, PracticeFeedback, ContextExplanation, VocabularySuggestion, PodcastScript, SynonymComparison, SentenceAnalysis } from "../types";

// ---- BYOK: the Gemini key lives in this browser only ----
export const getApiKey = (): string =>
  (typeof localStorage !== 'undefined' && localStorage.getItem('lexiai_api_key')) || process.env.API_KEY || '';

export const hasApiKey = (): boolean => Boolean(getApiKey());

export const getTextModel = (): string =>
  (typeof localStorage !== 'undefined' && localStorage.getItem('lexiai_model')) || 'gemini-3-flash-preview';

const getAi = () => {
  const key = getApiKey();
  if (!key) throw new Error('No Gemini API key configured. Open Settings and paste your free key from aistudio.google.com/apikey.');
  return new GoogleGenAI({ apiKey: key });
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

const vocabularySuggestionsSchema = {
  type: Type.ARRAY,
  items: {
    type: Type.OBJECT,
    properties: {
      word: { type: Type.STRING },
      definition: { type: Type.STRING },
      reason: { type: Type.STRING },
    },
    required: ["word", "definition", "reason"],
  },
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
    improvedVersion: { type: Type.STRING },
  },
  required: ["meaning", "vocabularyBreakdown"],
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

export const lookupWord = async (word: string): Promise<WordEntry | null> => {
  const ai = getAi();
  try {
    const response = await ai.models.generateContent({
      model: getTextModel(), 
      contents: `Act as a world-class lexicographer. Your goal is to provide accurate entries for advanced English learners.
      
      CRITICAL ACCURACY CHECK:
      The user input is: "${word}".
      1. If this is a malapropism or a non-standard expression, correct it to the standard idiomatic version.
      2. If you correct it, set "wasCorrected" to true.
      3. Provide IPA, detailed meanings, and advanced usage examples.
      4. ESSENTIAL: Provide 4-6 natural collocations for each definition.
      5. FINANCIAL FOCUS: If the word has a specific meaning in Finance, Business, or Economics, ENSURE you include that definition and set the partOfSpeech to exactly "Noun (Finance)", "Verb (Finance)", etc.`,
      config: {
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
    const response = await ai.models.generateContent({
      model: getTextModel(),
      contents: `Act as a constructive and encouraging English tutor for advanced learners.
      
      TARGET WORD: "${word}"
      USER SENTENCE: "${sentence}"
      
      EVALUATION GUIDELINES:
      1. FAIR SCORING: If the user used "${word}" correctly according to its meaning and context (collocations), give at least an 80/100, even if there are minor grammatical errors elsewhere in the sentence.
      2. SEMANTIC FOCUS: Only give a low score (below 60) if the user fundamentally misunderstood the word "${word}" or used it in a nonsensical way.
      3. FEEDBACK: Confirm if the word usage was semantically sound. Praise correct context usage.`,
      config: {
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

export const explainContext = async (word: string, sentence: string): Promise<ContextExplanation | null> => {
  const ai = getAi();
  try {
    const response = await ai.models.generateContent({
      model: getTextModel(),
      contents: `Explain "${word}" specifically in the context of this sentence: "${sentence}"`,
      config: {
        responseMimeType: "application/json",
        responseSchema: contextSchema,
        temperature: 0.3,
      },
    });
    return response.text ? JSON.parse(response.text) : null;
  } catch (error) {
    console.error("Error explaining context:", error);
    throw error;
  }
};

export const analyzeContextFromText = async (word: string, fullText: string): Promise<ContextExplanation | null> => {
  const ai = getAi();
  try {
    const response = await ai.models.generateContent({
      model: getTextModel(),
      contents: `Word: "${word}". Text: "${fullText.substring(0, 8000)}". Task: Find the sentence where "${word}" appears and explain its specific meaning.`,
      config: {
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
  const ai = getAi();
  try {
    const response = await ai.models.generateContent({
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
    console.error("Error playing pronunciation:", error);
    throw error;
  }
};

export const analyzeVocabulary = async (text: string): Promise<VocabularySuggestion[]> => {
  const ai = getAi();
  try {
    const response = await ai.models.generateContent({
      model: getTextModel(),
      contents: `Identify 5-10 advanced terms in: "${text.substring(0, 5000)}"`,
      config: {
        responseMimeType: "application/json",
        responseSchema: vocabularySuggestionsSchema,
        temperature: 0.3
      }
    });
    return response.text ? JSON.parse(response.text) : [];
  } catch (error) {
    console.error("Error analyzing vocabulary:", error);
    return [];
  }
};

export const generatePodcastScript = async (words: string[]): Promise<PodcastScript> => {
  const ai = getAi();
  try {
    const response = await ai.models.generateContent({
      model: getTextModel(),
      contents: `Create a casual, intellectually stimulating podcast script discussing these specific words: ${words.join(', ')}. 
      
      HOSTS: Alex and Jamie.
      REQUIREMENT: Each speaker should use at least 2 of the target words naturally in their dialogue.
      STYLE: Sophisticated but conversational, like an NPR or TED podcast.`,
      config: {
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
    const response = await ai.models.generateContent({
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
    const response = await ai.models.generateContent({
      model: getTextModel(),
      contents: `Compare synonyms: ${word1}, ${word2}${word3 ? ', ' + word3 : ''}.`,
      config: {
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
    const response = await ai.models.generateContent({
      model: getTextModel(),
      contents: `Break down advanced English sentence: "${sentence}".`,
      config: {
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
  const response = await ai.models.generateContent({
    model: getTextModel(),
    contents: [{
      parts: [
        { inlineData: { data: base64Audio, mimeType } },
        { text: "Transcribe this English speech verbatim. Return ONLY the transcribed words, no punctuation commentary, no quotes, no explanations. If there is no intelligible speech, return an empty string." },
      ],
    }],
    config: { temperature: 0 },
  });
  return (response.text || '').trim();
};
