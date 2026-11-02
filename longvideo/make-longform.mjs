// LONG-FORM daily factory (runs in the PUBLIC render repo — no YouTube tokens here).
// ONE 10+ min documentary per channel: topic (AI, deduped) -> 10-min script
// (Gemini->Groq) -> chapter beats -> Edge-TTS -> Pexels/Pixabay photos -> approved
// music (looped) -> Style-2 karaoke captions -> DocV2 render 1080p/24fps
// -> Wikipedia persona thumbnail (Remotion still) -> META json for the private uploader.
//   node make-longform.mjs --channel investors-compass [--test]
//   LF_MINUTES=1 for quick tests.
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fetchPhoto, fetchPhotoPixabay } from "../explainer/assets-photos.mjs";
import { pickApprovedTrack } from "../music-engine.mjs";

const DIR = import.meta.dirname;
const ROOT = path.resolve(DIR, "..");
const EXPL = path.join(ROOT, "explainer");
const PUB = path.join(EXPL, "public");
const IS_WIN = process.platform === "win32";
const PY = IS_WIN ? "python" : "python3";
const TEST = process.argv.includes("--test");
const chanArg = process.argv.indexOf("--channel");
const SLUG = chanArg > 0 ? process.argv[chanArg + 1] : "investors-compass";

import { loadEnv } from "../lib/env.mjs";
loadEnv();

const CHANNELS = {
  "investors-compass": { theme: "investing", group: "TENSION", slotET: "19:00", voice: "en-US-AndrewNeural", brand: "INVESTOR'S COMPASS", eyebrow: "MARKET DOCUMENTARIES // IC", accent: "#E8C15A", bg: "#0B1220", niche: "stock market crashes and panics, legendary investors, trading disasters, financial history", angles: ["market crash and panic", "legendary investor rise and fall", "trading disaster", "financial history mystery"] },
  "money-rulebook": { theme: "vox", group: "CINEMATIC", slotET: "19:45", voice: "en-US-AndrewNeural", brand: "MONEY RULEBOOK", eyebrow: "BUSINESS STORIES // MR", accent: "#C1272D", bg: "#FAF5EE", niche: "companies and business empires: founders, rises and falls, frauds and scandals", angles: ["company rise and fall", "founder story", "business fraud and scandal", "empire-building deal"] },
  "debt-free-doctrine": { theme: "poster", group: "TENSION", slotET: "20:30", voice: "en-US-GuyNeural", brand: "DEBT-FREE DOCTRINE", eyebrow: "DEBT STORIES // DFD", accent: "#FF3366", bg: "#0A0A0A", niche: "PERSONAL money disasters: credit card traps, loans, personal bankruptcy and debt-free comebacks (real people, NOT companies)", angles: ["personal debt trap", "credit score disaster", "loan shark and payday trap", "debt-free comeback story"] },
  "quotequarry": { theme: "vox", group: "CINEMATIC", slotET: "21:15", voice: "en-US-AndrewNeural", brand: "QUOTE QUARRY", eyebrow: "WISE MINDS // QQ", accent: "#C1272D", bg: "#FAF5EE", niche: "stoic philosophers and timeless wisdom stories from history (NO money, investing or business topics)", angles: ["stoic philosopher life story", "timeless wisdom lesson from history", "famous mind and discipline", "ancient story with modern lesson"] },
};
const CH = CHANNELS[SLUG];
if (!CH) { console.error("unknown channel " + SLUG); process.exit(1); }
console.log(`[longform] channel=${SLUG} theme=${CH.theme} test=${TEST}`);

const spawnOpts = { stdio: "inherit", shell: IS_WIN };
const step = (name, fn) => async () => {
  console.log(`[step] ${name} ...`);
  try { return await fn(); } catch (e) { console.log(`[warn] ${name}: ${String(e.message).slice(0, 160)}`); return null; }
};
const fit = (t, max) => { t = (t || "").trim(); if (t.length <= max) return t; const c = t.slice(0, max); return c.slice(0, c.lastIndexOf(" ")).trim() + "…"; };
const sentences = (text) => String(text).split(/(?<=[.!?])\s+/).map((x) => x.trim()).filter(Boolean);

