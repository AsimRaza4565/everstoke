#!/usr/bin/env node
// CodeBerry template renderer v2 — CloudXBerry-style 16:9 dev explainers with CONTINUOUS motion.
// brief.json (beats + scenes + ambient) -> Edge TTS -> deterministic component scenes animated on ONE GSAP timeline
// (GSAP pro plugins now free: DrawSVG, MotionPath; plus Three.js for the 3D globe) -> check -> render MP4.
// Usage: node hyperframes/render-codeberry.mjs hyperframes/briefs/<slug>.json

import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
try {
  for (const line of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
} catch { }
const HF_DIR = path.join(ROOT, 'hyperframes');
const HF_VER = '0.8.152';

const briefPath = process.argv[2];
if (!briefPath) { console.error('usage: node render-codeberry.mjs <brief.json>'); process.exit(1); }
const brief = JSON.parse(fs.readFileSync(path.resolve(briefPath), 'utf8'));
const slug = brief.slug || path.basename(briefPath, '.json');
const W = brief.width || 1920, H = brief.height || 1080;
const VOICE = brief.voice || 'en-US-AndrewNeural';
const brand = brief.brand || 'Byte Theory';
const kicker = brief.kicker || brand;
const amb = brief.ambient || { a: '#a78bfa', b: '#fbbf24' };
const GAP = brief.minutes ? 0.35 : 0.55;

// ---------- icons ----------
const ICONS = {
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.8 2.6 4 5.6 4 9s-1.2 6.4-4 9c-2.8-2.6-4-5.6-4-9s1.2-6.4 4-9z"/>',
  lock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  server: '<rect x="4" y="4" width="16" height="7" rx="2"/><rect x="4" y="13" width="16" height="7" rx="2"/><path d="M8 8h.01M8 17h.01"/>',
  link: '<path d="M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1.5 1.5M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7L12.5 19"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>',
  idcard: '<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="11" r="2"/><path d="M14 9h4M14 13h4M6 16c.8-1.2 4.2-1.2 5 0"/>',
  book: '<path d="M4 19V5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2zm0 0a2 2 0 0 0 2 2h13"/>',
  phone: '<rect x="7" y="2.5" width="10" height="19" rx="2.5"/><path d="M11 18.5h2"/>',
  code: '<path d="M8 6l-6 6 6 6M16 6l6 6-6 6"/>',
  tag: '<path d="M3 11V4a1 1 0 0 1 1-1h7l10 10-8 8L3 11z"/><circle cx="8" cy="8" r="1.6"/>',
  chat: '<path d="M21 12a8 8 0 0 1-8 8H4l2-3a8 8 0 1 1 15-5z"/><path d="M8.5 11h.01M12 11h.01M15.5 11h.01"/>',
  zap: '<path d="M13 2 4 14h6l-1 8 9-12h-6l1-8z"/>',
  db: '<ellipse cx="12" cy="5.5" rx="8" ry="3"/><path d="M4 5.5V18.5c0 1.7 3.6 3 8 3s8-1.3 8-3V5.5M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/>',
  git: '<circle cx="6" cy="6" r="2.5"/><circle cx="6" cy="18" r="2.5"/><circle cx="18" cy="12" r="2.5"/><path d="M6 8.5v7M8.5 6h4a3 3 0 0 1 3 3v.5M8.5 18h4a3 3 0 0 0 3-3v-.5"/>',
};
const svg = (name, cls = '') => `<svg class="${cls}" viewBox="0 0 24 24">${ICONS[name] || ICONS.link}</svg>`;

// ---------- 0. auto plan: topic -> long-form script + scene plan (LLM writes the words, engine owns the visuals) ----------
const PACKS = {
  network: ['browser', 'globe', 'chain', 'search', 'code', 'result', 'pills'],
  git: ['commits', 'code', 'result', 'pills', 'chain'],
  realtime: ['browser', 'flow', 'code', 'result', 'pills', 'search'],
  generic: ['browser', 'chain', 'search', 'code', 'result', 'pills'],
};
const ICON_LIST = 'globe, lock, server, link, search, idcard, book, phone, code, tag, chat, zap, db, git';


// ---------- rich family composer (LLM-free): full-stage compositions, variant per beat ----------
const STOP = new Set('the and for with that this your from into when what how why its every before after because them they then than will been have has are was were not but all can our out one two also more most each both make makes made just only some such these those there their would could should about which while does doing done like very much many using used use you yours is be being it as at by of on to in a an or if so we he she i without within would should needs need know knows things thing stuff means mean called based still even ever never always another whole part parts first second third next last same other others around across instead yet quite really actually basically'.split(' '));
function contentWords(text) {
  return String(text).toLowerCase().replace(/[^a-z0-9\s']/g, ' ').split(/\s+/).filter((w) => w.length > 3 && !STOP.has(w));
}
const PACK_FAMILIES = {
  network: ['chain', 'window', 'payoff', 'route', 'search', 'cycle', 'timeline', 'pills', 'tree', 'funnel', 'chat'],
  git: ['commits', 'window', 'timeline', 'chain', 'payoff', 'funnel', 'pills', 'tree'],
  realtime: ['flow', 'chat', 'window', 'timeline', 'payoff', 'cycle', 'pills', 'search'],
  generic: ['chain', 'window', 'timeline', 'funnel', 'tree', 'route', 'cycle', 'payoff', 'pills', 'search', 'chat'],
};
function composeScene(i, b, beatsArr) {
  const fams = PACK_FAMILIES[brief.pack] || PACK_FAMILIES.generic;
  composeScene._used = composeScene._used || [];
  let idx = (i * 5 + Math.floor(i / 6)) % fams.length;
  let fam = fams[idx];
  let guard = 0;
  while (composeScene._used.slice(-3).includes(fam) && guard++ < fams.length) {
    idx = (idx + 1) % fams.length;
    fam = fams[idx];
  }
  composeScene._used.push(fam);
  if (composeScene._used.length > 4) composeScene._used.shift();
  const cw = contentWords(b.text);
  const ranked = [...cw].sort((a, b2) => b2.length - a.length);
  const w = (k) => cw[k % Math.max(1, cw.length)] || (b.em || 'step');
  const icons = ['server', 'globe', 'db', 'phone', 'zap', 'link', 'lock', 'book', 'search', 'chat', 'code', 'idcard'];
  const ic = (k) => icons[(i * 3 + k * 5) % icons.length];
  const vrot = ['v', 'g', 'e', 'p'];
  const slugUrl = `https://${(brief.topic || 'example').toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 16)}.dev/${w(0)}`;
  switch (fam) {
    case 'chain': {
      const stair = i % 2 === 1;
      const n = 3 + (i % 2);
      const seenT = new Set();
      const tiles = Array.from({ length: n }, (_, k) => {
        let cand = (k === 0 ? (b.em || w(0)) : w(k)).slice(0, 14);
        if (seenT.has(cand)) cand = (ranked.find((r2) => !seenT.has(r2)) || w(k + 1) || 'step ' + (k + 1)).slice(0, 14);
        seenT.add(cand);
        return { icon: ic(k), label: cand, variant: vrot[(i + k) % 4] };
      });
      return { type: 'chain', conn: i % 2 ? 'e' : '', packet: true, packetDur: 1.4, stair, tiles, result: i % 3 === 2 ? { icon: ic(n), label: (b.em || w(1)).slice(0, 14), variant: 'gold' } : null, caption: `STEP ${i + 1} / ${beatsArr.length}` };
    }
    case 'window': {
      const which = ['code', 'browser', 'search'][i % 3];
      if (which === 'code') return { type: 'code', title: 'terminal', width: 980, lines: [[{ t: '$ ', c: 'c' }, { t: `${w(0)} ${w(1) || '--go'}`, c: 'w' }], [{ t: `${w(2) || 'status'}  ${'OK'.slice(0, 2)} · ${(b.em || 'done').toUpperCase()}`, c: 's' }]], tag: (b.em || '').toUpperCase() };
      if (which === 'browser') return { type: 'browser', title: String(w(0) || 'app').toUpperCase(), url: slugUrl, sub: shortLine(b.text, 42) };
      return { type: 'search', title: 'lookup', width: 950, query: (w(0) || 'query').slice(0, 20), caption: shortLine(b.text, 36), results: [0, 1, 2].map((k) => ({ icon: ic(k), w: 80 - k * 24, label: (k === 0 ? b.em : w(k)).slice(0, 16) })) };
    }
    case 'payoff':
      return { type: 'result', icon: ic(1), big: (b.em || w(0)).slice(0, 13).toUpperCase(), label: shortLine(b.text, 40), ring: true };
    case 'search':
      return { type: 'search', title: 'records', width: 950, query: (b.em || w(0)).slice(0, 20), caption: `STEP ${i + 1} / ${beatsArr.length}`, results: [0, 1, 2].map((k) => ({ icon: ic(k + 1), w: 84 - k * 26, label: (w(k + 1) || '').slice(0, 16) })) };
    case 'pills': {
      const seen = new Set();
      const lab = (k) => {
        let cand = [b.em, ranked[0], w(1), w(2), w(0)][k] || w(0);
        if (seen.has(cand)) cand = ranked.find((r2) => !seen.has(r2)) || cand + ' ' + (k + 1);
        seen.add(cand);
        return cand.slice(0, 14).toUpperCase();
      };
      return { type: 'pills', items: [0, 1].map((k) => ({ icon: ic(k + 2), label: lab(k), variant: k ? 'emerald' : 'gold' })), caption: shortLine(b.text, 36) };
    }
    case 'timeline':
      return { type: 'timeline', labels: [0, 1, 2, 3].map((k) => ({ icon: ic(k + 1), label: (k === 0 ? (b.em || w(0)) : w(k + 1)).slice(0, 13) })) };
    case 'cycle':
      return { type: 'cycle', labels: [0, 1, 2, 3].map((k) => ({ icon: ic(k + 2), label: (k === 0 ? (b.em || w(0)) : w(k + 2)).slice(0, 13) })) };
    case 'funnel':
      return { type: 'funnel', labels: [0, 1, 2].map((k) => ({ icon: ic(k + 1), label: (k === 0 ? (b.em || w(0)) : w(k + 2)).slice(0, 16) })) };
    case 'tree':
      return { type: 'tree', labels: [{ icon: 'server', label: (b.em || w(0)).slice(0, 13) }, { icon: ic(2), label: w(1).slice(0, 13) }, { icon: ic(4), label: w(2).slice(0, 13) }, { icon: ic(6), label: w(3).slice(0, 13) }] };
    case 'route':
      return { type: 'route', labels: [0, 1, 2].map((k) => ({ icon: ic(k), label: (k === 0 ? (b.em || w(0)) : w(k + 2)).slice(0, 13) })) };
    case 'chat':
      return { type: 'chat', labels: [0, 1, 2].map((k) => ({ icon: ic(k), label: (k === 0 ? (b.em || w(0)) : w(k + 1)).slice(0, 16) })) };
    case 'commits': {
      const modes = ['plain', 'branch', 'merge', 'rebase'];
      return { type: 'commits', mode: modes[i % 4], caption: `STEP ${i + 1} / ${beatsArr.length}` };
    }
    case 'flow': {
      const modes = ['close', 'poll', 'duplex'];
      return { type: 'flow', mode: modes[(i + 1) % 3], leftIcon: 'phone', leftLabel: 'client', rightIcon: 'server', rightLabel: 'server', caption: shortLine(b.text, 36), travel: 1240 };
    }
    default:
      return { type: 'result', icon: 'zap', big: (b.em || 'done').toUpperCase().slice(0, 10), label: shortLine(b.text, 40) };
  }
}
async function designBrain(p) {
  if (process.env.GEMINI_API_KEY) {
    for (const cfg of [{ temperature: 0.85, maxOutputTokens: 16000, thinkingConfig: { thinkingBudget: 0 } }, { temperature: 0.85, maxOutputTokens: 16000 }]) {
      try {
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents: [{ parts: [{ text: p }] }], generationConfig: cfg }),
        });
        const d = await res.json();
        const txt = d.candidates?.[0]?.content?.parts?.map((x) => x.text || '').join('') || '';
        if (txt.length > 300) { console.log('  [brain] gemini responded'); return txt; }
        throw new Error('short/empty');
      } catch (e) { console.log(`  [brain] gemini failed: ${String(e.message).slice(0, 50)}`); }
    }
  }
  const providers = [
    ['groq', 'https://api.groq.com/openai/v1/chat/completions', 'openai/gpt-oss-120b', 'GROQ_API_KEY'],
    ['cerebras', 'https://api.cerebras.ai/v1/chat/completions', 'gpt-oss-120b', 'CEREBRAS_API_KEY'],
    ['mistral', 'https://api.mistral.ai/v1/chat/completions', 'mistral-small-latest', 'MISTRAL_API_KEY'],
  ];
  for (const [name, url, model, keyEnv] of providers) {
    if (!process.env[keyEnv]) continue;
    for (let a = 1; a <= 4; a++) {
      try {
        const res = await fetch(url, {
          method: 'POST', headers: { Authorization: `Bearer ${process.env[keyEnv]}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ model, messages: [{ role: 'user', content: p }], temperature: 0.85, max_tokens: 12000 }),
        });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const txt = (await res.json()).choices?.[0]?.message?.content || '';
        if (txt.length > 300) { console.log(`  [brain] ${name} responded`); return txt; }
        throw new Error('short');
      } catch (e) {
        const msg = String(e.message);
        console.log(`  [brain] ${name} attempt ${a} failed: ${msg.slice(0, 50)}`);
        if (msg.includes('429') && a < 4) { console.log('  [brain] rate-limited — waiting 30s'); await new Promise((r) => setTimeout(r, 30000)); }
      }
    }
  }
  if (process.env.HF_TOKEN) {
    try {
      const res = await fetch('https://router.huggingface.co/v1/chat/completions', {
        method: 'POST', headers: { Authorization: `Bearer ${process.env.HF_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'meta-llama/Llama-3.1-8B-Instruct', messages: [{ role: 'user', content: p }], temperature: 0.8, max_tokens: 8000 }),
      });
      const txt = (await res.json()).choices?.[0]?.message?.content || '';
      if (txt.length > 300) { console.log('  [brain] hf responded'); return txt; }
    } catch { }
  }
  return null;
}

