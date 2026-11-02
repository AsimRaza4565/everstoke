#!/usr/bin/env node
// HyperFrames generative engine — Phase 2.
// brief JSON -> TTS beats -> design brain (LLM writes the HTML) -> check-gate retry -> fallback -> render MP4.
// Usage: node hyperframes/generate.mjs hyperframes/briefs/<slug>.json [--skip-render]

import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DNAS, dnaPrompt, GENRES, genrePrompt } from './dna.mjs';

import { loadEnv } from '../lib/env.mjs';

// load repo .env (keys stay out of code)
loadEnv();
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HF_DIR = path.join(ROOT, 'hyperframes');
const HF_VER = '0.8.152';
const args = process.argv.slice(2);
const SKIP_RENDER = args.includes('--skip-render');
const briefPath = args.find((a) => a.endsWith('.json'));
if (!briefPath) { console.error('usage: node generate.mjs <brief.json> [--skip-render]'); process.exit(1); }

const brief = JSON.parse(fs.readFileSync(path.resolve(briefPath), 'utf8'));
const slug = brief.slug || path.basename(briefPath, '.json');
const dnaName = brief.dna || 'luxury';
const dna = DNAS[dnaName];
if (!dna) { console.error('unknown dna ' + dnaName); process.exit(1); }
const genreName = GENRES[brief.genre] ? brief.genre : 'documentary';
const W = brief.width || 1080, H = brief.height || 1920;
const VOICE = brief.voice || 'en-US-AndrewNeural';
const GAP = 0.55;

const work = path.join(HF_DIR, 'work', slug);
fs.rmSync(work, { recursive: true, force: true });
fs.mkdirSync(path.join(work, 'voice'), { recursive: true });
console.log(`[hf] ${slug} — dna=${dnaName} ${W}x${H}, ${brief.beats?.length || 0} beats`);

// ---------- 0. auto-script: topic -> beats (when the brief has no beats) ----------
if (!Array.isArray(brief.beats) || brief.beats.length === 0) {
  const n = brief.beatCount || 5;
  console.log(`[hf] no beats in brief — writing script from topic "${brief.topic}" (${n} beats)`);
  const sp = `You write voiceover scripts for premium vertical shorts (YouTube Shorts, 9:16).
Topic: "${brief.topic}". Brand: "${brief.brand}" (${brief.brandStyle || dna.label} style). Audience: US.
Genre: ${genreName} (${GENRES[genreName].name}).
Write EXACTLY ${n} beats. Rules:
- Beat 1 is the HOOK: 6-12 words, curiosity gap, no greetings, no "in this video".
- Middle beats deliver one concrete idea each, 8-16 words, spoken style, escalating.
- Final beat lands the payoff and can end with a short punch line.
- NO hashtags, NO emojis, NO stage directions. Plain sentences only.
Return ONLY valid JSON: {"beats":[{"text":"...","em":"one word from text to accent"}]}
The "em" word MUST appear in that beat's text.`;
  let parsed = null;
  for (const attempt of [1, 2, 3]) {
    const out = await designBrain(sp + (attempt > 1 ? '\nReturn the raw JSON only.' : ''), attempt);
    const m = out && (out.match(/\{[\s\S]*\}/) || [])[0];
    if (m) { try { parsed = JSON.parse(m); if (Array.isArray(parsed.beats) && parsed.beats.length >= 3) break; } catch { } }
    parsed = null;
  }
  if (!parsed) { console.error('[hf] auto-script failed — provide beats in the brief'); process.exit(1); }
  brief.beats = parsed.beats.slice(0, n).map((b) => ({ text: String(b.text || '').trim(), em: String(b.em || '').trim() }));
  console.log(`[hf] script written: ${brief.beats.map((b) => `"${b.text.slice(0, 32)}"`).join(' | ')}`);
}
const beats = brief.beats.map((b, i) => ({ ...b, i }));

// ---------- 1. TTS ----------
let t = 0;
for (const b of beats) {
  const mp3 = path.join(work, 'voice', `beat-${String(b.i).padStart(2, '0')}.mp3`);
  tts(b.text, mp3);
  const dur = probe(mp3);
  b.start = round2(t); b.dur = round2(dur); b.file = `voice/beat-${String(b.i).padStart(2, '0')}.mp3`;
  t = t + dur + GAP;
  console.log(`  [tts] beat ${b.i} ${b.dur}s @ ${b.start}s — "${b.text.slice(0, 44)}"`);
}
const endStart = round2(t + 0.1);
const END_DUR = 3.4;
const total = round2(endStart + END_DUR);
console.log(`[hf] total ${total}s (end card ${endStart}s + ${END_DUR}s)`);

