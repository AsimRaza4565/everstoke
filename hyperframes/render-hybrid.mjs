#!/usr/bin/env node
// Hybrid renderer — HyperFrames master timeline (voice + word-sync + render) with three embedded engines:
//   * Remotion (@remotion/player via esm.sh)  -> spring-physics packet relay  (deterministic seekTo per frame)
//   * Motion Canvas segment                    -> <video> driven by currentTime (fallback: canvas scene)
//   * Theatre.js (@theatre/core via esm.sh)    -> keyframed camera dolly on the parallax finale (fallback: same keyframes lerped in GSAP)
// Usage: node hyperframes/render-hybrid.mjs hyperframes/briefs/hybrid-internet.json

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
if (!briefPath) { console.error('usage: node render-hybrid.mjs <brief.json>'); process.exit(1); }
const brief = JSON.parse(fs.readFileSync(path.resolve(briefPath), 'utf8'));
const slug = brief.slug || path.basename(briefPath, '.json');
const W = brief.width || 1920, H = brief.height || 1080;
const VOICE = brief.voice || 'en-US-AndrewNeural';
const GAP = 0.45;
const brand = brief.brand || 'Byte Theory';
const kicker = brief.kicker || brand;
const amb = brief.ambient || { a: '#a78bfa', b: '#fbbf24' };

const beats = (brief.beats || []).map((b, i) => ({ ...b, i }));
const scenes = brief.scenes || [];
if (beats.length === 0) { console.error('brief needs beats'); process.exit(1); }

const work = path.join(HF_DIR, 'work', `${slug}-hyb`);
fs.rmSync(work, { recursive: true, force: true });
fs.mkdirSync(path.join(work, 'voice'), { recursive: true });
console.log(`[hy] ${slug} — ${W}x${H}, ${beats.length} beats`);

// ---------- icons ----------
const ICONS = {
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.8 2.6 4 5.6 4 9s-1.2 6.4-4 9c-2.8-2.6-4-5.6-4-9s1.2-6.4 4-9z"/>',
  lock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  server: '<rect x="4" y="4" width="16" height="7" rx="2"/><rect x="4" y="13" width="16" height="7" rx="2"/><path d="M8 8h.01M8 17h.01"/>',
  link: '<path d="M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1.5 1.5M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7L12.5 19"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>',
  chat: '<path d="M21 12a8 8 0 0 1-8 8H4l2-3a8 8 0 1 1 15-5z"/><path d="M8.5 11h.01M12 11h.01M15.5 11h.01"/>',
  zap: '<path d="M13 2 4 14h6l-1 8 9-12h-6l1-8z"/>',
  db: '<ellipse cx="12" cy="5.5" rx="8" ry="3"/><path d="M4 5.5V18.5c0 1.7 3.6 3 8 3s8-1.3 8-3V5.5M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/>',
  code: '<path d="M8 6l-6 6 6 6M16 6l6 6-6 6"/>',
  phone: '<rect x="7" y="2.5" width="10" height="19" rx="2.5"/><path d="M11 18.5h2"/>',
};
const svg = (name, cls = '') => `<svg class="${cls}" viewBox="0 0 24 24">${ICONS[name] || ICONS.link}</svg>`;

// ---------- scene renderers ----------
const tile = (t) => `<span class="hf-tile ${t.variant || 'v'} rise">${svg(t.icon)}<span class="hf-tlabel">${t.label}</span></span>`;
const pill = (p) => `<span class="hf-pill ${p.variant || 'gold'} rise"><span class="ic">${svg(p.icon)}</span><span>${p.label}</span><span class="hf-shine"></span></span>`;

