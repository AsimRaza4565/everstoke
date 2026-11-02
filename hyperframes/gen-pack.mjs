#!/usr/bin/env node
// CodeBerry pack generator — YouTube metadata (title/tags/description, CloudXBerry formulas) + matching thumbnail.
// Usage: node hyperframes/gen-pack.mjs --topic "URL vs URI" --kind vs --out dir [--brand "Byte Theory"] [--amb a,b]
// kind: vs (X vs Y comparison) | sense (X finally makes sense) | map (topic node map)

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
const HF_VER = '0.8.152';

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > -1 ? process.argv[i + 1] : d; };
const topic = arg('topic');
const kind = arg('kind', 'sense');
const outDir = path.resolve(arg('out', '.'));
const brand = arg('brand', 'Byte Theory');
const [ambA, ambB] = (arg('amb', '#a78bfa,#fbbf24')).split(',');
if (!topic) { console.error('usage: gen-pack.mjs --topic "..." --kind vs|sense|map --out dir'); process.exit(1); }
fs.mkdirSync(outDir, { recursive: true });

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
const svg = (name) => `<svg viewBox="0 0 24 24" style="${'stroke:#fff;fill:none;stroke-width:2.5;stroke-linecap:round;stroke-linejoin:round;width:100%;height:100%'}">${ICONS[name] || ICONS.tag}</svg>`;

