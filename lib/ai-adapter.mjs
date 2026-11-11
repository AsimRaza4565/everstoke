// #104 Phase 2 BYOK vault v2 (Task 5, spec D4/D5, AC-P2-4) — the universal AI
// adapter. One entry point for every AI spend in the pipeline:
//
//   routeAndCall(capability, { slug, jobId, prompt|text|..., injected })
//     1. resolve the ordered provider list for the capability (Task 3
//        routing: channel override -> workspace default). Empty -> catalog
//        baseline order (source 'baseline') — Phase-1 semantics preserved
//        (zero-config = today's behavior).
//     2. apply the channel's vault keys into env via applyChannelKeys
//        (capability-filtered, D3). Real path mutates process.env exactly
//        like the current pipeline boot; tests inject the seam.
//     3. call each provider in order via its adapter — first success wins,
//        every failure falls through to the next provider. FAIL-CONTINUE:
//        routeAndCall NEVER throws past the API boundary; total failure
//        resolves { ok:false, attempts, error } (script-brain chain
//        semantics; the Oct 21-23 P0 "one dead dependency halts everything"
//        class stays dead).
//     4. write one usage_events row per ACTUAL call attempt via the injected
//        writer (skipped providers make no call and write no event —
//        AC-P2-4 scopes the ledger to calls).
//
// usage_events (spec D5): id, job_id, channel_id, provider, model,
// capability, tokens int, usage_source ('measured'|'estimated'), ok bool,
// error_class, created_at. Tokens are measured from the provider's in-response
// usage field when it reports one (gemini usageMetadata.totalTokenCount,
// OpenAI-compatible usage.total_tokens), else estimated via chars/4 with the
// flag set — the cost dashboard (Task 7) reads the ledger, not the providers.
//
// Keys never leak (AC-P2-9): only status codes, coarse error classes and
// redacted details reach logs or the ledger — no URLs (the Gemini/Tavily key
// rides in the query string), no Authorization headers, no response bodies.
//
// Production callers (wired in Task 6): yt-deepdive.mjs doc chain and
// youtube-engine.mjs Shorts script brain. Engine knowledge, not brand data
// (no-static-maps): provider specifics come from the catalog, endpoint
// wiring only lives here.
import { execFile as execFileCb } from 'node:child_process';
import fs from 'node:fs';
import { applyChannelKeys } from './channel-keys.mjs';
import { PROVIDERS, capabilityProviders, CAPABILITY_BASELINE } from '../studio/lib/provider-catalog.js';
import { getProviderRouting, adaptPostgres } from '../studio/lib/provider-routing.js';

// OpenAI-compatible chat-completions providers (D4: one client, any base URL).
const OPENAI_COMPAT = new Set(['groq', 'cerebras', 'mistral', 'hf', 'openrouter', 'cloudflare', 'openai']);

// Env a provider's endpoint needs BEYOND the catalog envVars (endpoint
// wiring, not brand data). Cloudflare keeps its env-gated form (D4) until
// the owner adds CF keys.
const EXTRA_ENV = { cloudflare: ['CLOUDFLARE_ACCOUNT_ID'] };

// max_tokens per provider — research-dated (research/free-doc-script-apis-
// 2026-10-28): groq gpt-oss-120b is a reasoning model whose hidden budget
// otherwise eats the JSON (16000 + low effort); the CF endpoint DEFAULTS TO
// 256, so it must always be explicit.
const MAX_TOKENS = { groq: 16000, cloudflare: 8000 };
const DEFAULT_MAX_TOKENS = 8000;

const DEFAULT_EDGE_VOICE = 'en-US-ChristopherNeural';

// Capability-pinned model lanes (fix round 1, review Critical 1): ONE
// provider can serve several capabilities with DIFFERENT model families —
// openai's catalog models[0] is the TTS id, so per-lane pinning IN THE
// ADAPTER decides which model id each capability lane sends (a single
// models[0] pick sent the TTS model to /audio/transcriptions and to
// chat/completions — a doomed paid call per attempt). Every pinned id is
// catalog-grounded (D9; pinned by tests/ai-adapter.test.mjs).
const PINNED_MODELS = {
  openai: { tts: 'gpt-4o-mini-tts', captions: 'whisper-1', 'script-gen': 'gpt-4o-mini' },
  groq: { captions: 'whisper-large-v3' }, // catalog notes: whisper-large-v3 doubles as hosted transcription
};

