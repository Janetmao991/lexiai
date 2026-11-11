// Thin wrapper around the Claude API, shared by every text feature.
// Claude handles all the reading/writing work (lookups, feedback, chat);
// Gemini is kept only for audio (transcription + voices) — see geminiService.ts.
import Anthropic from "@anthropic-ai/sdk";
// Reads JSON that is still being written (closes the open brackets, drops the half-written last value).
import { partialParse } from "@anthropic-ai/sdk/_vendor/partial-json-parser/parser.mjs";
import { IS_DEMO, DemoNoteError } from "./demo";

// ---- BYOK: the Claude key lives in this browser only ----
const CLAUDE_KEY_STORAGE = 'lexiai_claude_key';
export const CLAUDE_MODEL_STORAGE = 'lexiai_claude_model';

export const getClaudeKey = (): string =>
  (typeof localStorage !== 'undefined' && localStorage.getItem(CLAUDE_KEY_STORAGE)) || process.env.ANTHROPIC_API_KEY || '';
// Demo mode answers from its fixture, so it counts as ready (no key banner, normal placeholders).
export const hasClaudeKey = (): boolean => IS_DEMO || Boolean(getClaudeKey());

export const CLAUDE_MODELS = [
  { id: 'claude-opus-5-5', label: 'Claude Opus 5.5', hint: 'Best quality (recommended)' },
  { id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5', hint: 'Faster, about half the cost' },
  { id: 'claude-haiku-5-5', label: 'Claude Haiku 5.5', hint: 'Fastest and cheapest — fine for quick lookups' },
];
export const getClaudeModel = (): string => {
  const saved = typeof localStorage !== 'undefined' ? localStorage.getItem(CLAUDE_MODEL_STORAGE) : null;
  return saved && CLAUDE_MODELS.some(m => m.id === saved) ? saved : CLAUDE_MODELS[0].id;
};

const getClient = (timeoutMs: number) => {
  // Safety net: demo features are served by demoService; anything else stops here, before any request.
  if (IS_DEMO) throw new DemoNoteError();
  const apiKey = getClaudeKey();
  if (!apiKey) throw new Error('No Claude API key configured. Open Settings and paste your key from console.anthropic.com.');
  // "dangerouslyAllowBrowser": the SDK normally refuses to run in a browser because
  // a key in a web page is visible to whoever opens it. Here the key is the learner's
  // own, typed into their own browser (BYOK), so that's the intended setup.
  // maxRetries: the SDK quietly retries overloads, rate limits and network blips.
  return new Anthropic({ apiKey, dangerouslyAllowBrowser: true, timeout: timeoutMs, maxRetries: 2 });
};

// ---- Tiny JSON-schema builders (Claude's structured outputs take plain JSON Schema) ----
export type Schema = Record<string, unknown>;
export const S = {
  str: (): Schema => ({ type: 'string' }),
  num: (): Schema => ({ type: 'number' }),
  bool: (): Schema => ({ type: 'boolean' }),
  arr: (items: Schema): Schema => ({ type: 'array', items }),
  /** `required` defaults to every property. */
  obj: (properties: Record<string, Schema>, required: string[] = Object.keys(properties)): Schema =>
    ({ type: 'object', properties, required, additionalProperties: false }),
};

/** One message part — plain text or an inline image/PDF (base64). */
export type LexiPart = { text: string } | { inlineData: { data: string; mimeType: string } };

export const toClaudeContent = (parts: LexiPart[]): Anthropic.ContentBlockParam[] =>
  parts.map((p): Anthropic.ContentBlockParam => {
    if ('text' in p) return { type: 'text', text: p.text };
    const { data, mimeType } = p.inlineData;
    if (mimeType === 'application/pdf') {
      return { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data } };
    }
    return { type: 'image', source: { type: 'base64', media_type: mimeType as Anthropic.Base64ImageSource['media_type'], data } };
  });

type Effort = 'low' | 'medium' | 'high';
interface CallOpts {
  system?: string;
  effort?: Effort;
  maxTokens?: number;
  timeoutMs?: number;
}

