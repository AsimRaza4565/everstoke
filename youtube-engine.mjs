// YouTube Shorts Engine v2 — a DEDICATED YouTube format, deliberately different
// from the FB/IG cinematic reels but driven by the same content batch.
//
//   • Topic-matched 4K Pixabay footage per quote (Gemini picks the search query)
//   • Human-feel narration: OpenAI gpt-4o-mini-tts "documentary narrator"
//     instructions (Edge-TTS fallback) + whisper word-level alignment
//   • Trending "Hormozi" captions: ALL-CAPS Anton, thick black outline,
//     1-3 words per cue, yellow keyword, pop-in scale, burned via libass ASS
//   • Hook in frame 1 (<=7 words), loopable, ~12-30s, safe-zone layout
//   • SEO metadata + scheduled uploads at the 05:45/13:30/18:45 PKT slots
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path'; // restored — the #72 dead-code range accidentally cut this mid-file import (IC heal regression)
import sharp from 'sharp';
import { EMBEDDED_FONTS_CSS } from './typography-poster-engine.mjs';
import { ensurePoolClip } from './cinematic-engine.mjs';
import { getTopicClip } from './youtube-clips.mjs';
import { routeAndCall } from './lib/ai-adapter.mjs';
import { capabilityProviders } from './studio/lib/provider-catalog.js';

import { resolveBinary } from './lib/ffmpeg.mjs';
import { loadEnv } from './lib/env.mjs';

loadEnv();
const FF = resolveBinary('ffmpeg');
const POOL_DIR = 'pixabay-pool';
// BYOK (#104): provider keys for the script brain are applied per channel
// THROUGH the adapter (routeAndCall -> applyChannelKeys, capability-filtered)
// at call time — provider selection never reads env directly anymore.
import { resolveBrand as resolveBrandKit } from './lib/brand-resolve.mjs';

// Resolve the brand for a page/channel. Delegates to unified lib/brand-resolve.mjs.
function resolveBrand(page) {
  if (page?.ytBrand) {
    const b = page.ytBrand;
    const followName = b.followName || (b.label ? b.label.split(' ').map((w) => w[0] + w.slice(1).toLowerCase()).join(' ') : 'us');
    return { ...b, followName };
  }
  const slug = page?.ytSlug || page?.slug || page?.id;
  const brand = resolveBrandKit(slug);
  const followName = brand?.label ? brand.label.split(' ').map((w) => w[0] + w.slice(1).toLowerCase()).join(' ') : 'us';
  return { ...brand, followName };
}

const HOOK_STYLES = ['direct', 'emphasis', 'curiosity', 'negative'];
const CURIOSITY_PREFIX = ['NOBODY TELLS YOU THIS:', 'READ THIS TWICE:', 'THIS CHANGES EVERYTHING:'];
// ASS colour is &HAABBGGRR — #FFD93D yellow (BGR 3DD9FF)
const ASS_YELLOW = '&H3DD9FF&';
const ASS_WHITE = '&HFFFFFF&';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function wrapTextToLines(text, maxChars) {
  const words = String(text || '').trim().split(/\s+/).filter(Boolean);
  const lines = [];
  let current = '';
  for (const w of words) {
    if ((current ? current + ' ' + w : w).length <= maxChars) {
      current = current ? current + ' ' + w : w;
    } else {
      if (current) lines.push(current);
      current = w;
    }
  }
  if (current) lines.push(current);
  return lines;
}

