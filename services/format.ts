/** Display helpers for dictionary data. */

/** The model returns a transcription sometimes bare ("ˈmɑːrdʒɪn"), sometimes
    already wrapped ("/ˈmɑːrdʒɪn/", occasionally "[…]"). Every view adds its own
    slashes, so strip the outer delimiters here — otherwise it renders as "//…//".
    Inner slashes (a two-pronunciation entry) are left alone. */
export const formatIpa = (raw?: string): string =>
  (raw || '')
    .trim()
    .replace(/^[\/\[\|]+/, '')
    .replace(/[\/\]\|]+$/, '')
    .trim();

/** Ready-to-render transcription — "/ˈmɑːrdʒɪn/", or `fallback` when there is none. */
export const ipaLabel = (raw?: string, fallback = ''): string => {
  const ipa = formatIpa(raw);
  return ipa ? `/${ipa}/` : fallback;
};

const ROMAN = ['i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii', 'ix', 'x', 'xi', 'xii', 'xiii', 'xiv', 'xv'];

/**
 * A sense's number across the whole entry, not restarted under each word class — so
 * "verb (business)" i. and "verb" i. become i. and ii., and a "Sense ii" tag points to one place.
 */
export const senseLabel = (entry: { meanings: { definitions: unknown[] }[] }, meaning: number, definition: number): string => {
  const n = entry.meanings.slice(0, meaning).reduce((sum, m) => sum + m.definitions.length, 0) + definition;
  return ROMAN[n] ?? String(n + 1);
};