// ---------- 1. topic (AI, deduped against channel history) ----------
const HIST = path.join(ROOT, "state", `longform-${SLUG}.json`);
const history = (() => { try { return JSON.parse(fs.readFileSync(HIST, "utf8")); } catch { return []; } })();
let recentTitles = history.slice(-25).map((h) => h.title);
// CROSS-CHANNEL dedup: read the other channels' committed histories so two
// channels can never tell the same story in the same week.
import { LEGACY_SLUGS as ALL_SLUGS } from "../lib/registry.mjs";
const ghTok = process.env.GITHUB_TOKEN || process.env.GITHUB_PAT || "";
const ghRepo = process.env.GH_REPO || "muzzamilhassan/quarry-render";
if (ghTok) {
  for (const other of ALL_SLUGS) {
    if (other === SLUG) continue;
    try {
      const r = await fetch("https://api.github.com/repos/" + ghRepo + "/contents/state/longform-" + other + ".json", { headers: { Authorization: "Bearer " + ghTok, "User-Agent": "quarry-longform" } });
      if (!r.ok) continue;
      const j = await r.json();
      const arr = JSON.parse(Buffer.from(j.content, "base64").toString("utf8"));
      for (const h of arr.slice(-25)) if (h.title && !recentTitles.includes(h.title)) recentTitles.push(h.title);
    } catch { }
  }
}
recentTitles = recentTitles.slice(-100);
console.log(`[topic] dedup list: ${recentTitles.length} recent titles (all channels)`);

const ANGLE = (() => { const a = CH.angles || []; return a.length ? a[history.length % a.length] : ""; })();
const TOPIC_SYS = `You plan documentary YouTube videos. Return ONLY JSON: {"title":"...","keyword":"...","titles":["5 title variants"],"thumbHeadline":"...","personaQuery":"...","personaName":"..."}.
- Pick ONE specific real story told from this angle: ANGLE.
- STRICT NICHE (a story outside it is WRONG): NICHE.
- "keyword": the main phrase people SEARCH on YouTube for this story (3-6 words, e.g. "stock market crash explained").
- "titles": exactly 5 YouTube title variants using different formulas (number+outcome, curiosity gap, warning, contrarian, X vs Y). Max 70 chars each. One must contain the keyword.
- "thumbHeadline": 3-5 punchy words for the thumbnail (max 22 chars), no punctuation except $ or numbers.
- "personaQuery": the single most FAMOUS person, logo, or object tied to the story (e.g. "Warren Buffett", "Twitter logo", "silicon wafer") - this is used to find its Wikipedia photo.
- "personaName": that same name.
Not in this list of already-used topics: ${JSON.stringify(recentTitles)}`;

function parseJsonLoose(s) { const m = String(s).match(/\{[\s\S]*\}/); if (!m) throw new Error("no JSON"); return JSON.parse(m[0]); }
async function postJson(url, headers, body) {
  const r = await fetch(url, { method: "POST", headers, body: JSON.stringify(body) });
  if (!r.ok) { const t = await r.text().catch(() => ""); throw new Error(`HTTP ${r.status}: ${t.slice(0, 120)}`); }
  return r.json();
}
async function aiJson(runner) {
  let lastErr;
  for (let a = 0; a < 3; a++) {
    try { return await runner(); } catch (e) { lastErr = e; await new Promise((r) => setTimeout(r, 4000)); }
  }
  throw lastErr;
}
const geminiTopic = () => aiJson(async () => {
  const key = process.env.LONGVIDEO_GEMINI_API_KEY || process.env.GEMINI_API_KEY;
  if (!key) throw new Error("no gemini key");
  const d = await postJson(`https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${key}`,
    { "Content-Type": "application/json" },
    { contents: [{ parts: [{ text: `${TOPIC_SYS.replace("NICHE", CH.niche)}` }] }], generationConfig: { temperature: 1.0, responseMimeType: "application/json" } });
  return parseJsonLoose(d.candidates?.[0]?.content?.parts?.[0]?.text || "");
});
const groqTopic = () => aiJson(async () => {
  const key = process.env.LONGVIDEO_GROQ_API_KEY;
  if (!key) throw new Error("no groq key");
  const d = await postJson("https://api.groq.com/openai/v1/chat/completions",
    { "Content-Type": "application/json", Authorization: `Bearer ${key}`, "User-Agent": "quarry-longform/1.0" },
    { model: "openai/gpt-oss-120b", temperature: 1.0, max_tokens: 6000, messages: [{ role: "user", content: `${TOPIC_SYS.replace("NICHE", CH.niche)}\nOutput ONLY the raw JSON object.` }] });
  return parseJsonLoose(d.choices?.[0]?.message?.content || "");
});