const RENDER = {
  browser: (s) => `
    <span class="hf-window rise" style="width:900px">
      <span class="hf-bar"><i></i><i></i><i></i><span class="hf-tab">${s.title || 'New Tab'}</span></span>
      <span class="hf-body" style="flex-direction:column;gap:24px;padding:44px 40px;">
        <span class="hf-urlrow"><span class="hf-lock">${svg('lock')}</span><span class="hf-url" id="urltxt-i${s._i}"></span><span class="hf-caret" id="caret-i${s._i}"></span></span>
        ${s.sub ? `<span class="hf-label">${s.sub}</span>` : ''}
      </span>
    </span>`,
  chain: (s) => `
    <span class="hf-row" style="gap:0;">
      ${s.tiles.map((t, k) => tile(t) + (k < s.tiles.length - 1 ? `<span class="hf-conn ${s.conn === 'e' ? 'e' : ''} rise"></span>` : '')).join('')}
    </span>
    ${s.caption ? `<span class="hf-label rise" style="margin-top:30px;">${s.caption}</span>` : ''}`,
  search: (s) => `
    <span class="hf-window rise" style="width:950px">
      <span class="hf-bar"><i></i><i></i><i></i><span class="hf-tab">packets.log</span></span>
      <span class="hf-body" style="flex-direction:column;align-items:stretch;gap:22px;padding:36px 40px;">
        <span class="hf-search rise">${svg('search')}<span>${s.query}</span><span class="hf-shine"></span></span>
        ${(s.results || []).map((r) => `<span class="hf-row" style="justify-content:flex-start;gap:18px;"><span class="hf-rtile rise">${svg(r.icon || 'chat')}</span><span class="hf-rbar rise" style="width:${r.w};"></span><span class="hf-rlabel rise">${r.label}</span></span>`).join('')}
      </span>
    </span>`,
  result: (s) => `
    <span class="hf-col">
      <span class="hf-ringwrap rise">
        <span class="hf-bigicon">${svg(s.icon || 'zap')}</span>
        <svg class="hf-ring" viewBox="0 0 200 200"><circle id="ring-i${s._i}" cx="100" cy="100" r="92" pathLength="100"/></svg>
      </span>
      <span class="hf-num rise">${s.big}</span>
      <span class="hf-label rise">${s.label || ''}</span>
    </span>`,
  pills: (s) => `
    <span class="hf-row" style="gap:44px;">${(s.items || []).map((p) => pill(p)).join('')}</span>
    ${s.caption ? `<span class="hf-label rise" style="margin-top:36px;">${s.caption}</span>` : ''}`,
  remo: (s) => `
    <span class="seg-wrap">
      <span class="seg-chip rise">LIVE · PACKET RELAY · REMOTION</span>
      <span id="remo-root" style="display:block;width:1280px;height:720px;"></span>
      <span class="seg-fallback rise" id="remo-fallback">${s.fallback || ''}</span>
    </span>`,
  mcseg: (s) => `
    <span class="seg-wrap">
      <span class="seg-chip rise">SKETCH ASSEMBLY · MOTION CANVAS</span>
      ${fs.existsSync(path.join(HF_DIR, 'work', 'mc-build', 'mc-seg.mp4'))
      ? `<video id="mcvid" class="seg-video" src="assets/mc-seg.mp4" muted playsinline></video>`
      : `<canvas id="mccanvas" class="seg-video" width="1280" height="720"></canvas>`}
    </span>`,
  theatre: (s) => `
    <span class="seg-wrap" style="position:relative;">
      <span class="seg-chip rise">CAMERA CHOREOGRAPHY · THEATRE.JS</span>
      <span id="th-cam" class="th-cam">
        <svg class="th-layer" id="th-far" viewBox="0 0 1920 620" style="opacity:.5;">${s.far || ''}</svg>
        <svg class="th-layer" id="th-mid" viewBox="0 0 1920 620">${s.mid || ''}</svg>
        <span class="th-layer" id="th-near">${(s.cards || []).map((c, k) => `<span class="hf-tile ${['v', 'g', 'e'][k % 3]} th-card" style="left:${c.x};top:${c.y};">${svg(c.icon)}<span class="hf-tlabel">${c.label}</span></span>`).join('')}</span>
        <span class="th-title" id="th-title">${s.big || 'THE INTERNET'}</span>
      </span>
    </span>`,
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
.hf-shine{position:absolute;top:0;bottom:0;width:70px;background:linear-gradient(100deg,transparent,rgba(255,255,255,.5),transparent);transform:translateX(-160px) skewX(-18deg);}
.hf-tile{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:13px;min-width:150px;padding:26px 22px;border-radius:18px;background:#101014;border:1px solid rgba(255,255,255,.12);position:relative;}
.hf-tile svg{width:52px;height:52px;stroke:#fff;fill:none;stroke-width:2.5;stroke-linecap:round;stroke-linejoin:round;}
.hf-tile.g svg{stroke:#fbbf24;filter:drop-shadow(0 0 9px rgba(251,191,36,.6));}
.hf-tile.e svg{stroke:#4ade80;filter:drop-shadow(0 0 9px rgba(52,211,153,.6));}
.hf-tile.v svg{stroke:#a78bfa;filter:drop-shadow(0 0 9px rgba(167,139,250,.6));}
.hf-tlabel{font:500 16px 'JetBrains Mono',monospace;color:rgba(255,255,255,.8);letter-spacing:.12em;text-transform:uppercase;}
.hf-conn{display:block;height:4px;min-width:84px;flex:1;background:repeating-linear-gradient(90deg,#fbbf24 0 14px,transparent 14px 26px);border-radius:2px;position:relative;box-shadow:0 0 16px rgba(251,191,36,.5);margin:0 6px;}
.hf-conn.e{background:repeating-linear-gradient(90deg,#4ade80 0 14px,transparent 14px 26px);box-shadow:0 0 16px rgba(52,211,153,.5);}
.hf-conn::before,.hf-conn::after{content:'';position:absolute;top:50%;width:11px;height:11px;border-radius:50%;background:#fbbf24;transform:translateY(-50%);box-shadow:0 0 12px #fbbf24;}
.hf-conn.e::before,.hf-conn.e::after{background:#4ade80;box-shadow:0 0 12px #4ade80;}
.hf-conn::before{left:-3px}.hf-conn::after{right:-3px}
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
.hf-url{font:600 28px 'JetBrains Mono',monospace;color:#a78bfa;white-space:nowrap;min-height:34px;}
.hf-caret{display:inline-block;width:3px;height:34px;background:${amb.a};box-shadow:0 0 10px ${amb.a};border-radius:2px;}
.hf-ringwrap{position:relative;display:inline-flex;align-items:center;justify-content:center;width:210px;height:210px;}
.hf-bigicon{display:inline-flex;width:150px;height:150px;border-radius:34px;background:linear-gradient(135deg,#fbbf24,#d97706);align-items:center;justify-content:center;box-shadow:0 0 70px rgba(251,191,36,.5);}
.hf-bigicon svg{width:76px;height:76px;stroke:#050505;fill:none;stroke-width:2.4;stroke-linecap:round;stroke-linejoin:round;}
.hf-ring{position:absolute;inset:0;width:210px;height:210px;transform:rotate(-90deg);}
.hf-ring circle{fill:none;stroke:${amb.b};stroke-width:3.5;stroke-linecap:round;opacity:.85;}
.hf-num{font:800 96px 'Poppins',sans-serif;color:#fff;text-shadow:0 0 40px ${amb.b}59;}
.hf-col{display:flex;flex-direction:column;align-items:center;gap:24px;width:100%;}
.hf-row{display:flex;align-items:center;justify-content:center;gap:20px;width:100%;}
.seg-wrap{position:relative;display:flex;flex-direction:column;align-items:center;gap:18px;width:100%;}
.seg-chip{display:inline-flex;align-items:center;gap:10px;padding:8px 20px;border-radius:11px;background:#101014;border:1px solid rgba(255,255,255,.16);font:600 15px 'JetBrains Mono',monospace;color:#fff;letter-spacing:.14em;box-shadow:0 0 18px rgba(167,139,250,.35);}
.seg-video{display:block;width:1280px;height:720px;border-radius:22px;border:1.5px solid rgba(255,255,255,.14);box-shadow:0 24px 80px rgba(0,0,0,.65);background:#0d0d10;}
.seg-fallback{display:none;}
.th-cam{position:relative;display:block;width:100%;height:592px;overflow:hidden;border-radius:22px;border:1.5px solid rgba(255,255,255,.12);background:radial-gradient(900px 400px at 50% 0%,rgba(167,139,250,.12),transparent 60%),#07070a;}
.th-layer{position:absolute;inset:0;width:100%;height:100%;}
.th-card{position:absolute;width:220px;height:170px;min-height:0;}
.th-title{position:absolute;left:50%;top:44%;transform:translate(-50%,-50%);font:800 74px 'Poppins',sans-serif;color:#fff;text-shadow:0 0 44px ${amb.a}80;letter-spacing:.02em;white-space:nowrap;}
.hf-endcard{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;background:#050505;z-index:9;}
.hf-endcard .hf-eb{font:800 92px 'Poppins',sans-serif;color:#fff;}
.hf-endcard .hf-eb em{font-style:normal;color:${amb.a};text-shadow:0 0 34px ${amb.a}80;}
.hf-endcard .hf-es{font:500 22px 'JetBrains Mono',monospace;letter-spacing:.3em;color:rgba(255,255,255,.55);text-transform:uppercase;}
`;

// ---------- 1. TTS with word timestamps ----------
import { resolveBinary } from '../lib/ffmpeg.mjs';
const FFPROBE = resolveBinary('ffprobe'); // #66: bundled binary, not PATH luck
function probe(f) {
  return parseFloat(execFileSync(FFPROBE, ['-v', 'quiet', '-show_entries', 'format=duration', '-of', 'csv=p=0', f], { encoding: 'utf8' }).trim());
}
// #66: brief text and accent() output are injected into clip markup — escape
// HTML entities so <, >, & in narration cannot corrupt the composition
function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function tts(text, out, wordsOut) {
  const py = `import asyncio,edge_tts,sys,json\nasync def m():\n  words=[]\n  for i in range(5):\n    try:\n      c=edge_tts.Communicate(sys.argv[1],sys.argv[2],rate="${brief.rate || '-4%'}",boundary='WordBoundary')\n      with open(sys.argv[3],'wb') as f:\n        async for ch in c.stream():\n          if ch['type']=='audio': f.write(ch['data'])\n          elif ch['type']=='WordBoundary': words.append({'t':round(ch['offset']/1e7,2),'w':str(ch['text']).lower()})\n      import os\n      if os.path.getsize(sys.argv[3])>1000:\n        json.dump(words,open(sys.argv[4],'w')); return\n    except Exception as e: print('retry',i,e); await asyncio.sleep(1+i)\n  raise SystemExit(1)\nasyncio.run(m())`;
  const r = spawnSync('python', ['-c', py, text, VOICE, out, wordsOut], { encoding: 'utf8', timeout: 120000 });
  if (r.status !== 0) throw new Error('tts failed: ' + (r.stderr || r.stdout).slice(0, 200));
}
let t = 0;
for (const b of beats) {
  const mp3 = path.join(work, 'voice', `beat-${String(b.i).padStart(2, '0')}.mp3`);
  const wordsFile = path.join(work, 'voice', `beat-${String(b.i).padStart(2, '0')}.words.json`);
  tts(b.text, mp3, wordsFile);
  try { b.words = JSON.parse(fs.readFileSync(wordsFile, 'utf8')).map((w) => ({ t: Math.round((t + w.t) * 100) / 100, w: w.w })); } catch { b.words = []; }
  const dur = probe(mp3);
  b.start = Math.round(t * 100) / 100; b.dur = Math.round(dur * 100) / 100; b.file = `voice/beat-${String(b.i).padStart(2, '0')}.mp3`;
  t = t + dur + GAP;
  console.log(`  [tts] beat ${b.i} ${b.dur}s @ ${b.start}s — "${b.text.slice(0, 44)}"`);
}
const endStart = Math.round((t + 0.1) * 100) / 100;
const END_DUR = 3.4;
const total = Math.round((endStart + END_DUR) * 100) / 100;
console.log(`[hy] total ${total}s (end card ${endStart}s + ${END_DUR}s)`);
beats.forEach((b, i) => { b.until = i < beats.length - 1 ? beats[i + 1].start : endStart; });

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

// segment timing for the driver
const seg = {};
beats.forEach((b, i) => { const s2 = scenes[i] || {}; if (['remo', 'mcseg', 'theatre'].includes(s2.type)) seg[s2.type] = { start: b.start, until: b.until, i }; });
const mcVideo = fs.existsSync(path.join(HF_DIR, 'work', 'mc-build', 'mc-seg.mp4'));

const motionJs = beats.map((b, i) => {
  const s = scenes[i] || {};
  let m = '';
  if (s.type === 'browser') {
    m += `
var u${i} = document.querySelector('#urltxt-i${i}');
var urlFull${i} = ${JSON.stringify(s.url || 'https://you.send/hello')};
var uo${i} = { n: 0 };
tl.to(uo${i}, { n: urlFull${i}.length, duration: 1.2, ease: 'none', onUpdate: function () { u${i}.textContent = urlFull${i}.slice(0, Math.round(uo${i}.n)); } }, ${b.start} + 0.45);
tl.fromTo('#caret-i${i}', { opacity: 1 }, { opacity: 0, duration: 0.28, repeat: -1, yoyo: true, ease: 'none' }, ${b.start} + 0.45);`;
  } else if (s.type === 'result') {
    m += `
tl.fromTo('#ring-i${i}', { drawSVG: '0%' }, { drawSVG: '100%', duration: 1.1, ease: 'power2.inOut' }, ${b.start} + 0.5);`;
  } else if (s.type === 'pills') {
    m += `
Array.from(b${i}.querySelectorAll('.hf-shine')).forEach(function (el, k) { tl.fromTo(el, { x: -160 }, { x: 420, duration: 1.3, ease: 'power1.inOut', repeat: -1, repeatDelay: 1.4 }, ${b.start} + 1.2 + k * 0.5); });`;
  } else if (s.type === 'mcseg' && !mcVideo) {
    m += `
/* canvas fallback sketch assembly (deterministic draw by t) */
var mcC${i} = document.querySelector('#mccanvas'); var mcX${i} = mcC${i}.getContext('2d');
var mcDraw${i} = function (tt) {
  var local = Math.max(0, tt - ${b.start}); var p = Math.min(1, local / ${(b.until - b.start).toFixed(2)});
  var x = mcX${i}; var wd = mcC${i}.width, hg = mcC${i}.height;
  x.fillStyle = '#0d0d10'; x.fillRect(0, 0, wd, hg);
  x.strokeStyle = 'rgba(167,139,250,.9)'; x.lineWidth = 5;
  var doc = { x: wd / 2 - 170, y: hg / 2 - 210, w: 340, h: 420 };
  x.strokeRect(doc.x, doc.y, doc.w, doc.h * Math.min(1, p * 1.6));
  var lines = Math.floor(p * 9);
  x.strokeStyle = 'rgba(74,222,128,.9)'; x.lineWidth = 4;
  for (var li = 0; li < lines; li++) { var ly = doc.y + 60 + li * 44; x.beginPath(); x.moveTo(doc.x + 40, ly); x.lineTo(doc.x + doc.w - 40 - (li % 3) * 40, ly); x.stroke(); }
  var nums = 8;
  for (var ni = 0; ni < nums; ni++) {
    var ap = Math.max(0, Math.min(1, (p - 0.15 - ni * 0.09) / 0.25)); if (ap <= 0) continue;
    var ease = 1 - Math.pow(1 - ap, 3);
    var sx = 60 + ni * 30, sy = hg - 60 - ni * 12;
    var tx = doc.x + 52 + (ni % 2) * 210, ty = doc.y + 40 + ni * 44;
    var cxp = sx + (tx - sx) * ease, cyp = sy + (ty - sy) * ease;
    x.fillStyle = ni % 2 ? '#fbbf24' : '#a78bfa';
    x.beginPath(); x.arc(cxp, cyp, 16 * ease + 6, 0, 7); x.fill();
    x.fillStyle = '#050505'; x.font = '700 16px monospace'; x.textAlign = 'center'; x.fillText(String(ni), cxp, cyp + 5);
  }
};
window.__mcDraw = mcDraw${i};
mcDraw${i}(0);`;
  }
  return m;
}).join('\n');

const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Poppins:wght@600;700;800&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500;700&display=swap" rel="stylesheet">
<script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/DrawSVGPlugin.min.js"></script>
<script type="importmap">
{"imports": {
  "react": "https://esm.sh/react@18.3.1",
  "react/jsx-runtime": "https://esm.sh/react@18.3.1/jsx-runtime",
  "react-dom/client": "https://esm.sh/react-dom@18.3.1/client?external=react",
  "remotion": "https://esm.sh/remotion@4.0.220?external=react,react-dom",
  "@remotion/player": "https://esm.sh/@remotion/player@4.0.220?external=react,react-dom,remotion"
}}
</script>
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
    <span class="hf-es rise">${brief.subline || 'the internet, explained simply'}</span>
  </div>
${audioClips}
  <audio id="music" class="clip" data-start="0" data-duration="${total}" data-track-index="6" data-volume="0.12" src="assets/music.mp3"></audio>
</div>
<script>
gsap.registerPlugin(DrawSVGPlugin);
var tl = gsap.timeline({ paused: true });
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
${beats.map((b) => `  (function () {
    var ws = beatEls[${b.i}], hw = ${JSON.stringify(b.words.map((w) => w.t))};
    ws.forEach(function (w, j) { var tw = hw[j] !== undefined ? hw[j] : ${b.start} + 0.1 + j * 0.07; tl.to(w, { opacity: 1, y: 0, duration: 0.5, ease: 'expo.out' }, tw); });
  })();`).join('\n')}
/* ambient */
tl.fromTo('.aurora.a', { x: 0, y: 0 }, { x: 130, y: 70, duration: 9, yoyo: true, repeat: -1, ease: 'sine.inOut' }, 0);
tl.fromTo('.aurora.b', { x: 0, y: 0 }, { x: -110, y: -60, duration: 12, yoyo: true, repeat: -1, ease: 'sine.inOut' }, 0);
Array.prototype.forEach.call(document.querySelectorAll('.dust'), function (d, k) {
  tl.fromTo(d, { y: 0, opacity: 0 }, { y: -1080, opacity: 0.55, duration: 7 + (k % 5) * 1.3, ease: 'none', repeat: -1 }, (k % 7) * 1.1);
});
/* stage entrances (fast: fully built by 45% of each beat) */
${beats.map((b, i) => {
  const s = scenes[i] || {};
  const pieces = s.type === 'remo' || s.type === 'mcseg' || s.type === 'theatre'
    ? `Array.from(b${i}.children)`
    : `Array.from(b${i}.querySelectorAll('.rise'))`;
  const spanEnd = b.start + Math.max(1.8, (b.until - b.start) * 0.45);
  const slots = Array.from({ length: 6 }, (_, k) => Math.round((b.start + 0.35 + (k * (spanEnd - b.start - 0.35)) / 5) * 100) / 100);
  return `var b${i} = document.querySelector('#stage${i}');
gsap.set(b${i}, { opacity: 0, scale: 0.965, y: 26 });
gsap.set(${pieces}, { opacity: 0, y: 44 });
tl.to(b${i}, { opacity: 1, scale: 1, y: 0, duration: 0.5, ease: 'back.out(1.5)' }, ${b.start});
var pt${i} = ${JSON.stringify(slots)};
Array.prototype.forEach.call(${pieces}, function (el, k) { tl.to(el, { opacity: 1, y: 0, duration: 0.45, ease: 'back.out(1.6)' }, pt${i}[k % pt${i}.length]); });
tl.set(b${i}, { opacity: 0 }, ${b.until});`;
}).join('\n')}
${motionJs}
/* endcard */
var ec = document.querySelector('#endcard');
gsap.set(ec.querySelectorAll('.rise'), { opacity: 0, y: 40 });
tl.to(ec.querySelectorAll('.rise'), { opacity: 1, y: 0, duration: 0.7, ease: 'expo.out', stagger: 0.12 }, ${endStart} + 0.2);
/* theatre fallback camera (same keyframes the theatre module drives when it loads) */
var camK = [{ t: 0, x: -260, y: 18, z: 1.0 }, { t: 0.5, x: 40, y: -8, z: 1.07 }, { t: 1, x: 250, y: -14, z: 1.14 }];
var camAt = function (p) {
  for (var i = 0; i < camK.length - 1; i++) {
    if (p >= camK[i].t && p <= camK[i + 1].t) {
      var u = (p - camK[i].t) / (camK[i + 1].t - camK[i].t);
      var e = u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
      return { x: camK[i].x + (camK[i + 1].x - camK[i].x) * e, y: camK[i].y + (camK[i + 1].y - camK[i].y) * e, z: camK[i].z + (camK[i + 1].z - camK[i].z) * e };
    }
  }
  return camK[camK.length - 1];
};
var SEGS = ${JSON.stringify(seg)};
var MCVID = ${mcVideo ? 'true' : 'false'};
var mcCtx = null; var mcCv = document.querySelector('#mccanvas');
if (mcCv) mcCtx = mcCv.getContext('2d');
var mcDrawFn = (typeof mcDraw0 === 'function') ? mcDraw0 : null;
tl.eventCallback('onUpdate', function () {
  var now = tl.time();
  for (var key in SEGS) {
    var sg = SEGS[key];
    if (now < sg.start - 0.05 || now > sg.until + 0.05) continue;
    var local = now - sg.start;
    if (key === 'remo' && window.__remo && window.__remo.ready) window.__remo.seek(local);
    if (key === 'mcseg') {
      if (MCVID) { var v = document.querySelector('#mcvid'); if (v && Math.abs(v.currentTime - local) > 0.08) { try { v.currentTime = local; } catch (e) {} } }
      else if (mcCtx && mcDrawFn) mcDrawFn(now);
    }
    if (key === 'theatre') {
      var p = Math.max(0, Math.min(1, local / (sg.until - sg.start)));
      var cam = (window.__theatre && window.__theatre.camAt) ? window.__theatre.camAt(p) : camAt(p);
      var el = document.querySelector('#th-cam');
      if (el) el.style.transform = 'translate(' + cam.x + 'px,' + cam.y + 'px) scale(' + cam.z + ')';
    }
  }
});
tl.seek(0);
window.__timelines = { main: tl };
</script>
<script type="module">
/* ---- Remotion hero (deterministic seekTo) ---- */
(async function () {
try {
  const React = (await import('react')).default;
  const { createRoot } = await import('react-dom/client');
  const { Player } = await import('@remotion/player');
  const R = await import('remotion');
  const e = React.createElement;
  const nodes = [{ x: 170, y: 400 }, { x: 500, y: 190 }, { x: 830, y: 420 }, { x: 1140, y: 210 }];
  const Packet = ({ start, hops, color }) => {
    const frame = R.useCurrentFrame();
    const HOP = 34;
    const raw = Math.max(0, frame - start);
    const hop = Math.min(hops.length - 2, Math.floor(raw / HOP));
    const pr = R.spring({ frame: raw - hop * HOP, fps: 30, config: { damping: 14, stiffness: 110 } });
    const u = Math.max(0, Math.min(1, pr));
    const a = nodes[hops[hop]], b2 = nodes[hops[hop + 1]];
    const x = a.x + (b2.x - a.x) * u, y = a.y + (b2.y - a.y) * u;
    return e(R.AbsoluteFill, null,
      e('circle', { key: 'p', cx: x, cy: y, r: 15, fill: color, style: { filter: 'drop-shadow(0 0 14px ' + color + ')' } }),
      [2, 4, 6, 8].map((d2, gi) => {
        const rf = frame - d2; if (rf < start) return null;
        const rh = Math.min(hops.length - 2, Math.floor(Math.max(0, rf - start) / HOP));
        const ru = Math.max(0, Math.min(1, R.spring({ frame: rf - start - rh * HOP, fps: 30, config: { damping: 14, stiffness: 110 } })));
        const na = nodes[hops[rh]], nb = nodes[hops[rh + 1]];
        return e('circle', { key: gi, cx: na.x + (nb.x - na.x) * ru, cy: na.y + (nb.y - na.y) * ru, r: 10 - gi, fill: color, opacity: 0.35 - gi * 0.07 });
      })
    );
  };
  const Relay = () => {
    const frame = R.useCurrentFrame();
    const route = 'M ' + nodes.map((n2) => n2.x + ' ' + n2.y).join(' L ');
    const pulse = (k) => { const c = Math.abs(Math.sin(frame / 14 + k)); return 0.35 + c * 0.5; };
    return e(R.AbsoluteFill, { style: { background: '#0d0d10' } },
      e('svg', { viewBox: '0 0 1280 720', style: { width: '100%', height: '100%' } },
        e('path', { d: route, stroke: 'rgba(167,139,250,.4)', strokeWidth: 5, fill: 'none', strokeDasharray: '16 12' }),
        nodes.map((n2, k) => e('g', { key: k },
          e('rect', { x: n2.x - 52, y: n2.y - 52, width: 104, height: 104, rx: 24, fill: '#101014', stroke: '#a78bfa', strokeWidth: 2.5, style: { filter: 'drop-shadow(0 0 ' + (10 + pulse(k) * 22) + 'px rgba(167,139,250,.8))' } }),
          e('text', { x: n2.x, y: n2.y + 8, textAnchor: 'middle', fill: '#fff', fontFamily: 'JetBrains Mono', fontSize: 21, fontWeight: 700 }, 'R' + (k + 1))
        )),
        [{ s: 0, c: '#fbbf24' }, { s: 14, c: '#4ade80' }, { s: 28, c: '#ec4899' }, { s: 42, c: '#fbbf24' }, { s: 56, c: '#4ade80' }].map((pk, k) =>
          e(Packet, { key: k, start: pk.s, hops: [0, 1, 2, 3], color: pk.c }))
      ),
      e('div', { style: { position: 'absolute', left: 26, top: 20, fontFamily: 'JetBrains Mono', fontSize: 19, letterSpacing: 3, color: 'rgba(255,255,255,.75)' } }, '6 PACKETS · 4 ROUTERS · SPRING PHYSICS')
    );
  };
  const root = createRoot(document.querySelector('#remo-root'));
  const ref = React.createRef();
  root.render(e(Player, { ref, component: Relay, durationInFrames: 200, fps: 30, compositionWidth: 1280, compositionHeight: 720, style: { width: '100%', height: '100%' }, controls: false, autoPlay: false, acknowledgeRemotionLicense: true }));
  window.__remo = { ready: true, seek: (local) => { try { ref.current.seekTo(Math.max(0, Math.round(local * 30))); } catch (e) {} } };
  const fb = document.querySelector('#remo-fallback'); if (fb) fb.style.display = 'none';
} catch (err) { console.warn('remotion module unavailable:', String(err.message).slice(0, 60)); }
})();

/* ---- Theatre.js camera (fallback camera already in main script) ---- */
(async function () {
try {
  const { Project, types } = await import('https://esm.sh/@theatre/core@0.7.2');
  const state = { sheetsById: { Finale: { staticOverrides: { byObject: {} }, sequence: { type: 'InterpolationDataset', subUnitsPerUnit: 30, length: 8, trackIdByObjectKey: { Camera: { x: 'camx', y: 'camy', zoom: 'camz' } }, trackData: {
    camx: { type: 'BasicKeyframedTrack', __debugName: 'camx', keyframes: [ { id: 'a', position: 0, connectedRight: true, type: 'bezier', handles: [[0.3, 0], [0.7, 1]], value: -260 }, { id: 'b', position: 4, connectedRight: true, type: 'bezier', handles: [[0.3, 0], [0.7, 1]], value: 40 }, { id: 'c', position: 8, connectedRight: false, type: 'bezier', handles: [], value: 250 } ] },
    camy: { type: 'BasicKeyframedTrack', __debugName: 'camy', keyframes: [ { id: 'a', position: 0, connectedRight: true, type: 'bezier', handles: [[0.3, 0], [0.7, 1]], value: 18 }, { id: 'b', position: 4, connectedRight: true, type: 'bezier', handles: [[0.3, 0], [0.7, 1]], value: -8 }, { id: 'c', position: 8, connectedRight: false, type: 'bezier', handles: [], value: -14 } ] },
    camz: { type: 'BasicKeyframedTrack', __debugName: 'camz', keyframes: [ { id: 'a', position: 0, connectedRight: true, type: 'bezier', handles: [[0.3, 0], [0.7, 1]], value: 1.0 }, { id: 'b', position: 4, connectedRight: true, type: 'bezier', handles: [[0.3, 0], [0.7, 1]], value: 1.07 }, { id: 'c', position: 8, connectedRight: false, type: 'bezier', handles: [], value: 1.14 } ] }
  } } } }, definitionVersion: '0.4.0', revisionHistory: ['1'] };
  const project = new Project({ id: 'HybridFinale', state });
  const sheet = project.sheet('Finale');
  let vals = null;
  const cam = sheet.object('Camera', { x: types.number(0), y: types.number(0), zoom: types.number(1) }, { onValuesChange: (v) => { vals = v; } });
  await project.ready;
  window.__theatre = {
    ready: true,
    camAt: (p) => { try { sheet.sequence.position = p * 8; } catch (e) {} return vals || null; },
  };
} catch (err) { console.warn('theatre module unavailable:', String(err.message).slice(0, 60)); }
})();
</script>
</body>
</html>`;

// ---------- 3. write + check + render ----------
const genDir = path.join(work, 'gen');
fs.mkdirSync(genDir, { recursive: true });
fs.cpSync(path.join(work, 'voice'), path.join(genDir, 'voice'), { recursive: true });
const musicSrc = path.join(ROOT, 'hf-proof', 'assets', 'luxury-pad-01.mp3');
if (fs.existsSync(musicSrc)) { fs.mkdirSync(path.join(genDir, 'assets'), { recursive: true }); fs.copyFileSync(musicSrc, path.join(genDir, 'assets', 'music.mp3')); }
if (mcVideo) { fs.mkdirSync(path.join(genDir, 'assets'), { recursive: true }); fs.copyFileSync(path.join(HF_DIR, 'work', 'mc-build', 'mc-seg.mp4'), path.join(genDir, 'assets', 'mc-seg.mp4')); }
fs.writeFileSync(path.join(genDir, 'index.html'), html);

console.log('[hy] running check gate ...');
let c = null, cout = '';
for (let attempt = 1; attempt <= 3; attempt++) {
  c = spawnSync('npx', ['--yes', `hyperframes@${HF_VER}`, 'check'], { cwd: genDir, encoding: 'utf8', shell: true, timeout: 300000 });
  cout = `${c.stdout || ''}${c.stderr || ''}`;
  if (c.status === 0) break;
  const transient = /page_error|Navigation timeout|check_runtime_failure/.test(cout);
  if (transient && attempt < 3) { console.log(`[hy] check transient failure (attempt ${attempt}) — retrying in 20s`); await new Promise((r) => setTimeout(r, 20000)); }
  else break;
}
if (c.status !== 0) {
  console.error('[hy] check FAILED:\n' + cout.split('\n').filter((l) => l.includes('✗') || l.includes('error')).slice(0, 12).join('\n'));
  process.exit(1);
}
console.log('[hy] check PASSED — rendering ...');
const r = spawnSync('npx', ['--yes', `hyperframes@${HF_VER}`, 'render'], { cwd: genDir, encoding: 'utf8', shell: true, timeout: 1800000, stdio: ['ignore', 'pipe', 'pipe'] });
const out = `${r.stdout || ''}\n${r.stderr || ''}`;
const mp4Rel = (out.match(/renders[\\/](\S+\.mp4)/) || [])[1];
if (!mp4Rel) { console.error('[hy] render failed:\n' + out.slice(-800)); process.exit(1); }
const mp4 = path.join(genDir, 'renders', mp4Rel.replace(/\\/g, '/'));
console.log(`[hy] DONE -> ${mp4}`);