// Per (provider, capability) model selection: explicit options.model wins,
// then the pinned lane model, then the catalog default (models[0]).
function modelFor(providerId, capability, opts) {
  if (isNonEmptyString(opts.model)) return opts.model;
  return PINNED_MODELS[providerId]?.[capability] || PROVIDERS[providerId]?.models?.[0] || null;
}

function isNonEmptyString(v) {
  return typeof v === 'string' && v.length > 0;
}

// Redact anything key-shaped from a detail string before it reaches a log
// line or the ledger (AC-P2-9; the Gemini key rides in the URL query).
function redactSecrets(s) {
  return String(s ?? '')
    .replace(/([?&]key=)[^&\s"']+/gi, '$1REDACTED')
    .replace(/([?&]api[-_]key=)[^&\s"']+/gi, '$1REDACTED')
    .replace(/(Bearer\s+)[A-Za-z0-9._\-]+/gi, '$1REDACTED')
    .replace(/(xi-api-key['"]?\s*[:=]\s*['"])[^'"]+/gi, '$1REDACTED');
}

function redactedError(e) {
  return redactSecrets(String(e && e.message ? e.message : e)).slice(0, 140);
}

// Estimated tokens = (input chars + output chars) / 4, rounded up. Used only
// when the provider does not report usage in-response (flag 'estimated').
function estimateTokens(input, content) {
  const inLen = isNonEmptyString(input) ? input.length : 0;
  let outLen = 0;
  if (typeof content === 'string') outLen = content.length;
  else if (Buffer.isBuffer(content)) outLen = content.length;
  else if (content != null && typeof content === 'object') outLen = JSON.stringify(content).length;
  else if (content != null) outLen = String(content).length;
  return Math.max(1, Math.ceil((inLen + outLen) / 4));
}

// Provider availability: every catalog envVar (+ endpoint extras) present
// and non-empty. envVars [] = free-local lane (edge-tts-local /
// whisper-local) — always available, that is what makes the baseline true.
function envAvailable(providerId, env) {
  const required = [...(PROVIDERS[providerId]?.envVars || []), ...(EXTRA_ENV[providerId] || [])];
  if (required.length === 0) return true;
  return required.every((name) => isNonEmptyString(env[name]));
}

function keyFor(providerId, env) {
  for (const name of PROVIDERS[providerId]?.envVars || []) {
    if (isNonEmptyString(env[name])) return env[name];
  }
  return '';
}

// Caller-supplied content validated per capability: script-gen needs text,
// tts needs bytes, captions needs srt text, search needs a parsed object.
function validContent(capability, content) {
  if (capability === 'tts') return content != null && (Buffer.isBuffer(content) ? content.length > 0 : String(content).length > 0);
  if (capability === 'search') return content != null && typeof content === 'object';
  return isNonEmptyString(String(content ?? '').trim());
}

// ---------------------------------------------------------------------------
// Provider adapters (endpoint wiring only — every provider id, base URL,
// env var and model id comes from the catalog).
// ---------------------------------------------------------------------------

// Gemini native generateContent (JSON mode, thinkingBudget 0 so the full
// script JSON fits one call — same config the doc chain validated #102).
async function callGemini(ctx) {
  const key = keyFor('gemini', ctx.env);
  const res = await ctx.fetchImpl(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(ctx.model)}:generateContent?key=${encodeURIComponent(key)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(45000),
      body: JSON.stringify({
        contents: [{ parts: [{ text: ctx.input }] }],
        generationConfig: {
          temperature: 0.85,
          responseMimeType: 'application/json',
          maxOutputTokens: 16384,
          thinkingConfig: { thinkingBudget: 0 },
        },
      }),
    },
  );
  if (!res.ok) return { errorClass: 'http_error', detail: `HTTP ${res.status}` };
  const j = await res.json().catch(() => null);
  if (!j) return { errorClass: 'parse_error', detail: 'invalid JSON response' };
  const measured = typeof j.usageMetadata?.totalTokenCount === 'number' ? j.usageMetadata.totalTokenCount : null;
  return { content: j.candidates?.[0]?.content?.parts?.[0]?.text || '', measured };
}

// One OpenAI-compatible client for groq/cerebras/mistral/hf/openrouter/
// cloudflare/openai — base URL from the catalog; CF is account-scoped.
async function callOpenAiCompat(providerId, ctx) {
  const p = PROVIDERS[providerId];
  const base = providerId === 'cloudflare'
    ? `${p.baseUrl}/accounts/${ctx.env.CLOUDFLARE_ACCOUNT_ID}/ai/v1`
    : p.baseUrl;
  const body = {
    model: ctx.model,
    messages: [{ role: 'user', content: ctx.input }],
    temperature: 0.85,
    max_tokens: MAX_TOKENS[providerId] || DEFAULT_MAX_TOKENS,
  };
  if (providerId === 'groq') body.reasoning_effort = 'low';
  const res = await ctx.fetchImpl(`${base}/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${keyFor(providerId, ctx.env)}`, 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(45000),
    body: JSON.stringify(body),
  });
  if (!res.ok) return { errorClass: 'http_error', detail: `HTTP ${res.status}` };
  const j = await res.json().catch(() => null);
  if (!j) return { errorClass: 'parse_error', detail: 'invalid JSON response' };
  const measured = typeof j.usage?.total_tokens === 'number' ? j.usage.total_tokens : null;
  return { content: j.choices?.[0]?.message?.content || '', measured };
}

async function callElevenlabsTts(ctx) {
  const res = await ctx.fetchImpl(`${PROVIDERS.elevenlabs.baseUrl}/text-to-speech/${encodeURIComponent(ctx.options.voice)}`, {
    method: 'POST',
    headers: { 'xi-api-key': keyFor('elevenlabs', ctx.env), 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: ctx.input, model_id: ctx.model }),
  });
  if (!res.ok) return { errorClass: 'http_error', detail: `HTTP ${res.status}` };
  return { content: Buffer.from(await res.arrayBuffer()), measured: null };
}

async function callOpenAiTts(ctx) {
  const res = await ctx.fetchImpl(`${PROVIDERS.openai.baseUrl}/audio/speech`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${keyFor('openai', ctx.env)}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: ctx.model, voice: ctx.options.voice, input: ctx.input, response_format: 'mp3' }),
  });
  if (!res.ok) return { errorClass: 'http_error', detail: `HTTP ${res.status}` };
  return { content: Buffer.from(await res.arrayBuffer()), measured: null };
}

