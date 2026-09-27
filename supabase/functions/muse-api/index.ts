// LexiAI → Muse bridge.
//
// A tiny authenticated REST API over the LexiAI `words` table so an external agent
// (Meta Muse, or anything else that can call HTTPS with a bearer token) can read the
// notebook, pull today's due cards and record SM-2 reviews. Runs as a Supabase Edge
// Function next to the data, so nothing needs to be running on the laptop.
//
// Auth: `Authorization: Bearer <MUSE_API_TOKEN>` (or `x-api-key: <MUSE_API_TOKEN>`).
// Deploy with `--no-verify-jwt`; this function does its own auth and always scopes
// every query to the single account named by LEXI_USER_EMAIL / LEXI_USER_ID.
//
// Routes (all JSON):
//   GET  /                 API description (self-documenting for agents)
//   GET  /stats            notebook totals, due count, mastery breakdown, streak/XP
//   GET  /words/due        cards due today            ?limit=20
//   GET  /words/random     random sample              ?n=10
//   GET  /words            list or search             ?q=margin&limit=50&level=1..4
//   GET  /words/{word}     one full entry
//   POST /reviews          { word, rating } or { reviews: [{ word, rating }] }
//                          rating ∈ again | hard | good | easy — applies LexiAI's SM-2

import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";

// ---------- types (mirrors ../../types.ts, kept minimal) ----------
type SrsRating = "again" | "hard" | "good" | "easy";
interface SrsState { interval: number; ease: number; due: string; reps: number; lapses: number }
interface DefinitionDetail { definition: string; gloss?: string; synonyms: string[]; examples: string[]; collocations: string[] }
interface Meaning { partOfSpeech: string; definitions: DefinitionDetail[] }
interface UserContext { sourceTitle: string; targetSentence: string; explanation: string; timestamp: number }
interface WordEntry {
  word: string; ipa: string; meanings: Meaning[]; contexts?: UserContext[]; timestamp: number;
  srs?: SrsState; mastery?: { bestPracticeScore?: number; speakingPassed?: boolean };
  lastModified?: string; syncStatus?: string;
  [k: string]: unknown;
}

// ---------- config ----------
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const API_TOKEN = Deno.env.get("MUSE_API_TOKEN") ?? "";
const USER_EMAIL = (Deno.env.get("LEXI_USER_EMAIL") ?? "").toLowerCase();
const USER_ID_OVERRIDE = Deno.env.get("LEXI_USER_ID") ?? "";
const TZ = Deno.env.get("LEXI_TIMEZONE") ?? "America/Los_Angeles";

const sb: SupabaseClient = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

// ---------- dates (LexiAI uses the user's local calendar day, not UTC) ----------
const localDate = (d: Date): string =>
  new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
const todayStr = () => localDate(new Date());
const daysFromToday = (n: number) => localDate(new Date(Date.now() + n * 86_400_000));

// ---------- SM-2 (verbatim port of services/srsService.ts) ----------
const MIN_EASE = 1.3;
const DEFAULT_EASE = 2.5;
function schedule(current: SrsState | undefined, rating: SrsRating): SrsState {
  const s: SrsState = current ?? { interval: 0, ease: DEFAULT_EASE, due: todayStr(), reps: 0, lapses: 0 };
  if (rating === "again") {
    return { interval: 1, ease: Math.max(MIN_EASE, s.ease - 0.2), due: todayStr(), reps: 0, lapses: s.lapses + 1 };
  }
  let interval: number;
  let ease = s.ease;
  if (s.reps === 0) interval = rating === "easy" ? 3 : 1;
  else if (rating === "hard") { interval = Math.max(1, Math.round(s.interval * 1.2)); ease = Math.max(MIN_EASE, ease - 0.15); }
  else if (rating === "good") interval = Math.max(1, Math.round(s.interval * ease));
  else { interval = Math.max(1, Math.round(s.interval * ease * 1.3)); ease = ease + 0.15; }
  return { interval, ease, due: daysFromToday(interval), reps: s.reps + 1, lapses: s.lapses };
}
const isDue = (e: WordEntry) => !e.srs || e.srs.due <= todayStr();
function masteryLevel(e: WordEntry): 1 | 2 | 3 | 4 {
  const reviewing = (e.srs?.reps ?? 0) >= 3;
  const canWrite = reviewing && (e.mastery?.bestPracticeScore ?? 0) >= 80;
  const canSpeak = canWrite && e.mastery?.speakingPassed === true;
  return canSpeak ? 4 : canWrite ? 3 : reviewing ? 2 : 1;
}
const MASTERY_LABEL = { 1: "Collected", 2: "Reviewing", 3: "Can Write", 4: "Can Speak" } as const;

