// Word pronunciation that answers the tap immediately.
//
// The audio URL is built from the word alone, so playback starts inside the click handler —
// iOS Safari only lets audio start during the user's gesture, which an async round-trip
// (the old on-demand Gemini TTS) would miss, leaving the button silent. Source: Youdao's
// dictionary voice (US accent, words and phrases). If it fails to load, the browser's own
// speech synthesis speaks the word instead.

const voiceUrl = (word: string) =>
  `https://dict.youdao.com/dictvoice?type=2&audio=${encodeURIComponent(word.trim())}`;

const players = new Map<string, HTMLAudioElement>();

const playerFor = (word: string): HTMLAudioElement => {
  const key = word.trim().toLowerCase();
  let a = players.get(key);
  if (!a) {
    a = new Audio(voiceUrl(key));
    a.preload = 'auto';
    players.set(key, a);
  }
  return a;
};

const speakWithBrowser = (word: string) => {
  if (!('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(word);
  u.lang = 'en-US';
  u.rate = 0.9;
  window.speechSynthesis.speak(u);
};

/** Warm the audio for a word that is about to be shown, so the first tap plays instantly. */
export const preparePronunciation = (word: string) => {
  if (word.trim()) playerFor(word);
};

export const pronounce = (word: string): void => {
  if (!word.trim()) return;
  const a = playerFor(word);
  a.currentTime = 0;
  a.play().catch(() => {
    players.delete(word.trim().toLowerCase());
    speakWithBrowser(word);
  });
};