console.log("[step] topic (groq primary, gemini backup) ...");
let topic = await step("groq-topic", groqTopic)();
if (!topic) topic = await step("gemini-topic", geminiTopic)();
const FALLBACK_TOPICS = {
  "investors-compass": [
    { title: "The 1987 Black Monday Crash", keyword: "black monday 1987 explained", thumbHeadline: "22% IN ONE DAY", personaQuery: "Black Monday 1987", personaName: "Black Monday 1987" },
    { title: "How Nick Leeson Broke Barings Bank", keyword: "barings bank collapse explained", thumbHeadline: "THE BANK THAT DIED", personaQuery: "Nick Leeson", personaName: "Nick Leeson" },
    { title: "Jesse Livermore: The Man Who Shorted 1929", keyword: "jesse livermore story", thumbHeadline: "$100 MILLION SHORTED", personaQuery: "Jesse Livermore", personaName: "Jesse Livermore" },
    { title: "Madoff: The $65 Billion Ponzi Machine", keyword: "madoff ponzi scheme explained", thumbHeadline: "$65B PONZI", personaQuery: "Bernie Madoff", personaName: "Bernie Madoff" },
    { title: "Tulip Mania: History's First Market Bubble", keyword: "tulip mania explained", thumbHeadline: "FLOWERS COST HOUSES", personaQuery: "Tulip mania", personaName: "Tulip Mania" },
  ],
  "money-rulebook": [
    { title: "Kodak Invented the Digital Camera, Then Hid It", keyword: "kodak failure story", thumbHeadline: "THEY HID THE FUTURE", personaQuery: "Kodak", personaName: "Kodak" },
    { title: "Blockbuster Could Have Bought Netflix", keyword: "blockbuster netflix story", thumbHeadline: "$50M THAT DIED", personaQuery: "Blockbuster LLC", personaName: "Blockbuster" },
    { title: "WeWork: The $47 Billion Mirage", keyword: "wework collapse explained", thumbHeadline: "$47B TO ZERO", personaQuery: "Adam Neumann", personaName: "Adam Neumann" },
    { title: "Nokia: The King That Slept", keyword: "nokia rise and fall", thumbHeadline: "KING TO FORGOTTEN", personaQuery: "Nokia", personaName: "Nokia" },
    { title: "The East India Company: History's First Mega-Corporation", keyword: "east india company history", thumbHeadline: "FIRST MEGA-CORP", personaQuery: "East India Company", personaName: "East India Company" },
  ],
  "debt-free-doctrine": [
    { title: "The Credit Card Minimum Payment Trap", keyword: "credit card minimum payment trap", thumbHeadline: "30 YEARS OF DEBT", personaQuery: "credit cards", personaName: "Credit Cards" },
    { title: "How Student Loans Swallowed a Generation", keyword: "student loan crisis explained", thumbHeadline: "$1.7T TRAP", personaQuery: "Student debt", personaName: "Student Loans" },
    { title: "Payday Loans: The Legal Loan Sharks", keyword: "payday loan trap explained", thumbHeadline: "400% INTEREST", personaQuery: "Payday loan", personaName: "Payday Loans" },
    { title: "The Lottery Curse: Winners Who Lost Everything", keyword: "lottery winners who went broke", thumbHeadline: "WINNERS TO BROKE", personaQuery: "Lottery winner", personaName: "Lottery Winners" },
    { title: "From Sleeping in His Car to Debt-Free Millionaire", keyword: "debt free comeback story", thumbHeadline: "CAR TO MILLIONS", personaQuery: "homeless entrepreneur", personaName: "Comeback Story" },
  ],
  "quotequarry": [
    { title: "Seneca: The Richest Stoic and His Hardest Lesson", keyword: "seneca stoicism story", thumbHeadline: "THE RICHEST STOIC", personaQuery: "Seneca the Younger", personaName: "Seneca" },
    { title: "Epictetus: From Slave to Philosophy Master", keyword: "epictetus life story", thumbHeadline: "BORN A SLAVE", personaQuery: "Epictetus", personaName: "Epictetus" },
    { title: "Cato: Rome's Last Honest Man", keyword: "cato the younger story", thumbHeadline: "ROME'S HONEST MAN", personaQuery: "Cato the Younger", personaName: "Cato" },
    { title: "Diogenes: The Man Who Mocked an Empire", keyword: "diogenes philosophy story", thumbHeadline: "THE BARREL PHILOSOPHER", personaQuery: "Diogenes of Sinope", personaName: "Diogenes" },
    { title: "Viktor Frankl: Finding Meaning Inside Hell", keyword: "viktor frankl story", thumbHeadline: "MEANING IN HELL", personaQuery: "Viktor Frankl", personaName: "Viktor Frankl" },
  ],
};
if (!topic || !topic.title) {
  const fbList = FALLBACK_TOPICS[SLUG] || [];
  topic = fbList[history.length % fbList.length];
  console.log(`[topic] AI failed - on-niche fallback: "${topic.title}"`);
}
const keyword = String(topic.keyword || CH.niche.split(",")[0]).trim();
const titles5 = Array.isArray(topic.titles) ? topic.titles.filter(Boolean) : [];
const scoreTitle = (t) => {
  const tt = String(t || "");
  let sc = 0;
  if (keyword && tt.toLowerCase().includes(keyword.toLowerCase().split(" ")[0])) sc += 2;
  if (tt.length <= 70) sc += 1;
  if (/[0-9?]/.test(tt)) sc += 1;
  return sc;
};
const bestTitle = titles5.length ? titles5.slice().sort((a, b) => scoreTitle(b) - scoreTitle(a))[0] : topic.title;
if (titles5.length) console.log(`[seo] picked title (${scoreTitle(bestTitle)}pts): "${bestTitle}"`);
console.log(`[topic] "${topic.title}" | persona: ${topic.personaName || topic.personaQuery}`);

