// #104 Phase 2 Task 6 — the generators (yt-deepdive.mjs doc brain,
// youtube-engine.mjs Shorts brain) route through the capability registry via
// lib/ai-adapter.mjs routeAndCall. This suite pins the SWAPPED SEAM and the
// preserved contract:
//   - selection seam: hf filtered (dead paid lane, Task 1 review carry-forward);
//     openai only via EXPLICIT routes, never the zero-config baseline
//   - shape gate: a provider reply that parses but fails the brain's JSON
//     contract still fail-continues to the next provider (the retired chains'
//     bad-shape fall-through)
//   - escalation walk: the "reply with raw JSON ONLY" retry stays caller-owned
//     and applies chain-wide (maxAttempts)
//   - engine contract: source 'fallback' template on total failure (yt-daily's
//     `script.source === 'fallback'` gate), never throws
//   - AC-P2-10: no provider-specific chain config left in either generator
//
// All provider calls run against INJECTED fixtures (fetch stubs, injected
// env/routing/writer) — never live keys from process.env, never the network
// (mirrors tests/ai-adapter.test.mjs house style).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  parseScriptJson,
  filterScriptGenRoutes,
  baselineScriptGenRoutes,
  scriptGenRouting,
  extractScriptText,
  scriptShapeGate,
  callScriptBrain,
  generateYouTubeScript,
} from '../youtube-engine.mjs';
import { PROVIDERS, capabilityProviders } from '../studio/lib/provider-catalog.js';

// ---- fixtures (ai-adapter.test.mjs style) ----

function stubResponse(body, { status = 200 } = {}) {
  const ok = status >= 200 && status < 300;
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  return {
    ok,
    status,
    statusText: '',
    headers: undefined,
    json: async () => (typeof body === 'string' ? JSON.parse(text) : body),
    text: async () => text,
  };
}

// Fetch stub answering by URL substring; records every call.
function makeFetchStub(rules) {
  const calls = [];
  const fn = async (url, init) => {
    calls.push({ url: String(url), init });
    const rule = rules.find((r) => String(url).includes(r.match));
    if (!rule) throw new Error(`fetch stub: unexpected url ${String(url)}`);
    return stubResponse(rule.body, { status: rule.status });
  };
  fn.calls = calls;
  return fn;
}

// Fetch stub whose answer is scripted per call index (for escalation walks).
function scriptedFetch(handler) {
  const calls = [];
  const fn = async (url, init) => {
    const n = calls.push({ url: String(url), init });
    return handler(n, String(url), init);
  };
  fn.calls = calls;
  return fn;
}

function makeWriterStub() {
  const events = [];
  return {
    events,
    writer: {
      writeUsageEvent: async (e) => { events.push(e); return { ok: true }; },
      ensureUsageSchema: async () => ({ ok: true }),
    },
  };
}

const routingWith = (routes) => ({ resolveCapability: async () => routes });
const throwingRouting = () => ({ resolveCapability: async () => { throw new Error('DATABASE_URL missing'); } });

// ---- catalog lane (Task 5 re-review follow-up, data side) ----

test('catalog: openai covers script-gen, appended LAST after the retired-table order', () => {
  assert.deepEqual(
    capabilityProviders('script-gen'),
    ['gemini', 'groq', 'cerebras', 'mistral', 'hf', 'openrouter', 'cloudflare', 'openai'],
  );
  assert.ok(PROVIDERS.openai.capabilities.includes('script-gen'));
});

// ---- parseScriptJson (the shared loose parse — deepdive's parseLoose) ----

test('parseScriptJson: fenced and prose-wrapped JSON both parse', () => {
  assert.deepEqual(parseScriptJson('```json\n{"a":1}\n```'), { a: 1 });
  assert.deepEqual(parseScriptJson('Sure! {"a":{"b":2}} hope this helps'), { a: { b: 2 } });
  assert.throws(() => parseScriptJson('no json at all'));
});

// ---- selection seam: hf filtered, openai baseline-excluded ----