// ---------- user resolution (cached per isolate) ----------
let cachedUserId: string | null = null;
async function userId(): Promise<string> {
  if (USER_ID_OVERRIDE) return USER_ID_OVERRIDE;
  if (cachedUserId) return cachedUserId;
  if (!USER_EMAIL) throw new HttpError(500, "Server misconfigured: set LEXI_USER_EMAIL or LEXI_USER_ID secret.");
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await sb.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new HttpError(500, `auth lookup failed: ${error.message}`);
    const hit = data.users.find((u) => (u.email ?? "").toLowerCase() === USER_EMAIL);
    if (hit) { cachedUserId = hit.id; return hit.id; }
    if (data.users.length < 200) break;
  }
  throw new HttpError(500, `No Supabase user with email ${USER_EMAIL}.`);
}

// ---------- data access ----------
async function allWords(uid: string): Promise<WordEntry[]> {
  const out: WordEntry[] = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await sb.from("words").select("word, data").eq("user_id", uid).order("word").range(from, from + PAGE - 1);
    if (error) throw new HttpError(500, error.message);
    for (const row of data ?? []) out.push({ ...(row.data as WordEntry), word: (row.data as WordEntry).word ?? row.word });
    if (!data || data.length < PAGE) break;
  }
  return out;
}
async function oneWord(uid: string, word: string): Promise<{ key: string; entry: WordEntry } | null> {
  // Exact key first, then case-insensitive.
  const exact = await sb.from("words").select("word, data").eq("user_id", uid).eq("word", word).maybeSingle();
  if (exact.error) throw new HttpError(500, exact.error.message);
  if (exact.data) return { key: exact.data.word, entry: exact.data.data as WordEntry };
  const loose = await sb.from("words").select("word, data").eq("user_id", uid).ilike("word", word).limit(1);
  if (loose.error) throw new HttpError(500, loose.error.message);
  const row = loose.data?.[0];
  return row ? { key: row.word, entry: row.data as WordEntry } : null;
}

// ---------- shaping ----------
function compact(e: WordEntry) {
  const m = e.meanings?.[0];
  const d = m?.definitions?.[0];
  return {
    word: e.word,
    ipa: e.ipa ?? null,
    partOfSpeech: m?.partOfSpeech ?? null,
    definition: d?.definition ?? null,
    gloss: d?.gloss ?? null,
    example: d?.examples?.[0] ?? null,
    collocations: (d?.collocations ?? []).slice(0, 4),
    synonyms: (d?.synonyms ?? []).slice(0, 4),
    otherSenses: (e.meanings ?? []).slice(1).map((mm) => ({ partOfSpeech: mm.partOfSpeech, definition: mm.definitions?.[0]?.definition ?? null })),
    myContexts: (e.contexts ?? []).slice(0, 2).map((c) => ({ source: c.sourceTitle, sentence: c.targetSentence })),
    mastery: { level: masteryLevel(e), label: MASTERY_LABEL[masteryLevel(e)] },
    srs: e.srs ?? null,
    dueToday: isDue(e),
    savedAt: e.timestamp ? new Date(e.timestamp).toISOString().slice(0, 10) : null,
  };
}

// ---------- http plumbing ----------
class HttpError extends Error { constructor(public status: number, msg: string) { super(msg); } }
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body, null, 2), { status, headers: { "content-type": "application/json; charset=utf-8" } });

