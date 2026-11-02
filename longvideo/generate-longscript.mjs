// LONG-FORM script engine — dedicated to long videos only (own keys, own chain).
// Chain: Gemini flash-latest -> Groq gpt-oss-120b -> Groq qwen3.6-27b.
// Usage: node generate-longscript.mjs --topic "..." [--minutes 10] [--brand investors-compass]
// Output: longvideo/out/<slug>/script.json + narration.txt
import fs from "node:fs";
import path from "node:path";

const DIR = import.meta.dirname;
const ROOT = path.resolve(DIR, "..");
let envLines = [];
try { envLines = fs.readFileSync(path.join(ROOT, ".env"), "utf8").split("\n"); } catch { /* CI injects secrets */ }
for (const line of envLines) {
  const m = line.match(/^([A-Z_0-9]+)=(.*)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
}

const args = process.argv.slice(2);
const argOf = (name, def) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : def;
};
const TOPIC = argOf("--topic", "How One Man Turned the 2008 Crash Into a $37 Billion Win");
const MINUTES = Math.min(Math.max(parseInt(argOf("--minutes", "5"), 10) || 5, 4), 15);
const BRAND = argOf("--brand", "investors-compass");
const MUSIC = argOf("--music", "quiet-night.mp3");
const WORDS_TOTAL = Math.round(MINUTES * 150);          // ~150 wpm narration
const CHAPTERS = Math.max(4, Math.round(MINUTES / 1.1)); // ~65-75s chapters for 5 min = 4-5 chapters
const WORDS_PER_CH = Math.round(WORDS_TOTAL / CHAPTERS);

const slug = TOPIC.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
const OUT_DIR = path.join(DIR, "out", slug);
fs.mkdirSync(OUT_DIR, { recursive: true });

// ---------------------------------------------------------------- providers
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function gemini(prompt, maxTokens) {
  const r = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-goog-api-key": process.env.LONGVIDEO_GEMINI_API_KEY },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.85, maxOutputTokens: maxTokens } }),
      signal: AbortSignal.timeout(120000),
    }
  );
  if (!r.ok) throw new Error(`gemini HTTP ${r.status}`);
  const j = await r.json();
  const text = (j.candidates?.[0]?.content?.parts || []).map((p) => p.text || "").join("");
  if (!text.trim()) throw new Error("gemini empty");
  return text;
}

async function groq(model, prompt, maxTokens) {
  const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.LONGVIDEO_GROQ_API_KEY}`, "User-Agent": "longvideo/1.0" },
    body: JSON.stringify({ model, messages: [{ role: "user", content: prompt }], temperature: 0.85, max_tokens: maxTokens }),
    signal: AbortSignal.timeout(120000),
  });
  if (!r.ok) throw new Error(`groq/${model} HTTP ${r.status}`);
  const j = await r.json();
  let text = j.choices?.[0]?.message?.content || "";
  text = text.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
  if (!text) throw new Error(`groq/${model} empty`);
  return text;
}

// fallback chain per call
async function brain(prompt, maxTokens = 4096) {
  const chain = [];
  if (process.env.LONGVIDEO_GROQ_API_KEY) {
    chain.push(["groq-gpt-oss-120b", () => groq("openai/gpt-oss-120b", prompt, maxTokens)]);
    chain.push(["groq-qwen3.8-27b", () => groq("qwen/qwen3.8-27b", prompt, maxTokens)]);
  }
  if (process.env.LONGVIDEO_GEMINI_API_KEY) {
    chain.push(["gemini-flash-latest", () => gemini(prompt, maxTokens)]);
  }
  if (!chain.length) throw new Error("No LLM keys configured (need LONGVIDEO_GROQ_API_KEY or LONGVIDEO_GEMINI_API_KEY)");

  let lastErr;
  for (const [name, fn] of chain) {
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const out = await fn();
        console.log(`  [brain] ${name} ok`);
        return out;
      } catch (e) {
        lastErr = e;
        console.log(`  [brain] ${name} attempt ${attempt} failed: ${String(e.message).slice(0, 90)}`);
        await sleep(1500 * attempt);
      }
    }
  }
  throw lastErr || new Error("all providers failed");
}

function extractJson(s) {
  const m = s.match(/\{[\s\S]*\}/);
  if (!m) throw new Error("no JSON in output");
  return JSON.parse(m[0]);
}

const HOUSE_STYLE = `You write YouTube documentary scripts in the style of "How Money Works" and "MagnatesMedia":
- Conversational, confident, slightly cynical narrator. Short sentences. No fluff.
- Concrete numbers, names, and dates wherever possible (real, well-known facts only — never invent statistics).
- Every chapter: start by paying the previous chapter's open loop, deliver the insight, end with a new open loop into the next chapter.
- No markdown, no emoji, no stage directions, no "welcome back", no "in this video". Speak straight into the story.`;

async function generateOutline() {
  const prompt = `${HOUSE_STYLE}