// OpenAI-compatible transcription lane (openai whisper-1, groq
// whisper-large-v3 — base URL + bearer key from the catalog), SRT out.
async function callOpenAiTranscribe(providerId, ctx) {
  const fd = new FormData();
  fd.append('file', new File([fs.readFileSync(ctx.options.audioPath)], 'audio'));
  fd.append('model', ctx.model); // pinned per provider (whisper-1 / whisper-large-v3)
  fd.append('response_format', 'srt');
  const res = await ctx.fetchImpl(`${PROVIDERS[providerId].baseUrl}/audio/transcriptions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${keyFor(providerId, ctx.env)}` },
    body: fd,
  });
  if (!res.ok) return { errorClass: 'http_error', detail: `HTTP ${res.status}` };
  return { content: await res.text(), measured: null };
}

async function callTavily(ctx) {
  const res = await ctx.fetchImpl(`${PROVIDERS.tavily.baseUrl}/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ api_key: keyFor('tavily', ctx.env), query: ctx.input, max_results: ctx.options.maxResults || 5 }),
  });
  if (!res.ok) return { errorClass: 'http_error', detail: `HTTP ${res.status}` };
  const j = await res.json().catch(() => null);
  if (!j) return { errorClass: 'parse_error', detail: 'invalid JSON response' };
  return { content: j, measured: null };
}

async function callSerper(ctx) {
  const res = await ctx.fetchImpl(`${PROVIDERS.serper.baseUrl}/search`, {
    method: 'POST',
    headers: { 'X-API-KEY': keyFor('serper', ctx.env), 'Content-Type': 'application/json' },
    body: JSON.stringify({ q: ctx.input }),
  });
  if (!res.ok) return { errorClass: 'http_error', detail: `HTTP ${res.status}` };
  const j = await res.json().catch(() => null);
  if (!j) return { errorClass: 'parse_error', detail: 'invalid JSON response' };
  return { content: j, measured: null };
}

// Free-local baseline TTS lane (edge-tts CLI). Voice defaults to a valid
// Edge voice so the zero-config baseline actually runs.
async function callEdgeTtsLocal(ctx) {
  const voice = isNonEmptyString(ctx.options.voice) ? ctx.options.voice : DEFAULT_EDGE_VOICE;
  try {
    await ctx.spawnImpl('edge-tts', ['--voice', voice, '--text', String(ctx.input), '--write-media', ctx.options.outPath]);
    return { content: fs.readFileSync(ctx.options.outPath), measured: null };
  } catch (e) {
    return { errorClass: 'spawn_error', detail: redactedError(e) };
  }
}

// Free-local baseline captions lane (whisper.cpp family; bin/args overridable
// — E2E pins the live CLI shape). Default invocation emits SRT at
// `${outPath}.srt`.
async function callWhisperLocal(ctx) {
  const bin = isNonEmptyString(ctx.options.whisperBin) ? ctx.options.whisperBin : 'whisper-cli';
  const args = ctx.options.whisperArgs || [
    '-m', isNonEmptyString(ctx.options.whisperModelPath) ? ctx.options.whisperModelPath : ctx.model,
    '-f', ctx.options.audioPath,
    '-osrt', '-of', ctx.options.outPath,
  ];
  try {
    await ctx.spawnImpl(bin, args);
    return { content: fs.readFileSync(`${ctx.options.outPath}.srt`, 'utf8'), measured: null };
  } catch (e) {
    return { errorClass: 'spawn_error', detail: redactedError(e) };
  }
}

function execFileP(cmd, args) {
  return new Promise((resolve, reject) => {
    execFileCb(cmd, args, { encoding: 'utf8', timeout: 180000 }, (err, stdout, stderr) => {
      if (err) {
        err.message = `${err.message}${stderr ? ` :: ${redactSecrets(String(stderr)).slice(0, 120)}` : ''}`;
        reject(err);
      } else {
        resolve({ stdout, stderr });
      }
    });
  });
}

// Capability-aware dispatch. Null = NO adapter lane for the pair — the
// provider is skipped ('no_adapter') instead of making a doomed call
// (gemini routed to tts must not receive a generateContent TTS request).
function dispatchFor(providerId, capability) {
  if (providerId === 'gemini') return capability === 'script-gen' ? callGemini : null;
  if (providerId === 'elevenlabs') return capability === 'tts' ? callElevenlabsTts : null;
  if (providerId === 'tavily') return capability === 'search' ? callTavily : null;
  if (providerId === 'serper') return capability === 'search' ? callSerper : null;
  if (providerId === 'edge-tts-local') return capability === 'tts' ? callEdgeTtsLocal : null;
  if (providerId === 'whisper-local') return capability === 'captions' ? callWhisperLocal : null;
  if (OPENAI_COMPAT.has(providerId)) {
    if (capability === 'script-gen') return (ctx) => callOpenAiCompat(providerId, ctx);
    if (capability === 'tts') return providerId === 'openai' ? callOpenAiTts : null; // hosted tts lane is openai's
    // transcription lane only where a transcript model is pinned (openai, groq)
    if (capability === 'captions') return PINNED_MODELS[providerId]?.captions ? (ctx) => callOpenAiTranscribe(providerId, ctx) : null;
    return null;
  }
  return null;
}

// Pre-call preconditions. Anything here SKIPS the provider without a call —
// no usage event (AC-P2-4 scopes events to calls), attempt recorded.
function skipReason(providerId, capability, options, env, model) {
  const p = PROVIDERS[providerId];
  if (!p) return ['unknown_provider', 'routed provider id is not in the catalog'];
  if (!dispatchFor(providerId, capability)) return ['no_adapter', 'no adapter lane for this provider/capability pair'];
  if (!envAvailable(providerId, env)) return ['not_configured', 'required env vars absent'];
  // Only model-backed lanes need a model id (chat/generateContent, hosted
  // tts/transcription). tavily/serper are key-only endpoints and the local
  // CLI lanes are modelless by design — their catalog models[] is [].
  const needsModel = (p.models?.length || 0) > 0 || OPENAI_COMPAT.has(providerId);
  if (!model && needsModel) return ['no_model', 'catalog lists no model id and no options.model override'];
  if (capability === 'captions') {
    if (!isNonEmptyString(options.audioPath)) return ['audio_path_missing', 'options.audioPath is required for captions'];
    if (providerId === 'whisper-local' && !isNonEmptyString(options.outPath)) {
      return ['out_path_missing', 'options.outPath is required for the local captions lane'];
    }
  } else if (!isNonEmptyString(capability === 'tts' ? (options.text ?? options.prompt) : (options.prompt ?? options.text))) {
    return ['input_missing', 'no prompt/text provided'];
  }
  if (capability === 'tts' && (providerId === 'elevenlabs' || providerId === 'openai') && !isNonEmptyString(options.voice)) {
    return ['voice_missing', 'options.voice is required for hosted tts'];
  }
  if (capability === 'tts' && providerId === 'edge-tts-local' && !isNonEmptyString(options.outPath)) {
    return ['out_path_missing', 'options.outPath is required for the local tts lane'];
  }
  return null;
}

// ---------------------------------------------------------------------------
// Usage ledger (spec D5) — same positional client contract as
// provider-routing.js (client(sqlText, params) -> rows).
// ---------------------------------------------------------------------------

/**
 * Usage-events writer over an injected db client. Never throws — callers
 * get { ok: true } | { ok: false, error } on every path (a ledger outage
 * must never fail generation; ntfy-alert never-throw pattern).
 * @param {(sqlText: string, params: any[]) => Promise<any[]>} dbClient
 * @returns {{ ensureUsageSchema: () => Promise<{ok: boolean, error?: string}>, writeUsageEvent: (event: object) => Promise<{ok: boolean, id?: any, error?: string}> }}
 */
export function makeUsageWriter(dbClient) {
  if (typeof dbClient !== 'function') {
    throw new TypeError('makeUsageWriter: dbClient must be a function (sqlText, params) -> Promise<rows>');
  }

  async function ensureUsageSchema() {
    try {
      await dbClient(`CREATE TABLE IF NOT EXISTS usage_events (
        id bigserial PRIMARY KEY,
        job_id TEXT,
        channel_id TEXT,
        provider TEXT NOT NULL,
        model TEXT,
        capability TEXT NOT NULL,
        tokens INTEGER NOT NULL DEFAULT 0,
        usage_source TEXT NOT NULL DEFAULT 'estimated',
        ok BOOLEAN NOT NULL DEFAULT true,
        error_class TEXT,
        created_at timestamptz NOT NULL DEFAULT now()
      )`, []);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: redactedError(e).slice(0, 200) };
    }
  }

  async function writeUsageEvent(event) {
    try {
      if (!isNonEmptyString(event?.provider) || !isNonEmptyString(event?.capability)) {
        return { ok: false, error: 'provider_and_capability_required' };
      }
      const tokens = Math.max(0, Math.trunc(Number(event.tokens) || 0));
      const rows = await dbClient(
        `INSERT INTO usage_events (job_id, channel_id, provider, model, capability, tokens, usage_source, ok, error_class)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          event.job_id ?? null,
          event.channel_id ?? null,
          event.provider,
          event.model ?? null,
          event.capability,
          tokens,
          event.usage_source === 'measured' ? 'measured' : 'estimated',
          event.ok !== false,
          event.error_class ?? null,
        ],
      );
      return { ok: true, id: rows?.[0]?.id ?? null };
    } catch (e) {
      return { ok: false, error: redactedError(e).slice(0, 200) };
    }
  }

  return { ensureUsageSchema, writeUsageEvent };
}