test('filterScriptGenRoutes: drops hf from RESOLVED routes, keeps explicit openai and order', () => {
  const out = filterScriptGenRoutes([
    { providerId: 'groq', priority: 1, source: 'channel' },
    { providerId: 'hf', priority: 2, source: 'channel' },
    { providerId: 'openai', priority: 3, source: 'channel' },
  ]);
  assert.deepEqual(out.map((r) => r.providerId), ['groq', 'openai'], 'hf (dead paid lane) must never reach the call walk');
});

test('baselineScriptGenRoutes: zero-config baseline is the free lanes only (no hf, no openai)', () => {
  const routes = baselineScriptGenRoutes();
  assert.deepEqual(routes.map((r) => r.providerId), ['gemini', 'groq', 'cerebras', 'mistral', 'openrouter', 'cloudflare']);
  assert.ok(routes.every((r) => r.source === 'baseline'));
  assert.deepEqual(routes.map((r) => r.priority), [1, 2, 3, 4, 5, 6]);
});

test('scriptGenRouting: delegates resolved routes minus hf; keeps explicitly routed openai', async () => {
  const routing = scriptGenRouting(routingWith([
    { providerId: 'gemini', priority: 1, source: 'channel' },
    { providerId: 'hf', priority: 2, source: 'default' },
    { providerId: 'openai', priority: 3, source: 'default' },
  ]));
  const routes = await routing.resolveCapability('script-gen', 'chan-a');
  assert.deepEqual(routes.map((r) => r.providerId), ['gemini', 'openai']);
});

test('scriptGenRouting: routing outage and empty resolution both fall to the FILTERED baseline', async () => {
  const fromThrow = await scriptGenRouting(throwingRouting()).resolveCapability('script-gen', 'chan-a');
  const fromEmpty = await scriptGenRouting(routingWith([])).resolveCapability('script-gen', 'chan-a');
  for (const routes of [fromThrow, fromEmpty]) {
    assert.deepEqual(routes.map((r) => r.providerId), ['gemini', 'groq', 'cerebras', 'mistral', 'openrouter', 'cloudflare']);
  }
});

test('scriptGenRouting: non-script-gen capabilities delegate verbatim (adapter owns those baselines)', async () => {
  const routes = [{ providerId: 'openai', priority: 1, source: 'default' }];
  const ok = await scriptGenRouting(routingWith(routes)).resolveCapability('tts', 'chan-a');
  assert.deepEqual(ok, routes);
  const failed = await scriptGenRouting(throwingRouting()).resolveCapability('tts', 'chan-a');
  assert.deepEqual(failed, [], 'other capabilities return empty so routeAndCall applies its own baseline');
});

// ---- extraction + shape gate ----

test('extractScriptText: gemini candidates path vs OpenAI-compatible choices path', () => {
  const gemini = JSON.stringify({ candidates: [{ content: { parts: [{ text: '{"title":"G"}' }] } }] });
  const compat = JSON.stringify({ choices: [{ message: { content: '{"title":"O"}' } }] });
  assert.equal(extractScriptText('https://generativelanguage.googleapis.com/v1beta/models/m:generateContent?key=k', gemini), '{"title":"G"}');
  assert.equal(extractScriptText('https://api.groq.com/openai/v1/chat/completions', compat), '{"title":"O"}');
  assert.equal(extractScriptText('https://api.groq.com/openai/v1/chat/completions', 'not json'), null, 'non-JSON passes through untouched (adapter classifies parse_error)');
});

const VALID_TITLE = (p) => p && typeof p.title === 'string' && p.title.length > 0;

test('scriptShapeGate: usable gemini body passes through byte-identical', async () => {
  const raw = JSON.stringify({ candidates: [{ content: { parts: [{ text: '{"title":"GOOD"}' }] } }] });
  const fetchStub = async () => stubResponse(raw);
  const gated = scriptShapeGate(fetchStub, (c) => VALID_TITLE(parseScriptJson(c)));
  const res = await gated('https://generativelanguage.googleapis.com/v1beta/models/m:generateContent?key=k', {});
  assert.equal(res.status, 200);
  assert.equal(await res.text(), raw, 'usable payload must reach the adapter unmodified');
});