// ---------- 2. script (existing 10-min engine) ----------
process.chdir(DIR);
const MINUTES = process.env.LF_MINUTES || "10";
let script = null;
for (let attempt = 0; attempt < 3 && !script; attempt++) {
  if (attempt > 0) { console.log(`[script] retry ${attempt}/2 after 45s (rate-limit burst)`); await new Promise((r) => setTimeout(r, 45000)); }
  fs.rmSync(path.join(DIR, "out"), { recursive: true, force: true }); // isolate this run's script dir
  const gen = spawnSync("node", ["generate-longscript.mjs", "--topic", topic.title, "--minutes", MINUTES, "--brand", SLUG], { ...spawnOpts, cwd: DIR });
  if (gen.status !== 0) continue;
  const outRoot = path.join(DIR, "out");
  const slugDir = fs.readdirSync(outRoot).map((f) => path.join(outRoot, f)).filter((f) => fs.statSync(f).isDirectory()).sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0];
  if (!slugDir) continue;
  try { script = JSON.parse(fs.readFileSync(path.join(slugDir, "script.json"), "utf8")); } catch { script = null; }
}
if (!script) throw new Error("script generation failed");
console.log(`[script] ${script.stats.totalWords}w ≈ ${script.stats.estMinutes}min, ${script.chapters.length} chapters`);