const send = async (
  messages: Anthropic.Beta.BetaMessageParam[],
  opts: CallOpts & { schema?: Schema; onText?: (soFar: string) => void },
) => {
  const model = getClaudeModel();
  // Opus/Sonnet: if a safety filter wrongly declines (rare), the API re-runs the
  // request on a fallback model instead of failing. Haiku has no fallback.
  const fallback = model.includes('haiku') ? {} : { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' };
  const client = getClient(opts.timeoutMs ?? 60000);
  const params = {
    model,
    max_tokens: opts.maxTokens ?? 8000,
    ...(opts.system ? { system: opts.system } : {}),
    messages,
    output_config: {
      effort: opts.effort ?? 'low',
      ...(opts.schema ? { format: { type: 'json_schema', schema: opts.schema } } : {}),
    },
    ...fallback,
  } as Anthropic.Beta.MessageCreateParamsNonStreaming;
  let response: Anthropic.Beta.BetaMessage;
  if (opts.onText) {
    // Streaming: same request, same answer — but the text arrives piece by piece
    // as Claude writes it, so the screen can start filling in right away.
    const stream = client.beta.messages.stream(params);
    stream.on('text', (_delta, soFar) => opts.onText!(soFar));
    response = await stream.finalMessage();
  } else {
    response = await client.beta.messages.create(params);
  }
  if (response.stop_reason === 'refusal') throw new Error('Claude declined to answer that one — try rephrasing.');
  return response.content
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text')
    .map(b => b.text)
    .join('')
    .trim();
};

/** Ask for JSON matching `schema`; returns the parsed object (or null on an empty reply). */
export const claudeJson = async <T>(prompt: string | LexiPart[], schema: Schema, opts: CallOpts = {}): Promise<T | null> => {
  const content = typeof prompt === 'string' ? prompt : toClaudeContent(prompt);
  const text = await send([{ role: 'user', content }], { ...opts, schema });
  return text ? JSON.parse(text) as T : null;
};

/** If the text stops in the middle of a "string", close it — so a half-written sentence
 *  can be shown as it grows instead of popping in whole once it is finished. */
export const closeOpenString = (json: string): string => {
  let inString = false;
  let end = json.length;
  for (let i = 0; i < json.length; i++) {
    if (inString && json[i] === '\\') {
      // An escape is 2 characters (\n, \") or 6 (\u00e9); if it is only half there, stop before it.
      const length = json[i + 1] === 'u' ? 6 : 2;
      if (i + length > json.length) { end = i; break; }
      i += length - 1;
    } else if (json[i] === '"') inString = !inString;
  }
  return inString ? json.slice(0, end) + '"' : json;
};

/** Like claudeJson, but `onPartial` is also called with the unfinished object while Claude
 *  is still writing it — text included, so sentences appear as they are written. */
export const claudeJsonStream = async <T>(
  prompt: string,
  schema: Schema,
  onPartial: (partial: unknown) => void,
  opts: CallOpts = {},
): Promise<T | null> => {
  // Text arrives from the network in uneven bursts (a clump, a pause, another clump).
  // Showing it exactly as it lands looks jerky, so it is played back at an even pace:
  // the screen trails the network by about a third of a second and reveals a few
  // characters every tick — faster when a lot is waiting, never fully stopping while any is.
  const TICK_MS = 30;
  const CATCH_UP_MS = 350;      // how far behind the network the screen is allowed to trail
  const MIN_CHARS_PER_SEC = 90; // slowest pace while there is still text waiting
  let received = '';
  let shown = 0;
  let lastTick = Date.now();
  let drained: (() => void) | undefined;
  const tick = () => {
    const now = Date.now();
    const dt = now - lastTick;
    lastTick = now;
    const waiting = received.length - shown;
    if (waiting <= 0) { drained?.(); return; }
    const step = Math.max(MIN_CHARS_PER_SEC * dt / 1000, waiting * dt / CATCH_UP_MS, 1);
    shown = Math.min(received.length, shown + Math.ceil(step));
    try { onPartial(partialParse(closeOpenString(received.slice(0, shown)))); } catch { /* not parseable yet — wait for more */ }
  };
  const timer = setInterval(tick, TICK_MS);
  try {
    const text = await send([{ role: 'user', content: prompt }], {
      ...opts,
      schema,
      onText: soFar => { received = soFar; },
    });
    // Let the last few words finish appearing instead of snapping to the end
    // (capped, in case the tab is in the background and timers are slowed down).
    if (shown < received.length) {
      await Promise.race([
        new Promise<void>(resolve => { drained = resolve; }),
        new Promise<void>(resolve => setTimeout(resolve, 700)),
      ]);
    }
    return text ? JSON.parse(text) as T : null;
  } finally {
    clearInterval(timer);
  }
};

/** Plain-text reply for a whole conversation. 'model' turns are Claude's own earlier replies. */
export const claudeChat = async (
  history: { role: 'user' | 'model'; parts: LexiPart[] }[],
  opts: CallOpts = {},
): Promise<string> =>
  send(history.map(h => ({ role: h.role === 'model' ? 'assistant' : 'user', content: toClaudeContent(h.parts) })), opts);

/** Turn a raw API error into something a learner can act on. */
export const friendlyError = (raw: string): string => {
  if (/timed? ?out|504|DEADLINE_EXCEEDED|Deadline expired/i.test(raw)) return 'That took too long and timed out — please try again.';
  if (/529|503|overloaded|UNAVAILABLE|high demand/i.test(raw)) return 'The AI service is briefly overloaded — wait a few seconds and try again.';
  if (/429|rate.?limit|RESOURCE_EXHAUSTED|quota/i.test(raw)) return 'Rate limit reached — take a short break and try again in a minute.';
  if (/401|authentication_error|invalid x-api-key/i.test(raw)) return 'Your Claude API key was rejected — check it in Settings.';
  if (/credit balance/i.test(raw)) return 'Your Claude API credit has run out — check console.anthropic.com.';
  if (/API key/i.test(raw)) return raw;
  return raw.length > 140 || raw.includes('{"') ? 'Something went wrong talking to the AI. Please try again.' : raw;
};
