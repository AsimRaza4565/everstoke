// TECH VIDEO factory — data-driven "Dark Mode Minimalist Tech" explainer.
// --topic "..." -> AI fits the topic into fixed scene templates -> TTS ->
// tech-subset music -> 1080p render. Runs in the public render repo (no tokens).
//   node make-tech-video.mjs --topic "How Git actually works"
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { pickApprovedTrack } from "../music-engine.mjs";

const DIR = import.meta.dirname;
const ROOT = path.resolve(DIR, "..");
const EXPL = path.join(ROOT, "explainer");
const PUB = path.join(EXPL, "public");
const IS_WIN = process.platform === "win32";
const PY = IS_WIN ? "python" : "python3";
const tIdx = process.argv.indexOf("--topic");
const TOPIC = tIdx > 0 ? process.argv[tIdx + 1] : "Auto Increment vs UUID";
const fIdx = process.argv.indexOf("--force-fallback");
const FORCE_FALLBACK = fIdx > 0;
const mIdx = process.argv.indexOf("--minutes");
const MINUTES = mIdx > 0 ? Number(process.argv[mIdx + 1]) : 10;

try {
  for (const line of fs.readFileSync(path.join(ROOT, ".env"), "utf8").split("\n")) {
    const m = line.match(/^([A-Z_0-9]+)=(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
} catch { }

const spawnOpts = { stdio: "inherit", shell: IS_WIN };

// ---------------- AI scene script ----------------
const SYSTEM = MINUTES >= 5
  ? `You write scripts for LONG "Dark Mode Minimalist Tech" explainer videos (${MINUTES} minutes) in the style of premium coding channels.
Return ONLY JSON: {"scenes":[ ... ]} using these scene templates:
{"t":"title","headline":"max 46 chars","sub":"SHORT TAG","text":""}
{"t":"statement","label":"SECTION — NAME","headline":"big claim, max 46 chars","sub":"optional kicker","text":"narration 90-115 words"}
{"t":"terminal","label":"SECTION — NAME","termTitle":"file — context","lines":["code line max 44 chars","-- comment"],"caption":"takeaway line","text":"narration 90-115 words"}
{"t":"flow","label":"SECTION — NAME","nodes":["Box A","Box B","Box C"],"loop":true,"caption":"one-line takeaway","text":"narration 90-115 words"}
{"t":"steps","label":"SECTION — NAME","items":["step text max 46 chars"],"caption":"one line","text":"narration 90-115 words"}
{"t":"bars","label":"SECTION — NAME","bars":[{"label":"NAME","text":"value","v":8}],"caption":"line","text":"narration 90-115 words"}
{"t":"clash","label":"SECTION — NAME","a":"node-A","b":"node-B","value":1001,"warn":"SHORT WARNING","text":"narration 90-115 words"}
{"t":"code","label":"SECTION — NAME","big":"short reveal max 44 chars","caption":"why it matters","grid":false,"lines":["code line"],"text":"narration 90-115 words"}
{"t":"end","headline":"Now it makes sense.","sub":"FOLLOW FOR MORE","text":""}
Rules:
- 12-16 scenes total. First = title, last = end. Mix the templates; use "flow" at least twice (it draws the animated diagram) and "steps" at least twice.
- "text" = narration. Teaching voice, direct, plain English, no em-dashes. Each 90-115 words.
- Facts MUST be technically accurate for the topic. lines max 46 chars, max 2-3 per terminal.`
  : `You write scripts for "Dark Mode Minimalist Tech" explainer videos (60-100 seconds) in the style of modern coding channels.
Return ONLY JSON: {"scenes":[ ... ]} using EXACTLY these scene templates in this order:
1. {"t":"title","headline":"punchy question, max 42 chars","sub":"SHORT TECH TAG","text":""}
2. 2-3 middle scenes chosen from:
   {"t":"terminal","label":"STEP 1 — SHORT NAME","termTitle":"app — query","lines":["typed line 1 (max 44 chars)","-- comment line"],"caption":"one-line takeaway","text":"narration 35-50 words"}
   {"t":"counter","label":"STEP 2 — SHORT NAME","nodeTitle":"db — region","sub":"one line","values":[1001,1002,1003],"text":"narration 35-50 words"}
   {"t":"bars","label":"STEP 3 — SHORT NAME","bars":[{"label":"INT","text":"4 bytes","v":4}],"caption":"compare line","text":"narration 35-50 words"}
   {"t":"clash","label":"STEP 4 — SHORT NAME","a":"db — US-East","b":"db — Europe","value":1001,"warn":"COLLISION — SHORT REASON","text":"narration 35-50 words"}
   {"t":"code","label":"STEP 5 — SHORT NAME","big":"short code reveal (max 44 chars)","caption":"why it matters","grid":true,"lines":["id = solve();"],"text":"narration 35-50 words"}
3. {"t":"end","headline":"Now you know.","sub":"FOLLOW FOR MORE","text":""}
Rules:
- Exactly 6 or 7 scenes. Scene 1 = title, last = end.
- "text" = what the narrator SAYS. Plain English, direct, no em-dashes, no hashtags.
- "lines" items must be realistic code/SQL/commands for the topic, each max 46 chars, max 2 lines per terminal.
- Numbers/facts must be REAL and correct for the topic. Bars v values are relative sizes.
- Every middle scene needs "label" formatted like "STEP 1 — THE IDEA".`;

function parseJsonLoose(s) { const m = String(s).match(/\{[\s\S]*\}/); if (!m) throw new Error("no JSON"); return JSON.parse(m[0]); }
async function postJson(url, headers, body) {
  const r = await fetch(url, { method: "POST", headers, body: JSON.stringify(body) });
  if (!r.ok) { const t = await r.text().catch(() => ""); throw new Error(`HTTP ${r.status}: ${t.slice(0, 120)}`); }
  return r.json();
}
async function aiJson(runner) {
  let lastErr;
  for (let a = 0; a < 4; a++) {
    try { return await runner(); } catch (e) { lastErr = e; await new Promise((r) => setTimeout(r, 5000 * (a + 1))); }
  }
  throw lastErr;
}

const gemini = () => aiJson(async () => {
  const key = process.env.LONGVIDEO_GEMINI_API_KEY || process.env.GEMINI_API_KEY;
  if (!key) throw new Error("no key");
  const d = await postJson(`https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${key}`,
    { "Content-Type": "application/json" },
    { contents: [{ parts: [{ text: `${SYSTEM}\n\nTOPIC: ${TOPIC}` }] }], generationConfig: { temperature: 0.8, responseMimeType: "application/json" } });
  return parseJsonLoose(d.candidates?.[0]?.content?.parts?.[0]?.text || "");
});
const groq = () => aiJson(async () => {
  const key = process.env.LONGVIDEO_GROQ_API_KEY;
  if (!key) throw new Error("no key");
  const d = await postJson("https://api.groq.com/openai/v1/chat/completions",
    { "Content-Type": "application/json", Authorization: `Bearer ${key}`, "User-Agent": "quarry-tech/1.0" },
    { model: "openai/gpt-oss-120b", temperature: 0.8, max_tokens: 12000, messages: [{ role: "user", content: `${SYSTEM}\n\nTOPIC: ${TOPIC}\nOutput ONLY the raw JSON object.` }] });
  return parseJsonLoose(d.choices?.[0]?.message?.content || "");
});

// guaranteed fallback = full Event Loop deep-dive (accurate, tested content)
const FALLBACK = { scenes: JSON.parse(fs.readFileSync(path.join(DIR, "fallback-eventloop.json"), "utf8")) };

console.log(`[tech] topic: ${TOPIC}`);
if (FORCE_FALLBACK) console.log("[tech] --force-fallback: using curated deep-dive script (skips AI)");
let script = null;
if (FORCE_FALLBACK) script = null;
else try {
  script = await gemini();
  console.log("[script] gemini OK");
} catch (e) { console.log(`[warn] gemini: ${String(e.message).slice(0, 90)}`); }
if (!script && !FORCE_FALLBACK) {
  try {
    script = await groq();
    console.log("[script] groq OK");
  } catch (e) { console.log(`[warn] groq: ${String(e.message).slice(0, 90)}`); }
}
const minWords = MINUTES >= 5 ? 60 : 20;
const okShape = script && Array.isArray(script.scenes)
  && script.scenes.length >= (MINUTES >= 5 ? 11 : 6) && script.scenes.length <= 18
  && script.scenes[0]?.t === "title" && script.scenes[script.scenes.length - 1]?.t === "end"
  && script.scenes.slice(1, -1).every((s) => String(s.text || "").split(/\s+/).filter(Boolean).length >= minWords)
  && script.scenes.slice(1, -1).every((s) => ["terminal", "counter", "bars", "clash", "code", "flow", "steps", "statement"].includes(s.t));
if (FORCE_FALLBACK || !okShape) {
  console.log(`[script] weak/invalid AI scenes — using built-in UUID fallback`);
  script = FALLBACK;
}
const scenes = script.scenes;
const midwords = scenes.slice(1, -1).reduce((a, s) => a + String(s.text || "").split(/\s+/).filter(Boolean).length, 0);
console.log(`[script] ${scenes.length} scenes, ${midwords} narration words`);

// ---------------- TTS (middle scenes with narration) ----------------
const audioDir = path.join(PUB, "tech-audio");
fs.mkdirSync(audioDir, { recursive: true });
const spoken = scenes.map((s, i) => ({ i, text: String(s.text || "") })).filter((x) => x.text.trim());
const inPath = path.join(audioDir, "tts-input.json");
fs.writeFileSync(inPath, JSON.stringify(spoken));
const vIdx = process.argv.indexOf("--voice");
const VOICE = vIdx > 0 ? process.argv[vIdx + 1] : "en-US-AndrewNeural";
const RATE = MINUTES >= 5 ? "+0%" : "+4%";
const tts = spawnSync(PY, [path.join(EXPL, "edge_batch.py"), inPath], { ...spawnOpts, env: { ...process.env, EXPLAINER_VOICE: VOICE, EXPLAINER_RATE: RATE } });
if (tts.status !== 0) throw new Error("tts failed");
const durs = JSON.parse(fs.readFileSync(path.join(audioDir, "tts-durations.json"), "utf8"));
const byI = new Map(durs.map((d) => [d.i, d]));
const buildWords = (ws) => (ws || []).map((w) => ({ w: w.w, t0: Math.round(w.s * 1000), t1: Math.round((w.s + w.d) * 1000) }));

// ---------------- timing ----------------
const starts = [];
const dursArr = [];
let cur = 0;
for (let i = 0; i < scenes.length; i++) {
  const s = scenes[i];
  const narr = byI.get(i)?.ms || 0;
  let dur;
  if (s.t === "title") dur = 2.8;
  else if (s.t === "end") dur = 4.0;
  else if (s.t === "code") dur = Math.max(narr / 1000 + 2.2, 8); // code scenes need reveal time
  else dur = Math.max(narr / 1000 + 1.4, 4.5);
  starts.push(Math.round(cur * 100) / 100);
  dursArr.push(Math.round(dur * 100) / 100);
  cur += dur;
}
const totalS = Math.round((cur + 0.6) * 100) / 100;
console.log(`[timeline] ${scenes.length} scenes, ${totalS}s total`);

// ---------------- music (clean minimal tech subset only) ----------------
const ALL = JSON.parse(fs.readFileSync(path.join(DIR, "approved-music.json"), "utf8"));
const TECH_CALM = ["Deliberate Thought", "Cut Trance"]; // fixed calm bed — no random mismatches
const pool = ALL.filter((m) => TECH_CALM.includes(m.title));
const track = await (async () => { try { return await pickApprovedTrack((pool.length ? pool : ALL).map((m) => m.title)); } catch { return null; } })();
let music = null;
if (track) {
  music = "tech-audio/music.mp3";
  fs.copyFileSync(track.file, path.join(PUB, music));
  console.log(`[music] "${track.title}"`);
} else {
  console.log("[warn] no music — continuing silent bed");
}

// ---------------- audio paths + props ----------------
const sceneAudio = scenes.map((s, i) => {
  if (!String(s.text || "").trim()) return null;
  const rel = `tech-audio/audio/beat-${String(i).padStart(2, "0")}.mp3`;
  return fs.existsSync(path.join(PUB, rel)) && fs.statSync(path.join(PUB, rel)).size > 2048 ? rel : null;
});
const props = {
  scenes,
  starts,
  durs: dursArr,
  fps: MINUTES >= 5 ? 24 : 30,
  sceneWords: scenes.map((s, i) => buildWords(byI.get(i)?.words)),
  sceneAudio,
  music,
};
const propsPath = path.join(PUB, "tech-video.json");
fs.writeFileSync(propsPath, JSON.stringify(props, null, 2));
console.log(`[props] ${propsPath}`);

// ---------------- render ----------------
const ensure = spawnSync("npx", ["remotion", "browser", "ensure"], { cwd: EXPL, ...spawnOpts });
if (ensure.status !== 0) throw new Error("browser ensure failed");
const outMp4 = path.join(EXPL, "out", "tech-video.mp4");
const args = (conc) => ["remotion", "render", "remotion/index.ts", "TechVideo", outMp4, `--props=${propsPath}`, `--concurrency=${conc}`, "--timeout=240000", "--port=3492"];
let r = spawnSync("npx", args(3), { cwd: EXPL, ...spawnOpts });
if (r.status !== 0) r = spawnSync("npx", args(2), { cwd: EXPL, ...spawnOpts });
if (r.status !== 0) throw new Error("render failed");
console.log(`[DONE] ${outMp4} (${(fs.statSync(outMp4).size / 1048576).toFixed(1)} MB, ${totalS}s)`);