// ---------- 3. beats ----------
const beats = [];
const push = (b) => { b.i = beats.length; beats.push(b); };
push({ layout: "hero", kicker: "", headline: fit(topic.title, 76), sub: fit(sentences(script.hook)[0] || "", 90), text: script.hook });
script.chapters.forEach((ch, ci) => {
  push({ layout: "chapter", n: ci + 1, chapterTitle: fit(ch.title, 70) });
  for (const snt of sentences(ch.narration)) {
    const isStat = /(\$\d|\d+%|\d{4,})/.test(snt);
    push({ layout: isStat ? "stat" : "split", n: ci + 1, chapterTitle: ch.title, side: beats.length % 2 === 0 ? "left" : "right", headline: fit(snt, 110), text: snt });
  }
});
push({ layout: "end", headline: `Follow ${CH.brand} for more.`, text: "" });
console.log(`[beats] ${beats.length} beats`);

// ---------- 4. photos (rate-limit aware + pool reuse: no beat goes photoless) ----------
const photoDir = path.join(PUB, "lf-photos", SLUG);
const nicheWords = CH.niche.split(",").map((x) => x.trim());
const cleanQ = (t) => String(t || "").replace(/[^A-Za-z0-9 ]/g, " ").split(/\s+/).filter(Boolean).slice(0, 4).join(" ");
const sleepMs = (ms) => new Promise((r) => setTimeout(r, ms));
const pool = [];
let poolIdx = 0;
let photoFails = 0;
let photoIdx = 0;
async function getPhoto(query, outPath) {
  let r = await fetchPhoto({ key: process.env.PEXELS_API_KEY, query, outPath });
  if (!r) r = await fetchPhotoPixabay({ key: process.env.PIXABAY_API_KEY, query, outPath });
  if (!r) { await sleepMs(2600); r = await fetchPhoto({ key: process.env.PEXELS_API_KEY, query: nicheWords[photoIdx % nicheWords.length], outPath }); }
  if (!r) r = await fetchPhotoPixabay({ key: process.env.PIXABAY_API_KEY, query: nicheWords[photoIdx % nicheWords.length], outPath });
  const rel = r ? path.relative(PUB, r.file).split(path.sep).join("/") : null;
  if (rel) { pool.push(rel); return rel; }
  photoFails++;
  if (pool.length) { const reuse = pool[poolIdx++ % pool.length]; console.log(`[photo] reuse pool image`); return reuse; }
  return null;
}
for (const b of beats) {
  if (b.layout !== "split" && b.layout !== "hero") continue;
  const q = b.layout === "hero" ? (topic.personaQuery || nicheWords[0]) : `${cleanQ(b.chapterTitle)} ${nicheWords[photoIdx % nicheWords.length]}`;
  b.photo = await getPhoto(q.slice(0, 60), path.join(photoDir, `p-${b.i}.jpg`));
  photoIdx++;
  await sleepMs(350);
}
console.log(`[photos] ${beats.filter((b) => b.photo).length} set | pool ${pool.length} | failed ${photoFails}`);

// ---------- 5. TTS ----------
const audioDir = path.join(PUB, "lf-audio", SLUG);
fs.mkdirSync(audioDir, { recursive: true });
const spoken = beats.filter((b) => (b.text || "").trim()).map((b) => ({ i: b.i, text: b.text }));
const inPath = path.join(audioDir, "tts-input.json");
fs.writeFileSync(inPath, JSON.stringify(spoken));
const tts = spawnSync(PY, [path.join(EXPL, "edge_batch.py"), inPath], { ...spawnOpts, env: { ...process.env, EXPLAINER_VOICE: CH.voice } });
if (tts.status !== 0) throw new Error("tts failed");
const durs = JSON.parse(fs.readFileSync(path.join(audioDir, "tts-durations.json"), "utf8"));
const durByI = new Map(durs.map((d) => [d.i, d]));

