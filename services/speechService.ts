// Speech capture with two strategies:
// 1. MediaRecorder -> Gemini audio transcription: reliable, no silence timeout —
//    preferred whenever an API key is configured (same pipeline as LexiSpeak).
// 2. Web Speech API (Chrome/Edge): free, key-less fallback; Chrome aborts it
//    with `no-speech` after a few silent seconds, so we auto-restart on that.
import { transcribeAudio, hasApiKey, speakNatural, stopNaturalSpeech } from './geminiService';

export type SttStrategy = 'web-speech' | 'gemini-audio';

const SpeechRecognitionImpl: any =
  typeof window !== 'undefined'
    ? (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    : null;

export const sttStrategy = (): SttStrategy =>
  (hasApiKey() || !SpeechRecognitionImpl) ? 'gemini-audio' : 'web-speech';

export interface RecordingHandle {
  stop: () => Promise<string>; // resolves with the final transcript
  cancel: () => void;
}

const recordViaWebSpeech = (): RecordingHandle => {
  const recognition = new SpeechRecognitionImpl();
  recognition.lang = 'en-US';
  recognition.continuous = true;
  recognition.interimResults = false;

  let transcript = '';
  let settled = false;
  let stopping = false;
  let resolveStop: (t: string) => void;
  let rejectStop: (e: Error) => void;
  const done = new Promise<string>((res, rej) => { resolveStop = res; rejectStop = rej; });

  recognition.onresult = (event: any) => {
    for (let i = event.resultIndex; i < event.results.length; i++) {
      if (event.results[i].isFinal) transcript += event.results[i][0].transcript + ' ';
    }
  };
  recognition.onerror = (event: any) => {
    if (settled) return;
    // `no-speech` is Chrome's silence timeout, not a failure — onend restarts us.
    if (event.error === 'no-speech') return;
    settled = true;
    rejectStop(new Error(event.error === 'not-allowed'
      ? 'Microphone access denied. Please allow the microphone and try again.'
      : `Speech recognition error: ${event.error}`));
  };
  recognition.onend = () => {
    if (settled) return;
    if (!stopping) {
      // Keep listening across Chrome's silence timeouts until the user taps stop.
      try { recognition.start(); } catch { /* already running */ }
      return;
    }
    settled = true;
    resolveStop(transcript.trim());
  };
  recognition.start();

  return {
    stop: () => { stopping = true; recognition.stop(); return done; },
    cancel: () => { settled = true; recognition.abort(); },
  };
};

const pickMimeType = (): string => {
  const candidates = ['audio/webm', 'audio/mp4', 'audio/ogg'];
  for (const t of candidates) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(t)) return t;
  }
  return '';
};

const blobToBase64 = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });

const recordViaMediaRecorder = async (): Promise<RecordingHandle> => {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const mimeType = pickMimeType();
  const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
  const chunks: Blob[] = [];
  recorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };
  recorder.start();

  const cleanup = () => stream.getTracks().forEach(t => t.stop());

  return {
    stop: () =>
      new Promise<string>((resolve, reject) => {
        recorder.onstop = async () => {
          cleanup();
          try {
            const blob = new Blob(chunks, { type: recorder.mimeType });
            if (blob.size < 1000) throw new Error('Recording too short. Please try again.');
            const base64 = await blobToBase64(blob);
            resolve(await transcribeAudio(base64, recorder.mimeType));
          } catch (e) {
            reject(e);
          }
        };
        recorder.stop();
      }),
    cancel: () => { recorder.stop(); cleanup(); },
  };
};

export const speechService = {
  strategy: sttStrategy,

  /** Start capturing speech. Call .stop() on the handle to get the transcript. */
  startRecording: async (): Promise<RecordingHandle> => {
    if (sttStrategy() === 'web-speech') return recordViaWebSpeech();
    return recordViaMediaRecorder();
  },

  /** Speak text — Gemini's natural voice when a key is configured, otherwise
      (or on any TTS failure) the browser voice. Resolves when playback ends. */
  speak: async (text: string, rate = 0.92): Promise<void> => {
    if (hasApiKey()) {
      try { await speakNatural(text); return; } catch { /* fall back to the browser voice */ }
    }
    return new Promise(resolve => {
      if (!('speechSynthesis' in window)) return resolve();
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'en-US';
      utterance.rate = rate;
      const voice = window.speechSynthesis.getVoices().find(v => v.lang.startsWith('en') && v.localService) ||
                    window.speechSynthesis.getVoices().find(v => v.lang.startsWith('en'));
      if (voice) utterance.voice = voice;
      utterance.onend = () => resolve();
      utterance.onerror = () => resolve();
      window.speechSynthesis.speak(utterance);
    });
  },

  stopSpeaking: () => {
    stopNaturalSpeech();
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
  },
};

const normalizeToken = (t: string) => t.toLowerCase().replace(/[^a-z0-9']/g, '');

export interface ShadowDiff {
  tokens: { text: string; hit: boolean }[];
  accuracy: number; // 0-100, share of reference words found in the attempt
}

/** Compare a spoken attempt against reference text, word by word. */
export const diffTranscript = (reference: string, attempt: string): ShadowDiff => {
  const refTokens = reference.split(/\s+/).filter(Boolean);
  const attemptSet = new Set(attempt.split(/\s+/).map(normalizeToken).filter(Boolean));
  const tokens = refTokens.map(text => ({
    text,
    hit: attemptSet.has(normalizeToken(text)),
  }));
  const contentTokens = tokens.filter(t => normalizeToken(t.text).length > 0);
  const hits = contentTokens.filter(t => t.hit).length;
  return {
    tokens,
    accuracy: contentTokens.length === 0 ? 0 : Math.round((hits / contentTokens.length) * 100),
  };
};

/** Loose check for the recall game: did the attempt contain the target word/phrase? */
export const containsWord = (attempt: string, word: string): boolean => {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9\s']/g, ' ').replace(/\s+/g, ' ').trim();
  return norm(attempt).includes(norm(word));
};