// ---------- 1. metadata ----------
async function brain(p) {
  if (process.env.GEMINI_API_KEY) {
    for (const cfg of [{ temperature: 0.8, maxOutputTokens: 4000, thinkingConfig: { thinkingBudget: 0 } }, { temperature: 0.8, maxOutputTokens: 4000 }]) {
      try {
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents: [{ parts: [{ text: p }] }], generationConfig: cfg }),
        });
        const d = await res.json();
        const txt = d.candidates?.[0]?.content?.parts?.map((x) => x.text || '').join('') || '';
        if (txt.length > 100) return txt;
      } catch { }
    }
  }
  for (const [url, model, keyEnv] of [
    ['https://api.groq.com/openai/v1/chat/completions', 'openai/gpt-oss-120b', 'GROQ_API_KEY'],
    ['https://api.cerebras.ai/v1/chat/completions', 'gpt-oss-120b', 'CEREBRAS_API_KEY'],
  ]) {
    if (!process.env[keyEnv]) continue;
    try {
      const res = await fetch(url, {
        method: 'POST', headers: { Authorization: `Bearer ${process.env[keyEnv]}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, messages: [{ role: 'user', content: p }], temperature: 0.8, max_tokens: 3000 }),
      });
      if (!res.ok) continue;
      const txt = (await res.json()).choices?.[0]?.message?.content || '';
      if (txt.length > 100) return txt;
    } catch { }
  }
  return null;
}

const BROAD = ['web development', 'software engineering', 'programming', 'computer science', 'coding', 'developer fundamentals', 'tech explained', 'backend development'];

function formulaMeta() {
  const t = topic;
  const vs = t.includes(' vs ') ? t.split(/\s+vs\s+/i) : null;
  const title = kind === 'vs' && vs ? `${vs[0]} vs ${vs[1]}: The Most Confused Topic Finally Makes Sense`
    : kind === 'map' ? `Every Aspect of ${t} Explained in 5 Minutes`
      : `${t} Will Finally Make Sense After This Video`;
  const key = t.toLowerCase();
  const tags = [...new Set([t, `${key} explained`, `what is ${key}`, `${key} tutorial`, `${key} for beginners`, `${key} explained simply`, `${key} basics`, `${key} architecture`, ...BROAD])].slice(0, 18);
  const description = `${t} — explained in a simple and beginner-friendly way.\n\nWe build the idea up step by step with clean animated diagrams: what it is, why it exists, and how the pieces connect. By the end, ${key} will finally make sense.\n\n#${key.replace(/\s+/g, '')} #softwareengineering #tech`;
  return { title, tags, description };
}

async function meta() {
  const p = `You write YouTube metadata for a premium dev-explainer channel (dark animated explainers, audience = developers, US).
Topic: "${topic}". Thumbnail kind: ${kind}.
Title formulas that work for this channel: "X Will Finally Make Sense After This Video" / "X vs Y: The Most Confused Topic Finally Makes Sense" / "Every X Explained in N Minutes".
Return ONLY valid JSON: {"title":"<=95 chars, use a formula, high curiosity","tags":["15-18 tags: exact topic + variations like 'x explained','what is x','x for beginners' + broad tail like web development, software engineering"],"description":"3 short lines: what the video does / a relatable one-scenario hook from the topic / ends with 3 hashtags"}`;
  const out = await brain(p);
  if (out) {
    const m = out.match(/\{[\s\S]*\}/);
    if (m) {
      try {
        const j = JSON.parse(m[0]);
        if (j.title && Array.isArray(j.tags) && j.description) return { title: String(j.title).slice(0, 100), tags: j.tags.map(String).slice(0, 18), description: String(j.description) };
      } catch { }
    }
  }
  console.log('[pack] LLM metadata failed — using formula fallback');
  return formulaMeta();
}

// ---------- 2. thumbnail HTML (1280x720, same design language as the videos) ----------
function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

function thumbParts() {
  if (kind === 'vs') {
    const parts = topic.split(/\s+vs\s+/i);
    const a = esc((parts[0] || 'A').toUpperCase()), b = esc((parts[1] || 'B').toUpperCase());
    return {
      icon: 'link', accentText: a, whiteText: ` vs `, accent2Text: b, sub: "WHAT'S THE DIFFERENCE?",
      art: `<span class="vsbox left"><span class="vslabel" style="color:#4ade80">${a}</span><span class="vssample" style="color:#4ade80">https://site.com</span></span>
            <span class="vspill">VS</span>
            <span class="vsbox right"><span class="vslabel" style="color:#a78bfa">${b}</span><span class="vssample" style="color:#a78bfa">urn:isbn:0451</span></span>`,
    };
  }
  if (kind === 'map') {
    const nodes = ['api', 'cache', 'db', 'queue', 'auth', 'cdn'];
    const art = nodes.map((n, i) => {
      const ang = (i / nodes.length) * Math.PI * 2 - Math.PI / 2;
      const x = 640 + Math.cos(ang) * 420 - 110, y = 400 + Math.sin(ang) * 240 - 55;
      return `<span class="mnode" style="left:${x}px;top:${y}px;"><span class="mic">${svg(Object.keys(ICONS)[i % 14])}</span>${esc(n.toUpperCase())}</span>
              <svg class="mline" style="left:${Math.min(640, x + 110)}px;top:${Math.min(400, y + 55)}px;" width="${Math.abs(x + 110 - 640)}" height="${Math.abs(y + 55 - 400)}"><line x1="0" y1="0" x2="${Math.abs(x + 110 - 640)}" y2="${Math.abs(y + 55 - 400)}" stroke="${ambB}" stroke-width="3" stroke-dasharray="12 10" opacity="0.7"/></svg>`;
    }).join('');
    return { icon: Object.keys(ICONS)[0], accentText: topic.toUpperCase().slice(0, 18), whiteText: '', accent2Text: '', sub: 'EVERY PIECE, EXPLAINED', art };
  }
  const icon = kind === 'vs' ? 'link' : Object.keys(ICONS).find((k) => topic.toLowerCase().includes(k)) || 'zap';
  let sub = topic.toUpperCase();
  if (sub.length > 32) { sub = sub.slice(0, 32); sub = sub.slice(0, sub.lastIndexOf(' ') > 0 ? sub.lastIndexOf(' ') : sub.length); }
  return {
    icon, accentText: 'FINALLY', whiteText: ' MAKES SENSE', accent2Text: '', sub,
    art: `<span class="bigicon"><span class="bigicon-in">${svg(icon)}</span></span>`,
  };
}

const P = thumbParts();
const thumbHtml = `<!doctype html>
<html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Poppins:wght@700;800;900&family=JetBrains+Mono:wght@500;700&display=swap" rel="stylesheet">
<script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
<style>
*{margin:0;padding:0;box-sizing:border-box;}
html,body{width:1280px;height:720px;overflow:hidden;background:#050505;}
#root{position:relative;width:1280px;height:720px;font-family:'Poppins',sans-serif;background:radial-gradient(900px 420px at 50% -10%,${ambA}1c,transparent 60%),#050505;}
#stage::before{content:'';position:absolute;inset:0;background-image:linear-gradient(rgba(255,255,255,.05) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.05) 1px,transparent 1px);background-size:80px 80px;}
.top{position:absolute;top:64px;left:50%;transform:translateX(-50%);width:88%;text-align:center;font:900 92px/1.06 'Poppins',sans-serif;color:#fff;text-shadow:0 6px 40px rgba(0,0,0,.8);z-index:3;}
.top .a1{color:${ambA};text-shadow:0 0 44px ${ambA}80;}
.top .a2{color:${ambB};text-shadow:0 0 44px ${ambB}80;}
.underline{position:absolute;top:186px;left:50%;transform:translateX(-50%);width:560px;height:6px;border-radius:3px;background:linear-gradient(90deg,${ambA},${ambB});box-shadow:0 0 24px ${ambA}80;z-index:3;}
.sub{position:absolute;bottom:52px;left:50%;transform:translateX(-50%);font:700 34px 'JetBrains Mono',monospace;letter-spacing:.24em;color:#fff;text-shadow:0 0 24px ${ambB}90;z-index:3;}
.sub::after{content:'';position:absolute;left:50%;transform:translateX(-50%);bottom:-16px;width:340px;height:3px;border-radius:2px;background:linear-gradient(90deg,transparent,${ambB},transparent);}
.bigicon{position:absolute;left:50%;top:435px;transform:translate(-50%,-50%);width:270px;height:270px;border-radius:62px;background:linear-gradient(135deg,${ambB},#d97706);display:flex;align-items:center;justify-content:center;box-shadow:0 0 130px ${ambB}99,0 30px 60px rgba(0,0,0,.7);z-index:2;}
.bigicon-in{width:140px;height:140px;}
.vsbox{position:absolute;top:380px;width:430px;height:240px;border-radius:28px;background:#0d0d10;border:2px solid rgba(255,255,255,.16);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;box-shadow:0 0 90px rgba(255,255,255,.08);z-index:2;}
.vssample{font:700 26px 'JetBrains Mono',monospace;opacity:.85;}
.vsbox.left{left:70px;box-shadow:0 0 90px rgba(74,222,128,.28);border-bottom:6px solid #4ade80;}
.vsbox.right{right:70px;box-shadow:0 0 90px rgba(167,139,250,.28);border-bottom:6px solid #a78bfa;}
.vslabel{font:800 72px 'JetBrains Mono',monospace;text-shadow:0 0 30px currentColor;}
.vspill{position:absolute;left:50%;top:400px;transform:translate(-50%,-50%);padding:16px 30px;border-radius:18px;background:linear-gradient(135deg,#fff,#cbd5e1);color:#050505;font:900 44px 'Poppins',sans-serif;box-shadow:0 0 60px rgba(255,255,255,.5);z-index:4;}
.mnode{position:absolute;width:220px;padding:18px 0;border-radius:20px;background:#101014;border:1.5px solid rgba(255,255,255,.16);display:flex;flex-direction:column;align-items:center;gap:10px;font:700 22px 'JetBrains Mono',monospace;color:#fff;letter-spacing:.14em;box-shadow:0 0 40px ${ambA}40;z-index:2;}
.mic{width:44px;height:44px;}
.mline{position:absolute;z-index:1;}
</style></head>
<body>
<div id="root" data-composition-id="main" data-start="0" data-duration="1" data-width="1280" data-height="720">
  ${P.art}
  <div class="top"><span class="a1">${esc(P.accentText)}</span>${esc(P.whiteText)}${P.accent2Text ? `<span class="a2">${esc(P.accent2Text)}</span>` : ''}</div>
  <div class="underline"></div>
  <div class="sub">${esc(P.sub)}</div>
</div>
<script>
var tl = gsap.timeline({ paused: true });
window.__timelines = { main: tl };
tl.seek(0);
</script>
</body></html>`;

// ---------- render thumb via hyperframes (1s video -> frame) ----------
const workDir = path.join(ROOT, 'hyperframes', 'work', `thumb-${Date.now()}`);
fs.mkdirSync(workDir, { recursive: true });
fs.writeFileSync(path.join(workDir, 'index.html'), thumbHtml);
console.log('[pack] rendering thumbnail ...');
const r = spawnSync('npx', ['--yes', `hyperframes@${HF_VER}`, 'render'], { cwd: workDir, encoding: 'utf8', shell: true, timeout: 600000, stdio: ['ignore', 'pipe', 'pipe'] });
const out = `${r.stdout || ''}\n${r.stderr || ''}`;
const mp4Rel = (out.match(/renders[\\/](\S+\.mp4)/) || [])[1];
if (!mp4Rel) { console.error('[pack] thumb render failed:\n' + out.slice(-500)); process.exit(1); }
const mp4 = path.join(workDir, 'renders', mp4Rel.replace(/\\/g, '/'));
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-ss', '0.4', '-i', mp4, '-frames:v', '1', path.join(outDir, 'thumbnail.jpg')]);
fs.rmSync(workDir, { recursive: true, force: true });

const metadata = await meta();
fs.writeFileSync(path.join(outDir, 'metadata.json'), JSON.stringify(metadata, null, 2));
console.log(`[pack] DONE
TITLE: ${metadata.title}
TAGS: ${metadata.tags.length}
THUMB: ${path.join(outDir, 'thumbnail.jpg')}`);