const escapeXml = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const titleCase = (s) => String(s || '').toLowerCase().replace(/(?<!['’])\b([a-z])/g, (m, p) => p.toUpperCase());
const stripPunct = (s) => String(s || '').replace(/[.,!?;:"'’"“”—–-]/g, '').trim();

// ---------------------------------------------------------------------------
// Spoken script — written FOR the voice: contractions, short sentences, a
// pause marker before the takeaway (the "human twist" lives here as much as
// in the TTS instructions).
// ---------------------------------------------------------------------------
export function spokenScript(postData) {
  const headline = titleCase((postData?.headline || '').replace(/\.$/, ''));
  const insight = String(postData?.insight_body || '').trim();
  const takeaway = String(postData?.takeaway || '')
    .replace(/^Rule:\s*/i, '')
    .replace(/\.$/, '')
    .trim();
  const parts = [`Listen — ${headline}.`, insight];
  if (takeaway) parts.push(`Here's the rule... ${takeaway}.`);
  return parts.filter(Boolean).join(' ').split(/\s+/).slice(0, 55).join(' ');
}

// ---------------------------------------------------------------------------
// Narration — youtube-flow/narrate.py returns exact word timestamps
// ---------------------------------------------------------------------------
let cachedPython = null;
function resolvePython() {
  if (cachedPython !== null) return cachedPython;
  for (const cmd of ['python', 'python3']) {
    try {
      execFileSync(cmd, ['--version'], { stdio: 'ignore' });
      cachedPython = cmd;
      return cmd;
    } catch (e) { /* try next */ }
  }
  cachedPython = '';
  return '';
}

function narrate(scriptText, tag, voice = '') {
  const py = resolvePython();
  if (!py) return null;
  const base = `${POOL_DIR}/yt-tts-${tag}`;
  fs.mkdirSync(POOL_DIR, { recursive: true });
  fs.writeFileSync(`${base}.txt`, scriptText, 'utf8');
  try {
    const env = { ...process.env };
    if (voice) env.YT_KOKORO_VOICE = voice;
    execFileSync(py, ['youtube-flow/narrate.py', `${base}.txt`, `${base}.mp3`, `${base}.words.json`],
      { stdio: ['ignore', 'ignore', 'pipe'], timeout: 180000, env });
    // narrate.py writes a meta file — audio may be .mp3 (openai/edge) or .wav (kokoro)
    const meta = JSON.parse(fs.readFileSync(`${base}.mp3.meta.json`, 'utf8'));
    if (!meta.words?.length || !fs.existsSync(meta.audio)) return null;
    return { file: meta.audio, words: meta.words, engine: meta.engine };
  } catch (e) {
    console.log(`      [YT Short] Narration unavailable (${String(e.message).slice(0, 120)}) — rendering text-only.`);
    return null;
  } finally {
    fs.rmSync(`${base}.txt`, { force: true });
    fs.rmSync(`${base}.mp3.meta.json`, { force: true });
  }
}

// ---------------------------------------------------------------------------
// Trending caption template — "Hormozi" style ASS (research: ascynd.io 2025,
// EchoWave, libass docs). ALL-CAPS Anton 110, 9px black outline, 1-3 words
// per cue, yellow keyword, pop-in scale, centered at y=1260 (safe zone).
// ---------------------------------------------------------------------------
function assTime(sec) {
  const cs = Math.round(Math.max(0, sec) * 100); // integer centiseconds — 59.995+ carries into the next minute
  const h = Math.floor(cs / 360000);
  const m = Math.floor((cs % 360000) / 6000);
  const s = Math.floor((cs % 6000) / 100);
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs % 100).padStart(2, '0')}`;
}
const escAss = (s) => String(s || '').replace(/[{}\\]/g, '');

export function buildAssCaptions(words, opts = {}) {
  const W = opts.w || 1080;
  const H = opts.h || 1920;
  const CX = opts.x || Math.round(W / 2);
  const CY = opts.y || 1260;
  const SIZE = opts.size || 110;
  const clean = words.map((w) => ({ ...w, t: stripPunct(w.w).toUpperCase() })).filter((w) => w.t);
  // group into cues of <=3 words; break on sentence punctuation or a >0.45s gap
  const cues = [];
  let cur = [];
  for (let i = 0; i < clean.length; i++) {
    cur.push(clean[i]);
    const punct = /[.!?…]$/.test(clean[i].w);
    const gap = i + 1 < clean.length ? clean[i + 1].s - (clean[i].s + clean[i].d) : 0;
    if (cur.length >= 3 || punct || gap > 0.45 || i === clean.length - 1) {
      cues.push({ start: cur[0].s, end: cur[cur.length - 1].s + cur[cur.length - 1].d, words: cur });
      cur = [];
    }
  }

  const lines = cues.map((c) => {
    const keyword = c.words.map((w) => w.t).reduce((a, b) => (b.length > a.length ? b : a), '');
    const body = c.words.map((w) => (w.t === keyword && w.t.length > 2
      ? `{\\c${ASS_YELLOW}}${escAss(w.t)}{\\c${ASS_WHITE}}`
      : escAss(w.t))).join(' ');
    const pop = `\\fad(30,30)\\t(0,90,\\fscx114\\fscy114)\\t(90,240,\\fscx100\\fscy100)`;
    return `Dialogue: 0,${assTime(c.start)},${assTime(Math.max(c.end, c.start + 0.35))},Hormozi,,0,0,0,,{\\an5\\pos(${CX},${CY})${pop}}${body}`;
  });

  return `[Script Info]
ScriptType: v4.00+
PlayResX: ${W}
PlayResY: ${H}
WrapStyle: 2
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Hormozi,Anton,${SIZE},${ASS_WHITE},&H000000FF,&H00000000,&H00000000,-1,0,0,0,100,100,0,0,1,${Math.max(4, Math.round(SIZE / 14))},0,5,60,60,640,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
${lines.join('\n')}
`;
}

// ---------------------------------------------------------------------------
// Hook builder — style rotation (playbook Part 4: rotation beats one template)
// ---------------------------------------------------------------------------
function buildHook(postData, styleIndex) {
  const headline = (postData?.headline || 'STAY SILENT AND BUILD').toUpperCase();
  const style = HOOK_STYLES[styleIndex % HOOK_STYLES.length];
  let prefix = null;
  if (style === 'curiosity') prefix = CURIOSITY_PREFIX[styleIndex % CURIOSITY_PREFIX.length];
  if (style === 'negative' && !/^(STOP|NEVER|DON'T|DO NOT|QUIT)/.test(headline)) prefix = 'STOP.';
  let accentWord = null;
  if (style === 'emphasis') {
    accentWord = headline.split(/\s+/).filter((w) => w.length > 3).sort((a, b) => b.length - a.length)[0] || null;
  }
  const hookLines = wrapTextToLines(headline, 11).slice(0, 3);
  return { style, prefix, hookLines, accentWord };
}

// ---------------------------------------------------------------------------
// Overlay PNG — Quote Quarry identity: eyebrow + huge hook + footer.
// (The spoken words live in the ASS captions, so no body text needed when
// narration is present.)
// ---------------------------------------------------------------------------
async function renderOverlay(pageId, brand, hook, bodyLines, takeaway, withNarration) {
  const hlLines = hook.hookLines;
  const hSize = hlLines.some((l) => l.length > 9) ? 100 : 122;
  const hSp = Math.round(hSize * 1.04);
  const prefixY = 430;
  const hookTop = hook.prefix ? 540 : 470;
  const anchor = 'text-anchor="middle" x="540"';

  const hlEls = hlLines.map((line, i) => {
    let inner = escapeXml(line);
    if (hook.accentWord && line.includes(hook.accentWord)) {
      const esc = hook.accentWord.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      inner = line.split(new RegExp(`(${esc})`)).map((p) => (p === hook.accentWord
        ? `<tspan fill="${brand.accent}">${escapeXml(p)}</tspan>`
        : escapeXml(p))).join('');
    }
    return `<text ${anchor} y="${hookTop + i * hSp}" font-family="'Anton', 'Impact', 'Arial Black', sans-serif" font-size="${hSize}" fill="#FFFFFF">${inner}</text>`;
  }).join('\n  ');

  let bodyEls = '';
  let takeawayEl = '';
  if (!withNarration) {
    const bSize = 50;
    const bSp = Math.round(bSize * 1.4);
    const bodyTop = Math.min(1210, hookTop + hlLines.length * hSp + 200);
    bodyEls = (bodyLines || []).map((line, i) =>
      `<text ${anchor} y="${bodyTop + i * bSp}" font-family="'Oswald', 'Arial Narrow', sans-serif" font-size="${bSize}" fill="#E8E8E8">${escapeXml(line)}</text>`).join('\n  ');
    if (takeaway) {
      takeawayEl = `<text ${anchor} y="${Math.min(1600, bodyTop + (bodyLines || []).length * bSp + 110)}" font-family="'Oswald', 'Arial Narrow', sans-serif" font-weight="600" font-size="44" fill="${brand.accent}">${escapeXml(takeaway)}</text>`;
    }
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920" viewBox="0 0 1080 1920">
  <defs><style>${EMBEDDED_FONTS_CSS}</style></defs>
  <text ${anchor} y="300" font-family="'Oswald', 'Arial Narrow', sans-serif" font-weight="500" font-size="28" letter-spacing="7" fill="${brand.accent}">${escapeXml(brand.eyebrow || `QUOTE QUARRY // ${brand.label}`)}</text>
  ${hook.prefix ? `<text ${anchor} y="${prefixY}" font-family="'Oswald', 'Arial Narrow', sans-serif" font-weight="600" font-size="40" letter-spacing="5" fill="${brand.accent}">${escapeXml(hook.prefix)}</text>` : ''}
  ${hlEls}
  ${bodyEls}
  ${takeawayEl}
  <text ${anchor} y="1798" font-family="'Oswald', 'Arial Narrow', sans-serif" font-weight="500" font-size="30" letter-spacing="4" fill="#9A9A9A">${escapeXml(brand.handle || '@quotequarry302')} • DAILY ${escapeXml(brand.kwShort.toUpperCase())}</text>
</svg>`;
  const file = `${POOL_DIR}/yt-overlay-${pageId}.png`;
  await sharp(Buffer.from(svg)).png().toFile(file);
  return file;
}

// ---------------------------------------------------------------------------
// SEO metadata (playbook Part 3)
// ---------------------------------------------------------------------------
const capitalized = (s) => titleCase(s);

export async function renderYouTubeThumbnail(headline, cleanFrameFile, opts = {}) {
  const accent = opts.accent || '#F5E31C';
  const eyebrow = opts.eyebrow || 'QUOTE QUARRY';
  const b64 = await sharp(cleanFrameFile).resize(1280, 720, { fit: 'cover', position: 'attention' }).jpeg({ quality: 88 }).toBuffer();

  const raw = String(headline || 'DAILY MOTIVATION')
    .replace(/#[\w]+/g, '').replace(/[—|].*$/, '').trim().toUpperCase();
  let lines = wrapTextToLines(raw, 13).slice(0, 3);
  let size = lines.some((l) => l.length > 10) ? 128 : 150;
  if (lines.length === 1 && lines[0].length <= 8) size = 180;
  const accentWord = lines.join(' ').split(/\s+/).filter((w) => w.length > 3).sort((a, b) => b.length - a.length)[0] || null;

  const esc = accentWord ? accentWord.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') : null;
  const lineEls = lines.map((line, i) => {
    let inner = escapeXml(line);
    if (esc && line.includes(accentWord)) {
      inner = line.split(new RegExp(`(${esc})`)).map((p) => (p === accentWord
        ? `<tspan fill="${accent}">${escapeXml(p)}</tspan>`
        : escapeXml(p))).join('');
    }
    const y = 330 + i * (size + 18);
    return `<text text-anchor="middle" x="640" y="${y}" font-family="'Anton', 'Impact', 'Arial Black', sans-serif" font-size="${size}" fill="#000000" opacity="0.65" filter="url(#soft)" transform="translate(0,10)">${inner}</text>
  <text text-anchor="middle" x="640" y="${y}" font-family="'Anton', 'Impact', 'Arial Black', sans-serif" font-size="${size}" fill="#FFFFFF">${inner}</text>`;
  }).join('\n  ');

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720">
  <defs><style>${EMBEDDED_FONTS_CSS}</style>
    <filter id="soft" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="12"/></filter>
    <linearGradient id="vg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="rgba(0,0,0,0.42)"/><stop offset="0.55" stop-color="rgba(0,0,0,0.62)"/><stop offset="1" stop-color="rgba(0,0,0,0.85)"/>
    </linearGradient>
  </defs>
  <image href="data:image/jpeg;base64,${b64.toString('base64')}" x="0" y="0" width="1280" height="720" preserveAspectRatio="xMidYMid slice"/>
  <rect width="1280" height="720" fill="url(#vg)"/>
  <text text-anchor="middle" x="640" y="120" font-family="'Oswald', 'Arial Narrow', sans-serif" font-weight="600" font-size="34" letter-spacing="10" fill="${accent}">${escapeXml(eyebrow)}</text>
  <rect x="560" y="150" width="160" height="7" rx="3.5" fill="${accent}"/>
  ${lineEls}
</svg>`;
  return sharp(Buffer.from(svg), { density: 150 }).resize(1280, 720).jpeg({ quality: 92 }).toBuffer();
}

// ---------------------------------------------------------------------------
// Main renderer — returns { buffer, meta } for the YouTube Short
// ---------------------------------------------------------------------------
// Emergency-script line templates — varied copy per theme (see #12/#91: the
// fallback is kit-driven and must never throw; it is the last line of defense
// when every LLM provider fails)
const FALLBACK_LINE_TEMPLATES = [
  (t) => `Most people treat "${t}" as an idea. Winners treat it as a daily practice — small, deliberate, repeatable.`,
  (t) => `Nobody is coming to hand you "${t}". You build it in silence, one decision at a time.`,
  (t) => `Protect your "${t}" like an asset. The moment you guard it, everything downstream gets easier.`,
  (t) => `"${t}" looks boring on day one. On day one hundred it looks like a superpower.`,
  (t) => `Cut one thing that drains your "${t}" today. Subtraction is the fastest form of progress.`,
];

function fallbackScriptFor(brand) {
  const niche = String(brand?.niche || 'timeless wisdom and self-mastery');
  const themes = (brand?.tags || []).slice(0, 5);
  for (const t of niche.split(/[,&]/).map((x) => x.trim()).filter((x) => x.length > 3)) {
    if (themes.length >= 5) break;
    if (!themes.includes(t)) themes.push(t);
  }
  const spare = ['discipline', 'focus', 'patience', 'purpose', 'consistency'];
  while (themes.length < 5) themes.push(spare[themes.length]);
  return {
    hook: `5 principles of ${niche.split(/[,&]/)[0].trim().toLowerCase()} that separate you from 99% of people.`,
    points: themes.map((t, i) => ({ title: String(t).toUpperCase().slice(0, 36), line: FALLBACK_LINE_TEMPLATES[i % FALLBACK_LINE_TEMPLATES.length](t) })),
    closing: 'Which one do you live by? Comment the number.',
    thumbHeadline: '5 PRINCIPLES THAT SEPARATE YOU FROM 99%',
  };
}

// ---------------------------------------------------------------------------
// #104 Task 6 — the script brain routes through the capability registry
// (lib/ai-adapter.mjs). The hand-coded provider chains (doc: gemini → groq →
// cloudflare; shorts: gemini → groq → cerebras → mistral → hf) are GONE per
// AC-P2-10: provider ORDER and FALLBACK now belong to routeAndCall('script-gen')
// — channel routes → workspace default → catalog baseline. What stays
// caller-owned is the JSON CONTRACT (prompt + shape validation — only the
// brain knows what a usable script looks like) and the escalation-retry walk
// (the retired per-provider "reply with raw JSON ONLY" retries, now
// chain-wide). Two seams preserve the retired chains' semantics across the
// swap:
//   - scriptGenRouting(): hf is FILTERED at the selection seam (dead paid
//     lane — zero free credits, Task 1 review carry-forward) and openai is
//     only ever reachable via an EXPLICIT route (a paid lane must never enter
//     the zero-config baseline);
//   - scriptShapeGate(): a provider reply that parses but fails the brain's
//     shape check is surfaced to the adapter as unusable content, so
//     fail-continue still walks to the next provider (the retired chains'
//     bad-shape fall-through).
// ---------------------------------------------------------------------------

// Shared loose parse (deepdive's old parseLoose): tolerates code fences and
// prose around the JSON object. Throws when no JSON object is present.
export function parseScriptJson(content) {
  const t = String(content || '').replace(/```json|```/g, '').trim();
  return JSON.parse(t.slice(t.indexOf('{'), t.lastIndexOf('}') + 1));
}

// Dead paid lane — never routed, never a fallback candidate (research
// 2026-10-28: HF free tier ships zero monthly credits; Llama-3.1-8B was the
// known long-JSON truncator).
export const SCRIPT_GEN_DEAD_LANES = ['hf'];
// Paid lanes excluded from the IMPLICIT baseline only: with zero routes
// configured the brain stays on today's free behavior; an explicit route
// (user story 10's slot-0 UI action) reaches openai's adapter-pinned chat lane.
export const SCRIPT_GEN_BASELINE_PAID = ['openai'];

export function filterScriptGenRoutes(routes) {
  return (Array.isArray(routes) ? routes : []).filter((r) => r && !SCRIPT_GEN_DEAD_LANES.includes(r.providerId));
}

export function baselineScriptGenRoutes() {
  return capabilityProviders('script-gen')
    .filter((id) => !SCRIPT_GEN_DEAD_LANES.includes(id) && !SCRIPT_GEN_BASELINE_PAID.includes(id))
    .map((providerId, i) => ({ providerId, priority: i + 1, source: 'baseline' }));
}

// Routing wrapper passed to routeAndCall as injected.routing: delegates to the
// real Task-3 routing (lazy — importing this module never touches the DB),
// filters the dead lanes, and substitutes the FILTERED baseline whenever
// routing is unavailable or empty (otherwise routeAndCall would build its own
// UNfiltered baseline). Non-script-gen capabilities delegate verbatim and
// return [] on failure — routeAndCall's own baseline is correct for those.
export function scriptGenRouting(realRouting = null) {
  return {
    async resolveCapability(capability, channelId) {
      if (capability !== 'script-gen') {
        if (!realRouting) return [];
        try { return await realRouting.resolveCapability(capability, channelId); } catch { return []; }
      }
      let routes = [];
      try {
        if (!realRouting) {
          const { getProviderRouting } = await import('./studio/lib/provider-routing.js');
          realRouting = await getProviderRouting();
        }
        routes = await realRouting.resolveCapability(capability, channelId);
      } catch (e) {
        console.log(`[script-brain] routing unavailable — filtered baseline (${String(e?.message || e).slice(0, 80)})`);
        routes = [];
      }
      const filtered = filterScriptGenRoutes(routes);
      return filtered.length > 0 ? filtered : baselineScriptGenRoutes();
    },
  };
}

// Mirror of the adapter's content extraction (callGemini reads
// candidates[0].content.parts[0].text; the one OpenAI-compatible client reads
// choices[0].message.content) so the gate inspects exactly what the adapter
// will return. Returns null for non-JSON bodies — those pass through and the
// adapter classifies parse_error itself.
export function extractScriptText(url, text) {
  let j;
  try { j = JSON.parse(text); } catch { return null; }
  if (String(url).includes('generativelanguage.googleapis.com')) {
    return j?.candidates?.[0]?.content?.parts?.[0]?.text || '';
  }
  return j?.choices?.[0]?.message?.content || '';
}

// Fetch wrapper: a usable reply passes through byte-identical; a reply whose
// content fails the brain's shape check is rebuilt with an EMPTY body at the
// same status, which the adapter reads as parse_error and fail-continues to
// the next provider (no doomed retries, no lost fallback).
export function scriptShapeGate(fetchImpl, isUsableContent) {
  const rebuild = (text, res) => {
    try {
      return new Response(text, { status: res.status || 200, statusText: res.statusText || '', headers: res.headers || undefined });
    } catch { return res; }
  };
  const usable = (content) => {
    try { return isUsableContent(content); } catch { return false; } // a throwing validator = unusable
  };
  return async (url, init) => {
    const res = await fetchImpl(url, init);
    if (!res || !res.ok) return res;
    const text = await res.text();
    const extracted = extractScriptText(url, text);
    if (extracted === null || usable(extracted)) return rebuild(text, res);
    return rebuild('', res);
  };
}

// Adapter error classes worth an escalation walk: the provider RESPONDED but
// the payload was unusable, so the raw-JSON-only suffix can help. HTTP/network
// failures never re-walk (outage economics preserved: one walk, fail fast).
const SHAPE_RETRY_CLASSES = new Set(['parse_error', 'empty_response']);

/**
 * One script-brain request over the capability registry. Walks routeAndCall
 * up to maxAttempts times (attempt n>1 appends `suffix` to the prompt chain-
 * wide — the retired per-provider escalation retries). The shape gate keeps
 * bad-shape replies flowing to later providers WITHIN a walk. Never throws.
 * @param {object} o { slug, jobId, prompt, isValidJson(parsed)=>bool, maxAttempts, suffix, injected }
 * @returns {Promise<{ ok: true, parsed: object, provider: string, model: string|null, attempts: object[], walk: number }
 *                   |{ ok: false, attempts: object[], error: string }>}
 */
export async function callScriptBrain({ slug = null, jobId = null, prompt, isValidJson, maxAttempts = 1, suffix = '', injected = null }) {
  const isUsableContent = (content) => {
    try { return isValidJson(parseScriptJson(content)); } catch { return false; }
  };
  const injectedAdapter = {
    routing: scriptGenRouting(injected?.realRouting || null),
    keys: injected?.keys,
    writer: injected?.writer,
    fetch: scriptShapeGate(injected?.fetch || fetch, isUsableContent),
    env: injected?.env,
  };
  let last = null;
  for (let attempt = 1; attempt <= Math.max(1, maxAttempts); attempt++) {
    const res = await routeAndCall('script-gen', {
      slug: slug || undefined,
      jobId: jobId || undefined,
      prompt: attempt > 1 ? prompt + suffix : prompt,
      injected: injectedAdapter,
    });
    last = res;
    if (res.ok) {
      let parsed = null;
      try { parsed = parseScriptJson(res.content); } catch { parsed = null; }
      if (parsed && isValidJson(parsed)) {
        return { ok: true, parsed, provider: res.usage?.provider || 'unknown', model: res.usage?.model || null, attempts: res.attempts, walk: attempt };
      }
    }
    if (!(res.attempts || []).some((a) => SHAPE_RETRY_CLASSES.has(a.error_class))) break;
  }
  return { ok: false, attempts: last?.attempts || [], error: last?.error || 'script_brain_exhausted' };
}

// The shorts JSON contract — identical check across every retired provider arm.
const validShortsScript = (p) => p?.hook && Array.isArray(p.points) && p.points.length >= 4;

export async function generateYouTubeScript(page, forcedTheme = null, opts = {}) {
  const brand = resolveBrand(page);
  const fallback = fallbackScriptFor(brand);
  // The retired `if (!geminiKey()) return fallback` gate died with the chain
  // config: eligibility is whatever the registry resolves. With nothing
  // configured the walk below still lands on the template fallback — the
  // zero-config terminal behavior is unchanged (source 'fallback').
  // 09-30: static theme lists are gone. The caller passes a research-derived
  // topic directive; without one, the model chooses from the live trend
  // signals (or the niche itself as last resort).
  const themeLine = forcedTheme
    ? `Topic for this script (MUST be about exactly this): ${forcedTheme}`
    : page.trend
      ? `Choose the single most compelling topic for today's video yourself, derived from the viral signals below. Do NOT copy any existing title.`
      : `Choose the single most compelling, most searched topic in the niche for today's video.`;
  const subNichesStr = Array.isArray(brand.niches) && brand.niches.length ? brand.niches.join(', ') : (brand.niche || 'self improvement');
  const styleLine = `You write viral, high-retention YouTube Shorts scripts for "${page.name || brand.label}" (Niche: ${brand.niche}).
Target content pillars: ${subNichesStr}.
Write in EASY, CLEAR, punchy English with high curiosity and immediate practical payoff. The points must deliver concrete insider-level insights that feel like real knowledge, not generic surface-level fluff.`;
  const trendBlock = page.trend ? `\nGOING VIRAL RIGHT NOW in this exact niche (ride this wave — align your angle and wording with what is working): ${page.trend.videos.slice(0, 5).map(v => `"${v.title}"`).join(' | ')}\nHot search keywords to weave in naturally: ${page.trend.hotKeywords.join(', ')}.` : '';
  // RETENTION ENGINE (09-19: IC/MR/DFD sat at 35-54% avg-watched and the Shorts
  // feed buried them; QQ's 86% proves the format works when viewers stay)
  const SC = brand.script || null;
  const hookRule = SC ? `\nHOOK RULES (the first 2 seconds decide the swipe — obey ALL):
• Open with a question, a shocking number, or a stake that involves "you". NEVER a definition, a greeting, a setup, or a list announcement ("here are N things..." is BANNED).
• The hook must open a loop that only closes at the end.` : '';
  const pacingRule = SC ? `\nPACING RULES (viewers swipe away at the first weak line):
• Exactly ${SC.points} points. Each point line: ${SC.lineWords} words. One concrete idea per line, opened with the payoff itself — zero filler, zero transitions, no repeating an earlier point.
• Closing: a punchline, challenge, or mic-drop line (≤10 words) that makes the viewer rewatch or comment. NEVER a summary and never "follow for more".` : '';
  const titleRule = SC ? `\nthumb_headline MUST use this proven ${SC.titleStyle} pattern: ${SC.titleExamples}. Max 8 words.` : '';
  const structureLine = SC
    ? `Structure: hook (≤10 words), ${SC.points} numbered points (each line ${SC.lineWords} words), closing (≤10 words). Target: ~${SC.targetSeconds} seconds spoken.`
    : 'Structure: a curiosity-gap hook, 5 numbered points, a memorable closing line.';
  const prompt = `${styleLine}
Write in EASY, CLEAR, punchy English.
${themeLine}${trendBlock}${hookRule}${pacingRule}${titleRule}
${structureLine}
Return ONLY valid JSON:
{"hook":"<=12 words","thumb_headline":"<=6 word ALL CAPS thumbnail headline","points":[{"title":"2-5 word ALL CAPS title","line":"1-2 short sentences"},{"title":"...","line":"..."},{"title":"...","line":"..."},{"title":"...","line":"..."}],"closing":"<=12 words"}`;
  try {
    const slug = page?.ytSlug || page?.slug || page?.id || null;
    const res = await callScriptBrain({
      slug,
      jobId: `ytscript:${slug || 'unknown'}:${new Date().toISOString().slice(0, 10)}`,
      prompt,
      isValidJson: validShortsScript,
      // the retired HF second-try escalation, now chain-wide (walk 2 appends
      // the suffix to whichever providers are routed)
      maxAttempts: 2,
      suffix: '\nIMPORTANT: reply with the raw JSON object ONLY, no other text.',
      injected: opts.injected || null, // real path: registry routing + vault keys + usage ledger
    });
    if (res.ok) {
      console.log(`      [YT Script] ${res.provider} script OK${res.walk > 1 ? ` (attempt ${res.walk})` : ''}`);
      return { ...res.parsed, points: res.parsed.points.slice(0, 5), closing: res.parsed.closing || '', thumbHeadline: res.parsed.thumb_headline || `${res.parsed.points.length} RULES`, source: res.provider };
    }
  } catch (e) {
    console.log(`      [YT Script] script brain failed (${String(e?.message || e).slice(0, 80)}) — template fallback`);
  }
  return { ...fallback, source: 'fallback' };
}

async function renderSectionCard(pageId, accent, section, handle, kwShort) {
  const anchor = 'text-anchor="middle" x="540"';
  const els = [];
  if (section.kicker) {
    els.push(`<text ${anchor} y="330" font-family="'Oswald', 'Arial Narrow', sans-serif" font-weight="600" font-size="38" letter-spacing="6" fill="${accent}">${escapeXml(section.kicker)}</text>`);
  }
  // 2026-11-03 rebalance: with the sub line gone, number+title hugged the top
  // edge and left a hole above the caption band (y≈1260) — the block now sits
  // in the visual center; point titles cap at 3 lines to clear the band.
  let y = section.kicker ? 640 : 560;
  if (section.num) {
    els.push(`<text ${anchor} y="520" font-family="'Anton', 'Impact', 'Arial Black', sans-serif" font-size="200" fill="${accent}">${escapeXml(section.num)}</text>`);
    y = 740;
  }
  const bigLines = wrapTextToLines((section.big || '').toUpperCase(), 14).slice(0, section.num ? 3 : 4);
  const bSize = bigLines.some((l) => l.length > 11) ? 76 : 96;
  bigLines.forEach((l, i) => els.push(
    `<text ${anchor} y="${y + i * (bSize + 12)}" font-family="'Anton', 'Impact', 'Arial Black', sans-serif" font-size="${bSize}" fill="#FFFFFF" stroke="#000000" stroke-width="8" stroke-linejoin="round" paint-order="stroke">${escapeXml(l)}</text>`));
  y += bigLines.length * (bSize + 12) + (bigLines.length ? 70 : 0);
  if (section.sub) {
    const subLines = wrapTextToLines(section.sub, 30).slice(0, 4);
    subLines.forEach((l, i) => els.push(
      `<text ${anchor} y="${y + i * 64}" font-family="'Oswald', 'Arial Narrow', sans-serif" font-size="46" fill="#E8E8E8">${escapeXml(l)}</text>`));
  }
  els.push(`<text ${anchor} y="1798" font-family="'Oswald', 'Arial Narrow', sans-serif" font-weight="500" font-size="30" letter-spacing="4" fill="#9A9A9A">${escapeXml(handle || '@quotequarry302')} • DAILY ${escapeXml((kwShort || 'WISDOM').toUpperCase())}</text>`);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920" viewBox="0 0 1080 1920">
  <defs><style>${EMBEDDED_FONTS_CSS}</style></defs>
  ${els.join('\n  ')}
</svg>`;
  const file = `${POOL_DIR}/yt-script-card-${Math.random().toString(36).slice(2, 7)}.png`;
  await sharp(Buffer.from(svg)).png().toFile(file);
  return file;
}

export async function renderYouTubeScriptShort(page, script, musicOverride = null) {
  const brand = resolveBrand(page);
  if (!brand) throw new Error('no YouTube config for page ' + page?.id);
  console.log(`[YouTube Script Short] ${brand.label} ("${script.thumbHeadline}", ${script.source})...`);
  const clip = (await getTopicClip(page, { headline: script.thumbHeadline, insight_body: script.hook })) || await ensurePoolClip(page.id);

  const sections = [
    { text: script.hook, kicker: 'WATCH TILL THE END', big: script.hook },
    ...script.points.map((p, i) => {
      // strip AI-included numbering ("1." / "Point 2:") — we add our own number,
      // otherwise the narration says the number twice ("1, 1, …")
      const clean = String(p.title || '').replace(/^\s*(?:\d+\s*[.)]|point\s*\d+\s*[.:)]?)\s*/i, '').trim();
      return {
        text: `${i + 1}. ${clean}. ${p.line}`,
        num: String(i + 1), big: clean,
        // captions start at p.line — the card already shows "N clean" in huge
        // type, so karaoke-ing the title again duplicated it on screen (2026-11-03)
        capSkip: `${i + 1}. ${clean}.`.split(/\s+/).filter(Boolean).length,
      };
    }),
    { text: script.closing, kicker: 'REMEMBER THIS', big: script.closing }
  ].filter((s) => s.text);

  const scrimSvg = `<svg width="1080" height="1920" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="rgba(8,8,10,0.45)"/><stop offset="0.45" stop-color="rgba(8,8,10,0.64)"/><stop offset="1" stop-color="rgba(8,8,10,0.84)"/>
  </linearGradient></defs><rect width="1080" height="1920" fill="url(#g)"/></svg>`;
  const scrimFile = `${POOL_DIR}/yt-script-scrim-${page.id}.png`;
  await sharp(Buffer.from(scrimSvg)).png().toFile(scrimFile);

  const buildDir = `${POOL_DIR}/yt-script-build`;
  fs.rmSync(buildDir, { recursive: true, force: true });
  fs.mkdirSync(buildDir, { recursive: true });

  let cum = 0;
  const segFiles = [];
  for (let i = 0; i < sections.length; i++) {
    const sec = sections[i];
    const narration = narrate(sec.text, `${page.id}-s${i}`, brand.voice);
    const lastW = narration ? narration.words[narration.words.length - 1] : null;
    const dur = lastW
      ? Math.max(3.5, Math.min(20, Math.round((lastW.s + lastW.d + 0.8) * 10) / 10))
      : 4.5;
    const card = await renderSectionCard(page.id, brand.accent, sec, brand.handle, brand.kwShort);
    const segFile = path.resolve(`${buildDir}/seg-${String(i).padStart(2, '0')}.mp4`);
    const chain = `[0:v]crop=ih*9/16:ih,scale=1080:1920,eq=saturation=1.04:contrast=1.06` +
      (i === 0 ? `,fade=t=in:st=0:d=0.4` : ``) + `,fade=t=out:st=${Math.max(0, dur - 0.35).toFixed(1)}:d=0.35[bv];` +
      `[1:v]scale=1080:1920[sc];[bv][sc]overlay=0:0[base];[base][3:v]overlay=0:0[ov]`;
    let filter, inputs;
    if (narration) {
      // relative path only — a Windows drive colon breaks the filtergraph parser
      const assFile = `${buildDir}/cap-${i}.ass`;
      fs.writeFileSync(assFile, buildAssCaptions(sec.capSkip ? narration.words.slice(sec.capSkip) : narration.words), 'utf8');
      filter = chain + `;[ov]ass=${assFile}:fontsdir=image-tools/fonts[v];[2:a]apad=pad_dur=1,atrim=0:${dur}[a]`;
      inputs = ['-i', narration.file];
    } else {
      filter = chain + `;[ov]null[v];anullsrc=r=44100:cl=stereo,atrim=0:${dur}[a]`;
      inputs = ['-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo'];
    }
    execFileSync(FF, ['-y', '-stream_loop', '-1', '-ss', String(clip.start), '-i', clip.file, '-i', scrimFile,
      ...inputs, '-i', card, '-filter_complex', filter, '-map', '[v]', '-map', '[a]',
      '-t', String(dur), '-r', '30', '-pix_fmt', 'yuv420p',
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20',
      '-c:a', 'aac', '-b:a', '160k', '-video_track_timescale', '15360', segFile],
      { stdio: ['ignore', 'ignore', 'pipe'] });
    fs.rmSync(card, { force: true });
    if (narration) fs.rmSync(narration.file, { force: true });
    segFiles.push(segFile);
    cum += dur;
  }

  const total = Math.min(60, Math.round(cum * 10) / 10);
  const musicArgs = musicOverride?.file ? ['-stream_loop', '-1', '-i', musicOverride.file] : ['-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo'];
  const musicIdx = segFiles.length;
  const filter = `${segFiles.map((_, i) => `[${i}:v][${i}:a]`).join('')}concat=n=${segFiles.length}:v=1:a=1[vc][ac];` +
    `[vc]format=yuv420p[v];[${musicIdx}:a]volume=0.13,atrim=0:${total},afade=t=out:st=${Math.max(0, total - 1.2).toFixed(1)}:d=1.2[am];` +
    `[ac][am]amix=inputs=2:duration=first:normalize=0[aout]`;
  const outFile = `${POOL_DIR}/yt-script-short-${page.id}.tmp.mp4`;
  execFileSync(FF, ['-y', ...segFiles.map((f) => ['-i', f]).flat(), ...musicArgs,
    '-filter_complex', filter, '-map', '[v]', '-map', '[aout]',
    '-t', String(total), '-r', '30', '-pix_fmt', 'yuv420p',
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '20',
    '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', outFile],
    { stdio: ['ignore', 'ignore', 'pipe'], timeout: 15 * 60 * 1000 });
  const buf = fs.readFileSync(outFile);
  fs.rmSync(outFile, { force: true });
  fs.rmSync(buildDir, { recursive: true, force: true });

  let thumb = null;
  try {
    const frameFile = `${POOL_DIR}/yt-thumb-frame-${page.id}.jpg`;
    // b-roll windows can end before start+3 — seeking past the clip end yields
    // no frame and killed the thumbnail on the 11-03 runs. Step the seek
    // offset back until a frame actually lands (2026-11-03).
    let extracted = false;
    for (const off of [3, 1, 0]) {
      try {
        execFileSync(FF, ['-y', '-v', 'error', '-ss', String(clip.start + off), '-i', clip.file, '-frames:v', '1', frameFile]);
        extracted = fs.existsSync(frameFile) && fs.statSync(frameFile).size > 0;
      } catch { extracted = false; }
      if (extracted) break;
    }
    if (!extracted) throw new Error('no frame extracted from b-roll clip');
    thumb = await renderYouTubeThumbnail(script.thumbHeadline || script.hook, frameFile, { accent: brand.accent, eyebrow: brand.eyebrow || `QUOTE QUARRY // ${brand.label}` });
    fs.rmSync(frameFile, { force: true });
  } catch (e) { console.log(`      [YT Script] Thumbnail skipped (${String(e.message).slice(0, 80)})`); }

  const meta = buildScriptMeta(page, script, musicOverride ? `${musicOverride.title} — ${musicOverride.credit}` : '');
  console.log(`      ✓ Script Short rendered (${Math.round(buf.length / 1024)} KB, ${total}s, ${sections.length} sections)`);
  return { buffer: buf, thumb, meta, duration: total };
}

