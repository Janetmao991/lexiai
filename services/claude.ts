// Thin wrapper around the Claude API, shared by every text feature.
// Claude handles all the reading/writing work (lookups, feedback, chat);
// Gemini is kept only for audio (transcription + voices) — see geminiService.ts.
import Anthropic from "@anthropic-ai/sdk";

// ---- BYOK: the Claude key lives in this browser only ----
const CLAUDE_KEY_STORAGE = 'lexiai_claude_key';
export const CLAUDE_MODEL_STORAGE = 'lexiai_claude_model';

export const getClaudeKey = (): string =>
  (typeof localStorage !== 'undefined' && localStorage.getItem(CLAUDE_KEY_STORAGE)) || process.env.ANTHROPIC_API_KEY || '';
export const hasClaudeKey = (): boolean => Boolean(getClaudeKey());

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
  opts: CallOpts & { schema?: Schema },
) => {
  const model = getClaudeModel();
  // Opus/Sonnet: if a safety filter wrongly declines (rare), the API re-runs the
  // request on a fallback model instead of failing. Haiku has no fallback.
  const fallback = model.includes('haiku') ? {} : { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' };
  const response = await getClient(opts.timeoutMs ?? 60000).beta.messages.create({
    model,
    max_tokens: opts.maxTokens ?? 8000,
    ...(opts.system ? { system: opts.system } : {}),
    messages,
    output_config: {
      effort: opts.effort ?? 'low',
      ...(opts.schema ? { format: { type: 'json_schema', schema: opts.schema } } : {}),
    },
    ...fallback,
  } as Anthropic.Beta.MessageCreateParamsNonStreaming);
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
