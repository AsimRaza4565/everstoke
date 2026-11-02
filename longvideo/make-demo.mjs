// Cloud demo factory: ONE 2-3 minute themed video per run. Runs identically on
// a laptop or a GitHub Actions runner — all inputs come from env/secrets.
//   node make-demo.mjs --slug demo-invest --theme investing --title "..." \
//     --topic "..." --brand "BRAND" --eyebrow "KICKER // LINE" [--queries "a|b|c"]
// Steps: script (Gemini -> Groq -> builtin fallback) -> Edge-TTS per beat ->
// Pexels photo per beat -> DocV2 timeline json -> 720p Remotion render.
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fetchPhoto, fetchPhotoPixabay } from "../explainer/assets-photos.mjs";
import { pickMusicTrack, pickApprovedTrack } from "../music-engine.mjs";

const DIR = import.meta.dirname;
const ROOT = path.resolve(DIR, "..");
const EXPL = path.join(ROOT, "explainer");
const PUB = path.join(EXPL, "public");
const IS_WIN = process.platform === "win32";
const PY = IS_WIN ? "python" : "python3";

// .env is optional (CI injects secrets as real env vars instead)
try {
  for (const line of fs.readFileSync(path.join(ROOT, ".env"), "utf8").split("\n")) {
    const m = line.match(/^([A-Z_0-9]+)=(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
} catch { /* CI: no .env */ }

const arg = (name, def) => {
  const i = process.argv.indexOf(`--${name}`);
  const v = i > 0 ? process.argv[i + 1] : undefined;
  return v === undefined || v === "" ? def : v;
};
const slugify = (s) => (s || "demo").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 50);

const SLUG = slugify(arg("slug"));
const THEME = arg("theme", "investing");
const TITLE = arg("title", "Demo");
const TOPIC = arg("topic", TITLE);
const BRAND = arg("brand", "");
const EYEBROW = arg("eyebrow", "");
const QUERIES = (arg("queries", "") || "").split("|").map((q) => q.trim()).filter(Boolean);
const VOICE = arg("voice", THEME === "poster" ? "en-US-GuyNeural" : "en-US-AndrewNeural");

console.log(`[demo] slug=${SLUG} theme=${THEME} topic="${TOPIC}"`);

// ---------------- 1. script ----------------
const SYSTEM = `You write narration for short documentary YouTube videos (2.5-3 minutes).
Return ONLY valid JSON, no markdown fences, matching exactly:
{"title":"...","hook":"...","beats":[{"text":"...","headline":"...","kicker":"...","big":"...","label":"...","photoQuery":"..."}]}
Rules:
- "hook": 45-60 words, opens with a startling fact or moment. No greeting.
- exactly 7 beats in the array, each "text" 40-55 words of narration (one idea per beat).
- "headline": maximum 60 characters, punchy summary of the beat (never repeats text verbatim).
- "kicker": maximum 28 characters, uppercase label for the beat.
- One beat (index 3) must set "big" to a number/stat from the story and "label" to a 12-20 word caption. Others leave "big" and "label" empty.
- "photoQuery": 3-5 word stock-photo search phrase for the beat.
- Plain English, US/UK audience, no em-dashes, no hashtags.`;

function parseJsonLoose(s) {
  const m = String(s).match(/\{[\s\S]*\}/);
  if (!m) throw new Error("no JSON object found");
  return JSON.parse(m[0]);
}

async function postJson(url, headers, body) {
  const r = await fetch(url, { method: "POST", headers, body: JSON.stringify(body) });
  if (!r.ok) {
    const t = await r.text().catch(() => "");
    throw new Error(`HTTP ${r.status}: ${t.slice(0, 160)}`);
  }
  return r.json();
}

async function geminiScript() {
  const key = process.env.LONGVIDEO_GEMINI_API_KEY || process.env.GEMINI_API_KEY;
  if (!key) throw new Error("no gemini key");
  let lastErr;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const d = await postJson(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${key}`,
        { "Content-Type": "application/json" },
        { contents: [{ parts: [{ text: `${SYSTEM}\n\nTOPIC: ${TOPIC}` }] }], generationConfig: { temperature: 0.85, responseMimeType: "application/json" } }
      );
      return parseJsonLoose(d.candidates?.[0]?.content?.parts?.[0]?.text || "");
    } catch (e) {
      lastErr = e;
      if (!/HTTP 5\d\d/.test(String(e.message))) break; // only retry server-side errors
      await new Promise((r) => setTimeout(r, 4000));
    }
  }
  throw lastErr;
}

async function groqScript() {
  const key = process.env.LONGVIDEO_GROQ_API_KEY;
  if (!key) throw new Error("no groq key");
  let lastErr;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const d = await postJson(
        "https://api.groq.com/openai/v1/chat/completions",
        { "Content-Type": "application/json", Authorization: `Bearer ${key}`, "User-Agent": "quarry-demo/1.0" },
        {
          model: "openai/gpt-oss-120b", temperature: 0.85, max_tokens: 12000,
          messages: [{ role: "user", content: `${SYSTEM}\n\nTOPIC: ${TOPIC}\nOutput ONLY the raw JSON object. No reasoning, no markdown, no code fences.` }],
        }
      );
      return parseJsonLoose(d.choices?.[0]?.message?.content || "");
    } catch (e) {
      lastErr = e;
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
  throw lastErr;
}

// guaranteed script so the run ALWAYS produces a video even with zero API access
const FALLBACK = {
  title: TITLE,
  hook: `In 2013, one fake tweet wiped one hundred thirty six billion dollars off the stock market in three minutes. No hacker stole a single dollar. The market simply believed a headline, and panic did the rest. This is the story of the most expensive three minutes in financial history.`,
  beats: [
    { text: "It started with a hacked Associated Press account. At 1:07 PM, a message appeared claiming explosions at the White House had injured the president. Traders scrolling their screens saw it at the same moment, and selling began instantly.", headline: "One Fake Message, One Bad Afternoon", kicker: "THE SETUP", photoQuery: "stock market trading screens" },
    { text: "Algorithms read the headline faster than any human. High frequency systems dumped billions in stocks within seconds, because to a machine, a trusted news source is a fact. No one checked. No one could check that fast.", headline: "Machines Believed It First", kicker: "SPEED", photoQuery: "server room data center" },
    { text: "In three minutes, the Dow Jones dropped nearly one hundred fifty points. One hundred thirty six billion dollars in market value simply evaporated. It remains one of the fastest crashes in modern history.", headline: "136 Billion Gone In 3 Minutes", kicker: "THE DAMAGE", big: "$136B", label: "Erased from US markets in roughly three minutes of panic selling.", photoQuery: "wall street buildings" },
    { text: "Then the truth arrived. The Associated Press confirmed its account had been hacked, and the market snapped back almost as fast as it fell. Investors who held their nerve lost nothing. Investors who panicked locked in real losses.", headline: "The Truth Put It All Back", kicker: "RECOVERY", photoQuery: "newspaper morning coffee" },
    { text: "The SEC never found who sent the tweet. The Syrian Electronic Army was blamed, but no charges followed. A single anonymous message had moved more money in minutes than most countries move in a year.", headline: "No One Was Ever Caught", kicker: "AFTERMATH", photoQuery: "dark city night skyline" },
    { text: "The lesson is uncomfortable. The smartest systems on Wall Street are only as honest as the information they are fed. Speed without verification is not intelligence, it is risk wearing a suit.", headline: "Fast Is Not The Same As True", kicker: "THE LESSON", photoQuery: "empty office desk night" },
    { text: "Today, markets pause automatically when prices move too fast. It is called a circuit breaker, and it exists because of days like this one. Sometimes the best technology is a machine that knows when to stop and wait.", headline: "Now Machines Wait Before They Panic", kicker: "TODAY", photoQuery: "circuit board macro closeup" },
  ],
};

const step = (name, fn) => async () => {
  console.log(`[step] ${name} ...`);
  try { return await fn(); } catch (e) { console.log(`[warn] ${name}: ${String(e.message).slice(0, 140)}`); return null; }
};

console.log("[step] script: trying Gemini");
let script = await step("gemini", geminiScript)();
if (!script) { console.log("[step] script: trying Groq"); script = await step("groq", groqScript)(); }
if (!script || !Array.isArray(script.beats) || script.beats.length < 4) {
  console.log("[step] script: using built-in fallback");
  script = FALLBACK;
}
const words = [script.hook, ...script.beats.map((b) => b.text)].join(" ").split(/\s+/).length;
console.log(`[script] "${script.title}" ${words} words, ${script.beats.length} beats (~${(words / 150).toFixed(1)} min)`);

// ---------------- 2. beats + photos ----------------
const fit = (text, max) => {
  const t = (text || "").trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  return cut.slice(0, cut.lastIndexOf(" ")).trim() + "…";
};

// karaoke captions: group word timings into cues of <=4 words / <=1.9s (ms, beat-relative)
const buildCues = (words) => {
  const cues = [];
  let cur = [];
  for (const w of words || []) {
    cur.push(w);
    const span = (cur[cur.length - 1].s + cur[cur.length - 1].d) - cur[0].s;
    if (cur.length >= 4 || span >= 1.9) {
      cues.push({ t0: Math.round(cur[0].s * 1000), t1: Math.round((cur[cur.length - 1].s + cur[cur.length - 1].d) * 1000), text: cur.map((x) => x.w).join(" ") });
      cur = [];
    }
  }
  if (cur.length) cues.push({ t0: Math.round(cur[0].s * 1000), t1: Math.round((cur[cur.length - 1].s + cur[cur.length - 1].d) * 1000), text: cur.map((x) => x.w).join(" ") });
  return cues;
};

// premium captions: word-level timings + emphasis on key words (numbers, money, power words)
const POWER_WORDS = new Set(["billion", "million", "thousand", "trillion", "dollars", "dollar", "percent", "never", "always", "money", "rich", "broke", "free", "quit", "banned", "illegal", "secret", "huge", "massive", "warning", "collapsed", "crash", "erased", "vanished", "fortune", "empire", "power", "control", "impossible", "insane", "biggest", "most"]);
const isKeyWord = (w) => {
  const clean = String(w).toLowerCase().replace(/[^a-z0-9$%.]/g, "");
  return /\d/.test(clean) || /[$%]/.test(clean) || POWER_WORDS.has(clean);
};
const buildWords = (words) => (words || []).map((w) => ({
  w: w.w,
  t0: Math.round(w.s * 1000),
  t1: Math.round((w.s + w.d) * 1000),
  key: isKeyWord(w.w),
}));

// user-approved music pool (locked 09-16) — one track per video, looped if short
const APPROVED = JSON.parse(fs.readFileSync(path.join(DIR, "approved-music.json"), "utf8"));
const THEME_GROUP = { investing: "TENSION", vox: "CINEMATIC", poster: "TECH" };

const beats = [];
const push = (b) => { b.i = beats.length; beats.push(b); };
const firstHookSentence = (script.hook.split(/(?<=[.!?])\s+/)[0] || "").trim();
push({ layout: "hero", kicker: "", headline: fit(TITLE, 60), sub: fit(firstHookSentence, 92), text: script.hook });
script.beats.slice(0, 7).forEach((sb, i) => {
  const isStat = sb.big && sb.label;
  push({
    layout: isStat ? "stat" : "split",
    n: i + 1, kicker: (sb.kicker || "").slice(0, 28), headline: fit(sb.headline || sb.text, 96),
    text: sb.text, big: sb.big, label: fit(sb.label || "", 120), side: i % 2 === 0 ? "left" : "right",
    photoQuery: sb.photoQuery || QUERIES[i % Math.max(QUERIES.length, 1)] || "",
  });
});
push({ layout: "end", headline: "Follow for more stories that move money.", text: "" });

const photoDir = path.join(PUB, "demo-photos", SLUG);
for (const b of beats) {
  if (b.layout !== "split" && b.layout !== "hero") continue;
  const q = b.photoQuery || QUERIES[0];
  if (!q) continue;
  let r = await fetchPhoto({ key: process.env.PEXELS_API_KEY, query: q, outPath: path.join(photoDir, `p-${b.i}.jpg`) });
  if (!r) r = await fetchPhotoPixabay({ key: process.env.PIXABAY_API_KEY, query: q, outPath: path.join(photoDir, `p-${b.i}.jpg`) });
  if (!r) { await new Promise((res) => setTimeout(res, 1200)); r = await fetchPhoto({ key: process.env.PEXELS_API_KEY, query: q, outPath: path.join(photoDir, `p-${b.i}.jpg`) }); }
  if (r) b.photo = path.relative(PUB, r.file).split(path.sep).join("/");
  await new Promise((res) => setTimeout(res, 300));
}
console.log(`[photos] ${beats.filter((b) => b.photo).length}/${beats.filter((b) => b.layout === "split" || b.layout === "hero").length} fetched`);

// ---------------- 3. TTS ----------------
const audioDir = path.join(PUB, "demo-audio", SLUG);
fs.mkdirSync(audioDir, { recursive: true });
const spoken = beats.filter((b) => b.text.trim()).map((b) => ({ i: b.i, text: b.text }));
const inPath = path.join(audioDir, "tts-input.json");
fs.writeFileSync(inPath, JSON.stringify(spoken));
const spawnOpts = { stdio: "inherit", shell: IS_WIN };
const env = { ...process.env, EXPLAINER_VOICE: VOICE };
const tts = spawnSync(PY, [path.join(EXPL, "edge_batch.py"), inPath], { ...spawnOpts, env });
if (tts.status !== 0) throw new Error("tts failed");
const durs = JSON.parse(fs.readFileSync(path.join(audioDir, "tts-durations.json"), "utf8"));
const durByI = new Map(durs.map((d) => [d.i, d.ms]));

// ---------------- 4. music (approved pool only, one track per video) ----------------
const group = THEME_GROUP[THEME] || "TENSION";
const groupTracks = APPROVED.filter((m) => m.group === group);
const pickFrom = groupTracks.length ? groupTracks : APPROVED;
console.log(`[step] music: picking from approved ${group} pool (${pickFrom.length} tracks)`);
const track = await step("music", () => pickApprovedTrack(pickFrom.map((m) => m.title)))();
let musicFile = null;
if (track && track.file) {
  musicFile = `demo-audio/${SLUG}/music.mp3`;
  fs.copyFileSync(track.file, path.join(PUB, musicFile));
  console.log(`[music] "${track.title}" (${track.feel})`);
  console.log(`[music] credit: ${track.credit}`);
} else {
  console.log("[warn] no music track available — continuing without bg music");
}

// ---------------- 5. timeline json ----------------
let cursor = 600;
const durByI2 = new Map(durs.map((d) => [d.i, d]));
for (const b of beats) {
  const spokenMs = durByI.get(b.i) || 0;
  b.ms = b.layout === "end" ? 3500 : Math.max(Math.round(spokenMs) + 500, 2800);
  b.startMs = Math.round(cursor);
  const mp3Rel = `demo-audio/${SLUG}/audio/beat-${String(b.i).padStart(2, "0")}.mp3`;
  b.audio = b.text.trim() && fs.existsSync(path.join(PUB, mp3Rel)) && fs.statSync(path.join(PUB, mp3Rel)).size > 2048 ? mp3Rel : null;
  b.cues = buildCues(durByI2.get(b.i)?.words);
  b.words = buildWords(durByI2.get(b.i)?.words);
  cursor += b.ms;
}
const totalMs = Math.round(cursor + 1200);
const doc = { title: script.title, theme: THEME, brand: BRAND || undefined, eyebrow: EYEBROW || undefined, music: musicFile || undefined, beats, totalMs, fps: 30 };
const jsonPath = path.join(PUB, `demo-${SLUG}.json`);
fs.writeFileSync(jsonPath, JSON.stringify(doc, null, 2));
console.log(`[timeline] ${beats.length} beats, ${(totalMs / 60000).toFixed(2)} min -> ${path.basename(jsonPath)}`);

// ---------------- 5. render ----------------
const ensure = spawnSync("npx", ["remotion", "browser", "ensure"], { cwd: EXPL, stdio: "inherit", shell: IS_WIN });
if (ensure.status !== 0) throw new Error("browser ensure failed");
const outMp4 = path.join(EXPL, "out", `demo-${SLUG}.mp4`);
const renderArgs = (conc) => ["remotion", "render", "remotion/index.ts", "DocV2", outMp4,
  `--props=${jsonPath}`, `--concurrency=${conc}`, "--timeout=180000", "--port=3491"];
let r = spawnSync("npx", renderArgs(3), { cwd: EXPL, stdio: "inherit", shell: IS_WIN });
if (r.status !== 0) {
  console.log("[render] retry at concurrency 2");
  r = spawnSync("npx", renderArgs(2), { cwd: EXPL, stdio: "inherit", shell: IS_WIN });
}
if (r.status !== 0) throw new Error("render failed");
const size = (fs.statSync(outMp4).size / 1024 / 1024).toFixed(1);
console.log(`[DONE] ${outMp4} (${size} MB, ${(totalMs / 1000).toFixed(0)}s)`);