export function buildScriptMeta(page, script, musicLabel = '') {
  const brand = resolveBrand(page);
  const authority = brand.authority || `${brand.niche || 'Daily'} Wisdom`;
  const title = `${titleCase(script.thumbHeadline)} | ${authority}`.replace(/\s+/g, ' ').slice(0, 95);
  const visibleTags = (brand.tags?.length ? brand.tags : [brand.niche || 'shorts']).slice(0, 3).map((t) => '#' + String(t).replace(/\s+/g, '').replace(/[^a-zA-Z0-9]/g, ''));
  const descCore = [
    `${titleCase(script.hook)}.`,
    '',
    ...script.points.map((p, i) => `${i + 1}. ${titleCase(p.title)} — ${p.line}`),
    '',
    String(script.closing || ''),
    `Follow ${brand.followName || brand.label || 'us'} for daily ${brand.kwShort || 'insights'}.`,
    visibleTags.join(' ')
  ].join('\n').slice(0, 480);
  const description = musicLabel ? `${descCore}\n🎵 ${musicLabel}`.slice(0, 4900) : descCore;
  // the ranking tag sets these channels actually use (from competitor-scan)
  const tags = [...(page.trend?.hotKeywords || []), ...(brand.tags || []), 'life lessons'].filter((t, i, a) => a.indexOf(t) === i).slice(0, 12);
  return { title, description, tags, format: 'script', keyword: brand.keyword };
}
