import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { routeAndCall, makeUsageWriter, capabilityMapFromProviders } from '../lib/ai-adapter.mjs';
import { filterProviderKeysForCapabilities, applyChannelKeys } from '../lib/channel-keys.mjs';
import { PROVIDERS } from '../studio/lib/provider-catalog.js';

// ---------------------------------------------------------------------------
// #104 Phase 2 Task 5 — universal AI adapter + usage_events ledger.
//
// All tests run against INJECTED seams (routing / keys / writer / fetch /
// spawn / env) — no live network, no live Neon, and NEVER a write to
// yt-mcp/channel-keys.json (the real vault; another test file backs it up
// and node --test runs files concurrently).
// ---------------------------------------------------------------------------

// ---- fixtures ----

function stubResponse(body, { status = 200 } = {}) {
  const ok = status >= 200 && status < 300;
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  return {
    ok,
    status,
    json: async () => (typeof body === 'string' ? JSON.parse(text) : body),
    text: async () => text,
    arrayBuffer: async () => new TextEncoder().encode(text).buffer,
  };
}

// Fetch stub that answers by URL substring; records every call for assertions.
function makeFetchStub(rules) {
  const calls = [];
  const fn = async (url, init) => {
    calls.push({ url: String(url), init });
    const rule = rules.find((r) => String(url).includes(r.match));
    if (!rule) throw new Error(`fetch stub: unexpected url ${String(url)}`);
    return rule.response || stubResponse(rule.body, { status: rule.status });
  };
  fn.calls = calls;
  return fn;
}

function makeWriterStub({ reject = false } = {}) {
  const events = [];
  const writer = {
    writeUsageEvent: async (e) => {
      if (reject) throw new Error('ledger down');
      events.push(e);
      return { ok: true };
    },
    ensureUsageSchema: async () => ({ ok: true }),
  };
  return { writer, events };
}

// Injected keys applier: writes the given provider keys into the injected env.
function keysFrom(envFixture) {
  return (slug, env) => {
    Object.assign(env, envFixture);
    return Object.keys(envFixture);
  };
}

function routingWith(routes) {
  return { resolveCapability: async () => routes };
}

// Captures console.log during fn (restored afterwards).
async function captureLogs(fn) {
  const lines = [];
  const orig = console.log;
  console.log = (m) => lines.push(String(m));
  try {
    return { result: await fn(), lines };
  } finally {
    console.log = orig;
  }
}

const tmpDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'ai-adapter-test-'));

// ---- routeAndCall: routing honored (first provider called, second not) ----