function authorized(req: Request): boolean {
  if (!API_TOKEN) return false;
  const h = req.headers.get("authorization") ?? "";
  const bearer = h.toLowerCase().startsWith("bearer ") ? h.slice(7).trim() : "";
  const key = req.headers.get("x-api-key") ?? "";
  const presented = bearer || key;
  if (presented.length !== API_TOKEN.length) return false;
  let diff = 0;
  for (let i = 0; i < presented.length; i++) diff |= presented.charCodeAt(i) ^ API_TOKEN.charCodeAt(i);
  return diff === 0;
}

const API_DOC = {
  name: "LexiAI Notebook API",
  version: "1.0",
  description:
    "Read-and-review access to one learner's LexiAI vocabulary notebook (advanced English, finance-flavoured contexts). " +
    "Words carry IPA, definitions, examples, collocations, the learner's own reading contexts, a mastery level (1 Collected → 4 Can Speak) " +
    "and SM-2 spaced-repetition state. Use GET /words/due each morning to fetch what to drill, quiz the learner, then POST /reviews with " +
    "their self-rating so LexiAI's schedule stays in sync across devices.",
  auth: "Send `Authorization: Bearer <token>` (or `x-api-key: <token>`) on every request.",
  timezone: TZ,
  endpoints: [
    { method: "GET", path: "/stats", returns: "totals, dueToday, byMastery, streak, xp" },
    { method: "GET", path: "/words/due", query: { limit: "max cards (default 20)" }, returns: "compact cards due today, hardest (most lapses, lowest ease) first" },
    { method: "GET", path: "/words/random", query: { n: "sample size (default 10)", level: "optional mastery level 1-4" }, returns: "random compact cards" },
    { method: "GET", path: "/words", query: { q: "substring search in word/definition/collocations", level: "1-4", limit: "default 50" }, returns: "compact cards" },
    { method: "GET", path: "/words/{word}", returns: "full raw LexiAI entry for one word (case-insensitive)" },
    { method: "POST", path: "/reviews", body: { word: "string", rating: "again | hard | good | easy" }, alsoAccepts: { reviews: "[{ word, rating }] for a batch" }, returns: "updated srs per word; 'again' = forgot, 'hard' = barely, 'good' = recalled, 'easy' = instant" },
  ],
  ratingGuide: "again: could not recall meaning. hard: recalled with effort or partially. good: recalled correctly. easy: instant, trivially known.",
};

