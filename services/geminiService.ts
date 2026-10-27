// Gemini — audio only: speech transcription, natural-sounding voices and podcast audio.
// Claude can't hear or speak, so these stay here; every text feature is in claudeService.ts.
import { GoogleGenAI, Modality, ThinkingLevel, GenerateContentParameters, GenerateContentResponse } from "@google/genai";
import { pronounce } from "./pronunciation";
import { PodcastScript } from "../types";

// ---- BYOK: the Gemini key lives in this browser only ----
export const getApiKey = (): string =>
  (typeof localStorage !== 'undefined' && localStorage.getItem('lexiai_api_key')) || process.env.API_KEY || '';

export const hasApiKey = (): boolean => Boolean(getApiKey());

const AUDIO_MODEL = 'gemini-3-flash-preview';

const getAi = (timeoutMs = 45000) => {
  const key = getApiKey();
  if (!key) throw new Error('No Gemini API key configured. It powers voice features (transcription and natural voices) — open Settings and paste your free key from aistudio.google.com/apikey.');
  // Cap so a congested request fails visibly instead of spinning forever.
  return new GoogleGenAI({ apiKey: key, httpOptions: { timeout: timeoutMs } });
};

// Free-tier Gemini throws transient 503/429 blips; retry those quietly before
// surfacing an error to the UI.
const TRANSIENT = /503|504|UNAVAILABLE|DEADLINE_EXCEEDED|Deadline expired|overloaded|high demand|fetch failed|Failed to fetch|Load failed|network/i;
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

// One active Gemini-TTS playback at a time; stopNaturalSpeech cancels it.
let activeTts: { ctx: AudioContext; source: AudioBufferSourceNode } | null = null;
export const stopNaturalSpeech = () => {
  if (activeTts) {
    try { activeTts.source.stop(); activeTts.ctx.close(); } catch { /* already stopped */ }
    activeTts = null;
  }
};

/** Natural-sounding TTS for sentences (Gemini voice). Throws when unavailable —
    callers fall back to the browser voice. Resolves when playback ends. */
export const speakNatural = async (text: string): Promise<void> => {
  const ai = getAi();
  const response = await generateWithRetry(ai, {
    model: "gemini-2.5-flash-preview-tts",
    contents: [{ parts: [{ text: `Say this warmly and conversationally, like natural speech: ${text}` }] }],
    config: {
      responseModalities: [Modality.AUDIO],
      speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } } },
    },
  });
  const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  if (!base64Audio) throw new Error("No audio content returned");
  const AudioContextClass = (window as any).AudioContext || (window as any).webkitAudioContext;
  if (!AudioContextClass) return;
  stopNaturalSpeech();
  const ctx = new AudioContextClass({ sampleRate: 24000 });
  const buffer = await decodeAudioData(decode(base64Audio), ctx, 24000, 1);
  await new Promise<void>(resolve => {
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    activeTts = { ctx, source };
    source.onended = () => {
      if (activeTts?.source === source) { try { ctx.close(); } catch { /* noop */ } activeTts = null; }
      resolve();
    };
    source.start();
  });
};

/** Kept for existing call sites; see services/pronunciation.ts. */
export const playPronunciation = async (word: string): Promise<void> => pronounce(word);

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

export const transcribeAudio = async (base64Audio: string, mimeType: string): Promise<string> => {
  // Interactive path: fail fast (15s, one retry) — a learner mid-exercise
  // should see "try again" quickly, never a minute-long spinner.
  const ai = getAi(15000);
  const response = await generateWithRetry(ai, {
    model: AUDIO_MODEL,
    contents: [{
      parts: [
        { inlineData: { data: base64Audio, mimeType } },
        { text: "Transcribe this English speech verbatim. Return ONLY the words actually spoken — no punctuation commentary, no quotes, no explanations. If the audio is silent, unclear, or contains no speech, return an empty string. NEVER invent, guess, or complete content that is not clearly audible." },
      ],
    }],
    config: { thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL }, temperature: 0 },
  }, 2);
  return (response.text || '').trim();
};