function shortLine(text, max = 46) {
  let t = String(text).replace(/[^a-zA-Z0-9 .·-]/g, '').slice(0, max).trim();
  if (t.length >= max && t.includes(' ')) t = t.slice(0, t.lastIndexOf(' ')).trim();
  return t || 'the idea';
}

// Deterministic scene objects from the LLM's lightweight plan (actors rotate, counters cycle modes).
function buildScenesFromPlan(plan, actors, beatsArr) {
  const pack = PACKS[brief.pack] ? brief.pack : 'generic';
  const st = { a: 0, flow: 0, commits: 0, chain: 0 };
  const variantCycle = ['v', 'g', 'e', 'p'];
  return beatsArr.map((b, i) => {
    const x = plan[i] || {};
    let type = x.scene && PACKS[pack].includes(x.scene) ? x.scene : 'result';
    const p1 = (plan[i - 1] || {}).scene, p2 = (plan[i - 2] || {}).scene;
    if (p1 === type && p2 === type) type = 'result';
    const A = () => actors[st.a++ % actors.length] || { label: shortLine(b.em || 'it', 12), icon: 'tag' };
    switch (type) {
      case 'browser':
        return { type, title: x.title || 'New Tab', url: x.url || `https://${(brief.topic || 'example').toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 18)}.dev`, sub: shortLine(b.text, 40) };
      case 'globe':
        return { type, leftIcon: 'phone', leftLabel: 'YOU', rightIcon: 'server', rightLabel: 'SERVERS', centerLabel: (b.em || '').toUpperCase(), caption: `STEP ${i + 1} / ${beatsArr.length}` };
      case 'chain': {
        const n = 2 + (st.chain++ % 2);
        const tiles = Array.from({ length: n }, () => { const a = A(); return { icon: a.icon, label: a.label, variant: variantCycle[st.a % 4] }; });
        return { type, conn: st.chain % 2 ? 'e' : '', packet: true, packetDur: 1.2 + n * 0.15, tiles, ...(i % 2 === 1 ? { result: { icon: 'idcard', label: (b.em || 'done').slice(0, 16), variant: 'gold' } } : {}), caption: `STEP ${i + 1} / ${beatsArr.length}` };
      }
      case 'search':
        return { type, title: x.title || 'search', query: x.query || (b.em || 'query').slice(0, 24), caption: shortLine(b.text),
          results: [0, 1, 2].map((k) => { const a = actors[(st.a + k) % actors.length]; return { icon: a.icon, w: 82 - k * 24, label: a.label }; }) };
      case 'code': {
        const cmd = x.cmd || `${(b.em || 'run').toLowerCase()} ${(actors[st.a++ % actors.length].label).toLowerCase()}`;
        return { type, title: x.title || 'terminal', lines: [[{ t: '$ ', c: 'c' }, { t: cmd, c: 'w' }], [{ t: '# ' + shortLine(b.text, 44).toLowerCase(), c: 'c' }]], tag: x.tag || (b.em || '').toUpperCase() };
      }
      case 'result':
        return { type, icon: x.icon || 'zap', big: x.stat ? `${x.stat.to}${x.stat.suffix || ''}` : (b.em || 'done').slice(0, 12), ...(x.stat ? { count: x.stat } : {}), label: shortLine(b.text) };
      case 'pills':
        return { type, items: [0, 1].map((k) => { const a = actors[(st.a + k * 2) % actors.length]; return { icon: a.icon, label: `${a.label.toUpperCase().slice(0, 14)} · ${(b.em || '').slice(0, 8)}`, variant: k ? 'emerald' : 'gold' }; }), caption: shortLine(b.text) };
      case 'flow': {
        const modes = ['close', 'poll', 'duplex'];
        const mode = x.mode || modes[st.flow++ % 3];
        return { type, mode, leftIcon: 'phone', leftLabel: (actors[0] || { label: 'client' }).label.slice(0, 10), rightIcon: 'server', rightLabel: (actors[1] || { label: 'server' }).label.slice(0, 10), caption: `STEP ${i + 1} / ${beatsArr.length}`, travel: 1240 };
      }
      case 'commits': {
        const modes = ['plain', 'branch', 'merge', 'rebase'];
        const mode = x.mode || modes[st.commits++ % 4];
        return { type, mode, caption: shortLine(b.text) };
      }
      default:
        return { type: 'result', icon: 'zap', big: (b.em || 'done').slice(0, 12), label: shortLine(b.text) };
    }
  });
}

function salvageJson(txt) {
  let t = String(txt).trim();
  t = t.replace(/^```(json)?/i, '').replace(/```$/, '').trim();
  const a = t.indexOf('[') >= 0 && t.indexOf('{') >= 0 ? Math.min(t.indexOf('['), t.indexOf('{')) : Math.max(t.indexOf('['), t.indexOf('{'));
  if (a < 0) return null;
  t = t.slice(a);
  try { return JSON.parse(t); } catch { }
  for (let cut = t.length; cut > 120; cut--) {
    if (t[cut - 1] !== '}') continue;
    let cand = t.slice(0, cut);
    const d = { c: 0, sq: 0 };
    for (const ch of cand) { if (ch === '{') d.c++; else if (ch === '}') d.c--; else if (ch === '[') d.sq++; else if (ch === ']') d.sq--; }
    cand += ']'.repeat(Math.max(0, d.sq)) + '}'.repeat(Math.max(0, d.c));
    try { return JSON.parse(cand); } catch { }
  }
  return null;
}

const NLJ = String.fromCharCode(10);
const PLAN_INTRO = (n) => `You DESIGN scenes for a premium dark developer-explainer video (glowing cards on black, CloudXBerry style). Every scene must be a UNIQUE composition that builds word-by-word as the narrator speaks.
Topic: "${brief.topic}". Total video: ${n} beats (~${brief.minutes || 5} minutes).

Component vocabulary (kind — what it looks like):
- tile: glowing icon card with a small label (machines, services, people, concepts)
- pill: bright gradient badge with icon (results, names, verdicts)
- counter: huge number on screen (stats) — label IS the number, e.g. "90%"
- term: terminal window showing a command (cmd field, e.g. "git stash pop")
- browserbar: browser URL bar (cmd field holds the URL)
- searchrow: search box with result bars (lookups, queries) — label is the query
- ring: icon inside a glowing ring (the hero concept of the scene)
- note: small monospace chip (short side-note)
- stamp: red warning tag (dangers, errors)

Arrangements: row, column, diagonal, lshape, radial (1 center + satellites), stack (staircase), split (two groups facing).

Per beat: {"text","em","arr","items":[{"kind","icon","label","at","cmd"?}]}
- text: 12-20 spoken words, one idea, no greetings, no hashtags.
- em: ONE word from text to highlight.
- arr: arrangement, MUST differ from the previous beat's arrangement.
- items: 2-4 components. Each "at" = ONE word from that beat's text — the component POPS on screen exactly when that word is spoken.
- icons from: ${ICON_LIST}.
Design the story visually: who talks to what, what transforms, what counts. Vary: >= 4 arrangements and >= 5 kinds across your beats.`;

const PLAN_EXAMPLES = `Example beat objects (DNS topic):
{"text":"Your resolver asks the root server first, before anything else.","em":"root","arr":"split","items":[{"kind":"tile","icon":"phone","label":"resolver","at":"resolver"},{"kind":"tile","icon":"db","label":"root","at":"root"},{"kind":"pill","icon":"link","label":"first hop","at":"first"}]}
{"text":"Nine in ten lookups never leave the cache, so answers feel instant.","em":"cache","arr":"radial","items":[{"kind":"ring","icon":"zap","label":"cache","at":"cache"},{"kind":"counter","icon":"zap","label":"90%","at":"nine"},{"kind":"tile","icon":"globe","label":"web","at":"lookups"}]}`;

async function autoPlan() {
  const pack = PACKS[brief.pack] ? brief.pack : 'generic';
  const minutes = brief.minutes || 5;
  const n = Math.max(24, Math.min(48, Math.round(minutes * 7.2)));
  const half = Math.ceil(n / 2);
  let actors = null, title = null;
  const beatsAll = [];

  const p1 = PLAN_INTRO(n) + NLJ + NLJ + PLAN_EXAMPLES + NLJ + NLJ +
    `TASK: design beats 1-${half} (the hook, the problem, and the first build steps).
Also return "title" and "actors" (4-6 core nouns of the topic with icons).
Return ONLY valid JSON, no markdown:
{"title":"...","actors":[{"label":"...","icon":"..."}],"beats":[ ... EXACTLY ${half} objects ... ]}`;
  let r1 = salvageJson((await designBrain(p1)) || '');
  for (let round = 0; round < 2 && !r1; round++) { console.log('[cb] plan chunk 1 retry in 60s...'); await new Promise((r) => setTimeout(r, 60000)); r1 = salvageJson((await designBrain(p1)) || ''); }
  if (r1) {
    title = r1.title || null;
    actors = Array.isArray(r1.actors) ? r1.actors : null;
    beatsAll.push(...(Array.isArray(r1.beats) ? r1.beats : []));
    console.log(`[cb] plan chunk 1: ${beatsAll.length} beats`);
  }

  if (beatsAll.length >= Math.floor(half * 0.6)) {
    const lastText = (beatsAll[beatsAll.length - 1] || {}).text || '';
    const p2 = PLAN_INTRO(n) + NLJ + NLJ + PLAN_EXAMPLES + NLJ + NLJ +
      `TASK: continue the SAME video. Beats 1-${beatsAll.length} are done; the last one was: "${String(lastText).slice(0, 80)}".
Design the NEXT ${n - beatsAll.length} beats: finish the build steps, then 3 recap beats, then 2 payoff beats.
Return ONLY valid JSON, no markdown: {"beats":[ ... EXACTLY ${n - beatsAll.length} objects ... ]}`;
    let r2 = salvageJson((await designBrain(p2)) || '');
    for (let round = 0; round < 2 && !r2; round++) { console.log('[cb] plan chunk 2 retry in 60s...'); await new Promise((r) => setTimeout(r, 60000)); r2 = salvageJson((await designBrain(p2)) || ''); }
    if (r2 && Array.isArray(r2.beats)) {
      beatsAll.push(...r2.beats);
      console.log(`[cb] plan chunk 2: total ${beatsAll.length} beats`);
    }
  }

  beatsAll.forEach((b) => {
    b.text = String(b.text || '').trim();
    b.em = String(b.em || '').trim();
    b.items = Array.isArray(b.items) ? b.items.slice(0, 4) : [];
  });
  const valid = beatsAll.filter((b) => b.text && b.items.length > 0);
  if (valid.length >= 18) {
    console.log(`[cb] auto-plan accepted: ${valid.length} beats` + (actors ? `, actors: ${actors.map((a) => a.label).join(', ')}` : ''));
    return { title: title || brief.topic, actors: actors && actors.length ? actors : [{ label: 'system', icon: 'server' }, { label: 'client', icon: 'phone' }, { label: 'data', icon: 'db' }, { label: 'user', icon: 'globe' }], beats: valid };
  }
  return null;
}