// Real-path writer: lazily built over studio/lib/db.mjs (same lazy-import
// seam as getProviderRouting), memoized per process. Null -> events are
// skipped with ONE log line — a missing DATABASE_URL must not halt the run
// (template-preflight FIX ROUND 1 operating rule).
let defaultWriterPromise = null;
let ledgerWarned = false;
function logLedgerSkipOnce() {
  if (ledgerWarned) return;
  ledgerWarned = true;
  console.log('[ai-adapter] usage ledger unavailable (no DATABASE_URL / schema failed) — usage events skipped');
}
async function getDefaultWriter() {
  if (!defaultWriterPromise) {
    defaultWriterPromise = (async () => {
      try {
        const { db, dbReady } = await import('../studio/lib/db.mjs');
        if (!dbReady || !db) return null;
        const writer = makeUsageWriter(adaptPostgres(db));
        const ensured = await writer.ensureUsageSchema();
        return ensured.ok ? writer : null;
      } catch {
        return null;
      }
    })();
  }
  const writer = await defaultWriterPromise;
  if (!writer) logLedgerSkipOnce();
  return writer;
}

// ---------------------------------------------------------------------------
// capabilityMapFromProviders — the preflight consumer's boolean map
// (baseline || resolved-provider-presence; vault is add-only, same ruling
// as template-preflight.capabilityMapFromAppliedProviders but sourced from
// the ROUTED provider list rather than the applied-keys list).
// ---------------------------------------------------------------------------