function shuffle<T>(a: T[]): T[] { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
const clampInt = (v: string | null, def: number, max: number) => { const n = parseInt(v ?? "", 10); return Number.isFinite(n) && n > 0 ? Math.min(n, max) : def; };

Deno.serve(async (req) => {
  try {
    const url = new URL(req.url);
    // Path arrives as /muse-api/<route>; drop the function-name segment.
    const parts = url.pathname.split("/").filter(Boolean);
    if (parts[0] === "muse-api") parts.shift();
    const route = "/" + parts.join("/");

    if (route === "/" && req.method === "GET") return json(API_DOC);
    if (!authorized(req)) return json({ error: "unauthorized" }, 401);

    const uid = await userId();

    if (req.method === "GET" && route === "/stats") {
      const words = await allWords(uid);
      const byMastery: Record<string, number> = { "1 Collected": 0, "2 Reviewing": 0, "3 Can Write": 0, "4 Can Speak": 0 };
      for (const w of words) byMastery[`${masteryLevel(w)} ${MASTERY_LABEL[masteryLevel(w)]}`]++;
      const stats = await sb.from("user_stats").select("data").eq("user_id", uid).maybeSingle();
      const s = (stats.data?.data ?? {}) as Record<string, unknown>;
      return json({
        today: todayStr(),
        totalWords: words.length,
        dueToday: words.filter(isDue).length,
        neverReviewed: words.filter((w) => !w.srs).length,
        byMastery,
        streakCurrent: s.streakCurrent ?? 0,
        streakBest: s.streakBest ?? 0,
        xp: s.xp ?? 0,
        lastActiveDate: s.lastActiveDate ?? null,
      });
    }

    if (req.method === "GET" && route === "/words/due") {
      const limit = clampInt(url.searchParams.get("limit"), 20, 200);
      const due = (await allWords(uid)).filter(isDue).sort((a, b) =>
        (b.srs?.lapses ?? 0) - (a.srs?.lapses ?? 0) || (a.srs?.ease ?? DEFAULT_EASE) - (b.srs?.ease ?? DEFAULT_EASE) || (a.srs?.due ?? "").localeCompare(b.srs?.due ?? ""));
      return json({ today: todayStr(), dueCount: due.length, returned: Math.min(limit, due.length), words: due.slice(0, limit).map(compact) });
    }

    if (req.method === "GET" && route === "/words/random") {
      const n = clampInt(url.searchParams.get("n"), 10, 100);
      const level = url.searchParams.get("level");
      let pool = await allWords(uid);
      if (level) pool = pool.filter((w) => String(masteryLevel(w)) === level);
      return json({ total: pool.length, words: shuffle(pool).slice(0, n).map(compact) });
    }

    if (req.method === "GET" && route === "/words") {
      const q = (url.searchParams.get("q") ?? "").toLowerCase().trim();
      const level = url.searchParams.get("level");
      const limit = clampInt(url.searchParams.get("limit"), 50, 500);
      let pool = await allWords(uid);
      if (level) pool = pool.filter((w) => String(masteryLevel(w)) === level);
      if (q) pool = pool.filter((w) => JSON.stringify([w.word, w.meanings]).toLowerCase().includes(q));
      return json({ total: pool.length, returned: Math.min(limit, pool.length), words: pool.slice(0, limit).map(compact) });
    }

    if (req.method === "GET" && parts[0] === "words" && parts.length === 2) {
      const hit = await oneWord(uid, decodeURIComponent(parts[1]));
      if (!hit) return json({ error: `'${parts[1]}' is not in the notebook` }, 404);
      return json({ ...hit.entry, mastery: { ...(hit.entry.mastery ?? {}), level: masteryLevel(hit.entry), label: MASTERY_LABEL[masteryLevel(hit.entry)] }, dueToday: isDue(hit.entry) });
    }

    if (req.method === "POST" && route === "/reviews") {
      let body: unknown;
      try { body = await req.json(); } catch { return json({ error: "body must be JSON" }, 400); }
      const b = body as { word?: string; rating?: string; reviews?: { word: string; rating: string }[] };
      const items = Array.isArray(b.reviews) ? b.reviews : b.word ? [{ word: b.word, rating: b.rating ?? "" }] : [];
      if (!items.length) return json({ error: "provide { word, rating } or { reviews: [...] }" }, 400);
      if (items.length > 100) return json({ error: "max 100 reviews per call" }, 400);
      const results = [];
      for (const it of items) {
        const rating = String(it.rating ?? "").toLowerCase() as SrsRating;
        if (!["again", "hard", "good", "easy"].includes(rating)) { results.push({ word: it.word, ok: false, error: "rating must be again|hard|good|easy" }); continue; }
        const hit = await oneWord(uid, String(it.word ?? ""));
        if (!hit) { results.push({ word: it.word, ok: false, error: "not in notebook" }); continue; }
        const srs = schedule(hit.entry.srs, rating);
        const now = new Date().toISOString();
        // lastModified makes LexiAI's newer-wins merge pick this up on the next device sync.
        const updated: WordEntry = { ...hit.entry, srs, lastModified: now, syncStatus: "synced" };
        const { error } = await sb.from("words").upsert({ user_id: uid, word: hit.key, data: updated, updated_at: now });
        if (error) { results.push({ word: hit.key, ok: false, error: error.message }); continue; }
        results.push({ word: hit.key, ok: true, rating, srs, mastery: MASTERY_LABEL[masteryLevel(updated)] });
      }
      return json({ today: todayStr(), reviewed: results.filter((r) => r.ok).length, results });
    }

    return json({ error: `no route ${req.method} ${route}`, see: "GET / for the API description" }, 404);
  } catch (e) {
    if (e instanceof HttpError) return json({ error: e.message }, e.status);
    console.error(e);
    return json({ error: (e as Error).message ?? "internal error" }, 500);
  }
});