// ---------- 6. music (approved pool, ONE track, loops) ----------
const ALL_APPROVED = JSON.parse(fs.readFileSync(path.join(DIR, "approved-music.json"), "utf8"));
const pickFrom = ALL_APPROVED.filter((m) => m.group === CH.group);
const track = await step("music", () => pickApprovedTrack((pickFrom.length ? pickFrom : ALL_APPROVED).map((m) => m.title)))();
let musicFile = null;
if (track) {
  musicFile = `lf-audio/${SLUG}/music.mp3`;
  fs.copyFileSync(track.file, path.join(PUB, musicFile));
  console.log(`[music] "${track.title}" (${track.feel})`);
  console.log(`[music] credit: ${track.credit}`);
}

// ---------- 7. timeline ----------
const buildWords = (ws) => (ws || []).map((w) => ({ w: w.w, t0: Math.round(w.s * 1000), t1: Math.round((w.s + w.d) * 1000) }));
let cursor = 800;
for (const b of beats) {
  const d = durByI.get(b.i);
  const spokenMs = d ? Math.max(d.ms, 0) : 0;
  b.ms = b.layout === "end" ? 4000 : b.layout === "chapter" ? 3500 : Math.max(Math.round(spokenMs) + 600, 3000);
  b.startMs = Math.round(cursor);
  const mp3Rel = `lf-audio/${SLUG}/audio/beat-${String(b.i).padStart(2, "0")}.mp3`;
  const mp3Abs = path.join(PUB, mp3Rel);
  b.audio = (b.text || "").trim() && fs.existsSync(mp3Abs) && fs.statSync(mp3Abs).size > 2048 ? mp3Rel : null;
  b.words = buildWords(d?.words);
  cursor += b.ms;
}
const totalMs = Math.round(cursor + 1500);
const doc = { title: script.title, theme: CH.theme, brand: CH.brand, eyebrow: CH.eyebrow, music: musicFile || undefined, width: 1920, height: 1080, fps: 24, beats, totalMs };
const jsonPath = path.join(PUB, `lf-${SLUG}.json`);
fs.writeFileSync(jsonPath, JSON.stringify(doc, null, 2));
console.log(`[timeline] ${beats.length} beats, ${(totalMs / 60000).toFixed(1)} min -> ${path.basename(jsonPath)}`);

// ---------- 8. render (composition metadata drives 1920x1080; CSS is 1920-space) ----------
const ensure = spawnSync("npx", ["remotion", "browser", "ensure"], { cwd: EXPL, ...spawnOpts });
if (ensure.status !== 0) throw new Error("browser ensure failed");
const outMp4 = path.join(EXPL, "out", `lf-${SLUG}.mp4`);
const renderArgs = (conc) => ["remotion", "render", "remotion/index.ts", "DocV2", outMp4, `--props=${jsonPath}`, `--concurrency=${conc}`, "--timeout=300000", "--port=3492"];
let r = spawnSync("npx", renderArgs(2), { cwd: EXPL, ...spawnOpts });
if (r.status !== 0) {
  console.log("[render] retry concurrency 1");
  r = spawnSync("npx", renderArgs(1), { cwd: EXPL, ...spawnOpts });
}
if (r.status !== 0) throw new Error("render failed");
console.log(`[DONE] ${outMp4} (${(fs.statSync(outMp4).size / 1048576).toFixed(1)} MB, ${(totalMs / 1000).toFixed(0)}s)`);