/**
 * Boolean capability map for Task 6's preflight wiring: CAPABILITY_BASELINE
 * truth refined add-only by the capabilities covered by the resolved
 * providers. Accepts bare provider ids or route objects ({providerId}).
 * @param {Array<string | {providerId: string}>} resolvedList
 * @returns {Record<string, boolean>}
 */
export function capabilityMapFromProviders(resolvedList) {
  const ids = (Array.isArray(resolvedList) ? resolvedList : [])
    .map((r) => (typeof r === 'string' ? r : r?.providerId))
    .filter(isNonEmptyString);
  const caps = new Set(Object.keys(CAPABILITY_BASELINE));
  for (const id of ids) for (const cap of PROVIDERS[id]?.capabilities || []) caps.add(cap);
  const map = {};
  for (const cap of caps) {
    map[cap] = CAPABILITY_BASELINE[cap] === true || ids.some((id) => (PROVIDERS[id]?.capabilities || []).includes(cap));
  }
  return map;
}

// ---------------------------------------------------------------------------
// routeAndCall — the universal entry point.
// ---------------------------------------------------------------------------

/**
 * Route one capability through the provider chain and call it.
 * @param {string} capability registry capability ('script-gen' | 'tts' | 'captions' | 'search' | ...)
 * @param {object} [options]
 * @param {string} [options.slug] channel slug (per-channel vault keys + routing)
 * @param {string} [options.jobId] job id for the usage ledger
 * @param {string} [options.prompt] text input (script-gen / search query)
 * @param {string} [options.text] text input (tts narration; prompt fallback)
 * @param {string} [options.model] model override (default: catalog models[0])
 * @param {string} [options.voice] voice id (hosted tts; edge lane defaults)
 * @param {string} [options.outPath] output path (local lanes)
 * @param {string} [options.audioPath] audio input path (captions)
 * @param {object} [options.injected] test seams: { routing, keys, writer, fetch, spawn, env }
 * @returns {Promise<{ ok: true, content: any, usage: { provider: string, model: string, capability: string, tokens: number, usage_source: 'measured'|'estimated' }, attempts: object[] }
 *                     | { ok: false, attempts: object[], error: string }>}
 * NEVER resolves to a throw — provider/routing/ledger outages all degrade.
 */