test('scriptShapeGate: shape-invalid reply is neutralized so the adapter fail-continues', async () => {
  const raw = JSON.stringify({ choices: [{ message: { content: 'I am a chatty prose reply with no JSON' } }] });
  const fetchStub = async () => stubResponse(raw);
  const gated = scriptShapeGate(fetchStub, (c) => VALID_TITLE(parseScriptJson(c)));
  const res = await gated('https://api.groq.com/openai/v1/chat/completions', {});
  assert.equal(res.status, 200, 'status preserved — the adapter reads parse_error, not http_error');
  assert.equal(await res.text(), '', 'empty body -> adapter extraction yields nothing -> parse_error -> next provider');
});

test('scriptShapeGate: non-ok and non-JSON responses pass through untouched', async () => {
  const gated = scriptShapeGate(async () => stubResponse({ error: 'boom' }, { status: 500 }), () => false);
  const res = await gated('https://api.mistral.ai/v1/chat/completions', {});
  assert.equal(res.status, 500);
  assert.deepEqual(JSON.parse(await res.text()), { error: 'boom' });

  const gated2 = scriptShapeGate(async () => stubResponse('garbage bytes'), () => false);
  const res2 = await gated2('https://api.mistral.ai/v1/chat/completions', {});
  assert.equal(await res2.text(), 'garbage bytes', 'non-JSON bodies are the adapter\'s parse_error, not ours to rewrite');
});

// ---- callScriptBrain orchestration ----

const brainOpts = (over = {}) => ({
  slug: 'chan-a',
  jobId: 'job-brain',
  prompt: 'write a script',
  isValidJson: VALID_TITLE,
  maxAttempts: 1,
  ...over,
});

test('callScriptBrain: routed provider wins; usage event carries capability + job', async () => {
  const { writer, events } = makeWriterStub();
  const fetchStub = makeFetchStub([
    { match: 'api.groq.com', body: { choices: [{ message: { content: '{"title":"GROQ WINS"}' } }], } },
  ]);
  const res = await callScriptBrain(brainOpts({
    injected: {
      realRouting: routingWith([{ providerId: 'groq', priority: 1, source: 'channel' }]),
      keys: (slug, env) => { env.GROQ_API_KEY = 'gsk_x'; return ['groq']; },
      writer,
      fetch: fetchStub,
      env: {},
    },
  }));
  assert.equal(res.ok, true);
  assert.deepEqual(res.parsed, { title: 'GROQ WINS' });
  assert.equal(res.provider, 'groq');
  assert.equal(res.walk, 1);
  assert.equal(fetchStub.calls.length, 1);
  assert.equal(events.length, 1);
  assert.equal(events[0].capability, 'script-gen');
  assert.equal(events[0].job_id, 'job-brain');
  assert.equal(events[0].channel_id, 'chan-a');
});

test('callScriptBrain: shape-rejected provider fail-continues to the next (retired chains\' fall-through)', async () => {
  const { writer, events } = makeWriterStub();
  const fetchStub = makeFetchStub([
    { match: 'api.groq.com', body: { choices: [{ message: { content: 'prose with no usable shape' } }] } },
    { match: 'api.mistral.ai', body: { choices: [{ message: { content: '{"title":"MISTRAL SAVED IT"}' } }] } },
  ]);
  const res = await callScriptBrain(brainOpts({
    injected: {
      realRouting: routingWith([
        { providerId: 'groq', priority: 1, source: 'default' },
        { providerId: 'mistral', priority: 2, source: 'default' },
      ]),
      keys: (slug, env) => { env.GROQ_API_KEY = 'gsk_x'; env.MISTRAL_API_KEY = 'mlt_x'; return ['groq', 'mistral']; },
      writer,
      fetch: fetchStub,
      env: {},
    },
  }));
  assert.equal(res.ok, true);
  assert.equal(res.provider, 'mistral', 'bad-shape reply must fall through, not abort the chain');
  assert.equal(fetchStub.calls.length, 2);
  assert.equal(events.length, 2, 'both real calls are ledgered (AC-P2-4)');
  assert.equal(events[0].ok, false);
  assert.equal(events[0].error_class, 'parse_error', 'the shape gate surfaces as parse_error');
});