// ---------- 9. thumbnail (Wikipedia persona image + Remotion still) ----------
const WIKI_UA = { "User-Agent": "QuarryLongform/1.0 (video thumbnail; contact via channel)" };
async function fetchPersonaImage(query, name, outPath) {
  if (name) {
    try {
      const r = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(String(name).trim().replace(/\s+/g, "_"))}`, { headers: WIKI_UA });
      if (r.ok) {
        const d = await r.json();
        const src = d.originalimage?.source || d.thumbnail?.source;
        if (src) {
          const dl = await fetch(src, { headers: WIKI_UA });
          if (dl.ok) { fs.writeFileSync(outPath, Buffer.from(await dl.arrayBuffer())); return d.content_urls?.desktop?.page || "wikipedia"; }
        }
      }
    } catch (e) { console.log(`[thumb] wikipedia: ${String(e.message).slice(0, 60)}`); }
  }
  try {
    const url = `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(query)}&gsrlimit=10&gsrnamespace=6&prop=imageinfo&iiprop=url%7Csize&iiurlwidth=1280&format=json`;
    const r = await fetch(url, { headers: WIKI_UA });
    if (r.ok) {
      const pages = Object.values((await r.json()).query?.pages || {});
      const cands = pages.map((p) => p.imageinfo?.[0]).filter((ii) => ii && /\.jpe?g$/i.test(ii.url) && ii.width >= 700);
      cands.sort((a, b) => b.width * b.height - a.width * a.height);
      if (cands.length) {
        const dl = await fetch(cands[0].thumburl || cands[0].url, { headers: WIKI_UA });
        if (dl.ok) { fs.writeFileSync(outPath, Buffer.from(await dl.arrayBuffer())); return cands[0].descriptionurl || "commons"; }
      }
    }
  } catch (e) { console.log(`[thumb] commons: ${String(e.message).slice(0, 60)}`); }
  const r = await fetchPhoto({ key: process.env.PEXELS_API_KEY, query, outPath });
  return r ? "pexels" : "";
}
let thumbFile = null;
{
  const personaFile = path.join(photoDir, "persona.jpg");
  try {
    const src = await fetchPersonaImage(topic.personaQuery || topic.personaName || nicheWords[0], topic.personaName || topic.personaQuery, personaFile);
    if (src) console.log(`[thumb] persona (${src})`);
    const thumbDoc = { thumb: { headline: topic.thumbHeadline || fit(topic.title, 22), brand: CH.brand, accent: CH.accent, bg: CH.bg, persona: src ? path.relative(PUB, personaFile).split(path.sep).join("/") : "" } };
    const thumbJson = path.join(PUB, `lf-thumb-${SLUG}.json`);
    fs.writeFileSync(thumbJson, JSON.stringify(thumbDoc, null, 2));
    thumbFile = path.join(EXPL, "out", `lf-thumb-${SLUG}.jpg`);
    const still = spawnSync("npx", ["remotion", "still", "remotion/index.ts", "Thumb", thumbFile, `--props=${thumbJson}`, "--port=3492"], { cwd: EXPL, ...spawnOpts });
    if (still.status !== 0) throw new Error("still failed");
    console.log(`[thumb] ${thumbFile}`);
  } catch (e) {
    console.log(`[warn] thumbnail: ${String(e.message).slice(0, 120)}`);
    thumbFile = null;
  }
}

// ---------- 10. META json (private uploader reads this; no tokens live here) ----------
const chapterBeats = beats.filter((b) => b.layout === "chapter");
function fmtTime(sec) { const m = Math.floor(sec / 60); const s = Math.round(sec % 60); return `${m}:${String(s).padStart(2, "0")}`; }
const chapters = script.chapters.map((c, i) => ({ t: fmtTime((chapterBeats[i]?.startMs || 0) / 1000), title: c.title }));

function etToUTC(y, mo, d, h, mi) {
  let ts = Date.UTC(y, mo - 1, d, h, mi);
  const dtf = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour12: false, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
  for (let k = 0; k < 2; k++) {
    const parts = dtf.formatToParts(new Date(ts));
    const g = (x) => Number(parts.find((q) => q.type === x).value);
    ts += ts - Date.UTC(g("year"), g("month") - 1, g("day"), g("hour") % 24, g("minute"));
  }
  return ts;
}
function nextSlotET(hhmm) {
  const [H, M] = hhmm.split(":").map(Number);
  for (let add = 1; add <= 4; add++) {
    const cand = new Date(Date.now() + add * 86400000);
    const p = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(cand);
    const g = (x) => Number(p.find((q) => q.type === x).value);
    const ts = etToUTC(g("year"), g("month"), g("day"), H, M);
    if (ts > Date.now() + 2 * 3600 * 1000) return new Date(ts).toISOString().replace(/\.\d+Z$/, "Z");
  }
  throw new Error("no slot found");
}
const publishAt = nextSlotET(CH.slotET);

// SEO description: keyword inside the FIRST 125 chars (search snippet), then hook
const hook1 = sentences(script.hook)[0] || script.hook;
const description = [
  `${keyword} explained - ${hook1}`,
  "",
  "CHAPTERS:",
  ...chapters.map((c) => `${c.t} ${c.title}`),
  "",
  `Subscribe to ${CH.brand}.`,
  track ? `Music: ${track.title} - ${track.credit}` : "",
].filter(Boolean).join("\n").slice(0, 4900);

// SRT captions from word timings (closed captions are indexed for search)
const fmtSrt = (ms) => {
  const h = String(Math.floor(ms / 3600000)).padStart(2, "0");
  const m = String(Math.floor((ms % 3600000) / 60000)).padStart(2, "0");
  const sec = String(Math.floor((ms % 60000) / 1000)).padStart(2, "0");
  return `${h}:${m}:${sec},${String(ms % 1000).padStart(3, "0")}`;
};
let srt = "";
let srtIdx = 0;
for (const b of beats) {
  const ws = b.words || [];
  if (!ws.length) continue;
  let cur = null;
  const flush = () => {
    if (!cur || !cur.words.length) return;
    srtIdx += 1;
    srt += `${srtIdx}\n${fmtSrt(b.startMs + cur.t0)} --> ${fmtSrt(b.startMs + cur.t1)}\n${cur.words.join(" ")}\n\n`;
  };
  for (const w of ws) {
    if (!cur) { cur = { t0: w.t0, t1: w.t1, words: [w.w] }; continue; }
    if (cur.words.length >= 8 || w.t1 - cur.t0 >= 3200) { flush(); cur = { t0: w.t0, t1: w.t1, words: [w.w] }; }
    else { cur.t1 = w.t1; cur.words.push(w.w); }
  }
  flush();
}
const srtPath = path.join(EXPL, "out", `lf-srt-${SLUG}.srt`);
fs.writeFileSync(srtPath, srt || "1\n00:00:00,000 --> 00:00:02,000\n " + String.fromCharCode(92) + "n");
const meta = {
  channel: SLUG, brand: CH.brand, title: String(bestTitle || script.title), keyword, description,
  tags: [nicheWords[0], "documentary", "stories", SLUG],
  publishAt, durationMs: totalMs,
  music: track ? { title: track.title, credit: track.credit } : null,
  persona: { query: topic.personaQuery || "", name: topic.personaName || "" },
  videoFile: `lf-${SLUG}.mp4`, thumbFile: `lf-thumb-${SLUG}.jpg`, srtFile: `lf-srt-${SLUG}.srt`,
};
const metaPath = path.join(EXPL, "out", `lf-meta-${SLUG}.json`);
fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));
console.log(`[meta] ${metaPath} (publishAt ${publishAt})`);

// topic history lives HERE (public repo stores only titles, no private data)
history.push({ date: new Date().toISOString().slice(0, 10), title: script.title });
fs.mkdirSync(path.dirname(HIST), { recursive: true });
fs.writeFileSync(HIST, JSON.stringify(history.slice(-200), null, 2));

try {
  const ntopic = process.env.NTFY_TOPIC;
  if (ntopic) {
    await fetch(`https://ntfy.sh/${ntopic}`, { method: "POST", headers: { "Content-Type": "text/plain", Title: `Long-form rendered: ${SLUG}` }, body: `${script.title}\nReady for upload (goes public ${publishAt})` });
  }
} catch { }
console.log("[ALL DONE]");