export async function routeAndCall(capability, options = {}) {
  const opts = options || {};
  const slug = isNonEmptyString(opts.slug) ? opts.slug : null;
  const jobId = isNonEmptyString(opts.jobId) ? opts.jobId : null;
  const injected = opts.injected || {};
  const env = injected.env || process.env;
  const fetchImpl = injected.fetch || fetch;
  const spawnImpl = injected.spawn || execFileP;
  const attempts = [];

  try {
    if (!isNonEmptyString(capability)) {
      return { ok: false, attempts, error: 'capability_required' };
    }

    // 1. Routes: channel override -> workspace default (Task 3); empty or
    // unavailable routing -> catalog baseline order (source 'baseline').
    let routes = [];
    try {
      const routing = injected.routing || await getProviderRouting();
      routes = await routing.resolveCapability(capability, slug || undefined);
    } catch (e) {
      console.log(`[ai-adapter] ${capability}: routing unavailable — baseline order (${redactedError(e).slice(0, 80)})`);
    }
    if (!Array.isArray(routes) || routes.length === 0) {
      routes = capabilityProviders(capability).map((providerId, i) => ({ providerId, priority: i + 1, source: 'baseline' }));
    }

    // 2. Vault keys into env (capability-filtered, D3; null slug keeps
    // shared keys). Never fatal — shared env continues on failure.
    try {
      (injected.keys || applyChannelKeys)(slug || '', env, [capability]);
    } catch (e) {
      console.log(`[ai-adapter] ${capability}: key apply failed — continuing with shared env (${redactedError(e).slice(0, 80)})`);
    }

    // Ledger writer (real path: lazily built over db.mjs; null -> skipped).
    const writer = injected.writer || await getDefaultWriter();

    // 3+4. Walk the chain: first success wins, each failure fall-throughs.
    let calledAny = false;
    const seen = new Set(); // defensive dedupe (fix round 1): Task 3 must not emit duplicate provider ids, we do not depend on it
    for (const route of routes) {
      const providerId = route.providerId;
      if (seen.has(providerId)) continue;
      seen.add(providerId);
      const model = modelFor(providerId, capability, opts);

      const skip = skipReason(providerId, capability, opts, env, model);
      if (skip) {
        const [errorClass, detail] = skip;
        attempts.push({ provider: providerId, model, source: route.source, ok: false, skipped: true, error_class: errorClass, detail });
        console.log(`[ai-adapter] ${capability}/${providerId}: skipped (${errorClass})`);
        continue;
      }

      const ctx = {
        capability,
        input: capability === 'tts' ? (opts.text ?? opts.prompt ?? '') : (opts.prompt ?? opts.text ?? ''),
        model,
        options: opts,
        env,
        fetchImpl,
        spawnImpl,
      };

      let out;
      try {
        out = await dispatchFor(providerId, capability)(ctx);
      } catch (e) {
        out = { errorClass: 'network_error', detail: redactedError(e) };
      }

      calledAny = true;
      let { content, measured } = out;
      let errorClass = out.errorClass || null;
      let detail = out.detail ? redactSecrets(out.detail) : null;
      if (!errorClass && !validContent(capability, content)) {
        errorClass = 'empty_response';
        detail = 'provider returned empty content';
        content = '';
      }

      const ok = !errorClass;
      const tokens = typeof measured === 'number' ? measured : estimateTokens(ctx.input, content);
      const usageSource = typeof measured === 'number' ? 'measured' : 'estimated';
      attempts.push({ provider: providerId, model, source: route.source, ok, error_class: errorClass, detail });

      if (writer) {
        try {
          await writer.writeUsageEvent({
            job_id: jobId,
            channel_id: slug,
            provider: providerId,
            model,
            capability,
            tokens,
            usage_source: usageSource,
            ok,
            error_class: errorClass,
          });
        } catch (e) {
          console.log(`[ai-adapter] usage write failed: ${redactedError(e).slice(0, 80)}`);
        }
      } else {
        logLedgerSkipOnce();
      }

      if (ok) {
        console.log(`[ai-adapter] ${capability}/${providerId}: ok ${model} ${tokens} tokens (${usageSource})`);
        return {
          ok: true,
          content,
          usage: { provider: providerId, model, capability, tokens, usage_source: usageSource },
          attempts,
        };
      }
      console.log(`[ai-adapter] ${capability}/${providerId}: failed ${errorClass} ${detail || ''}`.trimEnd());
    }

    return { ok: false, attempts, error: calledAny ? 'all_providers_failed' : 'no_provider_available' };
  } catch (e) {
    return { ok: false, attempts, error: `adapter_error: ${redactedError(e)}` };
  }
}

export default routeAndCall;