test('callScriptBrain: escalation walk appends the raw-JSON suffix chain-wide', async () => {
  const SUFFIX = '\nReply with the raw JSON object ONLY.';
  const fetchStub = scriptedFetch((n, url) => {
    if (!url.includes('api.groq.com')) throw new Error('unexpected ' + url);
    const content = n === 1 ? 'still chatty, no json' : '{"title":"SECOND WALK WORKS"}';
    return stubResponse({ choices: [{ message: { content } }] });
  });
  const res = await callScriptBrain(brainOpts({
    maxAttempts: 2,
    suffix: SUFFIX,
    injected: {
      realRouting: routingWith([{ providerId: 'groq', priority: 1, source: 'default' }]),
      keys: (slug, env) => { env.GROQ_API_KEY = 'gsk_x'; return ['groq']; },
      writer: makeWriterStub().writer,
      fetch: fetchStub,
      env: {},
    },
  }));
  assert.equal(res.ok, true);
  assert.equal(res.walk, 2, 'shape-only failures must trigger exactly one escalation walk');
  const body1 = JSON.parse(fetchStub.calls[0].init.body);
  const body2 = JSON.parse(fetchStub.calls[1].init.body);
  assert.ok(!body1.messages[0].content.includes('raw JSON object ONLY'), 'walk 1 prompt must be clean');
  assert.ok(body2.messages[0].content.includes('raw JSON object ONLY'), 'walk 2 prompt must carry the escalation suffix');
  assert.ok(body2.messages[0].content.startsWith('write a script'), 'suffix appended, prompt unchanged');
});

test('callScriptBrain: hard outage does NOT escalate (single walk, ok:false, never throws)', async () => {
  const { writer } = makeWriterStub();
  const fetchStub = makeFetchStub([
    { match: 'api.groq.com', status: 500, body: { error: 'down' } },
    { match: 'api.mistral.ai', status: 503, body: { error: 'down' } },
  ]);
  const res = await callScriptBrain(brainOpts({
    maxAttempts: 3,
    suffix: '\nReply with the raw JSON object ONLY.',
    injected: {
      realRouting: routingWith([
        { providerId: 'groq', priority: 1, source: 'default' },
        { providerId: 'mistral', priority: 2, source: 'default' },
      ]),
      keys: (slug, env) => { env.GROQ_API_KEY = 'gsk_x'; env.MISTRAL_API_KEY = 'mlt_x'; return ['groq', 'mistral']; },
      writer,
      fetch: fetchStub,
      env: {},
    },
  }));
  assert.equal(res.ok, false);
  assert.equal(res.error, 'all_providers_failed');
  assert.equal(fetchStub.calls.length, 2, 'HTTP-dead providers must not be re-walked (outage economics preserved)');
});

test('callScriptBrain: zero configured providers -> ok:false with the filtered baseline, no calls', async () => {
  const { writer } = makeWriterStub();
  const fetchStub = makeFetchStub([]);
  const res = await callScriptBrain(brainOpts({
    slug: null,
    jobId: null,
    injected: { realRouting: routingWith([]), keys: () => null, writer, fetch: fetchStub, env: {} },
  }));
  assert.equal(res.ok, false);
  assert.equal(res.error, 'no_provider_available');
  assert.equal(fetchStub.calls.length, 0, 'no keys -> no network');
  const attempted = res.attempts.map((a) => a.provider);
  assert.deepEqual(attempted, ['gemini', 'groq', 'cerebras', 'mistral', 'openrouter', 'cloudflare'], 'baseline walk excludes hf AND openai');
});

test('callScriptBrain: rejecting fetch (network error) never throws past the brain', async () => {
  const fetchStub = async () => { throw new TypeError('fetch failed: ECONNRESET'); };
  const res = await callScriptBrain(brainOpts({
    injected: {
      realRouting: routingWith([{ providerId: 'groq', priority: 1, source: 'default' }]),
      keys: (slug, env) => { env.GROQ_API_KEY = 'gsk_x'; return ['groq']; },
      writer: makeWriterStub().writer,
      fetch: fetchStub,
      env: {},
    },
  }));
  assert.equal(res.ok, false);
  assert.equal(res.attempts[0].error_class, 'network_error');
});

// ---- engine wiring: generateYouTubeScript ----