let beats = (brief.beats || []).map((b, i) => ({ ...b, i }));
let plan = brief.scenes || [];
let planIsLight = false;
let actors = [];
if (beats.length === 0 && brief.topic) {
  const p = await autoPlan();
  if (!p) { console.error('[cb] auto-plan failed — provide beats or fix keys'); process.exit(1); }
  brief.title = p.title || brief.title;
  actors = p.actors.map((a) => ({ label: String(a.label || 'node').slice(0, 14), icon: ICONS[String(a.icon)] ? a.icon : 'tag' }));
  plan = p.beats.map((b) => ({ scene: b.scene, ...(b.cmd ? { cmd: b.cmd } : {}), ...(b.stat ? { stat: b.stat } : {}), ...(b.url ? { url: b.url } : {}) }));
  planIsLight = true;
  beats = p.beats.map((b, i) => ({ text: b.text, em: b.em, i }));
} else if (beats.length === 0) {
  console.error('[cb] brief needs beats or topic'); process.exit(1);
}
else if (brief.freeScenes && plan.length === 0) {
  plan = beats.map((b, i) => composeScene(i, b, beats));
  planIsLight = false; // full scene objects already
  console.log('[cb] composed family plan: ' + plan.map((p2) => p2.type).join(','));
}
let scenes = plan.length ? plan : [];

const work = path.join(HF_DIR, 'work', `${slug}-tpl`);
fs.rmSync(work, { recursive: true, force: true });
fs.mkdirSync(path.join(work, 'voice'), { recursive: true });
console.log(`[cb] ${slug} — ${W}x${H}, ${beats.length} beats`);

// ---------- scene renderers (clips must not nest <div> — spans/canvas/svg only) ----------
const tile = (t, extra = '') => `<span class="hf-tile ${t.variant || ''} ${extra} rise">${svg(t.icon)}<span class="hf-tlabel">${t.label || ''}</span></span>`;
const pill = (p, extra = '') => `<span class="hf-pill ${p.variant || 'gold'} ${extra} rise"><span class="ic">${svg(p.icon)}</span><span>${p.label}</span><span class="hf-shine"></span></span>`;


