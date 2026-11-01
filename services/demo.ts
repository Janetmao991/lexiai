// Demo mode (?demo=1): a no-sign-up tour for visitors. Everything is served from a bundled
// fixture (demo/fixture.ts) — no Supabase, no Claude, no Gemini — and anything the visitor
// changes lives in this tab's sessionStorage only, so their real notebook (and anyone else's)
// is never touched.
//
// The switch is read once from the URL when the page loads. Entering or leaving demo reloads
// the page, which guarantees no Supabase client or API client from the other mode survives.
import type { DemoFixture } from '../demo/fixture';

export const IS_DEMO = typeof window !== 'undefined'
  && new URLSearchParams(window.location.search).get('demo') === '1';

export const DEMO_NOTE = 'This is a demo — sign up to look up your own words.';

/** Thrown by any feature the demo can't serve; the UI shows its message as a friendly note. */
export class DemoNoteError extends Error {
  readonly demo = true;
  constructor(message = DEMO_NOTE) {
    super(message);
    this.name = 'DemoNoteError';
  }
}
export const isDemoNote = (e: unknown): e is DemoNoteError =>
  e instanceof DemoNoteError || Boolean((e as any)?.demo);

/** Pop a short toast (rendered by App) — e.g. "saved for this session only". */
export const DEMO_NOTE_EVENT = 'lexiai:demo-note';
export const showDemoNote = (message = DEMO_NOTE) =>
  window.dispatchEvent(new CustomEvent(DEMO_NOTE_EVENT, { detail: message }));

// Key–value storage for the demo: this tab only, and namespaced so it can't collide
// with the real app's keys.
const PREFIX = 'lexiai_demo:';
export const demoStore = {
  getItem: (key: string): string | null => {
    try { return sessionStorage.getItem(PREFIX + key); } catch { return null; }
  },
  setItem: (key: string, value: string) => {
    try { sessionStorage.setItem(PREFIX + key, value); } catch { /* full or blocked — memory copy still works */ }
  },
  removeItem: (key: string) => {
    try { sessionStorage.removeItem(PREFIX + key); } catch { /* noop */ }
  },
  clear: () => {
    try {
      Object.keys(sessionStorage).filter(k => k.startsWith(PREFIX)).forEach(k => sessionStorage.removeItem(k));
    } catch { /* noop */ }
  },
};

export const enterDemo = () => {
  demoStore.clear(); // every visit starts from the same tidy notebook
  window.location.assign(`${window.location.pathname}?demo=1`);
};

/** Leave the demo and land on the sign-in (or sign-up) form of the real app. */
export const exitDemo = (to: 'signin' | 'signup' = 'signin') => {
  demoStore.clear();
  window.location.assign(`${window.location.pathname}#${to}`);
};

// The fixture is loaded with a dynamic import, so normal visitors never download it.
let fixture: DemoFixture | null = null;
export const loadDemoFixture = async () => {
  fixture = (await import('../demo/fixture')).buildDemoFixture();
};
export const demoFixture = (): DemoFixture => {
  if (!fixture) throw new Error('Demo fixture not loaded');
  return fixture;
};