Write the outline for a ${MINUTES}-minute YouTube documentary case-study video.
Topic: "${TOPIC}"
Brand audience: ${BRAND} (money / investing psychology viewers).

Return ONLY JSON:
{
 "title": "curiosity-gap title, max 70 chars",
 "hook": "0:00-0:20 cold-open narration, 45-60 words, shocking fact or question, no greetings",
 "promise": "0:20-0:40 anti-hook + what viewer will know by the end, 35-50 words",
 "chapters": [
   { "title": "chapter title", "promise": "what this chapter delivers, 1 sentence", "closingLoop": "open question that pulls to the next chapter, 1 sentence" }
 ] // exactly ${CHAPTERS} chapters, in order, escalating stakes
}`;
  console.log("[1/3] outline…");
  const j = extractJson(await brain(prompt, 6000));
  if (!Array.isArray(j.chapters) || j.chapters.length < 4) throw new Error("bad outline");
  return j;
}

async function generateChapter(i, ch, outline) {
  const prev = i === 0 ? outline.promise : outline.chapters[i - 1].closingLoop;
  const next = i === outline.chapters.length - 1 ? null : ch.closingLoop;
  const prompt = `${HOUSE_STYLE}

Write chapter ${i + 1}/${outline.chapters.length} of the documentary "${outline.title}".
Chapter: "${ch.title}" — must deliver: ${ch.promise}
${prev ? `It must open by paying this loop from before: "${prev}"` : "It follows the cold open and promise directly."}
${next ? `It must end with this open loop (next chapter): "${next}"` : "It is the final chapter: land the payoff, then close with a 1-sentence takeaway that loops to the channel's bigger theme."}

Length: ${WORDS_PER_CH - 40} to ${WORDS_PER_CH + 40} words. Output ONLY the spoken narration text, nothing else.`;
  const text = (await brain(prompt, 4096)).replace(/^["']|["']$/g, "").trim();
  const words = text.split(/\s+/).filter(Boolean).length;
  if (words < WORDS_PER_CH * 0.55) throw new Error(`chapter too short: ${words} words`);
  return { title: ch.title, narration: text, words };
}

async function main() {
  const outline = await generateOutline();
  console.log(`[1/3] title: "${outline.title}" | ${outline.chapters.length} chapters`);

  const chapters = [];
  for (let i = 0; i < outline.chapters.length; i++) {
    console.log(`[2/3] chapter ${i + 1}/${outline.chapters.length}: ${outline.chapters[i].title}`);
    for (let a = 0; a < 3; a++) {
      try { chapters.push(await generateChapter(i, outline.chapters[i], outline)); break; }
      catch (e) {
        console.log(`  [ch] attempt ${a + 1} failed: ${String(e.message).slice(0, 90)}`);
        if (a === 2) throw new Error(`chapter ${i + 1} unrecoverable`);
        await sleep(2000);
      }
    }
  }

  const totalWords = chapters.reduce((a, c) => a + c.words, 0);
  const estMinutes = totalWords / 150;
  const doc = {
    topic: TOPIC, brand: BRAND, minutes: MINUTES, musicTrack: MUSIC, generatedAt: new Date().toISOString(),
    title: outline.title, hook: outline.hook, promise: outline.promise, chapters,
    stats: { totalWords, estMinutes: +estMinutes.toFixed(1), providers: "groq-gpt-oss-120b -> groq-qwen3.8-27b" },
  };
  fs.writeFileSync(path.join(OUT_DIR, "script.json"), JSON.stringify(doc, null, 2));
  const txt = [`TITLE: ${outline.title}`, "", `HOOK: ${outline.hook}`, "", `PROMISE: ${outline.promise}`, "",
    ...chapters.map((c, i) => `--- CHAPTER ${i + 1}: ${c.title} (${c.words}w) ---\n${c.narration}\n`)];
  fs.writeFileSync(path.join(OUT_DIR, "narration.txt"), txt.join("\n"));
  console.log(`\n[3/3] DONE: ${totalWords} words ≈ ${estMinutes.toFixed(1)} min -> ${OUT_DIR}`);
  if (estMinutes < MINUTES * 0.8) { console.error(`[gate] too short vs target ${MINUTES} min`); process.exit(2); }
}

main().catch((e) => { console.error("[longscript] FATAL:", e.message); process.exit(1); });