// ---------- 2. design brain ----------
const contract = `
You output ONE complete self-contained index.html for the HyperFrames render engine (HTML -> MP4). No explanations, no markdown fences.

HARD ENGINE CONTRACT (violations fail the build):
1. Root: <div id="root" data-composition-id="main" data-start="0" data-duration="${total}" data-width="${W}" data-height="${H}"> — and html/body exactly ${W}px x ${H}px, overflow hidden.
2. EVERY timed element must have: class="clip" data-start="S" data-duration="D" data-track-index="T" AND a unique descriptive id. Elements without data-* are always-on decoration.
3. NEVER nest a <div> inside an element that has class="clip". Use <span> for children.
4. Voiceover clips (use EXACTLY these files/timings): ${beats.map((b) => `<audio id="voice-${b.i}" class="clip" data-start="${b.start}" data-duration="${b.dur}" data-track-index="5" src="${b.file}"></audio>`).join('\n   ')}
   Plus background music: <audio id="music" class="clip" data-start="0" data-duration="${total}" data-track-index="6" data-volume="0.12" src="assets/music.mp3"></audio>
5. Animation: ONE paused GSAP timeline registered as window.__timelines['main'] = tl; with tl.seek(0) last. Load gsap from https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js
   - NO CSS keyframe animations, NO autoplaying animations (they break deterministic seeking).
   - Split each beat into word spans in JS (wrap words in span.w), gsap.set them hidden, reveal per beat with stagger at the beat's data-start.
6. Readability (auto-checked, build fails on violation): normal text contrast >= 4.5:1, large text >= 3:1 against the LOCAL background behind it. No heavy/black text borders or outlines — soft blurred shadows only.
7. Fonts via one Google Fonts <link>. Load it early. Use font-display swap.
8. Scene plan: kicker/label visible from ~0.3s; each beat appears at its data-start and stays until the next beat starts (give each beat clip data-duration covering its span, overlapping is fine on different track indexes); final end card with brand "${brief.brand}" from ${endStart}s for ${END_DUR}s.
9. Style: the DNA below is law. Within it, YOU design the layout, decoration and motion personality for THIS specific content.
10. REQUIRED word-reveal pattern — use this EXACT JavaScript (only customize selector lists, start times, durations and eases). Do NOT wrap it in an IIFE or DOMContentLoaded. Do NOT invent iterator variables. Do NOT set opacity:0 in CSS — the JS below handles hiding:
   function splitWords(sel){const el=document.querySelector(sel);if(!el)return[];const nodes=[];el.childNodes.forEach(n=>{if(n.nodeType===3){n.textContent.split(/(\\s+)/).forEach(t=>{if(t.trim()){const s=document.createElement('span');s.className='w';s.textContent=t;nodes.push(s);n.parentNode.insertBefore(s,n);}else if(t){n.parentNode.insertBefore(document.createTextNode(' '),n);}});n.remove();}else if(n.nodeType===1){n.classList.add('w');nodes.push(n);}});return nodes;}
   const allWords=[${beats.map((b) => `'${'#beat' + b.i}'`).join(', ')}].map(splitWords);
   allWords.forEach(ws=>gsap.set(ws,{opacity:0,y:60}));
   allWords.forEach((ws,i)=>tl.to(ws,{opacity:1,y:0,duration:0.7,ease:'expo.out',stagger:0.08},${'${'}[${beats.map((b) => b.start).join(', ')}][i]+0.1}));
   Every beat's words must be fully visible (opacity 1) before that beat's audio ends. Beat root ids MUST be ${beats.map((b) => '#beat' + b.i).join(', ')}.`;

const prompt = `${contract}

${dnaPrompt(dnaName)}

${genrePrompt(genreName)}

CONTENT — topic: "${brief.topic}" | brand: "${brief.brand}" | kicker label: "${brief.kicker || ''}"
Word-level beats (voiceover audio already exists at these EXACT times — design to them):
${beats.map((b) => `- beat ${b.i}: start=${b.start}s dur=${b.dur}s text="${b.text}"${b.em ? ` (emphasis word: "${b.em}")` : ''}`).join('\n')}