test('routing honored: first provider called, second untouched on success', async () => {
  const { writer, events } = makeWriterStub();
  const fetchStub = makeFetchStub([
    { match: 'api.groq.com', body: { choices: [{ message: { content: 'HELLO SCRIPT' } }], usage: { total_tokens: 321 } } },
    { match: 'api.mistral.ai', body: { choices: [{ message: { content: 'SHOULD NOT HAPPEN' } }] } },
  ]);
  const result = await routeAndCall('script-gen', {
    slug: 'chan-a',
    jobId: 'job-1',
    prompt: 'write a script',
    injected: {
      routing: routingWith([
        { providerId: 'groq', priority: 1, source: 'channel' },
        { providerId: 'mistral', priority: 2, source: 'channel' },
      ]),
      keys: keysFrom({ GROQ_API_KEY: 'gsk_test_1', MISTRAL_API_KEY: 'mlt_test_1' }),
      writer,
      fetch: fetchStub,
      env: {},
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.content, 'HELLO SCRIPT');
  assert.equal(result.usage.provider, 'groq');
  assert.equal(result.usage.capability, 'script-gen');
  assert.equal(result.usage.tokens, 321);
  assert.equal(result.usage.usage_source, 'measured');
  assert.equal(fetchStub.calls.length, 1, 'second provider must NOT be called when the first succeeds');
  assert.ok(fetchStub.calls[0].url.includes('api.groq.com'));
  assert.equal(JSON.parse(fetchStub.calls[0].init.body).model, 'openai/gpt-oss-120b', 'catalog models[0] is the default model');
  assert.equal(fetchStub.calls[0].init.headers.Authorization, 'Bearer gsk_test_1');

  assert.equal(events.length, 1, 'one usage event for the one attempt');
  assert.equal(events[0].job_id, 'job-1');
  assert.equal(events[0].channel_id, 'chan-a');
  assert.equal(events[0].provider, 'groq');
  assert.equal(events[0].capability, 'script-gen');
  assert.equal(events[0].tokens, 321);
  assert.equal(events[0].usage_source, 'measured');
  assert.equal(events[0].ok, true);
  assert.equal(result.attempts.length, 1);
  assert.equal(result.attempts[0].provider, 'groq');
  assert.equal(result.attempts[0].ok, true);
  assert.equal(result.attempts[0].source, 'channel');
});

test('fallback on HTTP 500: attempt recorded + usage event, next provider succeeds', async () => {
  const { writer, events } = makeWriterStub();
  const fetchStub = makeFetchStub([
    { match: 'api.groq.com', status: 500, body: { error: 'boom' } },
    { match: 'api.mistral.ai', body: { choices: [{ message: { content: 'MISTRAL WINS' } }], usage: { total_tokens: 777 } } },
  ]);
  const result = await routeAndCall('script-gen', {
    slug: 'chan-a',
    jobId: 'job-2',
    prompt: 'write a script',
    injected: {
      routing: routingWith([
        { providerId: 'groq', priority: 1, source: 'default' },
        { providerId: 'mistral', priority: 2, source: 'default' },
      ]),
      keys: keysFrom({ GROQ_API_KEY: 'gsk_test_1', MISTRAL_API_KEY: 'mlt_test_1' }),
      writer,
      fetch: fetchStub,
      env: {},
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.usage.provider, 'mistral');
  assert.equal(fetchStub.calls.length, 2, 'fallback must fire to the next provider');
  assert.equal(result.attempts.length, 2);
  assert.equal(result.attempts[0].provider, 'groq');
  assert.equal(result.attempts[0].ok, false);
  assert.equal(result.attempts[0].error_class, 'http_error');
  assert.equal(result.attempts[1].provider, 'mistral');
  assert.equal(result.attempts[1].ok, true);

  assert.equal(events.length, 2, 'usage event written per attempt — failure AND success');
  assert.equal(events[0].provider, 'groq');
  assert.equal(events[0].ok, false);
  assert.equal(events[0].error_class, 'http_error');
  assert.equal(events[0].usage_source, 'estimated', 'failed call has no measured usage');
  assert.equal(events[1].provider, 'mistral');
  assert.equal(events[1].ok, true);
  assert.equal(events[1].tokens, 777);
  assert.equal(events[1].usage_source, 'measured');
});

// ---- measured vs estimated tokens ----

test('measured vs estimated: usage field -> measured; absent -> chars/4 estimated', async () => {
  const { writer, events } = makeWriterStub();
  const prompt = 'Hello world'; // 11 chars
  const content = 'ABCD'; // 4 chars -> ceil(15/4) = 4 estimated
  const fetchStub = makeFetchStub([
    { match: 'api.cerebras.ai', body: { choices: [{ message: { content } }] } }, // no usage field
  ]);
  const result = await routeAndCall('script-gen', {
    prompt,
    injected: {
      routing: routingWith([{ providerId: 'cerebras', priority: 1, source: 'default' }]),
      keys: keysFrom({ CEREBRAS_API_KEY: 'csd_test_1' }),
      writer,
      fetch: fetchStub,
      env: {},
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.usage.provider, 'cerebras');
  assert.equal(result.usage.usage_source, 'estimated');
  assert.equal(result.usage.tokens, Math.ceil((prompt.length + content.length) / 4), 'estimated via (prompt+content) chars / 4');
  assert.equal(events[0].usage_source, 'estimated');
  assert.equal(events[0].tokens, Math.ceil((prompt.length + content.length) / 4));
});

test('gemini native adapter: measured usageMetadata tokens + key never logged', async () => {
  const { writer, events } = makeWriterStub();
  const KEY = 'AIza_GEMINI_SECRET_ZZ1';
  const fetchStub = makeFetchStub([
    {
      match: 'generativelanguage.googleapis.com',
      body: { candidates: [{ content: { parts: [{ text: 'GEMINI SCRIPT' }] } }], usageMetadata: { totalTokenCount: 555 } },
    },
  ]);
  const { lines } = await captureLogs(() => routeAndCall('script-gen', {
    prompt: 'doc prompt',
    injected: {
      routing: routingWith([{ providerId: 'gemini', priority: 1, source: 'default' }]),
      keys: keysFrom({ GEMINI_API_KEY: KEY }),
      writer,
      fetch: fetchStub,
      env: {},
    },
  }));

  assert.equal(fetchStub.calls[0].url.includes('models/gemini-3.8-flash:generateContent'), true, 'catalog models[0] is the default gemini model');
  assert.ok(fetchStub.calls[0].url.includes(`key=${encodeURIComponent(KEY)}`), 'gemini auth via key query param');
  assert.ok(lines.every((l) => !l.includes(KEY)), 'key material must never appear in logs (AC-P2-9)');
  assert.equal(events[0].tokens, 555);
  assert.equal(events[0].usage_source, 'measured', 'gemini usageMetadata.totalTokenCount is measured');
  assert.equal(events[0].provider, 'gemini');
  assert.equal(events[0].model, 'gemini-3.8-flash');
});

// ---- zero routes -> baseline catalog order ----

test('zero routes: baseline catalog order with source baseline', async () => {
  const { writer, events } = makeWriterStub();
  const fetchStub = makeFetchStub([
    { match: 'api.mistral.ai', body: { choices: [{ message: { content: 'MISTRAL BASELINE' } }] } },
  ]);
  const result = await routeAndCall('script-gen', {
    prompt: 'p',
    injected: {
      routing: routingWith([]), // nothing seeded -> consumer-side baseline fallback
      keys: keysFrom({ MISTRAL_API_KEY: 'mlt_only' }),
      writer,
      fetch: fetchStub,
      env: {},
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.usage.provider, 'mistral');
  // baseline catalog order for script-gen: gemini, groq, cerebras, mistral, hf, openrouter, cloudflare
  assert.deepEqual(result.attempts.map((a) => a.provider), ['gemini', 'groq', 'cerebras', 'mistral']);
  assert.ok(result.attempts.slice(0, 3).every((a) => a.skipped && a.error_class === 'not_configured'), 'providers without env keys are skipped');
  assert.ok(result.attempts.every((a) => a.source === 'baseline'), 'fallback attempts carry source baseline');
  assert.equal(fetchStub.calls.length, 1);
  assert.equal(fetchStub.calls[0].url.includes('api.mistral.ai'), true);
  assert.equal(events.length, 1);
});

// ---- zero env keys -> all fail, ok:false, never throws ----

test('zero env keys: every provider unavailable -> ok:false, no call, no event, no throw', async () => {
  const { writer, events } = makeWriterStub();
  const fetchStub = makeFetchStub([]); // any call would throw "unexpected url"
  const { result } = await captureLogs(() => routeAndCall('script-gen', {
    prompt: 'p',
    injected: { routing: routingWith([]), keys: () => null, writer, fetch: fetchStub, env: {} },
  }));

  assert.equal(result.ok, false);
  assert.equal(result.error, 'no_provider_available');
  assert.equal(fetchStub.calls.length, 0, 'no network attempt without keys');
  assert.equal(events.length, 0, 'no usage events without calls (AC-P2-4 scopes events to calls)');
  assert.ok(result.attempts.length >= 7, 'all catalog script-gen providers considered');
  assert.ok(result.attempts.every((a) => a.skipped && a.ok === false));
});

test('image-gen (no provider in catalog): ok:false, never throws', async () => {
  const { writer, events } = makeWriterStub();
  const result = await routeAndCall('image-gen', {
    injected: { routing: routingWith([]), keys: () => null, writer, fetch: makeFetchStub([]), env: {} },
  });
  assert.equal(result.ok, false);
  assert.equal(result.error, 'no_provider_available');
  assert.deepEqual(result.attempts, []);
  assert.equal(events.length, 0);
});

// ---- Cloudflare env gating (D4: keeps its env-gated form) ----

test('cloudflare skipped without account id, called at the accounts URL with both secrets', async () => {
  const { writer: w1 } = makeWriterStub();
  const skipFetch = makeFetchStub([]);
  const skipped = await routeAndCall('script-gen', {
    prompt: 'p',
    injected: {
      routing: routingWith([{ providerId: 'cloudflare', priority: 1, source: 'default' }]),
      keys: keysFrom({ CLOUDFLARE_API_TOKEN: 'cf_token_only' }), // CLOUDFLARE_ACCOUNT_ID missing
      writer: w1,
      fetch: skipFetch,
      env: {},
    },
  });
  assert.equal(skipped.ok, false);
  assert.equal(skipFetch.calls.length, 0, 'CF must be env-gated: token without account id is not callable');
  assert.equal(skipped.attempts[0].skipped, true);
  assert.equal(skipped.attempts[0].error_class, 'not_configured');

  const { writer: w2, events } = makeWriterStub();
  const fetchStub = makeFetchStub([
    { match: 'api.cloudflare.com', body: { choices: [{ message: { content: 'CF SCRIPT' } }], usage: { total_tokens: 64 } } },
  ]);
  const ok = await routeAndCall('script-gen', {
    prompt: 'p',
    injected: {
      routing: routingWith([{ providerId: 'cloudflare', priority: 1, source: 'default' }]),
      keys: keysFrom({ CLOUDFLARE_API_TOKEN: 'cf_token_ok', CLOUDFLARE_ACCOUNT_ID: 'acct-123' }),
      writer: w2,
      fetch: fetchStub,
      env: {},
    },
  });
  assert.equal(ok.ok, true);
  assert.equal(ok.usage.provider, 'cloudflare');
  assert.ok(fetchStub.calls[0].url.includes('/accounts/acct-123/ai/v1/chat/completions'), 'CF account-scoped OpenAI-compatible URL');
  const body = JSON.parse(fetchStub.calls[0].init.body);
  assert.equal(body.model, '@cf/openai/gpt-oss-120b');
  assert.equal(body.max_tokens, 8000, 'CF max_tokens must be explicit (defaults to 256)');
  assert.equal(events[0].tokens, 64);
});

// ---- fail-continue semantics: never throws ----

test('routing layer throwing falls back to baseline (never throws past the adapter)', async () => {
  const { writer, events } = makeWriterStub();
  const fetchStub = makeFetchStub([
    { match: 'api.groq.com', body: { choices: [{ message: { content: 'BASELINE OK' } }] } },
  ]);
  const routing = { resolveCapability: async () => { throw new Error('DATABASE_URL missing'); } };
  const result = await routeAndCall('script-gen', {
    prompt: 'p',
    injected: {
      routing,
      keys: keysFrom({ GROQ_API_KEY: 'gsk_ok' }),
      writer,
      fetch: fetchStub,
      env: {},
    },
  });
  assert.equal(result.ok, true, 'routing unavailability must degrade to baseline, not throw');
  assert.equal(result.usage.provider, 'groq');
  assert.equal(events.length, 1);
});

test('usage writer failing never fails the call', async () => {
  const { writer } = makeWriterStub({ reject: true });
  const fetchStub = makeFetchStub([
    { match: 'api.groq.com', body: { choices: [{ message: { content: 'STILL OK' } }] } },
  ]);
  const result = await routeAndCall('script-gen', {
    prompt: 'p',
    injected: {
      routing: routingWith([{ providerId: 'groq', priority: 1, source: 'default' }]),
      keys: keysFrom({ GROQ_API_KEY: 'gsk_ok' }),
      writer,
      fetch: fetchStub,
      env: {},
    },
  });
  assert.equal(result.ok, true, 'ledger outage must not fail generation');
});

test('unknown provider id in a route is skipped, chain continues', async () => {
  const { writer, events } = makeWriterStub();
  const fetchStub = makeFetchStub([
    { match: 'api.groq.com', body: { choices: [{ message: { content: 'GROQ AFTER STALE ROUTE' } }] } },
  ]);
  const result = await routeAndCall('script-gen', {
    prompt: 'p',
    injected: {
      routing: routingWith([
        { providerId: 'retired-provider', priority: 1, source: 'default' },
        { providerId: 'groq', priority: 2, source: 'default' },
      ]),
      keys: keysFrom({ GROQ_API_KEY: 'gsk_ok' }),
      writer,
      fetch: fetchStub,
      env: {},
    },
  });
  assert.equal(result.ok, true);
  assert.equal(result.attempts[0].provider, 'retired-provider');
  assert.equal(result.attempts[0].error_class, 'unknown_provider');
  assert.equal(result.attempts[0].skipped, true);
  assert.equal(events.length, 1, 'skipped provider wrote no usage event');
});

test('all real calls fail -> ok:false with attempts + error, never throws', async () => {
  const { writer, events } = makeWriterStub();
  const fetchStub = makeFetchStub([
    { match: 'api.groq.com', status: 429, body: { error: 'rate limited' } },
    { match: 'api.mistral.ai', status: 500, body: { error: 'down' } },
  ]);
  const { result } = await captureLogs(() => routeAndCall('script-gen', {
    prompt: 'p',
    jobId: 'job-9',
    injected: {
      routing: routingWith([
        { providerId: 'groq', priority: 1, source: 'default' },
        { providerId: 'mistral', priority: 2, source: 'default' },
      ]),
      keys: keysFrom({ GROQ_API_KEY: 'gsk_ok', MISTRAL_API_KEY: 'mlt_ok' }),
      writer,
      fetch: fetchStub,
      env: {},
    },
  }));
  assert.equal(result.ok, false);
  assert.equal(result.error, 'all_providers_failed');
  assert.equal(result.attempts.length, 2);
  assert.equal(result.attempts[0].error_class, 'http_error');
  assert.equal(result.attempts[1].error_class, 'http_error');
  assert.equal(events.length, 2, 'both failed attempts are in the ledger');
  assert.ok(events.every((e) => e.ok === false && e.job_id === 'job-9'));
});

// ---- tts / captions / search native adapters ----

test('elevenlabs tts: fetch adapter, xi-api-key header, estimated tokens', async () => {
  const { writer, events } = makeWriterStub();
  const fetchStub = makeFetchStub([
    { match: 'api.elevenlabs.io', body: 'AUDIOBYTES' },
  ]);
  const result = await routeAndCall('tts', {
    slug: 'chan-a',
    jobId: 'job-tts',
    text: 'Narrate this',
    voice: 'v_custom_voice',
    injected: {
      routing: routingWith([{ providerId: 'elevenlabs', priority: 1, source: 'channel' }]),
      keys: keysFrom({ ELEVENLABS_API_KEY: 'el_test_1' }),
      writer,
      fetch: fetchStub,
      env: {},
    },
  });

  assert.equal(result.ok, true);
  assert.equal(Buffer.isBuffer(result.content), true, 'tts content is audio bytes');
  assert.ok(result.content.length > 0);
  assert.ok(fetchStub.calls[0].url.includes('/text-to-speech/v_custom_voice'), 'voice id in the URL path');
  assert.equal(fetchStub.calls[0].init.headers['xi-api-key'], 'el_test_1');
  assert.equal(result.usage.provider, 'elevenlabs');
  assert.equal(result.usage.usage_source, 'estimated', 'elevenlabs reports no token usage in-response');
  assert.equal(events[0].capability, 'tts');
  assert.equal(events[0].usage_source, 'estimated');
});

test('edge-tts-local: baseline local lane via spawn, no env needed', async () => {
  const { writer, events } = makeWriterStub();
  const dir = tmpDir();
  const outPath = path.join(dir, 'narration.mp3');
  const spawnCalls = [];
  const spawnStub = async (cmd, args) => {
    spawnCalls.push({ cmd, args });
    const i = args.indexOf('--write-media');
    fs.writeFileSync(args[i + 1], 'FAKE_MP3');
    return { stdout: '', stderr: '' };
  };
  const result = await routeAndCall('tts', {
    text: 'Hello narration',
    voice: 'en-US-ChristopherNeural',
    outPath,
    injected: {
      routing: routingWith([{ providerId: 'edge-tts-local', priority: 1, source: 'baseline' }]),
      keys: () => null,
      writer,
      fetch: makeFetchStub([]),
      spawn: spawnStub,
      env: {},
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.content.toString(), 'FAKE_MP3', 'local lane reads back the produced media');
  assert.equal(spawnCalls[0].cmd, 'edge-tts');
  assert.ok(spawnCalls[0].args.includes('Hello narration'));
  assert.equal(result.usage.provider, 'edge-tts-local');
  assert.equal(result.usage.usage_source, 'estimated');
  assert.equal(events[0].provider, 'edge-tts-local');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('whisper-local captions: spawn adapter producing srt', async () => {
  const { writer, events } = makeWriterStub();
  const dir = tmpDir();
  const outBase = path.join(dir, 'caps');
  const spawnCalls = [];
  const spawnStub = async (cmd, args) => {
    spawnCalls.push({ cmd, args });
    fs.writeFileSync(outBase + '.srt', '1\n00:00:00,000 --> 00:00:02,000\nhello\n');
    return { stdout: '', stderr: '' };
  };
  const result = await routeAndCall('captions', {
    audioPath: path.join(dir, 'audio.wav'),
    outPath: outBase,
    injected: {
      routing: routingWith([{ providerId: 'whisper-local', priority: 1, source: 'baseline' }]),
      keys: () => null,
      writer,
      fetch: makeFetchStub([]),
      spawn: spawnStub,
      env: {},
    },
  });

  assert.equal(result.ok, true);
  assert.ok(String(result.content).includes('-->'), 'srt content read back');
  assert.equal(spawnCalls[0].cmd, 'whisper-cli');
  assert.ok(spawnCalls[0].args.includes('-osrt'), 'srt output flag');
  assert.equal(result.usage.provider, 'whisper-local');
  assert.equal(events[0].capability, 'captions');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('tavily search: fetch adapter returns parsed results, key never logged', async () => {
  const { writer, events } = makeWriterStub();
  const KEY = 'tvly_SECRET_SEARCH_1';
  const fetchStub = makeFetchStub([
    { match: 'api.tavily.com', body: { results: [{ title: 'T1', url: 'https://x' }] } },
  ]);
  const { lines } = await captureLogs(() => routeAndCall('search', {
    prompt: 'documentary research query',
    injected: {
      routing: routingWith([{ providerId: 'tavily', priority: 1, source: 'default' }]),
      keys: keysFrom({ TAVILY_API_KEY: KEY }),
      writer,
      fetch: fetchStub,
      env: {},
    },
  }));

  assert.equal(fetchStub.calls[0].url, 'https://api.tavily.com/search');
  assert.equal(JSON.parse(fetchStub.calls[0].init.body).api_key, KEY);
  assert.ok(lines.every((l) => !l.includes(KEY)), 'search key must never be logged');
  assert.equal(events[0].provider, 'tavily');
  assert.equal(events[0].capability, 'search');
  assert.equal(events[0].usage_source, 'estimated');
});

// ---- makeUsageWriter ----

function makeDbStub({ fail = false } = {}) {
  const calls = [];
  const client = async (sql, params) => {
    calls.push({ sql, params });
    if (fail) throw new Error('db down');
    return [];
  };
  client.calls = calls;
  return client;
}

test('makeUsageWriter: ensureUsageSchema creates usage_events per spec D5', async () => {
  const stub = makeDbStub();
  const w = makeUsageWriter(stub);
  const r = await w.ensureUsageSchema();
  assert.equal(r.ok, true);
  const create = stub.calls.map((c) => c.sql).join('\n');
  assert.ok(/CREATE TABLE IF NOT EXISTS usage_events/i.test(create));
  for (const col of ['job_id', 'channel_id', 'provider', 'model', 'capability', 'tokens', 'usage_source', 'ok', 'error_class', 'created_at']) {
    assert.ok(create.includes(col), `schema must include ${col}`);
  }
});

test('makeUsageWriter: writeUsageEvent inserts positionally, coerces tokens to int', async () => {
  const stub = makeDbStub();
  const w = makeUsageWriter(stub);
  const r = await w.writeUsageEvent({
    job_id: 'job-1',
    channel_id: 'chan-a',
    provider: 'groq',
    model: 'openai/gpt-oss-120b',
    capability: 'script-gen',
    tokens: 12.9,
    usage_source: 'measured',
    ok: true,
  });
  assert.equal(r.ok, true);
  const insert = stub.calls.find((c) => /^INSERT INTO usage_events/i.test(c.sql));
  assert.ok(insert, 'one INSERT');
  assert.equal(insert.params[0], 'job-1');
  assert.equal(insert.params[1], 'chan-a');
  assert.equal(insert.params[2], 'groq');
  assert.equal(insert.params[5], 12, 'tokens stored as integer');
  assert.equal(insert.params[6], 'measured');
  assert.equal(insert.params[7], true);
  assert.equal(insert.params[8], null, 'error_class null on success');
});

test('makeUsageWriter: rejects provider-less events and never throws on client failure', async () => {
  const stub = makeDbStub({ fail: true });
  const w = makeUsageWriter(stub);
  const bad = await w.writeUsageEvent({ capability: 'script-gen', tokens: 1, usage_source: 'estimated', ok: true });
  assert.equal(bad.ok, false, 'event without provider must be refused, not written');
  const r = await w.writeUsageEvent({ provider: 'groq', capability: 'script-gen', tokens: 1, usage_source: 'estimated', ok: false });
  assert.equal(r.ok, false, 'client failure must return ok:false, not throw');
});

// ---- capabilityMapFromProviders (Task 6 preflight wiring) ----

test('capabilityMapFromProviders: baseline map with no providers', () => {
  assert.deepEqual(capabilityMapFromProviders([]), { 'script-gen': true, tts: true, captions: true, 'image-gen': false });
});

test('capabilityMapFromProviders: resolved providers add capabilities (vault add-only)', () => {
  const map = capabilityMapFromProviders(['tavily', 'elevenlabs']);
  assert.equal(map['script-gen'], true, 'baseline stays true');
  assert.equal(map.tts, true);
  assert.equal(map.captions, true);
  assert.equal(map['image-gen'], false, 'no provider can conjure image-gen');
  assert.equal(map.search, true, 'resolved search provider adds the search capability');

  const viaRouteObjects = capabilityMapFromProviders([{ providerId: 'tavily', priority: 1, source: 'default' }]);
  assert.equal(viaRouteObjects.search, true, 'accepts route objects ({providerId}) as well as bare ids');
});

// ---- channel-keys.mjs capability-aware addition ----

test('filterProviderKeysForCapabilities: keeps only providers covering the requested capabilities', () => {
  const keys = { groq: 'gsk_k', pixabay: 'px_k', elevenlabs: 'el_k' };
  assert.deepEqual(filterProviderKeysForCapabilities(keys, ['script-gen']), { groq: 'gsk_k' });
  assert.deepEqual(filterProviderKeysForCapabilities(keys, ['tts']), { elevenlabs: 'el_k' });
  assert.deepEqual(filterProviderKeysForCapabilities(keys, ['script-gen', 'tts']), { groq: 'gsk_k', elevenlabs: 'el_k' });
  assert.deepEqual(filterProviderKeysForCapabilities(keys, null), keys, 'no filter -> unchanged (backward compat)');
  assert.deepEqual(filterProviderKeysForCapabilities(keys, []), keys, 'empty filter -> unchanged');
  assert.deepEqual(filterProviderKeysForCapabilities(keys, ['captions']), {}, 'no covering provider -> empty');
});

test('applyChannelKeys accepts a capabilities filter (read-only probe on an unknown slug)', () => {
  // Never touches yt-mcp/channel-keys.json — a slug that cannot exist in the
  // vault keeps this read-only (the real vault is exercised by its own test file).
  const fake = { GROQ_API_KEY: 'shared' };
  const applied = applyChannelKeys('zz-ai-adapter-nonexistent-probe', fake, ['script-gen']);
  assert.equal(applied, null, 'no vault entry -> null, env untouched');
  assert.equal(fake.GROQ_API_KEY, 'shared');
});

// ---------------------------------------------------------------------------
// Fix round 1 (review verdict on Task 5):
//   C1 — openai serves THREE capabilities; a single models[0] cannot pick
//        across lanes. Models must be pinned per (provider, capability) IN
//        THE ADAPTER: transcriptions -> whisper-1, hosted tts ->
//        gpt-4o-mini-tts, script-gen chat -> gpt-4o-mini (catalog-grounded).
//   I2 — chain walk dedupes provider ids (defensive against duplicate
//        routes, removes coupling on Task 3 never emitting duplicates).
//   I3 — the fail-continue catch on a REJECTING fetch is pinned by a test.
// ---------------------------------------------------------------------------

test('openai script-gen dispatch uses the pinned CHAT model, not the tts model', async () => {
  const { writer, events } = makeWriterStub();
  const fetchStub = makeFetchStub([
    { match: 'api.openai.com', body: { choices: [{ message: { content: 'OPENAI CHAT SCRIPT' } }], usage: { total_tokens: 99 } } },
  ]);
  const result = await routeAndCall('script-gen', {
    prompt: 'paid slot-0 story',
    injected: {
      routing: routingWith([{ providerId: 'openai', priority: 1, source: 'default' }]),
      keys: keysFrom({ OPENAI_API_KEY: 'sk_test_openai' }),
      writer,
      fetch: fetchStub,
      env: {},
    },
  });

  assert.equal(result.ok, true);
  const body = JSON.parse(fetchStub.calls[0].init.body);
  assert.equal(fetchStub.calls[0].url.includes('/chat/completions'), true);
  assert.equal(body.model, 'gpt-4o-mini', 'chat lane must pin the chat model — models[0] is the TTS id');
  assert.equal(result.usage.model, 'gpt-4o-mini');
  assert.equal(events[0].model, 'gpt-4o-mini');
});

test('openai captions dispatch hits /audio/transcriptions with whisper-1 (not the tts model)', async () => {
  const { writer, events } = makeWriterStub();
  const dir = tmpDir();
  const audioPath = path.join(dir, 'audio.mp3');
  fs.writeFileSync(audioPath, 'FAKE_AUDIO');
  const fetchStub = makeFetchStub([
    { match: '/audio/transcriptions', body: '1\n00:00:00,000 --> 00:00:02,000\nhello\n' },
  ]);
  const result = await routeAndCall('captions', {
    audioPath,
    injected: {
      routing: routingWith([{ providerId: 'openai', priority: 1, source: 'default' }]),
      keys: keysFrom({ OPENAI_API_KEY: 'sk_test_openai' }),
      writer,
      fetch: fetchStub,
      env: {},
    },
  });

  assert.equal(result.ok, true);
  assert.equal(fetchStub.calls[0].url.includes('/audio/transcriptions'), true);
  assert.equal(fetchStub.calls[0].init.body.get('model'), 'whisper-1', 'captions lane must pin whisper-1');
  assert.equal(fetchStub.calls[0].init.body.get('response_format'), 'srt');
  assert.equal(fetchStub.calls[0].init.headers.Authorization, 'Bearer sk_test_openai');
  assert.equal(result.usage.model, 'whisper-1');
  assert.ok(String(result.content).includes('-->'));
  assert.equal(events[0].capability, 'captions');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('openai tts dispatch hits /audio/speech with gpt-4o-mini-tts (not the chat model)', async () => {
  const { writer, events } = makeWriterStub();
  const fetchStub = makeFetchStub([
    { match: '/audio/speech', body: 'OPENAI_TTS_AUDIO' },
  ]);
  const result = await routeAndCall('tts', {
    text: 'Say this',
    voice: 'alloy',
    injected: {
      routing: routingWith([{ providerId: 'openai', priority: 1, source: 'default' }]),
      keys: keysFrom({ OPENAI_API_KEY: 'sk_test_openai' }),
      writer,
      fetch: fetchStub,
      env: {},
    },
  });

  assert.equal(result.ok, true);
  assert.equal(fetchStub.calls[0].url.includes('/audio/speech'), true);
  const body = JSON.parse(fetchStub.calls[0].init.body);
  assert.equal(body.model, 'gpt-4o-mini-tts', 'tts lane must pin the tts model');
  assert.equal(body.voice, 'alloy');
  assert.equal(body.input, 'Say this');
  assert.equal(Buffer.isBuffer(result.content), true);
  assert.equal(result.usage.model, 'gpt-4o-mini-tts');
});

test('pinned model ids are catalog-grounded (D9: no model id outside the catalog)', () => {
  assert.ok(PROVIDERS.openai.models.includes('gpt-4o-mini'), 'openai chat entry must exist in the catalog');
  assert.ok(PROVIDERS.openai.models.includes('gpt-4o-mini-tts'));
  assert.ok(PROVIDERS.openai.models.includes('whisper-1'));
  assert.ok(PROVIDERS.groq.models.includes('whisper-large-v3'), 'groq transcription pin must be catalog-grounded');
});

test('lane without an adapter is skipped cleanly — no doomed call, no event', async () => {
  const { writer, events } = makeWriterStub();
  const fetchStub = makeFetchStub([]); // any call = unexpected url throw
  const { result } = await captureLogs(() => routeAndCall('tts', {
    text: 'narrate',
    voice: 'alloy',
    outPath: path.join(tmpDir(), 'narration.mp3'),
    injected: {
      routing: routingWith([
        { providerId: 'gemini', priority: 1, source: 'default' }, // gemini has no tts lane
        { providerId: 'edge-tts-local', priority: 2, source: 'default' },
      ]),
      keys: keysFrom({ GEMINI_API_KEY: 'AIza_present' }),
      writer,
      fetch: fetchStub,
      spawn: async (cmd, args) => {
        const i = args.indexOf('--write-media');
        fs.writeFileSync(args[i + 1], 'FALLBACK_MP3');
        return { stdout: '', stderr: '' };
      },
      env: {},
    },
  }));

  assert.equal(result.ok, true, 'chain continues past the adapter-less lane');
  assert.equal(result.usage.provider, 'edge-tts-local');
  assert.equal(fetchStub.calls.length, 0, 'gemini must NOT receive a doomed generateContent tts call');
  assert.equal(result.attempts[0].provider, 'gemini');
  assert.equal(result.attempts[0].skipped, true);
  assert.equal(result.attempts[0].error_class, 'no_adapter');
  assert.equal(events.length, 1, 'skip writes no usage event');
});

test('duplicate providerId in routes is deduped — provider attempted once per failure', async () => {
  const { writer, events } = makeWriterStub();
  let groqHits = 0;
  const base = makeFetchStub([
    { match: 'api.groq.com', status: 500, body: { error: 'boom' } },
    { match: 'api.mistral.ai', body: { choices: [{ message: { content: 'MISTRAL OK' } }] } },
  ]);
  const fetchStub = async (url, init) => {
    if (String(url).includes('api.groq.com')) groqHits += 1;
    return base(url, init);
  };
  const result = await routeAndCall('script-gen', {
    prompt: 'p',
    injected: {
      routing: routingWith([
        { providerId: 'groq', priority: 1, source: 'channel' },
        { providerId: 'groq', priority: 1, source: 'default' }, // duplicate (defensive: Task 3 must not emit these, we do not depend on it)
        { providerId: 'mistral', priority: 2, source: 'default' },
      ]),
      keys: keysFrom({ GROQ_API_KEY: 'gsk_dup', MISTRAL_API_KEY: 'mlt_dup' }),
      writer,
      fetch: fetchStub,
      env: {},
    },
  });

  assert.equal(result.ok, true);
  assert.equal(groqHits, 1, 'duplicate route must not re-call a failed provider');
  assert.deepEqual(result.attempts.map((a) => a.provider), ['groq', 'mistral'], 'duplicate collapses into the first attempt');
  assert.equal(events.length, 2, 'one event per real call, not per route row');
});

test('network throw (rejecting fetch) is recorded network_error and the chain continues', async () => {
  const { writer, events } = makeWriterStub();
  const fallback = makeFetchStub([
    { match: 'api.mistral.ai', body: { choices: [{ message: { content: 'SURVIVED THE THROW' } }] } },
  ]);
  const fetchStub = async (url, init) => {
    if (String(url).includes('api.groq.com')) throw new TypeError('fetch failed: ECONNRESET');
    return fallback(url, init);
  };
  const result = await routeAndCall('script-gen', {
    prompt: 'p',
    jobId: 'job-throw',
    injected: {
      routing: routingWith([
        { providerId: 'groq', priority: 1, source: 'default' },
        { providerId: 'mistral', priority: 2, source: 'default' },
      ]),
      keys: keysFrom({ GROQ_API_KEY: 'gsk_throw', MISTRAL_API_KEY: 'mlt_throw' }),
      writer,
      fetch: fetchStub,
      env: {},
    },
  });

  assert.equal(result.ok, true, 'a rejected fetch must fail-continue, never throw past the adapter');
  assert.equal(result.usage.provider, 'mistral');
  assert.equal(result.attempts[0].provider, 'groq');
  assert.equal(result.attempts[0].ok, false);
  assert.equal(result.attempts[0].error_class, 'network_error');
  assert.equal(events[0].ok, false);
  assert.equal(events[0].error_class, 'network_error', 'regression pin: deleting the catch must fail the suite');
  assert.equal(events[0].job_id, 'job-throw');
  assert.equal(events.length, 2);
});