const SHORTS_JSON = (nPoints = 4, withThumb = true) => JSON.stringify({
  hook: 'Stop wasting your mornings',
  ...(withThumb ? { thumb_headline: 'MORNING RULES' } : {}),
  points: Array.from({ length: nPoints }, (_, i) => ({ title: `P${i + 1}`, line: `line ${i + 1}` })),
  closing: 'Start tomorrow at 5.',
});
const geminiBody = (text) => ({ candidates: [{ content: { parts: [{ text }] } }] });
const compatBody = (content) => ({ choices: [{ message: { content } }] });

const page = { id: 'test-page', slug: 'zz-generator-routing-test', name: 'Routing Test Page' };
const engineOpts = (over = {}) => ({
  injected: {
    realRouting: routingWith(over.routes || []),
    keys: over.keys || (() => null),
    writer: over.writer || makeWriterStub().writer,
    fetch: over.fetch,
    env: over.env || {},
  },
});

test('engine: routed gemini script returns source=provider, slices points, defaults thumbHeadline', async () => {
  const six = SHORTS_JSON(6, true);
  const fetchStub = makeFetchStub([
    { match: 'generativelanguage.googleapis.com', body: geminiBody(six) },
  ]);
  const script = await generateYouTubeScript(page, null, engineOpts({
    routes: [{ providerId: 'gemini', priority: 1, source: 'channel' }],
    keys: (slug, env) => { env.GEMINI_API_KEY = 'AIza_x'; return ['gemini']; },
    fetch: fetchStub,
  }));
  assert.equal(script.source, 'gemini', 'source label = registry provider id');
  assert.equal(script.points.length, 5, 'points sliced to 5 exactly as the retired engine did');
  assert.equal(script.thumbHeadline, 'MORNING RULES');
  assert.equal(script.hook, 'Stop wasting your mornings');
  // JSON contract pinned: same prompt structure as the retired hand chain
  const sent = JSON.parse(fetchStub.calls[0].init.body);
  const prompt = sent.contents[0].parts[0].text;
  assert.ok(prompt.includes('Return ONLY valid JSON'), 'prompt contract: JSON-only instruction');
  assert.ok(prompt.includes('"hook":"<=12 words"'), 'prompt contract: the shorts JSON schema line');
  assert.ok(prompt.includes('YouTube Shorts scripts'), 'prompt contract: the style line');
  assert.equal(sent.generationConfig.responseMimeType, 'application/json', 'adapter pins JSON mode');
});

test('engine: missing thumb_headline falls back to "<N> RULES" like the retired chain', async () => {
  const fetchStub = makeFetchStub([
    { match: 'generativelanguage.googleapis.com', body: geminiBody(SHORTS_JSON(4, false)) },
  ]);
  const script = await generateYouTubeScript(page, null, engineOpts({
    routes: [{ providerId: 'gemini', priority: 1, source: 'channel' }],
    keys: (slug, env) => { env.GEMINI_API_KEY = 'AIza_x'; return ['gemini']; },
    fetch: fetchStub,
  }));
  assert.equal(script.thumbHeadline, '4 RULES');
  assert.equal(script.closing, 'Start tomorrow at 5.');
});

test('engine: zero-config -> the template fallback with source "fallback" (yt-daily gate pinned)', async () => {
  const fetchStub = makeFetchStub([]); // any call = unexpected url = test failure
  const script = await generateYouTubeScript(page, null, engineOpts({ fetch: fetchStub }));
  assert.equal(script.source, 'fallback', 'yt-daily skips the slot when source === fallback');
  assert.equal(fetchStub.calls.length, 0, 'nothing configured -> nothing called');
  assert.ok(script.hook && Array.isArray(script.points) && script.closing && script.thumbHeadline, 'fallback template stays well-formed');
});

test('engine: baseline routing (no routes) calls a free baseline lane and excludes hf/openai', async () => {
  const fetchStub = makeFetchStub([
    { match: 'api.mistral.ai', body: compatBody(SHORTS_JSON(4, true)) },
  ]);
  const script = await generateYouTubeScript(page, null, engineOpts({
    routes: [],
    keys: (slug, env) => { env.MISTRAL_API_KEY = 'mlt_x'; env.HF_TOKEN = 'hf_should_not matter'; env.OPENAI_API_KEY = 'sk_should_not_fire'; return ['mistral', 'hf', 'openai']; },
    fetch: fetchStub,
  }));
  assert.equal(script.source, 'mistral', 'baseline free lanes serve script-gen with zero routes');
  assert.equal(fetchStub.calls.length, 1);
  assert.ok(fetchStub.calls[0].url.includes('api.mistral.ai'));
});