// ---------- free scenes: AI-designed unique compositions, entrances word-synced ----------
const FX_KINDS = ['tile', 'pill', 'counter', 'term', 'browserbar', 'searchrow', 'ring', 'note', 'stamp'];
const FX_ARRS = ['row', 'column', 'diagonal', 'lshape', 'radial', 'stack', 'split'];
const FX_SIZE = { tile: [214, 184], pill: [330, 68], counter: [360, 180], term: [660, 210], browserbar: [720, 78], searchrow: [680, 200], ring: [230, 230], note: [230, 48], stamp: [240, 46] };
function renderFree(sc) {
  const items = (sc.items || []).slice(0, 5);
  const sw = Math.round(W * 0.88), sh = Math.round(H - 392 - 96);
  const arr = FX_ARRS.includes(sc.arr) ? sc.arr : 'row';
  const sizes = items.map((it) => FX_SIZE[it.kind] || FX_SIZE.tile);
  let pts = [];
  if (arr === 'column') { const maxH = Math.max(...sizes.map((z) => z[1])); const step = Math.max(maxH + 30, Math.min(250, (sh - 60) / Math.max(1, items.length))); pts = sizes.map((sz, k) => ({ x: sw / 2 - sz[0] / 2, y: sh / 2 - (items.length - 1) * step / 2 + k * step - sz[1] / 2 })); }
  else if (arr === 'diagonal') { pts = sizes.map((sz, k) => ({ x: sw * 0.08 + (sw * 0.6 - sizes[0][0]) * (k / Math.max(1, items.length - 1)), y: sh * 0.78 - sh * 0.55 * (k / Math.max(1, items.length - 1)) - sz[1] / 2 })); }
  else if (arr === 'lshape') { const half = Math.ceil(items.length / 2); pts = sizes.map((sz, k) => k < half ? { x: sw * 0.1 + k * (sw * 0.55 / half), y: sh * 0.72 - sz[1] / 2 } : { x: sw * 0.8 - sz[0] / 2, y: sh * 0.62 - (k - half + 1) * (sz[1] + 40) - sz[1] / 2 }); }
  else if (arr === 'radial') { pts = sizes.map((sz, k) => { if (k === 0) return { x: sw / 2 - sz[0] / 2, y: sh / 2 - sz[1] / 2 }; const a = (k - 1) / Math.max(1, items.length - 1) * Math.PI * 2 - Math.PI / 2; return { x: sw / 2 + Math.cos(a) * sw * 0.3 - sz[0] / 2, y: sh / 2 + Math.sin(a) * sh * 0.34 - sz[1] / 2 }; }); }
  else if (arr === 'stack') { pts = sizes.map((sz, k) => ({ x: sw * 0.05 + k * 265, y: sh * 0.82 - k * ((sh * 0.6) / Math.max(1, items.length - 1)) - sz[1] / 2 })); }
  else if (arr === 'split') { pts = sizes.map((sz, k) => ({ x: k % 2 === 0 ? sw * 0.16 - sz[0] / 2 : sw * 0.84 - sz[0] / 2, y: sh * 0.3 + Math.floor(k / 2) * 180 - sz[1] / 2 })); }
  else { const n = items.length; const spread = sw * 0.74; const startx = sw / 2 - spread / 2; pts = sizes.map((sz, k) => ({ x: n === 1 ? sw / 2 - sz[0] / 2 : startx + (spread - sz[0]) * (k / (n - 1)), y: sh / 2 - sz[1] / 2 })); }
  const variantCycle = ['v', 'g', 'e', 'p'];
  let html = `<span class="fx-stage">`;
  if (arr === 'radial' && items.length > 2) {
    html += `<svg class="fx-svg" viewBox="0 0 ${sw} ${sh}">` + items.slice(1).map((_, k) => {
      const c0 = { x: pts[0].x + sizes[0][0] / 2, y: pts[0].y + sizes[0][1] / 2 };
      const c = { x: pts[k + 1].x + sizes[k + 1][0] / 2, y: pts[k + 1].y + sizes[k + 1][1] / 2 };
      return `<line x1="${Math.round(c0.x)}" y1="${Math.round(c0.y)}" x2="${Math.round(c.x)}" y2="${Math.round(c.y)}" stroke="${k % 2 ? '#4ade80' : '#fbbf24'}" stroke-width="3" stroke-dasharray="12 10" opacity="0.6"/>`;
    }).join('') + `</svg>`;
  }
  items.forEach((it, k) => {
    const id = `fx-${sc._i}-${k}`;
    const wd = sizes[k][0], ht = sizes[k][1];
    const pos = `left:${Math.max(0, Math.round(pts[k].x))}px;top:${Math.max(0, Math.round(pts[k].y))}px;`;
    const variant = variantCycle[k % 4];
    const label = String(it.label || '').slice(0, 18);
    switch (it.kind) {
      case 'pill': html += `<span class="hf-pill ${it.variant || (k % 2 ? 'emerald' : 'gold')} fx" id="${id}" style="${pos}"><span class="ic">${svg(it.icon || 'tag')}</span><span>${label}</span><span class="hf-shine"></span></span>`; break;
      case 'counter': html += `<span class="hf-num fx" id="${id}" style="${pos}font-size:76px;">${String(it.label || '0').slice(0, 8)}</span>`; break;
      case 'term': html += `<span class="hf-window fx" id="${id}" style="${pos}width:${wd}px;"><span class="hf-bar"><i></i><i></i><i></i><span class="hf-tab">terminal</span></span><span class="hf-body" style="flex-direction:column;align-items:stretch;gap:10px;padding:22px 26px;"><span class="hf-codeline"><span class="tok-c">$ </span><span>${escAttr(it.cmd || label.toLowerCase())}</span></span></span></span>`; break;
      case 'browserbar': html += `<span class="hf-urlrow fx" id="${id}" style="${pos}width:${wd}px;"><span class="hf-lock">${svg('lock')}</span><span class="hf-url" style="font-size:24px;">${escAttr(it.cmd || 'https://example.dev')}</span></span>`; break;
      case 'searchrow': html += `<span class="hf-window fx" id="${id}" style="${pos}width:${wd}px;"><span class="hf-body" style="flex-direction:column;align-items:stretch;gap:16px;padding:24px 28px;"><span class="hf-search">${svg('search')}<span>${escAttr(label || 'query')}</span></span><span class="hf-rbar" style="width:78%;"></span><span class="hf-rbar" style="width:52%;"></span></span></span>`; break;
      case 'ring': html += `<span class="hf-ringwrap fx" id="${id}" style="${pos}"><span class="hf-bigicon">${svg(it.icon || 'zap')}</span><svg class="hf-ring" viewBox="0 0 200 200"><circle cx="100" cy="100" r="92" pathLength="100"/></svg></span>`; break;
      case 'note': html += `<span class="hf-chip fx" id="${id}" style="${pos}">${escAttr(label)}</span>`; break;
      case 'stamp': html += `<span class="hf-tag fx" id="${id}" style="${pos}font-size:22px;padding:10px 18px;">${escAttr(label)}</span>`; break;
      default: html += `<span class="hf-tile ${variant} fx" id="${id}" style="${pos}width:${wd}px;height:${ht}px;min-height:0;">${svg(it.icon || 'tag')}<span class="hf-tlabel">${label}</span></span>`;
    }
  });
  html += `</span>`;
  return html;
}
function escAttr(x) { return String(x).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

const RENDER = {
  free: (s) => renderFree(s),
  timeline: (s) => {
    const n = (s.labels || []).length;
    const sw = Math.round(W * 0.84), x0 = Math.round(W * 0.08), y = 296;
    const line = `<svg class="fx-svg" viewBox="0 0 ${sw} ${H - 392 - 96}" style="left:${x0}px;top:0;"><path id="tl-line-i${s._i}" d="M 30 ${Math.round((H - 392 - 96) / 2)} H ${sw - 30}" pathLength="100" stroke="#fbbf24" stroke-width="5" fill="none" stroke-linecap="round"/></svg>`;
    const stems = (s.labels || []).map((_, k) => {
      const px = Math.round(30 + ((sw - 60) - 40) * (k / Math.max(1, n - 1)));
      const up = k % 2 === 0;
      return `<path id="tl-stem-i${s._i}-${k}" d="M ${px} ${up ? 250 : 300} L ${px} ${Math.round((H - 392 - 96) / 2)}" pathLength="100" stroke="rgba(255,255,255,.35)" stroke-width="3" fill="none"/>`;
    }).join('');
    const stops = (s.labels || []).map((lb, k) => {
      const px = Math.round(30 + ((sw - 60) - 40) * (k / Math.max(1, n - 1)));
      const up = k % 2 === 0;
      return `<span class="hf-tile ${['v', 'g', 'e', 'p'][k % 4]} fx tlstop" id="tl-k-i${s._i}-${k}" style="left:${x0 + px - 95}px;top:${up ? 108 : 312}px;width:190px;height:130px;min-height:0;">${svg(lb.icon || 'tag')}<span class="hf-tlabel">${lb.label}</span></span>`;
    }).join('');
    return line + stems + stops;
  },
  cycle: (s) => {
    const cx = Math.round(W * 0.5), cy = 296, r = 208;
    const items = (s.labels || []).slice(0, 4);
    const tiles = items.map((lb, k) => {
      const a = (k / items.length) * Math.PI * 2 - Math.PI / 2;
      const px = cx + Math.cos(a) * r * 1.42 - 105, py = cy + Math.sin(a) * r - 80;
      return `<span class="hf-tile ${['v', 'g', 'e', 'p'][k % 4]} fx" id="cy-k-i${s._i}-${k}" style="left:${Math.round(px)}px;top:${Math.round(py)}px;width:210px;height:160px;min-height:0;">${svg(lb.icon || 'tag')}<span class="hf-tlabel">${lb.label}</span></span>`;
    }).join('');
    return `<svg class="fx-svg" viewBox="0 0 ${W} ${H - 392 - 96}"><circle id="cy-ring-i${s._i}" cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#fbbf24" stroke-width="4" stroke-dasharray="16 12" opacity="0.75"/></svg>` + tiles;
  },
  funnel: (s) => {
    const widths = [900, 640, 400];
    return (s.labels || []).slice(0, 3).map((lb, k) => `<span class="fx" id="fn-k-i${s._i}-${k}" style="left:${Math.round(W / 2 - widths[k] / 2)}px;top:${Math.round(70 + k * 148)}px;"><span class="hf-pill ${k === 2 ? 'emerald' : 'gold'}" style="width:${widths[k]}px;justify-content:center;height:96px;font-size:32px;"><span class="ic">${svg(lb.icon || 'tag')}</span><span>${lb.label}</span><span class="hf-shine"></span></span></span>`).join('');
  },
  tree: (s) => {
    const sw = Math.round(W * 0.8), x0 = Math.round(W * 0.1);
    const kids = (s.labels || []).slice(1);
    const top = `<span class="hf-tile g fx" id="tr-top-i${s._i}" style="left:${Math.round(x0 + sw / 2 - 107)}px;top:40px;width:214px;height:150px;min-height:0;">${svg((s.labels || [])[0] && s.labels[0].icon || 'server')}<span class="hf-tlabel">${(s.labels || [])[0] ? s.labels[0].label : 'root'}</span></span>`;
    const lines = `<svg class="fx-svg" viewBox="0 0 ${sw} ${H - 392 - 96}" style="left:${x0}px;top:0;">` + kids.map((_, k) => {
      const kx = sw * (0.22 + (0.56) * (k / Math.max(1, kids.length - 1)));
      return `<path id="tr-l-i${s._i}-${k}" d="M ${sw / 2} 190 C ${sw / 2} 300 ${kx} 260 ${kx} 360" pathLength="100" stroke="#4ade80" stroke-width="4" fill="none" opacity="0.7"/>`;
    }).join('') + `</svg>`;
    const kidTiles = kids.map((lb, k) => {
      const kx = sw * (0.22 + 0.56 * (k / Math.max(1, kids.length - 1)));
      return `<span class="hf-tile ${['v', 'e', 'p'][k % 3]} fx" id="tr-k-i${s._i}-${k}" style="left:${Math.round(x0 + kx - 100)}px;top:368px;width:200px;height:140px;min-height:0;">${svg(lb.icon || 'tag')}<span class="hf-tlabel">${lb.label}</span></span>`;
    }).join('');
    return lines + top + kidTiles;
  },
  route: (s) => {
    const sw = Math.round(W * 0.84), sh = H - 392 - 96, x0 = Math.round(W * 0.08);
    const stops = (s.labels || []).slice(0, 3);
    const pts = stops.map((_, k) => ({ x: Math.round(sw * (0.08 + 0.84 * (k / Math.max(1, stops.length - 1)))), y: Math.round(sh * (k % 2 === 0 ? 0.3 : 0.72)) }));
    const path = `M ${pts[0].x} ${pts[0].y} ` + pts.slice(1).map((p2, k) => `Q ${Math.round((pts[k].x + p2.x) / 2)} ${k % 2 === 0 ? 40 : sh - 40} ${p2.x} ${p2.y}`).join(' ');
    return `<svg class="fx-svg" viewBox="0 0 ${sw} ${sh}" style="left:${x0}px;top:0;">
      <path id="rt-path-i${s._i}" d="${path}" pathLength="100" stroke="#fbbf24" stroke-width="5" fill="none" stroke-linecap="round"/>
      ${stops.map((_, k) => `<circle id="rt-node-i${s._i}-${k}" class="cm-node ${['v', 'g', 'e'][k % 3]}" cx="${pts[k].x}" cy="${pts[k].y}" r="14"/>`).join('')}
    </svg>` + stops.map((lb, k) => `<span class="hf-tile ${['v', 'g', 'e'][k % 3]} fx" id="rt-s-i${s._i}-${k}" style="left:${Math.round(x0 + pts[k].x - 95)}px;top:${Math.round(pts[k].y + (k % 2 === 0 ? -170 : 36))}px;width:190px;height:120px;min-height:0;">${svg(lb.icon || 'tag')}<span class="hf-tlabel">${lb.label}</span></span>`).join('');
  },
  chat: (s) => {
    const items = (s.labels || []).slice(0, 4);
    return `<span class="hf-tile v fx" id="ch-side-i${s._i}-0" style="left:4%;top:180px;width:220px;height:230px;min-height:0;">${svg('phone')}<span class="hf-tlabel">client</span></span>
    <span class="hf-tile g fx" id="ch-side-i${s._i}-1" style="right:4%;top:180px;width:220px;height:230px;min-height:0;">${svg('server')}<span class="hf-tlabel">server</span></span>`
    + items.map((lb, k) => `<span class="hf-msg ${k % 2 ? 'back' : ''}" id="ch-b-i${s._i}-${k}" style="${k % 2 ? 'right' : 'left'}:${k % 2 ? '17%' : '17%'};top:${[60, 210, 360, 470][k % 4]}px;position:absolute;font-size:26px;padding:14px 26px;opacity:0;">${lb.label}</span>`).join('');
  },

  browser: (s) => `
    <span class="hf-window rise" style="width:${s.width || 840}px">
      <span class="hf-bar"><i></i><i></i><i></i><span class="hf-tab">${s.title || 'New Tab'}</span></span>
      <span class="hf-body" style="flex-direction:column;gap:26px;padding:44px 40px;">
        <span class="hf-urlrow"><span class="hf-lock">${svg('lock')}</span><span class="hf-url" id="urltxt-i${s._i}"></span><span class="hf-caret" id="caret-i${s._i}"></span></span>
        ${s.sub ? `<span class="hf-label">${s.sub}</span>` : ''}
      </span>
    </span>`,
  chain: (s) => `
    <span class="hf-row" style="gap:0;position:relative;">
      ${s.tiles.map((t, i) => tile(t) + (i < s.tiles.length - 1 ? `<span class="hf-conn ${s.conn === 'e' ? 'e' : ''} rise"></span>` : '')).join('')}
      ${s.result ? `<span class="hf-conn ${s.resultVariant === 'emerald' ? 'e' : ''} rise"></span>` + pill({ ...s.result }) : ''}
      ${s.packet ? `<span class="hf-packet" id="packet-i${s._i}"></span>` : ''}
    </span>
    ${s.caption ? `<span class="hf-label rise" style="margin-top:34px;">${s.caption}</span>` : ''}`,
  search: (s) => `
    <span class="hf-window rise" style="width:${s.width || 950}px">
      <span class="hf-bar"><i></i><i></i><i></i><span class="hf-tab">${s.title || 'search'}</span></span>
      <span class="hf-body" style="flex-direction:column;align-items:stretch;gap:22px;padding:36px 40px;">
        <span class="hf-search rise">${svg('search')}<span>${s.query}</span><span class="hf-shine"></span></span>
        ${s.caption ? `<span class="hf-label" style="letter-spacing:.3em;">${s.caption}</span>` : ''}
        ${(s.results || []).map((r) => `<span class="hf-row" style="justify-content:flex-start;gap:18px;"><span class="hf-rtile rise">${svg(r.icon || 'chat')}</span><span class="hf-rbar rise" style="width:${r.w || 70}%;"></span><span class="hf-rlabel rise">${r.label || ''}</span></span>`).join('')}
      </span>
    </span>`,
  code: (s) => `
    <span class="hf-window rise" style="width:${s.width || 950}px">
      <span class="hf-bar"><i></i><i></i><i></i><span class="hf-tab">${s.title}</span></span>
      <span class="hf-body" style="flex-direction:column;align-items:stretch;gap:14px;padding:34px 40px;">
        ${s.lines.map((ln, li) => `<span class="hf-clinewrap"><span class="hf-codeline rise" id="cl-i${s._i}-${li}">${ln.map((tok) => `<span class="tok-${tok.c || 'w'}">${tok.t}</span>`).join('')}</span></span>`).join('')}
        <span class="hf-caret hf-caret-last" id="caret-i${s._i}"></span>
        ${s.tag ? `<span class="hf-tag rise" id="tag-i${s._i}">${s.tag}</span>` : ''}
      </span>
    </span>`,
  result: (s) => `
    <span class="hf-col">
      <span class="hf-ringwrap rise">
        <span class="hf-bigicon">${svg(s.icon || 'zap')}</span>
        <svg class="hf-ring" viewBox="0 0 200 200"><circle id="ring-i${s._i}" cx="100" cy="100" r="92" pathLength="100"/></svg>
      </span>
      <span class="hf-num rise" id="num-i${s._i}">${s.big}</span>
      <span class="hf-label rise">${s.label || ''}</span>
    </span>`,
  pills: (s) => `
    <span class="hf-row" style="gap:44px;">
      ${s.items.map((p, pi) => pill(p, `pulsedrp-i${s._i}-${pi}`)).join('')}
    </span>
    ${s.caption ? `<span class="hf-label rise" style="margin-top:38px;">${s.caption}</span>` : ''}`,
  globe: (s) => `
    <span class="hf-globewrap">
      <span class="hf-globehalf"><canvas id="globe-i${s._i}" width="660" height="660"></canvas></span>
      <span class="hf-gpill left rise"><span class="ic">${svg(s.leftIcon || 'phone')}</span><span>${s.leftLabel || 'YOU'}</span></span>
      <span class="hf-gpill right rise"><span class="ic">${svg(s.rightIcon || 'server')}</span><span>${s.rightLabel || 'SERVER'}</span></span>
      ${s.centerLabel ? `<span class="hf-gcenter rise">${s.centerLabel}</span>` : ''}
    </span>
    ${s.caption ? `<span class="hf-label rise" style="margin-top:20px;">${s.caption}</span>` : ''}`,
  commits: (s) => `
    <span class="hf-svgwrap">
      <svg viewBox="0 0 1200 400" class="hf-commitsvg">
        <path id="cm-main-i${s._i}" class="cm-line" d="M80 220 H1120" pathLength="100"/>
        ${s.mode !== 'plain' ? `<path id="cm-branch-i${s._i}" class="cm-line ${s.mode === 'merge' ? 'gold' : 'em'}" d="M430 220 C 560 220 560 96 700 96 H940 C 1040 96 1040 220 1050 220" pathLength="100"/>` : ''}
        ${[
          { x: 200, y: 220, v: 'v' }, { x: 430, y: 220, v: 'v' }, { x: 660, y: 220, v: 'v' }, { x: 890, y: 220, v: 'v' }, { x: 1050, y: 220, v: 'g' },
          { x: 700, y: 96, v: 'e' }, { x: 940, y: 96, v: 'e' },
        ].map((n, ni) => `<circle id="cm-n-i${s._i}-${ni}" class="cm-node ${n.v}" cx="${n.x}" cy="${n.y}" r="17"/>`).join('')}
        ${s.mode === 'merge' ? `<circle id="cm-flash-i${s._i}" class="cm-flash" cx="1050" cy="220" r="30"/>` : ''}
        ${s.mode === 'rebase' ? `<circle id="cm-rb-i${s._i}-0" class="cm-node em" cx="700" cy="96" r="17"/><circle id="cm-rb-i${s._i}-1" class="cm-node em" cx="940" cy="96" r="17"/>` : ''}
      </svg>
      <span class="hf-chip rise" id="chip-a-i${s._i}" style="left:14%;top:46%;">main</span>
      ${s.mode !== 'plain' ? `<span class="hf-chip rise em" id="chip-b-i${s._i}" style="left:44%;top:12%;">feature</span>` : ''}
    </span>
    ${s.caption ? `<span class="hf-label rise" style="margin-top:14px;">${s.caption}</span>` : ''}`,
  flow: (s) => `
    <span class="hf-flowrow">
      <span class="hf-tile ${s.leftVariant || 'v'} rise">${svg(s.leftIcon || 'phone')}<span class="hf-tlabel">${s.leftLabel || 'client'}</span></span>
      <span class="hf-wirewrap">
        <span class="hf-wire ${s.mode === 'duplex' ? 'e' : ''}" id="wire-i${s._i}"></span>
        ${(s.mode === 'close' ? [{ t: 'GET', dn: 1 }] : s.mode === 'poll' ? [{ t: 'GET', dn: 1 }, { t: 'GET', dn: 1 }, { t: 'GET', dn: 1 }] : [{ t: 'msg', dn: 1 }, { t: 'msg', up: 1 }, { t: 'msg', dir: -1, dn: 1 }, { t: 'msg', dir: -1, up: 1 }]).map((p, pi) => `<span class="hf-msg ${p.dir === -1 ? 'back' : ''} ${p.up ? 'up' : 'dn'}" id="msg-i${s._i}-${pi}">${p.t}</span>`).join('')}
      </span>
      <span class="hf-tile ${s.rightVariant || 'g'} rise" id="server-i${s._i}">${svg(s.rightIcon || 'server')}<span class="hf-tlabel">${s.rightLabel || 'server'}</span></span>
    </span>
    ${s.mode === 'close' ? pill({ icon: 'lock', label: 'closed', variant: 'pink' }, `id="closed-i${s._i}" style="margin-top:26px;"`) : ''}
    ${s.mode === 'duplex' ? pill({ icon: 'chat', label: 'always on', variant: 'emerald' }, `id="dup-i${s._i}" style="margin-top:26px;"`) : ''}
    ${s.caption ? `<span class="hf-label rise" style="margin-top:22px;">${s.caption}</span>` : ''}`,
};

// ---------- CSS ----------
const CSS = `
*{margin:0;padding:0;box-sizing:border-box;}
html,body{width:${W}px;height:${H}px;overflow:hidden;background:#050505;}
#root{position:relative;width:${W}px;height:${H}px;font-family:'Poppins',sans-serif;background:#050505;}
#root::before{content:'';position:absolute;inset:0;background-image:linear-gradient(rgba(255,255,255,.045) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.045) 1px,transparent 1px);background-size:90px 90px;z-index:0;}
.aurora{position:absolute;width:760px;height:760px;border-radius:50%;filter:blur(90px);opacity:.16;z-index:0;}
.aurora.a{background:radial-gradient(circle,${amb.a},transparent 65%);top:-330px;left:26%;}
.aurora.b{background:radial-gradient(circle,${amb.b},transparent 65%);bottom:-380px;right:8%;opacity:.10;}
.dust{position:absolute;bottom:-20px;width:7px;height:7px;border-radius:50%;background:${amb.a};opacity:0;box-shadow:0 0 10px ${amb.a};z-index:0;}
.hf-brand{position:absolute;top:34px;right:44px;display:flex;align-items:center;gap:9px;font:600 14px 'JetBrains Mono',monospace;color:rgba(255,255,255,.58);letter-spacing:.06em;z-index:5;}
.hf-brand i{width:13px;height:13px;border-radius:4px;background:linear-gradient(135deg,${amb.a},${amb.b});box-shadow:0 0 12px ${amb.a};}
.hf-kicker{position:absolute;top:54px;left:50%;transform:translateX(-50%);font:500 15px 'JetBrains Mono',monospace;letter-spacing:.35em;color:rgba(255,255,255,.58);text-transform:uppercase;display:flex;gap:14px;align-items:center;z-index:5;}
.hf-kicker::before{content:'';width:10px;height:10px;border-radius:50%;background:${amb.a};box-shadow:0 0 14px ${amb.a};}
.hf-head{position:absolute;top:118px;left:50%;transform:translateX(-50%);width:84%;text-align:center;font:700 56px/1.22 'Poppins',sans-serif;color:#fff;z-index:5;}
.hf-head .em{color:${amb.a};text-shadow:0 0 30px ${amb.a}73;}
.hf-stage{position:absolute;top:392px;bottom:96px;left:50%;transform:translateX(-50%);width:88%;display:flex;flex-direction:column;align-items:center;justify-content:center;z-index:4;}
.hf-window{display:flex;flex-direction:column;background:#0d0d10;border:1.5px solid rgba(255,255,255,.14);border-radius:22px;box-shadow:0 24px 80px rgba(0,0,0,.65);overflow:hidden;}
.hf-bar{display:flex;align-items:center;gap:9px;padding:15px 22px;border-bottom:1px solid rgba(255,255,255,.14);font:500 16px 'JetBrains Mono',monospace;color:rgba(255,255,255,.68);}
.hf-bar i{width:11px;height:11px;border-radius:50%;background:#ef4444;display:inline-block;}
.hf-bar i:nth-child(1){background:#fbbf24}.hf-bar i:nth-child(2){background:#34d399}
.hf-tab{margin-left:8px;}
.hf-body{display:flex;gap:22px;align-items:center;justify-content:center;padding:26px 32px;width:100%;}
.hf-pill{position:relative;display:inline-flex;align-items:center;gap:14px;height:64px;padding:0 28px;border-radius:16px;font:700 27px 'Poppins',sans-serif;color:#050505;white-space:nowrap;overflow:hidden;}
.hf-pill .ic{width:40px;height:40px;border-radius:11px;background:rgba(0,0,0,.30);display:inline-flex;align-items:center;justify-content:center;flex:none;}
.hf-pill .ic svg{width:25px;height:25px;stroke:#fff;fill:none;stroke-width:2.5;stroke-linecap:round;stroke-linejoin:round;}
.hf-pill.emerald{background:linear-gradient(135deg,#4ade80,#059669);box-shadow:0 0 46px rgba(52,211,153,.45);}
.hf-pill.gold{background:linear-gradient(135deg,#fbbf24,#d97706);box-shadow:0 0 46px rgba(251,191,36,.45);}
.hf-pill.pink{background:linear-gradient(135deg,#ec4899,#be185d);box-shadow:0 0 46px rgba(236,72,153,.4);}
.hf-shine{position:absolute;top:0;bottom:0;width:70px;background:linear-gradient(100deg,transparent,rgba(255,255,255,.5),transparent);transform:translateX(-160px) skewX(-18deg);}
.hf-tile{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:13px;min-width:150px;padding:26px 22px;border-radius:18px;background:#101014;border:1px solid rgba(255,255,255,.12);position:relative;}
.hf-tile svg{width:52px;height:52px;stroke:#fff;fill:none;stroke-width:2.5;stroke-linecap:round;stroke-linejoin:round;}
.hf-tile.g svg{stroke:#fbbf24;filter:drop-shadow(0 0 9px rgba(251,191,36,.6));}
.hf-tile.e svg{stroke:#4ade80;filter:drop-shadow(0 0 9px rgba(52,211,153,.6));}
.hf-tile.v svg{stroke:#a78bfa;filter:drop-shadow(0 0 9px rgba(167,139,250,.6));}
.hf-tile.p svg{stroke:#ec4899;filter:drop-shadow(0 0 9px rgba(236,72,153,.6));}
.hf-tile.dim{opacity:.45;}
.hf-tlabel{font:500 16px 'JetBrains Mono',monospace;color:rgba(255,255,255,.8);letter-spacing:.12em;text-transform:uppercase;}
.hf-conn{display:block;height:4px;min-width:84px;flex:1;background:repeating-linear-gradient(90deg,#fbbf24 0 14px,transparent 14px 26px);border-radius:2px;position:relative;box-shadow:0 0 16px rgba(251,191,36,.5);margin:0 6px;}
.hf-conn.e{background:repeating-linear-gradient(90deg,#4ade80 0 14px,transparent 14px 26px);box-shadow:0 0 16px rgba(52,211,153,.5);}
.hf-conn::before,.hf-conn::after{content:'';position:absolute;top:50%;width:11px;height:11px;border-radius:50%;background:#fbbf24;transform:translateY(-50%);box-shadow:0 0 12px #fbbf24;}
.hf-conn.e::before,.hf-conn.e::after{background:#4ade80;box-shadow:0 0 12px #4ade80;}
.hf-conn::before{left:-3px}.hf-conn::after{right:-3px}
.hf-packet{position:absolute;left:150px;top:50%;width:14px;height:14px;margin-top:-7px;border-radius:50%;background:#fff;box-shadow:0 0 18px 4px rgba(255,255,255,.8);opacity:0;}
.hf-search{position:relative;display:flex;width:100%;height:72px;border-radius:18px;background:linear-gradient(135deg,#ec4899,#be185d);align-items:center;gap:18px;padding:0 28px;box-shadow:0 0 44px rgba(236,72,153,.4);font:700 27px 'JetBrains Mono',monospace;color:#1a0510;overflow:hidden;}
.hf-search svg{width:30px;height:30px;stroke:#1a0510;fill:none;stroke-width:3;stroke-linecap:round;flex:none;}
.hf-rbar{display:block;height:36px;border-radius:10px;background:linear-gradient(135deg,#4ade80,#059669);box-shadow:0 0 24px rgba(52,211,153,.35);transform-origin:left center;}
.hf-rtile{display:inline-flex;width:46px;height:46px;border-radius:12px;background:linear-gradient(135deg,#60a5fa,#2563eb);align-items:center;justify-content:center;flex:none;}
.hf-rtile svg{width:26px;height:26px;stroke:#fff;fill:none;stroke-width:2.5;stroke-linecap:round;stroke-linejoin:round;}
.hf-rlabel{font:500 17px 'JetBrains Mono',monospace;color:rgba(255,255,255,.62);white-space:nowrap;}
.hf-label{font:500 18px 'JetBrains Mono',monospace;letter-spacing:.3em;color:rgba(255,255,255,.62);text-transform:uppercase;display:block;text-align:center;}
.hf-urlrow{display:flex;align-items:center;gap:16px;width:100%;height:74px;border-radius:16px;background:#16161a;border:1px solid rgba(255,255,255,.13);padding:0 24px;}
.hf-lock{display:inline-flex;width:40px;height:40px;border-radius:10px;background:rgba(74,222,128,.14);align-items:center;justify-content:center;flex:none;}
.hf-lock svg{width:24px;height:24px;stroke:#4ade80;fill:none;stroke-width:2.5;stroke-linecap:round;stroke-linejoin:round;}
.hf-url{font:600 28px 'JetBrains Mono',monospace;color:#a78bfa;letter-spacing:.01em;white-space:nowrap;min-height:34px;}
.hf-caret{display:inline-block;width:3px;height:34px;background:${amb.a};box-shadow:0 0 10px ${amb.a};border-radius:2px;}
.hf-caret-last{align-self:flex-start;margin-top:2px;}
.hf-clinewrap{display:block;}
.hf-codeline{display:block;font:500 27px/1.65 'JetBrains Mono',monospace;color:rgba(255,255,255,.88);white-space:pre;}
.tok-k{color:#fbbf24}.tok-s{color:#4ade80}.tok-u{color:#a78bfa}.tok-r{color:#f87171}.tok-c{color:rgba(255,255,255,.4)}
.hf-tag{display:inline-block;align-self:flex-start;margin-top:10px;padding:7px 14px;border-radius:8px;background:rgba(239,68,68,.16);border:1px solid rgba(239,68,68,.5);font:600 19px 'JetBrains Mono',monospace;color:#f87171;letter-spacing:.08em;}
.hf-ringwrap{position:relative;display:inline-flex;align-items:center;justify-content:center;width:210px;height:210px;}
.hf-bigicon{display:inline-flex;width:150px;height:150px;border-radius:34px;background:linear-gradient(135deg,#fbbf24,#d97706);align-items:center;justify-content:center;box-shadow:0 0 70px rgba(251,191,36,.5);}
.hf-bigicon svg{width:76px;height:76px;stroke:#050505;fill:none;stroke-width:2.4;stroke-linecap:round;stroke-linejoin:round;}
.hf-ring{position:absolute;inset:0;width:210px;height:210px;transform:rotate(-90deg);}
.hf-ring circle{fill:none;stroke:${amb.b};stroke-width:3.5;stroke-linecap:round;opacity:.85;}
.hf-num{font:800 96px 'Poppins',sans-serif;color:#fff;text-shadow:0 0 40px ${amb.b}59;}
.hf-col{display:flex;flex-direction:column;align-items:center;gap:24px;width:100%;}
.hf-row{display:flex;align-items:center;justify-content:center;gap:20px;width:100%;}
.hf-globewrap{position:relative;display:flex;align-items:center;justify-content:center;width:100%;height:100%;}
.hf-globehalf{display:block;width:660px;height:660px;}
.hf-globehalf canvas{display:block;width:660px;height:660px;}
.hf-gpill{position:absolute;display:inline-flex;align-items:center;gap:12px;height:56px;padding:0 22px;border-radius:15px;font:700 22px 'Poppins',sans-serif;color:#050505;}
.hf-gpill .ic{width:36px;height:36px;border-radius:9px;background:rgba(0,0,0,.3);display:inline-flex;align-items:center;justify-content:center;}
.hf-gpill .ic svg{width:22px;height:22px;stroke:#fff;fill:none;stroke-width:2.5;stroke-linecap:round;stroke-linejoin:round;}
.hf-gpill.left{left:4%;top:16%;background:linear-gradient(135deg,#a78bfa,#7c3aed);box-shadow:0 0 40px rgba(167,139,250,.5);}
.hf-gpill.right{right:4%;bottom:18%;background:linear-gradient(135deg,#fbbf24,#d97706);box-shadow:0 0 40px rgba(251,191,36,.5);}
.hf-svgwrap{position:relative;width:1250px;height:417px;}
.hf-commitsvg{width:100%;height:100%;}
.cm-line{fill:none;stroke:rgba(255,255,255,.35);stroke-width:5;stroke-linecap:round;}
.cm-line.em{stroke:#4ade80;filter:drop-shadow(0 0 6px rgba(52,211,153,.7));}
.cm-line.gold{stroke:#fbbf24;filter:drop-shadow(0 0 6px rgba(251,191,36,.7));}
.cm-node{fill:#0d0d10;stroke:#a78bfa;stroke-width:5;filter:drop-shadow(0 0 10px rgba(167,139,250,.7));}
.cm-node.g{stroke:#fbbf24;filter:drop-shadow(0 0 10px rgba(251,191,36,.8));}
.cm-node.em{stroke:#4ade80;filter:drop-shadow(0 0 10px rgba(52,211,153,.8));}
.cm-flash{fill:none;stroke:#fbbf24;stroke-width:4;opacity:0;}
.hf-chip{position:absolute;padding:8px 18px;border-radius:11px;background:#101014;border:1px solid rgba(255,255,255,.16);font:600 18px 'JetBrains Mono',monospace;color:#fff;letter-spacing:.1em;box-shadow:0 0 18px rgba(167,139,250,.35);}
.hf-chip.em{border-color:rgba(74,222,128,.6);color:#4ade80;box-shadow:0 0 18px rgba(52,211,153,.4);}
.hf-flowrow{display:flex;align-items:center;justify-content:center;gap:0;width:100%;}
.hf-wirewrap{position:relative;flex:1;height:190px;margin:0 10px;}
.hf-wire{position:absolute;left:0;right:0;top:50%;height:4px;margin-top:-2px;background:repeating-linear-gradient(90deg,#fbbf24 0 14px,transparent 14px 26px);border-radius:2px;box-shadow:0 0 16px rgba(251,191,36,.5);}
.hf-wire.e{background:repeating-linear-gradient(90deg,#4ade80 0 14px,transparent 14px 26px);box-shadow:0 0 16px rgba(52,211,153,.5);}
.hf-wire.dead{background:repeating-linear-gradient(90deg,#ef4444 0 14px,transparent 14px 26px);box-shadow:0 0 16px rgba(239,68,68,.5);}
.hf-msg{position:absolute;top:50%;left:0;margin-top:-18px;padding:9px 18px;border-radius:11px;background:linear-gradient(135deg,#fbbf24,#d97706);font:700 19px 'JetBrains Mono',monospace;color:#050505;box-shadow:0 0 22px rgba(251,191,36,.55);white-space:nowrap;opacity:0;}
.hf-msg.back{background:linear-gradient(135deg,#a78bfa,#7c3aed);color:#fff;box-shadow:0 0 22px rgba(167,139,250,.55);}
.hf-msg.up{margin-top:-70px;}
.hf-msg.dn{margin-top:34px;}
.hf-endcard{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;background:#050505;z-index:9;}
.hf-endcard .hf-eb{font:800 92px 'Poppins',sans-serif;color:#fff;}
.hf-endcard .hf-eb em{font-style:normal;color:${amb.a};text-shadow:0 0 34px ${amb.a}80;}
.hf-endcard .hf-es{font:500 22px 'JetBrains Mono',monospace;letter-spacing:.3em;color:rgba(255,255,255,.55);text-transform:uppercase;}
.fx-stage{position:relative;display:block;width:100%;height:100%;}
.fx{position:absolute;display:block;}
.fx .hf-pill,.fx .hf-tile,.fx .hf-window,.fx .hf-urlrow,.fx .hf-ringwrap,.fx .hf-num,.fx .hf-chip,.fx .hf-tag{position:absolute;}
.fx-svg{position:absolute;inset:0;width:100%;height:100%;}
`;

// ---------- 1. TTS ----------
function probe(f) {
  return parseFloat(execFileSync('ffprobe', ['-v', 'quiet', '-show_entries', 'format=duration', '-of', 'csv=p=0', f], { encoding: 'utf8' }).trim());
}
function tts(text, out, wordsOut) {
  const py = `import asyncio,edge_tts,sys,json\nasync def m():\n  words=[]\n  for i in range(5):\n    try:\n      c=edge_tts.Communicate(sys.argv[1],sys.argv[2],boundary='WordBoundary',rate="${brief.rate || '-4%'}")\n      with open(sys.argv[3],'wb') as f:\n        async for ch in c.stream():\n          if ch['type']=='audio': f.write(ch['data'])\n          elif ch['type']=='WordBoundary': words.append({'t':round(ch['offset']/1e7,2),'w':str(ch['text']).lower()})\n      import os\n      if os.path.getsize(sys.argv[3])>1000:\n        json.dump(words,open(sys.argv[4],'w')); return\n    except Exception as e: print('retry',i,e); await asyncio.sleep(1+i)\n  raise SystemExit(1)\nasyncio.run(m())`;
  const r = spawnSync('python', ['-c', py, text, VOICE, out, wordsOut], { encoding: 'utf8', timeout: 120000 });
  if (r.status !== 0) throw new Error('tts failed: ' + (r.stderr || r.stdout).slice(0, 200));
}
let t = 0;
for (const b of beats) {
  const mp3 = path.join(work, 'voice', `beat-${String(b.i).padStart(2, '0')}.mp3`);
  const wordsFile = path.join(work, 'voice', `beat-${String(b.i).padStart(2, '0')}.words.json`);
  tts(b.text, mp3, wordsFile);
  try { b.words = JSON.parse(fs.readFileSync(wordsFile, 'utf8')).map((w) => ({ t: Math.round((b.start + w.t) * 100) / 100, w: w.w })); } catch { b.words = []; }
  const dur = probe(mp3);
  b.start = Math.round(t * 100) / 100; b.dur = Math.round(dur * 100) / 100; b.file = `voice/beat-${String(b.i).padStart(2, '0')}.mp3`;
  t = t + dur + GAP;
  console.log(`  [tts] beat ${b.i} ${b.dur}s @ ${b.start}s — "${b.text.slice(0, 44)}"`);
}
const endStart = Math.round((t + 0.1) * 100) / 100;
const END_DUR = 3.4;
const total = Math.round((endStart + END_DUR) * 100) / 100;
console.log(`[cb] total ${total}s (end card ${endStart}s + ${END_DUR}s)`);
beats.forEach((b, i) => { b.until = i < beats.length - 1 ? beats[i + 1].start : endStart; });
if (planIsLight) {
  const allHaveItems = plan.every((e2) => Array.isArray(e2.items) && e2.items.length > 0);
  if (allHaveItems) {
    scenes = plan.map((e2, i2) => ({
      type: 'free', arr: FX_ARRS.includes(e2.arr) ? e2.arr : 'row',
      items: (e2.items || []).slice(0, 5).map((it) => ({
        kind: FX_KINDS.includes(it.kind) ? it.kind : 'tile',
        icon: ICONS[it.icon] ? it.icon : 'tag',
        label: String(it.label || '').slice(0, 18),
        at: String(it.at || '').toLowerCase(),
        ...(it.cmd ? { cmd: it.cmd } : {}), ...(it.variant ? { variant: it.variant } : {}),
      })),
    }));
    console.log('[cb] free-scene plan: ' + scenes.map((s2) => s2.arr + '(' + s2.items.map((x) => x.kind[0]).join('') + ')').join(' '));
  } else scenes = buildScenesFromPlan(plan, actors, beats);
}
const sceneTypes = scenes.map((s2) => s2.type).join(',');
console.log(`[cb] scene plan: ${sceneTypes}`);

// ---------- 2. build index.html ----------
const accent = (text, em) => {
  if (!em) return text;
  const re = new RegExp(`\\b(${em.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})\\b`, 'i');
  return text.replace(re, '<span class="em">$1</span>');
};
const headClips = beats.map((b) =>
  `  <div id="beat${b.i}" class="clip hf-head" data-start="${b.start}" data-duration="${Math.round((b.until - b.start) * 100) / 100}" data-track-index="1">${accent(b.text, b.em)}</div>`).join('\n');
const stageClips = beats.map((b, i) => {
  const scene = { ...(scenes[i] || { type: 'result', big: '…' }), _i: i };
  const inner = (RENDER[scene.type] || RENDER.result)(scene);
  return `  <div id="stage${i}" class="clip hf-stage" data-start="${b.start}" data-duration="${Math.round((b.until - b.start) * 100) / 100}" data-track-index="2">${inner}</div>`;
}).join('\n');
const audioClips = beats.map((b) =>
  `  <audio id="voice-${b.i}" class="clip" data-start="${b.start}" data-duration="${b.dur}" data-track-index="5" src="${b.file}"></audio>`).join('\n');
const dustSpans = Array.from({ length: 14 }, (_, i) => `<span class="dust" id="dust-${i}" style="left:${8 + ((i * 173) % 88)}%;"></span>`).join('\n  ');

// ---------- per-scene motion (JS on the ONE timeline; repeat:-1 loops are seek-safe) ----------
function motion(i, s, start) {
  let m = '';
  if (s.type === 'browser') {
    m += `
var u${i} = document.querySelector('#urltxt-i${i}');
var urlFull${i} = ${JSON.stringify(s.url || 'https://example.com')};
var urlObj${i} = { n: 0 };
tl.to(urlObj${i}, { n: urlFull${i}.length, duration: 1.2, ease: 'none', onUpdate: function () { u${i}.textContent = urlFull${i}.slice(0, Math.round(urlObj${i}.n)); } }, ${start} + 0.45);
tl.fromTo('#caret-i${i}', { opacity: 1 }, { opacity: 0, duration: 0.28, repeat: -1, yoyo: true, ease: 'none' }, ${start} + 0.45);`;
  } else if (s.type === 'chain') {
    m += `
Array.from(b${i}.querySelectorAll('.hf-conn')).forEach(function (el, k) { tl.fromTo(el, { backgroundPositionX: '0px' }, { backgroundPositionX: '26px', duration: 0.55, ease: 'none', repeat: -1 }, ${start} + 0.5 + k * 0.08); });
${s.packet ? `var row${i} = b${i}.querySelector('.hf-row');
var travel${i} = Math.max(300, row${i}.scrollWidth - 320);
tl.fromTo('#packet-i${i}', { x: 0, opacity: 0 }, { x: travel${i}, opacity: 1, duration: ${(s.packetDur || 1.6)}, ease: 'power1.inOut', repeat: -1, repeatDelay: 0.7 }, ${start} + 0.9);` : ''}`;
  } else if (s.type === 'search') {
    m += `
Array.from(b${i}.querySelectorAll('.hf-rbar')).forEach(function (el, k) { tl.fromTo(el, { scaleX: 0 }, { scaleX: 1, duration: 0.55, ease: 'power3.out' }, ${start} + 0.75 + k * 0.16); });
Array.from(b${i}.querySelectorAll('.hf-shine')).forEach(function (el) { tl.fromTo(el, { x: -160 }, { x: ${s.width || 950}, duration: 1.5, ease: 'power1.inOut', repeat: -1, repeatDelay: 1.6 }, ${start} + 1.4); });`;
  } else if (s.type === 'code') {
    const nLines = (s.lines || []).length;
    m += `
var cl${i} = [${Array.from({ length: nLines }, (_, li) => `'#cl-i${i}-${li}'`).join(', ')}];
cl${i}.forEach(function (sel, li) { tl.fromTo(sel, { clipPath: 'inset(0 100% 0 0)' }, { clipPath: 'inset(0 0% 0 0)', duration: ${(s.typeDur || 0.5)}, ease: 'none' }, ${start} + 0.5 + li * ${(s.typeDur || 0.5) + 0.14}); });
tl.fromTo('#caret-i${i}', { opacity: 1 }, { opacity: 0, duration: 0.26, repeat: -1, yoyo: true, ease: 'none' }, ${start} + 0.5);
${s.tag ? `tl.fromTo('#tag-i${i}', { scale: 0.4, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.45, ease: 'back.out(2.2)' }, ${start} + 0.7 + ${nLines} * ${(s.typeDur || 0.5) + 0.14});` : ''}`;
  } else if (s.type === 'result') {
    m += `
tl.fromTo('#ring-i${i}', { drawSVG: '0%' }, { drawSVG: '100%', duration: 1.1, ease: 'power2.inOut' }, ${start} + 0.5);
tl.to(b${i}.querySelector('.hf-ringwrap'), { scale: 1.05, duration: 0.9, yoyo: true, repeat: -1, ease: 'sine.inOut' }, ${start} + 1.6);
${s.count ? `var num${i} = document.querySelector('#num-i${i}');
var cnt${i} = { v: ${s.count.from} };
tl.to(cnt${i}, { v: ${s.count.to}, duration: 1.1, ease: 'power2.out', onUpdate: function () { num${i}.textContent = cnt${i}.v.toFixed(${s.count.dec || 0}) + ${JSON.stringify(s.count.suffix || '')}; } }, ${start} + 0.6);` : ''}`;
  } else if (s.type === 'pills') {
    m += `
${(s.items || []).map((_, pi) => `tl.to('.pulsedrp-i${i}-${pi}', { scale: 1.05, duration: 0.75, yoyo: true, repeat: -1, ease: 'sine.inOut' }, ${start} + 0.9 + ${pi} * 0.38);`).join('\n')}
Array.from(b${i}.querySelectorAll('.hf-shine')).forEach(function (el, k) { tl.fromTo(el, { x: -160 }, { x: 420, duration: 1.3, ease: 'power1.inOut', repeat: -1, repeatDelay: 1.4 }, ${start} + 1.2 + k * 0.5); });`;
  } else if (s.type === 'globe') {
    const arcs = (s.arcs || [{ from: [20, -30], to: [35, 45], color: '0xfbbf24' }, { from: [-15, -60], to: [40, 100], color: '0x4ade80' }, { from: [45, 10], to: [10, -100], color: '0xa78bfa' }]).map((a) => ({ ...a, color: Number(a.color) }));
    m += `
registerGlobe(${i}, ${start}, ${JSON.stringify(arcs)});`;
  } else if (s.type === 'commits') {
    m += `
tl.fromTo('#cm-main-i${i}', { drawSVG: '0%' }, { drawSVG: '100%', duration: 0.9, ease: 'power2.inOut' }, ${start} + 0.35);
[0, 1, 2, 3].forEach(function (n, k) { tl.fromTo('#cm-n-i${i}-' + n, { scale: 0, opacity: 0, transformOrigin: '50% 50%' }, { scale: 1, opacity: 1, duration: 0.35, ease: 'back.out(2.4)' }, ${start} + 0.5 + k * 0.18); });
${s.mode !== 'plain' ? `tl.fromTo('#cm-branch-i${i}', { drawSVG: '0%' }, { drawSVG: '100%', duration: 0.8, ease: 'power2.inOut' }, ${start} + 1.3);
tl.fromTo('#cm-n-i${i}-5', { scale: 0, opacity: 0, transformOrigin: '50% 50%' }, { scale: 1, opacity: 1, duration: 0.35, ease: 'back.out(2.4)' }, ${start} + 1.55);
tl.fromTo('#cm-n-i${i}-6', { scale: 0, opacity: 0, transformOrigin: '50% 50%' }, { scale: 1, opacity: 1, duration: 0.35, ease: 'back.out(2.4)' }, ${start} + 1.9);` : ''}
${s.mode === 'merge' ? `tl.fromTo('#cm-flash-i${i}', { scale: 0.4, opacity: 0.9, transformOrigin: '50% 50%' }, { scale: 2.1, opacity: 0, duration: 0.7, ease: 'power2.out' }, ${start} + 2.5);` : ''}
${s.mode === 'rebase' ? `tl.to(['#cm-n-i${i}-5', '#cm-n-i${i}-6'], { opacity: 0, duration: 0.3 }, ${start} + 2.5);
tl.to('#cm-branch-i${i}', { opacity: 0.15, duration: 0.4 }, ${start} + 2.5);
tl.fromTo('#cm-rb-i${i}-0', { x: 0, y: 0 }, { x: 330, y: 124, duration: 0.6, ease: 'power2.inOut' }, ${start} + 2.8);
tl.fromTo('#cm-rb-i${i}-1', { x: 0, y: 0 }, { x: 190, y: 124, duration: 0.6, ease: 'power2.inOut' }, ${start} + 3.4);` : ''}`;
  } else if (s.type === 'flow') {
    if (s.mode === 'close') {
      m += `
tl.fromTo('#msg-i${i}-0', { x: 0, opacity: 0 }, { x: ${s.travel || 1240}, opacity: 1, duration: 1.0, ease: 'power1.inOut' }, ${start} + 0.7);
tl.to('#msg-i${i}-0', { opacity: 0, duration: 0.2 }, ${start} + 1.7);
tl.fromTo('#msg-i${i}-0', { x: ${s.travel || 1240}, opacity: 0 }, { x: 0, opacity: 1, duration: 0.9, ease: 'power1.inOut' }, ${start} + 2.0);
tl.to('#msg-i${i}-0', { opacity: 0, duration: 0.2 }, ${start} + 2.9);
tl.set('#wire-i${i}', { className: 'hf-wire dead' }, ${start} + 3.1);
tl.to('#server-i${i}', { opacity: 0.45, duration: 0.4 }, ${start} + 3.1);
tl.fromTo('#closed-i${i}', { scale: 0.4, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.45, ease: 'back.out(2.2)' }, ${start} + 3.3);`;
    } else if (s.mode === 'poll') {
      m += `
[0, 1, 2].forEach(function (k) {
  tl.fromTo('#msg-i${i}-' + k, { x: 0, opacity: 0 }, { x: ${s.travel || 1240}, opacity: 1, duration: 0.85, ease: 'power1.inOut' }, ${start} + 0.7 + k * 1.15);
  tl.to('#msg-i${i}-' + k, { opacity: 0, duration: 0.15 }, ${start} + 1.55 + k * 1.15);
});`;
    } else if (s.mode === 'duplex') {
      m += `
[0, 1].forEach(function (k) {
  tl.fromTo('#msg-i${i}-' + k, { x: 0, opacity: 0 }, { x: ${s.travel || 1240}, opacity: 1, duration: 2.2, ease: 'none', repeat: -1, repeatDelay: 0.5 }, ${start} + 0.8 + k * 1.35);
});
[2, 3].forEach(function (k) {
  tl.fromTo('#msg-i${i}-' + k, { x: ${s.travel || 1240}, opacity: 0 }, { x: 0, opacity: 1, duration: 2.2, ease: 'none', repeat: -1, repeatDelay: 0.5 }, ${start} + 1.5 + (k - 2) * 1.35);
});
tl.to('#wire-i${i}', { opacity: 0.55, duration: 0.7, yoyo: true, repeat: -1, ease: 'sine.inOut' }, ${start} + 0.8);`;
    }
  } else if (s.type === 'timeline') {
    m += `
tl.fromTo('#tl-line-i${i}', { drawSVG: '0%' }, { drawSVG: '100%', duration: ${(beats[i].until - beats[i].start).toFixed(2) - 0.6}, ease: 'none' }, ${start} + 0.4);
${(s.labels || []).map((_, k) => `tl.fromTo('#tl-stem-i${i}-${k}', { drawSVG: '0%' }, { drawSVG: '100%', duration: 0.3, ease: 'power1.inOut' }, ${start} + 0.4 + ${(beats[i].until - beats[i].start).toFixed(2) - 0.6} * ${(k / Math.max(1, (s.labels || []).length - 1)).toFixed(2)});
tl.fromTo('#tl-k-i${i}-${k}', { scale: 0, opacity: 0, transformOrigin: '50% ${k % 2 === 0 ? '100%' : '0%'}' }, { scale: 1, opacity: 1, duration: 0.4, ease: 'back.out(2)' }, ${start} + 0.65 + ${(beats[i].until - beats[i].start).toFixed(2) - 0.6} * ${(k / Math.max(1, (s.labels || []).length - 1)).toFixed(2)});`).join('\n')}`;
  } else if (s.type === 'cycle') {
    m += `
tl.fromTo('#cy-ring-i${i}', { strokeDashoffset: 0 }, { strokeDashoffset: -224, duration: 8, ease: 'none', repeat: -1 }, ${start});
${(s.labels || []).map((_, k) => `tl.fromTo('#cy-k-i${i}-${k}', { scale: 0, opacity: 0, transformOrigin: '50% 50%' }, { scale: 1, opacity: 1, duration: 0.4, ease: 'back.out(2)' }, ${start} + 0.5 + ${k} * 0.5);`).join('\n')}`;
  } else if (s.type === 'funnel') {
    m += `
${(s.labels || []).map((_, k) => `tl.fromTo('#fn-k-i${i}-${k}', { scaleX: 0, opacity: 0 }, { scaleX: 1, opacity: 1, duration: 0.55, ease: 'power3.out' }, ${start} + 0.45 + ${k} * 0.5);`).join('\n')}
Array.prototype.forEach.call(b${i}.querySelectorAll('.hf-shine'), function (el, k) { tl.fromTo(el, { x: -160 }, { x: 900, duration: 1.4, ease: 'power1.inOut', repeat: -1, repeatDelay: 1.5 }, ${start} + 1.6 + k * 0.4); });`;
  } else if (s.type === 'tree') {
    m += `
tl.fromTo('#tr-top-i${i}', { scale: 0, opacity: 0, transformOrigin: '50% 50%' }, { scale: 1, opacity: 1, duration: 0.4, ease: 'back.out(2)' }, ${start} + 0.4);
${(s.labels || []).slice(1).map((_, k) => `tl.fromTo('#tr-l-i${i}-${k}', { drawSVG: '0%' }, { drawSVG: '100%', duration: 0.5, ease: 'power2.inOut' }, ${start} + 0.9 + ${k} * 0.45);
tl.fromTo('#tr-k-i${i}-${k}', { scale: 0, opacity: 0, transformOrigin: '50% 50%' }, { scale: 1, opacity: 1, duration: 0.4, ease: 'back.out(2)' }, ${start} + 1.3 + ${k} * 0.45);`).join('\n')}`;
  } else if (s.type === 'route') {
    m += `
tl.fromTo('#rt-path-i${i}', { drawSVG: '0%' }, { drawSVG: '100%', duration: ${(beats[i].until - beats[i].start).toFixed(2) - 0.5}, ease: 'none' }, ${start} + 0.4);
${(s.labels || []).slice(0, 3).map((_, k) => `tl.fromTo('#rt-node-i${i}-${k}', { scale: 0, opacity: 0, transformOrigin: '50% 50%' }, { scale: 1, opacity: 1, duration: 0.35, ease: 'back.out(2)' }, ${start} + 0.45 + ${(beats[i].until - beats[i].start).toFixed(2) - 0.5} * ${[0, 0.5, 1][k]});\ntl.fromTo('#rt-s-i${i}-${k}', { y: ${k % 2 === 0 ? 30 : -30}, opacity: 0 }, { y: 0, opacity: 1, duration: 0.45, ease: 'back.out(1.7)' }, ${start} + 0.9 + ${(beats[i].until - beats[i].start).toFixed(2) - 0.5} * ${[0, 0.5, 1][k]});`).join('\n')}
`;
  } else if (s.type === 'chat') {
    m += `
[0, 1].forEach(function (k) { tl.fromTo('#ch-side-i${i}-' + k, { scale: 0, opacity: 0, transformOrigin: '50% 50%' }, { scale: 1, opacity: 1, duration: 0.4, ease: 'back.out(2)' }, ${start} + 0.35 + k * 0.25); });
${(s.labels || []).slice(0, 4).map((_, k) => `tl.fromTo('#ch-b-i${i}-${k}', { scale: 0.5, opacity: 0, transformOrigin: '${k % 2 ? '100% 50%' : '0% 50%'}' }, { scale: 1, opacity: 1, duration: 0.35, ease: 'back.out(2.2)' }, ${start} + 0.9 + ${k} * 0.7);`).join('\n')}`;
  } else if (s.type === 'free') {
    m += `
var wl${i} = ${JSON.stringify((beats[i].words || []).map((w) => [w.t, w.w]))};
var wt${i} = function (word) { word = String(word).toLowerCase(); for (var q = 0; q < wl${i}.length; q++) { if (wl${i}[q][1] === word || wl${i}[q][1].indexOf(word) === 0) return wl${i}[q][0]; } return -1; };
var its${i} = ${JSON.stringify((s.items || []).map((it, k) => ({ id: 'fx-' + i + '-' + k, at: String(it.at || '').toLowerCase() })))};
its${i}.forEach(function (it, k) {
  var el = document.getElementById(it.id); if (!el) return;
  var tw = it.at ? wt${i}(it.at) : -1; if (tw < 0) tw = ${start} + 0.5 + k * 0.4;
  tw = Math.min(tw, ${(beats[i].until || 0).toFixed(2)} - 0.35);
  gsap.set(el, { opacity: 0, y: 36, scale: 0.92 });
  tl.to(el, { opacity: 1, y: 0, scale: 1, duration: 0.45, ease: 'back.out(1.8)' }, tw);
});
Array.prototype.forEach.call(b${i}.querySelectorAll('.hf-shine'), function (el, k) { tl.fromTo(el, { x: -160 }, { x: 420, duration: 1.3, ease: 'power1.inOut', repeat: -1, repeatDelay: 1.6 }, ${start} + 1.2 + k * 0.5); });
`;
  }
  return m;
}

const motionJs = beats.map((b, i) => motion(i, scenes[i] || {}, b.start)).join('\n');

const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Poppins:wght@600;700;800&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500;700&display=swap" rel="stylesheet">
<script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/DrawSVGPlugin.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/MotionPathPlugin.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/three@0.128.0/build/three.min.js"></script>
<style>${CSS}</style>
</head>
<body>
<div id="root" data-composition-id="main" data-start="0" data-duration="${total}" data-width="${W}" data-height="${H}">
  <span class="aurora a"></span>
  <span class="aurora b"></span>
  ${dustSpans}
  <div class="hf-brand"><i></i><span>${brand.toLowerCase().replace(/\s+/g, '')}</span></div>
  <div class="hf-kicker">${kicker}</div>
${headClips}
${stageClips}
  <div id="endcard" class="clip hf-endcard" data-start="${endStart}" data-duration="${END_DUR}" data-track-index="3">
    <span class="hf-eb rise">${brand.split(' ')[0]} <em>${brand.split(' ').slice(1).join(' ') || '.'}</em></span>
    <span class="hf-es rise">${brief.subline || 'code, explained simply'}</span>
  </div>
${audioClips}
  <audio id="music" class="clip" data-start="0" data-duration="${total}" data-track-index="6" data-volume="0.12" src="assets/music.mp3"></audio>
</div>
<script>
gsap.registerPlugin(DrawSVGPlugin, MotionPathPlugin);
var tl = gsap.timeline({ paused: true });
var globes = [];
var beatEls = [${beats.map((b) => `'#beat${b.i}'`).join(', ')}].map(function (sel) {
  var el = document.querySelector(sel);
  var nodes = [];
  el.childNodes.forEach(function (n) {
    if (n.nodeType === 3) {
      n.textContent.split(/(\\s+)/).forEach(function (tok) {
        if (tok.trim()) { var s = document.createElement('span'); s.className = 'w'; s.textContent = tok; nodes.push(s); n.parentNode.insertBefore(s, n); }
        else if (tok) { n.parentNode.insertBefore(document.createTextNode(' '), n); }
      });
      n.remove();
    } else if (n.nodeType === 1) { n.classList.add('w'); nodes.push(n); }
  });
  return nodes;
});
beatEls.forEach(function (ws) { gsap.set(ws, { opacity: 0, y: 56 }); });
/* headline words appear at the exact SPOKEN time of each word */
${beats.map((b) => `  (function () {
    var ws = beatEls[${b.i}], hw = ${JSON.stringify(b.words.map((w) => w.t))};
    ws.forEach(function (w, j) { var tw = hw[j] !== undefined ? hw[j] : ${b.start} + 0.1 + j * 0.07; tl.to(w, { opacity: 1, y: 0, duration: 0.5, ease: 'expo.out' }, tw); });
  })();`).join('\n')}
/* ambient: aurora drift + rising dust (deterministic, always-on) */
tl.fromTo('.aurora.a', { x: 0, y: 0 }, { x: 130, y: 70, duration: 9, yoyo: true, repeat: -1, ease: 'sine.inOut' }, 0);
tl.fromTo('.aurora.b', { x: 0, y: 0 }, { x: -110, y: -60, duration: 12, yoyo: true, repeat: -1, ease: 'sine.inOut' }, 0);
Array.prototype.forEach.call(document.querySelectorAll('.dust'), function (d, k) {
  tl.fromTo(d, { y: 0, opacity: 0 }, { y: -1080, opacity: 0.55, duration: 7 + (k % 5) * 1.3, ease: 'none', repeat: -1 }, 0 + (k % 7) * 1.1);
});
/* stage entrances + per-scene motion */
${beats.map((b, i) => {
  const s = scenes[i] || {};
  const wide = s.type === 'commits' || s.type === 'globe' || s.type === 'flow';
  const isFree = s.type === 'free';
  const pieces = isFree ? '[]' : wide ? `Array.from(b${i}.children)` : `Array.from(b${i}.querySelectorAll('.rise'))`;
  const spanEnd = b.start + Math.max(1.8, (b.until - b.start) * 0.45);
  const slots = Array.from({ length: 6 }, (_, k) => Math.round((b.start + 0.35 + (k * (spanEnd - b.start - 0.35)) / 5) * 100) / 100);
  return `var b${i} = document.querySelector('#stage${i}');
var lean${i} = [0, -44, 44][${i} % 3];
gsap.set(b${i}, { opacity: 0, scale: 0.965, y: 26, x: lean${i} });
gsap.set(${pieces}, { opacity: 0, y: 44 });
tl.to(b${i}, { opacity: 1, scale: 1, y: 0, x: lean${i}, duration: 0.5, ease: 'back.out(1.5)' }, ${b.start});
var pt${i} = ${JSON.stringify(slots)};
Array.prototype.forEach.call(${pieces}, function (el, k) { tl.to(el, { opacity: 1, y: 0, duration: 0.45, ease: 'back.out(1.6)' }, pt${i}[k % pt${i}.length]); });
tl.set(b${i}, { opacity: 0 }, ${b.until});`;
}).join('\n')}
${motionJs}
/* endcard */
var ec = document.querySelector('#endcard');
gsap.set(ec.querySelectorAll('.rise'), { opacity: 0, y: 40 });
tl.to(ec.querySelectorAll('.rise'), { opacity: 1, y: 0, duration: 0.7, ease: 'expo.out', stagger: 0.12 }, ${endStart} + 0.2);
/* three.js globes: deterministic render driven by timeline time */
function registerGlobe(idx, start, arcs) { globes.push({ idx: idx, start: start, arcs: arcs, inited: false }); }
function latLonToVec(lat, lon) {
  var phi = (90 - lat) * Math.PI / 180, theta = (lon + 180) * Math.PI / 180;
  return new THREE.Vector3(-Math.sin(phi) * Math.cos(theta), Math.cos(phi), Math.sin(phi) * Math.sin(theta));
}
function initGlobe(g) {
  var canvas = document.querySelector('#globe-i' + g.idx);
  if (!canvas || typeof THREE === 'undefined') { g.inited = 'failed'; return; }
  var renderer = new THREE.WebGLRenderer({ canvas: canvas, alpha: true, antialias: true, preserveDrawingBuffer: true });
  renderer.setClearColor(0x000000, 0);
  var scene = new THREE.Scene();
  var camera = new THREE.PerspectiveCamera(45, 1, 0.1, 20);
  camera.position.z = 2.75;
  var globe = new THREE.Group();
  var N = 420, pts = new Float32Array(N * 3);
  for (var i = 0; i < N; i++) {
    var y = 1 - (i / (N - 1)) * 2, rad = Math.sqrt(1 - y * y), th = i * 2.39996;
    pts[i * 3] = Math.cos(th) * rad; pts[i * 3 + 1] = y; pts[i * 3 + 2] = Math.sin(th) * rad;
  }
  var pg = new THREE.BufferGeometry();
  pg.setAttribute('position', new THREE.BufferAttribute(pts, 3));
  globe.add(new THREE.Points(pg, new THREE.PointsMaterial({ color: 0xa78bfa, size: 0.022, transparent: true, opacity: 0.9 })));
  g.packets = [];
  (g.arcs || []).forEach(function (a) {
    var p1 = latLonToVec(a.from[0], a.from[1]), p2 = latLonToVec(a.to[0], a.to[1]);
    var mid = p1.clone().add(p2).normalize().multiplyScalar(1 + p1.distanceTo(p2) * 0.38);
    var curve = new THREE.QuadraticBezierCurve3(p1, mid, p2);
    for (var b2 = 0; b2 <= 14; b2++) {
      var bead = new THREE.Mesh(new THREE.SphereGeometry(0.012, 8, 8), new THREE.MeshBasicMaterial({ color: a.color }));
      bead.position.copy(curve.getPoint(b2 / 14)); globe.add(bead);
    }
    var packet = new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 10), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    globe.add(packet);
    g.packets.push({ mesh: packet, curve: curve, speed: 0.14 + (g.packets.length * 0.04), off: g.packets.length * 0.3 });
  });
  scene.add(globe);
  g.scene = scene; g.camera = camera; g.globe = globe; g.renderer = renderer;
  g.inited = true;
}
tl.eventCallback('onUpdate', function () {
  var now = tl.time();
  globes.forEach(function (g) {
    if (g.inited === false) { try { initGlobe(g); } catch (e) { g.inited = 'failed'; } }
    if (g.inited !== true) return;
    var local = Math.max(0, now - g.start);
    g.globe.rotation.y = local * 0.22;
    g.globe.rotation.x = 0.35;
    g.packets.forEach(function (p) {
      p.mesh.position.copy(p.curve.getPoint((local * p.speed + p.off) % 1));
    });
    g.renderer.render(g.scene, g.camera);
  });
});
tl.seek(0);
window.__timelines = { main: tl };
</script>
</body>
</html>`;

// ---------- 3. write + check + render ----------
const genDir = path.join(work, 'gen');
fs.mkdirSync(genDir, { recursive: true });
fs.cpSync(path.join(work, 'voice'), path.join(genDir, 'voice'), { recursive: true });
const musicSrc = path.join(ROOT, 'hf-proof', 'assets', 'luxury-pad-01.mp3');
if (fs.existsSync(musicSrc)) { fs.mkdirSync(path.join(genDir, 'assets'), { recursive: true }); fs.copyFileSync(musicSrc, path.join(genDir, 'assets', 'music.mp3')); }
fs.writeFileSync(path.join(genDir, 'index.html'), html);

console.log('[cb] running check gate ...');
let c = null, cout = '';
for (let attempt = 1; attempt <= 3; attempt++) {
  c = spawnSync('npx', ['--yes', `hyperframes@${HF_VER}`, 'check'], { cwd: genDir, encoding: 'utf8', shell: true, timeout: 300000 });
  cout = `${c.stdout || ''}${c.stderr || ''}`;
  if (c.status === 0) break;
  const transient = /page_error|Navigation timeout|check_runtime_failure/.test(cout);
  if (transient && attempt < 3) { console.log(`[cb] check transient failure (attempt ${attempt}) — retrying in 20s`); await new Promise((r) => setTimeout(r, 20000)); }
  else break;
}
if (c.status !== 0) {
  console.error('[cb] check FAILED:' + NLJ + cout.split(NLJ).filter((l) => l.includes('✗') || l.includes('error')).slice(0, 12).join(NLJ));
  process.exit(1);
}
console.log('[cb] check PASSED — rendering ...');
const r = spawnSync('npx', ['--yes', `hyperframes@${HF_VER}`, 'render'], { cwd: genDir, encoding: 'utf8', shell: true, timeout: 1800000, stdio: ['ignore', 'pipe', 'pipe'] });
const out = `${r.stdout || ''}\n${r.stderr || ''}`;
const mp4Rel = (out.match(/renders[\\/](\S+\.mp4)/) || [])[1];
if (!mp4Rel) { console.error('[cb] render failed:\n' + out.slice(-800)); process.exit(1); }
const mp4 = path.join(genDir, 'renders', mp4Rel.replace(/\\/g, '/'));
console.log(`[cb] DONE -> ${mp4}`);
