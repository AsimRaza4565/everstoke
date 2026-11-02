// TEACHER demo factory: one 2-3 minute Vox-style teaching video.
// Teaching script (second person) -> Edge-TTS w/ word timings -> media from
// Wikimedia/Openverse/Met/Pollinations (NOT Pexels/Pixabay) -> approved music
// -> Teacher composition render 1080p.
//   node make-teacher-demo.mjs [--test]
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fetchTeachingMedia } from "../explainer/media-assets.mjs";
import { pickApprovedTrack } from "../music-engine.mjs";

const DIR = import.meta.dirname;
const ROOT = path.resolve(DIR, "..");
const EXPL = path.join(ROOT, "explainer");
const PUB = path.join(EXPL, "public");
const IS_WIN = process.platform === "win32";
const PY = IS_WIN ? "python" : "python3";
const TEST = process.argv.includes("--test");

try {
  for (const line of fs.readFileSync(path.join(ROOT, ".env"), "utf8").split("\n")) {
    const m = line.match(/^([A-Z_0-9]+)=(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
} catch { }

const TOPIC = "How compound interest silently makes you rich";
console.log(`[teacher-demo] topic: ${TOPIC}`);

// ---------------- teaching script (7 beats, second person, direct address) ----------------
const SYSTEM = `You write a 2.5-minute teaching video script in the style of an editorial explainer host (Vox / Johnny Harris energy): the narrator teaches ONE idea directly to the viewer.
Return ONLY JSON: {"beats":[{"layout":"hook|say|board|cutout|quote|end","kicker":"","headline":"","sub":"","big":"","label":"","quote":"","mediaQuery":"","text":""}]}
Rules:
- exactly 7 beats, in this order: hook, say, board, quote, cutout, say, end.
- "text" = what the narrator SAYS (40-60 words per beat). Teach directly: use "you", "let me show you", "here is the part nobody tells you". Plain English, no em-dashes, no hashtags.
- "headline" = max 55 chars of on-screen text (a punchy statement, not the narration).
- beat 3 (board) is the drawn diagram: set big to a dollar figure like "$760K" and label to a 12-18 word caption explaining it. mediaQuery can be "".
- beat 4 (quote) is a famous-person moment: set "quote" to a real, well-known short quote about the topic and mediaQuery to that person's name for a Wikipedia photo. label = the person's name + role.
- beat 5 (cutout) uses two real photos: set mediaQuery to 2 searches separated by " | ".
- "mediaQuery" for other beats: 3-5 word search for a real historical/photo image (hook needs one; say/end can be "").`;

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

const FALLBACK = {
  beats: [
    { layout: "hook", headline: "Your money could work while you sleep.", sub: "Most people never see the machine doing it.", mediaQuery: "gold coins pile", text: "Let me show you the quietest way people get rich. It is not a salary. It is not luck. It is a machine called compound interest, and once you see it, you cannot unsee it." },
    { layout: "say", kicker: "THE MACHINE", headline: "Money that earns money, earns money.", sub: "That sentence is the whole secret.", mediaQuery: "", text: "Here is the idea. When you invest money, it earns a return. Then that return earns its own return. Your money makes babies, and those babies make babies. Let me show you what that actually looks like." },
    { layout: "board", kicker: "WATCH THIS", headline: "", big: "$760K", label: "What 500 dollars a month becomes in 40 years at an 8 percent average return.", mediaQuery: "", text: "Say you invest five hundred dollars a month. After forty years you would have put in about two hundred forty thousand. But the account? Around seven hundred sixty thousand. The curve you see is not magic. It is time doing the heavy lifting." },
    { layout: "quote", quote: "Compound interest is the eighth wonder of the world.", label: "ATTRIBUTED TO ALBERT EINSTEIN", mediaQuery: "Albert Einstein", text: "The line attributed to Einstein says compound interest is the eighth wonder of the world. He who understands it, earns it. He who does not, pays it. And here is the part nobody tells you: the person who pays it is often the borrower." },
    { layout: "cutout", headline: "Start at 25. Retire with twice the guy who started at 35.", sub: "Ten years of waiting costs more than the money ever saved.", mediaQuery: "young person saving money jar | Wall Street bull statue", text: "Look at these two savers. One starts at twenty five, one at thirty five. The ten-year head start can be worth more than everything the late starter puts in. Time in the market beats timing the market, almost every single time." },
    { layout: "say", kicker: "THE TAKEAWAY", headline: "Start small. Start now. Let time work.", sub: "The best day was yesterday. The second best is today.", mediaQuery: "", text: "So here is the takeaway. You do not need to be rich to start. You need to start to become rich. Small amounts, invested early, left alone. That is the whole lesson." },
    { layout: "end", headline: "Now you know.", sub: "Follow for the next 5-minute lesson.", mediaQuery: "", text: "" },
  ],
};

console.log("[step] script: trying Gemini");
let script = null;
try {
  const key = process.env.LONGVIDEO_GEMINI_API_KEY || process.env.GEMINI_API_KEY;
  if (!key) throw new Error("no key");
  const d = await aiJson(() => postJson(`https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${key}`,
    { "Content-Type": "application/json" },
    { contents: [{ parts: [{ text: `${SYSTEM}\n\nTOPIC: ${TOPIC}` }] }], generationConfig: { temperature: 0.9, responseMimeType: "application/json" } }));
  script = parseJsonLoose(d.candidates?.[0]?.content?.parts?.[0]?.text || "");
  console.log("[script] gemini OK");
} catch (e) { console.log(`[warn] gemini: ${String(e.message).slice(0, 100)}`); }
if (!script) {
  try {
    const key = process.env.LONGVIDEO_GROQ_API_KEY;
    if (!key) throw new Error("no key");
    const d = await aiJson(() => postJson("https://api.groq.com/openai/v1/chat/completions",
      { "Content-Type": "application/json", Authorization: `Bearer ${key}`, "User-Agent": "quarry-teacher/1.0" },
      { model: "openai/gpt-oss-120b", temperature: 0.9, max_tokens: 12000, messages: [{ role: "user", content: `${SYSTEM}\n\nTOPIC: ${TOPIC}\nOutput ONLY the raw JSON object.` }] }));
    script = parseJsonLoose(d.choices?.[0]?.message?.content || "");
    console.log("[script] groq OK");
  } catch (e) { console.log(`[warn] groq: ${String(e.message).slice(0, 100)}`); }
}
const wordCount = script && Array.isArray(script.beats) ? script.beats.reduce((a, b) => a + String(b.text || "").split(/\s+/).filter(Boolean).length, 0) : 0;
const headlinesOk = script && Array.isArray(script.beats) && script.beats.filter((b) => String(b.headline || "").trim().length >= 8).length >= 5;
if (!script || !Array.isArray(script.beats) || script.beats.length < 6 || wordCount < 200 || !headlinesOk) {
  console.log(`[script] weak AI script (${script ? script.beats?.length : 0} beats, ${wordCount} words, headlines ${headlinesOk ? "ok" : "thin"}) — using built-in teaching fallback`);
  script = FALLBACK;
}
const B = script.beats.slice(0, 7);
console.log(`[script] ${B.length} beats, ${B.map((b) => (b.text || "").split(/\s+/).length).reduce((a, b) => a + b, 0)} words`);

// ---------------- media (multi-platform, NOT pexels/pixabay) ----------------
const mediaDir = path.join(PUB, "teacher-media");
const fit = (t, max) => { t = String(t ?? "").trim(); if (t.length <= max) return t; const c = t.slice(0, max); return c.slice(0, c.lastIndexOf(" ")).trim() + "…"; };
const beats = [];
const push = (b) => { b.i = beats.length; beats.push(b); };
const DEFAULT_ICONS = { hook: ["coins", "clock", "growth"], say: ["dollar", "bulb", "growth"], cutout: ["person", "swap", "people"], board: [], quote: [], end: ["bulb", "growth", "clock"] };

for (const [bi, sb] of B.entries()) {
  const b = { ...sb, text: sb.text || "" };
  b.headline = fit(b.headline, 90);
  b.icons = Array.isArray(sb.icons) && sb.icons.length ? sb.icons.slice(0, 3) : (DEFAULT_ICONS[sb.layout] || []);
  if (sb.layout === "say" && !sb.stamp) b.stamp = "+8% A YEAR";
  // media
  const queries = String(sb.mediaQuery || "").split("|").map((q) => q.trim()).filter(Boolean);
  b.photos = []; b.credits = [];
  if (sb.layout === "quote") {
    const p = path.join(mediaDir, `persona-${bi}.jpg`);
    const r = await fetchTeachingMedia({ query: `${sb.mediaQuery || "Einstein"} portrait`, outPath: p });
    if (r) { b.persona = path.relative(PUB, r.file).split(path.sep).join("/"); b.personaCredit = r.credit; }
  }
  for (const [qi, q] of queries.entries()) {
    if (b.photos.length >= 2) break;
    const p = path.join(mediaDir, `m-${bi}-${qi}.jpg`);
    const r = await fetchTeachingMedia({ query: q, outPath: p });
    if (r) { b.photos.push(path.relative(PUB, r.file).split(path.sep).join("/")); b.credits.push(r.credit); }
  }
  push(b);
}
console.log(`[media] ${beats.reduce((a, b) => a + (b.photos?.length || 0) + (b.persona ? 1 : 0), 0)} assets fetched`);

// ---------------- TTS ----------------
const audioDir = path.join(PUB, "teacher-audio");
fs.mkdirSync(audioDir, { recursive: true });
const spoken = beats.filter((b) => b.text.trim()).map((b) => ({ i: b.i, text: b.text }));
const inPath = path.join(audioDir, "tts-input.json");
fs.writeFileSync(inPath, JSON.stringify(spoken));
const spawnOpts = { stdio: "inherit", shell: IS_WIN };
const tts = spawnSync(PY, [path.join(EXPL, "edge_batch.py"), inPath], { ...spawnOpts, env: { ...process.env, EXPLAINER_VOICE: "en-US-AndrewNeural", EXPLAINER_RATE: "+8%" } });
if (tts.status !== 0) throw new Error("tts failed");
const durs = JSON.parse(fs.readFileSync(path.join(audioDir, "tts-durations.json"), "utf8"));
const durByI = new Map(durs.map((d) => [d.i, d]));

// ---------------- music ----------------
const ALL = JSON.parse(fs.readFileSync(path.join(DIR, "approved-music.json"), "utf8"));
const cin = ALL.filter((m) => m.group === "CINEMATIC");
const track = await (async () => { try { return await pickApprovedTrack((cin.length ? cin : ALL).map((m) => m.title)); } catch { return null; } })();
let musicFile = null;
if (track) {
  musicFile = "teacher-audio/music.mp3";
  fs.copyFileSync(track.file, path.join(PUB, musicFile));
  console.log(`[music] "${track.title}"`);
}

// ---------------- timeline ----------------
const buildWords = (ws) => (ws || []).map((w) => ({ w: w.w, t0: Math.round(w.s * 1000), t1: Math.round((w.s + w.d) * 1000) }));
let cursor = 500;
for (const b of beats) {
  const d = durByI.get(b.i);
  b.ms = b.layout === "end" ? 4000 : b.layout === "board" ? Math.max(Math.round(d?.ms || 0) + 6500, 12000) : Math.max(Math.round(d?.ms || 0) + 700, 3500);
  b.startMs = Math.round(cursor);
  const mp3Rel = `teacher-audio/audio/beat-${String(b.i).padStart(2, "0")}.mp3`;
  const mp3Abs = path.join(PUB, mp3Rel);
  b.audio = (b.text || "").trim() && fs.existsSync(mp3Abs) && fs.statSync(mp3Abs).size > 2048 ? mp3Rel : null;
  b.words = buildWords(d?.words);
  cursor += b.ms;
}
const totalMs = Math.round(cursor + 1200);
const doc = { title: TOPIC, beats, totalMs, fps: 30, width: 1920, height: 1080, music: musicFile || undefined };
const jsonPath = path.join(PUB, "teacher-demo.json");
fs.writeFileSync(jsonPath, JSON.stringify(doc, null, 2));
console.log(`[timeline] ${beats.length} beats, ${(totalMs / 60000).toFixed(2)} min`);

// ---------------- render ----------------
const ensure = spawnSync("npx", ["remotion", "browser", "ensure"], { cwd: EXPL, ...spawnOpts });
if (ensure.status !== 0) throw new Error("browser ensure failed");
const outMp4 = path.join(EXPL, "out", "teacher-demo.mp4");
const renderArgs = (conc) => ["remotion", "render", "remotion/index.ts", "Teacher", outMp4, `--props=${jsonPath}`, `--concurrency=${conc}`, "--timeout=300000", "--port=3494"];
let r = spawnSync("npx", renderArgs(3), { cwd: EXPL, ...spawnOpts });
if (r.status !== 0) r = spawnSync("npx", renderArgs(2), { cwd: EXPL, ...spawnOpts });
if (r.status !== 0) throw new Error("render failed");
console.log(`[DONE] ${outMp4} (${(fs.statSync(outMp4).size / 1048576).toFixed(1)} MB, ${(totalMs / 1000).toFixed(0)}s)`);
if (TEST) console.log("[TEST] demo kept locally");