test('engine: escalation fires when the first walk only shape-rejects, then groq saves the short', async () => {
  const fetchStub = scriptedFetch((n, url) => {
    if (!url.includes('api.groq.com')) throw new Error('unexpected ' + url);
    return stubResponse(compatBody(n === 1 ? 'chatty no json' : SHORTS_JSON(4, true)));
  });
  const script = await generateYouTubeScript(page, null, engineOpts({
    routes: [{ providerId: 'groq', priority: 1, source: 'default' }],
    keys: (slug, env) => { env.GROQ_API_KEY = 'gsk_x'; return ['groq']; },
    fetch: fetchStub,
  }));
  assert.equal(script.source, 'groq');
  assert.equal(fetchStub.calls.length, 2);
  const body2 = JSON.parse(fetchStub.calls[1].init.body);
  assert.ok(body2.messages[0].content.includes('IMPORTANT: reply with the raw JSON object ONLY'), 'engine escalation suffix preserved');
});

// ---- AC-P2-10: no provider-specific chain config left in the generators ----

const readSrc = (p) => fs.readFileSync(p, 'utf8');

test('yt-deepdive: doc brain routes through the registry — zero hand chain config left', () => {
  const src = readSrc('yt-deepdive.mjs');
  for (const gone of ['generativelanguage.googleapis.com', 'api.groq.com', 'api.cloudflare.com', 'api.mistral.ai', 'GEMINI_API_KEY', 'GROQ_API_KEY', 'CLOUDFLARE_ACCOUNT_ID', 'openai/gpt-oss-120b']) {
    assert.equal(src.includes(gone), false, `retired chain literal must be gone: ${gone}`);
  }
  assert.ok(src.includes('callScriptBrain'), 'doc brain must call the shared registry seam');
  assert.ok(src.includes('applyChannelKeys(slug)'), 'boot-time whole-render key application stays (narration env)');
  assert.ok(src.includes('validEpisode'), 'the doc JSON contract stays');
  assert.ok(src.includes("throw new Error('all script providers failed')"), 'total-failure throw stays (cron retries tomorrow)');
});

test('yt-deepdive: 3-walk escalation config is pinned (commit-2 review follow-up)', () => {
  const src = readSrc('yt-deepdive.mjs');
  assert.ok(src.includes('maxAttempts: 3'), 'doc brain must keep its 3-walk escalation ceiling — dropping it to 1 must fail the suite');
  // the exact legacy suffix literal (groq attempt 2/3 wording, kept verbatim)
  assert.ok(src.includes("'\\nReply with the raw JSON object ONLY.'"), 'the exact raw-JSON-only escalation suffix must stay verbatim');
});

test('youtube-engine: shorts brain routes through the registry — zero hand chain config left', () => {
  const src = readSrc('youtube-engine.mjs');
  for (const gone of ['api.groq.com', 'api.cerebras.ai', 'api.mistral.ai', 'router.huggingface.co', 'GEMINI_API_KEY ||', 'process.env.GROQ_API_KEY', 'meta-llama/Llama-3.1-8B-Instruct', "max_tokens: 1500"]) {
    assert.equal(src.includes(gone), false, `retired chain literal must be gone: ${gone}`);
  }
  // the ONE allowed gemini literal is extractScriptText's response-shape
  // classifier — endpoint wiring, not chain config (AC-P2-10 wording)
  const geminiRefs = src.match(/generativelanguage\.googleapis\.com/g) || [];
  assert.equal(geminiRefs.length, 1, 'gemini literal may appear only in the extraction classifier');
  assert.ok(src.includes("routeAndCall('script-gen'") || src.includes('callScriptBrain'), 'shorts brain must call the registry seam');
  assert.ok(src.includes("source: 'fallback'"), 'template fallback terminal state stays');
});