Design the most premium possible ${W}x${H} video for this content in this DNA. Return the complete index.html now.`;

let html = null, provider = null;
for (const attempt of [1, 2, 3]) {
  const out = await designBrain(prompt + (attempt > 1 ? '\nPrevious attempt failed validation. Fix ALL listed problems and return the full corrected HTML.' : ''), attempt);
  if (!out) continue;
  const clean = extractHtml(out);
  if (!clean) { console.log(`  [brain] attempt ${attempt}: no html found`); continue; }
  const problems = preValidate(clean);
  if (problems.length) { console.log(`  [brain] attempt ${attempt}: pre-check failed — ${problems.join('; ')}`); lastFail = problems.join('\n'); continue; }
  html = clean; provider = `attempt-${attempt}`; break;
}
if (!html) { console.log('[hf] design brain failed 3x — using safe fallback template'); }
else console.log(`[hf] design brain accepted (${provider})`);

// ---------- 3. write + check gate ----------
function writeComposition(dir) {
  fs.mkdirSync(dir, { recursive: true });
  fs.cpSync(path.join(work, 'voice'), path.join(dir, 'voice'), { recursive: true });
  const musicSrc = path.join(ROOT, 'hf-proof', 'assets', 'luxury-pad-01.mp3');
  if (fs.existsSync(musicSrc)) { fs.mkdirSync(path.join(dir, 'assets'), { recursive: true }); fs.copyFileSync(musicSrc, path.join(dir, 'assets', 'music.mp3')); }
  fs.writeFileSync(path.join(dir, 'index.html'), html);
}
function runCheck(dir) {
  const r = spawnSync('npx', ['--yes', `hyperframes@${HF_VER}`, 'check'], { cwd: dir, encoding: 'utf8', shell: true, timeout: 300000 });
  return { ok: r.status === 0, out: `${r.stdout || ''}\n${r.stderr || ''}` };
}

let finalDir = null;
if (html) {
  const dir = path.join(work, 'gen');
  for (const attempt of [1, 2, 3]) {
    writeComposition(dir);
    const c = runCheck(dir);
    if (c.ok) { finalDir = dir; console.log(`[hf] check PASSED (gen attempt ${attempt})`); break; }
    const errs = c.out.split('\n').filter((l) => l.includes('✗')).slice(0, 8).join('\n');
    console.log(`[hf] check FAILED (gen attempt ${attempt}):\n${errs || c.out.slice(-500)}\n— feeding errors back to brain`);
    const fix = await designBrain(`${prompt}\n\nYOUR PREVIOUS HTML FAILED THESE CHECKS:\n${errs}\n\nReturn the COMPLETE corrected index.html.`, 9);
    const clean = fix && extractHtml(fix);
    if (clean && !preValidate(clean).length) html = clean;
  }
}
if (!finalDir) {
  const dir = path.join(work, 'fallback');
  console.log('[hf] using fallback template');
  html = fallbackHtml();
  fs.mkdirSync(dir, { recursive: true });
  fs.cpSync(path.join(work, 'voice'), path.join(dir, 'voice'), { recursive: true });
  const musicSrc = path.join(ROOT, 'hf-proof', 'assets', 'luxury-pad-01.mp3');
  if (fs.existsSync(musicSrc)) { fs.mkdirSync(path.join(dir, 'assets'), { recursive: true }); fs.copyFileSync(musicSrc, path.join(dir, 'assets', 'music.mp3')); }
  fs.writeFileSync(path.join(dir, 'index.html'), html);
  const c = runCheck(dir);
  if (!c.ok) console.log(`[hf] fallback check issues:\n${c.out.split('\n').filter((l) => l.includes('✗')).slice(0, 6).join('\n')}`);
  finalDir = dir;
}

// ---------- 4. render + post-frame validation ----------
// The check gate can pass a composition whose animation script crashed (text stays opacity:0,
// nothing overlaps, nothing to contrast-check). So after rendering we PROVE text is visible:
// sample a frame mid-beat and mid-endcard, measure luma range in the 10-90% band.
function renderFinal(dir) {
  console.log(`[hf] rendering ${path.relative(ROOT, dir)} ...`);
  const t0 = Date.now();
  const r = spawnSync('npx', ['--yes', `hyperframes@${HF_VER}`, 'render'], { cwd: dir, encoding: 'utf8', shell: true, timeout: 1800000, stdio: ['ignore', 'pipe', 'pipe'] });
  const out = `${r.stdout || ''}\n${r.stderr || ''}`;
  const mp4 = (out.match(/renders[\\/](\S+\.mp4)/) || [])[1];
  if (r.status !== 0 || !mp4) { console.error(`[hf] RENDER FAILED:\n${out.slice(-1200)}`); return null; }
  const p = path.join(dir, 'renders', mp4.replace(/\\/g, '/'));
  console.log(`[hf] rendered in ${Math.round((Date.now() - t0) / 1000)}s -> ${p}`);
  return p;
}
function frameHasText(mp4, t) {
  const png = path.join(work, 'chk.png');
  try {
    execFileSync('ffmpeg', ['-y', '-v', 'quiet', '-ss', String(t), '-i', mp4, '-frames:v', '1', '-vf', 'crop=iw:ih*0.8:iw:ih*0.10,scale=54:60,format=gray', png]);
    const r = spawnSync('ffmpeg', ['-v', 'info', '-i', png, '-vf', 'signalstats,metadata=print', '-f', 'null', '-'], { encoding: 'utf8', shell: true, timeout: 60000 });
    const ymin = parseFloat((r.stderr.match(/YMIN=([0-9.]+)/) || [])[1]);
    const ymax = parseFloat((r.stderr.match(/YMAX=([0-9.]+)/) || [])[1]);
    if (Number.isNaN(ymin) || Number.isNaN(ymax)) return true; // can't measure — don't block
    return ymax - ymin >= 100;
  } catch { return true; }
}
if (!SKIP_RENDER) {
  const mp4 = renderFinal(finalDir);
  if (mp4 && finalDir !== path.join(work, 'fallback')) {
    const sample = (t) => frameHasText(mp4, round2(t));
    let blind = beats.filter((b) => !sample(b.start + Math.min(1.5, b.dur * 0.6))).map((b) => b.i);
    const endOk = sample(endStart + 1.2);
    if (blind.length || !endOk) {
      console.log(`[hf] POST-FRAME CHECK FAILED — invisible text at beats [${blind.join(',')}] endcard=${endOk}. One regeneration round with brain...`);
      const fix = await designBrain(`${prompt}\n\nCRITICAL BUG in your previous HTML: the rendered video shows NO visible text at beat(s) ${blind.join(', ')}${endOk ? '' : ' and on the end card'}. Almost always the cause: your animation <script> throws an error (undefined variable, wrapped in IIFE/DOMContentLoaded) so the timeline never registers and words stay at CSS opacity:0. Use the REQUIRED word-reveal pattern from the rules verbatim. Return the COMPLETE corrected index.html.`, 9);
      const clean = fix && extractHtml(fix);
      if (clean && !preValidate(clean).length) {
        html = clean;
        writeComposition(finalDir);
        if (runCheck(finalDir).ok) {
          const mp4b = renderFinal(finalDir);
          if (mp4b) {
            blind = beats.filter((b) => !sample(b.start + Math.min(1.5, b.dur * 0.6))).map((b) => b.i);
            const endOk2 = sample(endStart + 1.2);
            if (blind.length || !endOk2) {
              console.log(`[hf] still invisible after retry (beats [${blind.join(',')}] endcard=${endOk2}) — switching to fallback template`);
              finalDir = path.join(work, 'fallback');
              html = fallbackHtml();
              fs.mkdirSync(finalDir, { recursive: true });
              fs.cpSync(path.join(work, 'voice'), path.join(finalDir, 'voice'), { recursive: true });
              const musicSrc2 = path.join(ROOT, 'hf-proof', 'assets', 'luxury-pad-01.mp3');
              if (fs.existsSync(musicSrc2)) { fs.mkdirSync(path.join(finalDir, 'assets'), { recursive: true }); fs.copyFileSync(musicSrc2, path.join(finalDir, 'assets', 'music.mp3')); }
              fs.writeFileSync(path.join(finalDir, 'index.html'), html);
              runCheck(finalDir);
              renderFinal(finalDir);
            } else console.log('[hf] post-frame check PASSED after retry');
          }
        } else console.log('[hf] retry failed check gate — switching to fallback template');
      } else console.log('[hf] retry unusable — switching to fallback template');
    } else console.log('[hf] post-frame check PASSED (all beats + endcard visible)');
  }
}

// ---------- helpers ----------
let lastFail = '';
function round2(n) { return Math.round(n * 1000) / 1000; }
function probe(f) {
  return parseFloat(execFileSync('ffprobe', ['-v', 'quiet', '-show_entries', 'format=duration', '-of', 'csv=p=0', f], { encoding: 'utf8' }).trim());
}
function tts(text, out) {
  const py = `import asyncio,edge_tts,sys\nasync def m():\n  for i in range(5):\n    try:\n      c=edge_tts.Communicate(sys.argv[1],sys.argv[2],rate="${brief.rate || '-4%'}")\n      with open(sys.argv[3],'wb') as f:\n        async for ch in c.stream():\n          if ch['type']=='audio': f.write(ch['data'])\n      import os\n      if os.path.getsize(sys.argv[3])>1000: return\n    except Exception as e: print('retry',i,e); await asyncio.sleep(1+i)\n  raise SystemExit(1)\nasyncio.run(m())`;
  const r = spawnSync('python', ['-c', py, text, VOICE, out], { encoding: 'utf8', timeout: 120000 });
  if (r.status !== 0) throw new Error('tts failed: ' + (r.stderr || r.stdout).slice(0, 200));
}
function extractHtml(s) {
  const m = s.match(/<!doctype html[\s\S]*<\/html>/i) || s.match(/<html[\s\S]*<\/html>/i);
  return m ? m[0] : null;
}
function preValidate(h) {
  const probs = [];
  if (!h.includes('data-composition-id="main"')) probs.push('missing composition root');
  if (!h.includes('__timelines')) probs.push('missing __timelines registration');
  for (const b of beats) if (!h.includes(`src="${b.file}"`)) probs.push(`missing audio ${b.file}`);
  if (!/id="music"/.test(h) && !h.includes('assets/music.mp3')) probs.push('missing music audio');
  const clips = h.match(/class="[^"]*clip[^"]*"/g) || [];
  if (clips.length < beats.length + 2) probs.push('too few clips');
  return probs;
}
function fallbackHtml() {
  const p = dna.palette;
  const vertical = H > W;
  const subs = {
    '{{WIDTH}}': String(W), '{{HEIGHT}}': String(H),
    '{{FONTS}}': dna.fonts, '{{FONT_STACK}}': dna.fontStack, '{{UI_STACK}}': dna.uiStack,
    '{{BG}}': p.bg, '{{BG_GLOW}}': p.bgGlow, '{{BG_DEEP}}': p.bg,
    '{{TEXT}}': p.text, '{{TEXT_SUBTLE}}': p.subtle, '{{ACCENT}}': p.accent,
    '{{BEAT_SIZE}}': vertical ? '100' : '120', '{{BEAT_TOP}}': vertical ? String(Math.round(H * 0.36)) : '300',
    '{{BRAND_SIZE}}': vertical ? '92' : '110', '{{BRAND_TOP}}': vertical ? String(Math.round(H * 0.44)) : '400',
    '{{RISE_Y}}': String(dna.motion.riseY),
    '{{KICKER}}': esc(brief.kicker || brief.brand), '{{BRAND}}': esc(brief.brand), '{{SUBLINE}}': esc(brief.subline || brief.topic),
    '{{TOTAL}}': String(total), '{{END_START}}': String(endStart), '{{END_DUR}}': String(END_DUR),
  };
  const beatClips = beats.map((b) => `      <div id="fb-beat-${b.i}" class="beat clip" data-start="${b.start}" data-duration="${round2((beats[b.i + 1] ? beats[b.i + 1].start : endStart) - b.start)}" data-track-index="2">${beatInner(b)}</div>`).join('\n');
  const audios = beats.map((b) => `      <audio id="voice-${b.i}" class="clip" data-start="${b.start}" data-duration="${b.dur}" data-track-index="5" src="${b.file}"></audio>`).join('\n') + `\n      <audio id="music" class="clip" data-start="0" data-duration="${total}" data-track-index="6" data-volume="0.12" src="assets/music.mp3"></audio>`;
  const sels = JSON.stringify(beats.map((b) => `#fb-beat-${b.i}`));
  const reveals = beats.map((b, i) => `tl.to(allWords[${i}], { opacity: 1, y: 0, duration: ${dna.motion.wordDur}, ease: '${dna.motion.ease.split('(')[0]}', stagger: ${dna.motion.wordStagger} }, ${b.start + 0.15});`).join('\n        ');
  let out = fs.readFileSync(path.join(HF_DIR, 'fallback.html'), 'utf8');
  for (const [k, v] of Object.entries(subs)) out = out.split(k).join(v);
  out = out.replace('{{BEAT_CLIPS}}', beatClips).replace('{{AUDIO_CLIPS}}', audios)
    .replace('{{BEAT_SELS}}', sels).replace('{{WORD_REVEALS}}', reveals);
  return out;
}
function beatInner(b) {
  if (!b.em) return esc(b.text);
  const idx = b.text.toLowerCase().indexOf(b.em.toLowerCase());
  if (idx < 0) return esc(b.text);
  return esc(b.text.slice(0, idx)) + `<span class="em">` + esc(b.text.slice(idx, idx + b.em.length)) + `</span>` + esc(b.text.slice(idx + b.em.length));
}
function esc(s) { return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

async function designBrain(p, attempt) {
  if (process.env.GEMINI_API_KEY && attempt !== 9) {
    for (const cfg of [{ temperature: 0.9, maxOutputTokens: 24000, thinkingConfig: { thinkingBudget: 0 } }, { temperature: 0.9, maxOutputTokens: 24000 }]) {
      try {
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents: [{ parts: [{ text: p }] }], generationConfig: cfg }),
        });
        const d = await res.json();
        const txt = d.candidates?.[0]?.content?.parts?.map((x) => x.text || '').join('') || '';
        if (txt.length > 500) { console.log('  [brain] gemini responded'); return txt; }
        throw new Error('short/empty');
      } catch (e) { console.log(`  [brain] gemini failed: ${String(e.message).slice(0, 60)}`); }
    }
  }
  if (process.env.GROQ_API_KEY) {
    for (let a = 1; a <= 2; a++) {
      try {
        const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST', headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: 'openai/gpt-oss-120b', messages: [{ role: 'user', content: p }], temperature: 0.8, max_tokens: 12000 }),
        });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const txt = (await res.json()).choices?.[0]?.message?.content || '';
        if (txt.length > 500) { console.log('  [brain] groq responded'); return txt; }
        throw new Error('short');
      } catch (e) { console.log(`  [brain] groq attempt ${a} failed: ${String(e.message).slice(0, 60)}`); }
    }
  }
  if (process.env.CEREBRAS_API_KEY) {
    for (let a = 1; a <= 2; a++) {
      try {
        const res = await fetch('https://api.cerebras.ai/v1/chat/completions', {
          method: 'POST', headers: { Authorization: `Bearer ${process.env.CEREBRAS_API_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: 'gpt-oss-120b', messages: [{ role: 'user', content: p }], temperature: 0.8, max_tokens: 12000 }),
        });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const txt = (await res.json()).choices?.[0]?.message?.content || '';
        if (txt.length > 500) { console.log('  [brain] cerebras responded'); return txt; }
        throw new Error('short');
      } catch (e) { console.log(`  [brain] cerebras attempt ${a} failed: ${String(e.message).slice(0, 60)}`); }
    }
  }
  if (process.env.MISTRAL_API_KEY) {
    for (let a = 1; a <= 2; a++) {
      try {
        const res = await fetch('https://api.mistral.ai/v1/chat/completions', {
          method: 'POST', headers: { Authorization: `Bearer ${process.env.MISTRAL_API_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: 'mistral-small-latest', messages: [{ role: 'user', content: p }], temperature: 0.8, max_tokens: 12000 }),
        });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const txt = (await res.json()).choices?.[0]?.message?.content || '';
        if (txt.length > 500) { console.log('  [brain] mistral responded'); return txt; }
        throw new Error('short');
      } catch (e) { console.log(`  [brain] mistral attempt ${a} failed: ${String(e.message).slice(0, 60)}`); }
    }
  }
  if (process.env.HF_TOKEN) {
    try {
      const res = await fetch('https://router.huggingface.co/v1/chat/completions', {
        method: 'POST', headers: { Authorization: `Bearer ${process.env.HF_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'meta-llama/Llama-3.1-8B-Instruct', messages: [{ role: 'user', content: p }], temperature: 0.8, max_tokens: 8000 }),
      });
      const txt = (await res.json()).choices?.[0]?.message?.content || '';
      if (txt.length > 500) { console.log('  [brain] hf responded'); return txt; }
    } catch { }
  }
  return null;
}
