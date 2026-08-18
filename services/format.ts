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
