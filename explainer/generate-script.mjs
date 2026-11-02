// Stage 1: script + storyboard. Asks the free Gemini tier to write JSM-style
// break/fix narration as structured beats. Hard-validates every beat (beat
// count + words per chapter); any bad chapter falls back to the bundled
// script so the pipeline never dead-ends or comes out under 5 minutes.
// Usage: node generate-script.mjs [--no-llm]
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const OUT = path.resolve(import.meta.dirname, "public/storyboard.beats.json");
const MIN_WORDS_PER_CHAPTER = 190;

import { loadEnv } from '../lib/env.mjs';
loadEnv();

// ---------------------------------------------------------------------------
// Bundled fallback: a complete hand-written beat script (JSM break/fix style).
// ---------------------------------------------------------------------------
const FALLBACK = {
  title: "What Happens When Your App Goes Viral",
  chapters: [
    { n: 1, title: "The Viral Night" },
    { n: 2, title: "Spread the Load" },
    { n: 3, title: "The Memory Trick" },
    { n: 4, title: "What It Costs" },
  ],
  beats: [
    { tpl: "hook", text: "You shipped your app. It works, users are happy, and life is good. And then one morning, the entire internet shows up at your door at the same time.", props: { highlight: "internet" } },
    { tpl: "statement", text: "This is the story of surviving your own success. And every big system you admire was built exactly this way.", props: { highlight: "surviving" } },
    { tpl: "chapter", text: "", props: { n: 1, title: "The Viral Night", total: 4 } },
    { tpl: "server", text: "This is your app on its best day. One server running your code, and one database holding your data. Two machines, working together, simple and clean.", props: { variant: "intro", label: "YOUR APP" } },
    { tpl: "server", text: "Forty users? No problem at all. The server barely notices them. This is the setup every tutorial ends with, and honestly, it goes further than you think.", props: { variant: "traffic", label: "YOUR APP", users: 40000 } },
    { tpl: "statement", text: "Then a creator with two million followers mentions your app. And by sunrise, forty users becomes forty thousand.", props: { highlight: "forty thousand" } },
    { tpl: "overload", text: "Every single one of them hits your one server at the same moment. New requests arrive faster than the old ones can finish. The line just keeps growing.", props: { variant: "cpu", label: "YOUR APP", errors: ["500", "timeout", "503"] } },
    { tpl: "overload", text: "The CPU maxes out. Responses that took fifty milliseconds now take thirty seconds. And then the server simply gives up and stops answering completely.", props: { variant: "cpu", label: "YOUR APP", errors: ["500", "timeout", "503", "crashed"] } },
    { tpl: "panel", text: "", props: { title: "GAME SERVER", status: "OVERLOADED", rows: [ { label: "CPU", value: "98%", pct: 98 }, { label: "RAM", value: "3.8 GB", pct: 74 }, { label: "QUEUE", value: "12,402", pct: 88 } ], note: "CAPACITY: 1 SERVER" } },
    { tpl: "statement", text: "Your app is down. And here is the uncomfortable part: not because the code is bad, but because one physical machine has hard limits.", props: { highlight: "limits" } },
    { tpl: "cost", text: "The obvious fix is the right one: get more servers. But the moment you do, a new question appears, and it has no obvious answer.", props: { items: [{ name: "Add more servers", cost: "which one gets the traffic?" }] } },
    { tpl: "chapter", text: "", props: { n: 2, title: "Spread the Load", total: 4 } },
    { tpl: "balancer", text: "Meet the load balancer. It is one calm door standing in front of all your servers, and its only job is handing each request to whoever is free.", props: { servers: 3, label: "LOAD BALANCER" } },
    { tpl: "balancer", text: "Now three servers share the traffic. Each one works at a comfortable half speed, instead of one machine dying at full speed. That is the whole trick.", props: { servers: 3, label: "LOAD BALANCER" } },
    { tpl: "server", text: "The crash stops. Users get their responses, the error messages disappear, and the app feels alive again. Crisis over, for about an hour.", props: { variant: "traffic", label: "YOUR APP", users: 40000 } },
    { tpl: "code", text: "", props: { lang: "SQL", code: "SELECT * FROM orders WHERE user_id = 42;", result: "1 ROW — 8.5 SECONDS", note: "EVERY REQUEST, EVERY TIME" } },
    { tpl: "database", text: "Because now look closer at what those servers are talking to. Every single request turns into a question for the database. Every single one.", props: { variant: "converge", label: "DATABASE", queries: 300 } },
    { tpl: "overload", text: "Three servers are all asking the same tiny database thousands of questions per minute. The servers are fine. The database is drowning.", props: { variant: "db", label: "DROWNING" } },
    { tpl: "statement", text: "And here is the cruel part: your three servers are sitting there at half load, completely healthy, while one small database does all the work for all of them.", props: { highlight: "cruel part" } },
    { tpl: "statement", text: "Same symptoms, completely different patient. And here is the lesson worth writing down: scaling is a chain, and you are always as slow as your slowest part.", props: { highlight: "slowest part" } },
    { tpl: "cost", text: "The database fix exists, and it is called a read replica. But that is another story. First, watch what your users are actually asking for.", props: { items: [{ name: "Read replicas", cost: "a story for later" }] } },
    { tpl: "chapter", text: "", props: { n: 3, title: "The Memory Trick", total: 4 } },
    { tpl: "cache", text: "So watch what your users actually ask for. The same questions, over and over, thousands of times. So we add a cache, a small fast memory that sits in front.", props: { hitrate: 92 } },
    { tpl: "cache", text: "Now nine out of ten answers come straight from memory. The database barely gets touched, pages load instantly, and the whole system breathes again.", props: { hitrate: 92 } },
    { tpl: "stale", text: "But cached data gets old. You change the price from forty-nine dollars to thirty-nine, push the update, and users are still seeing the old price.", props: { item: "PRICE", old: "$49", neu: "$39" } },
    { tpl: "stale", text: "That is real money leaving your checkout page, and real broken trust. And this gap has a name every engineer should know: stale cache.", props: { item: "PRICE", old: "$49", neu: "$39" } },
    { tpl: "statement", text: "So you make a decision, on purpose, about which data is allowed to be a few minutes old, and which data must always be perfectly fresh.", props: { highlight: "on purpose" } },
    { tpl: "statement", text: "Fresh when it matters, forgiving when it does not. That single decision is what separates apps that feel broken from apps that feel instant.", props: { highlight: "single decision" } },
    { tpl: "cost", text: "Cache invalidation is one of the famously hard problems in computer science, and now you know why. But we are not done with the bill yet.", props: { items: [{ name: "Cache invalidation", cost: "famously hard" }] } },
    { tpl: "chapter", text: "", props: { n: 4, title: "What It Costs", total: 4 } },
    { tpl: "cost", text: "Nothing you did today was free. Every single fix bought you speed and stability, and every one of them sends you a bill that arrives later.", props: { items: [{ name: "Load balancer", cost: "one more moving part" }, { name: "More servers", cost: "real money every month" }, { name: "Cache", cost: "data can go stale" }] } },
    { tpl: "cost", text: "The load balancer itself can fail, and now it takes everything down with it. Servers cost real money whether traffic comes or not. And a cache can quietly lie to your users.", props: { items: [{ name: "Load balancer", cost: "single point of failure" }, { name: "More servers", cost: "$$ every month" }, { name: "Cache", cost: "can serve old data" }] } },
    { tpl: "panel", text: "", props: { title: "MONTHLY BILL", status: "DUE", rows: [ { label: "SERVERS", value: "$240/mo", pct: 70 }, { label: "BANDWIDTH", value: "$180/mo", pct: 52 }, { label: "CACHE", value: "$60/mo", pct: 30 } ], note: "THE METER NEVER STOPS" } },
    { tpl: "statement", text: "This is what senior engineers actually know that beginners do not: architecture is not a list of buzzwords. It is a list of trade-offs you chose.", props: { highlight: "trade-offs" } },
    { tpl: "statement", text: "And here is the part nobody puts in the tutorial: the bill never stops arriving. Scaling is not a one-time purchase, it is a subscription.", props: { highlight: "subscription" } },
    { tpl: "outro", text: "One server became a real system. Not all at once, and not by guessing, but every time something broke, you fixed exactly one thing and understood why.", props: {} },
    { tpl: "outro", text: "That is system design. Not scary words on day one, but answers you earned one crash at a time. Now go break something on purpose.", props: {} },
  ],
};

// ---------------------------------------------------------------------------
// LLM generation: one call per chapter, strict JSON, validated hard.
// ---------------------------------------------------------------------------
const TPL_RULES = `Templates (pick per beat) — VARY the visuals: never use the same template+variant twice in a row when the situation changed:
- "hook": opening question. props:{highlight} (one word of the text to color)
- "statement": big single-sentence emphasis. props:{highlight}
- "chapter": chapter card. text:"", props:{n:int, title, total:4}
- "server": calm app. variants: "intro" (users->server->database chain) | "traffic" (crowd arrives, user counter climbs). props:{variant, label?, users?}
- "overload": crash. variants: "cpu" (users flood one server, error badges) | "db" (queries pile into a drowning database). props:{variant, label?, errors?:[2-4 short strings]}
- "balancer": fix. props:{servers:2-4, label:"LOAD BALANCER"}
- "database": db pressure. variants: "single" (one flood line) | "converge" (three servers converge). props:{variant, label:"DATABASE"}
- "cache": fix. props:{hitrate:int 80-97}
- "stale": cache bug. props:{item:"PRICE", old:"$49", neu:"$39"}
- "cost": bill reveal. props:{items:[{name, cost}] 1-3 items, cost = 2-5 words}
- "panel": dark ops-monitor with climbing stat bars. text can be "" (visual carries it) or 1 short line. props:{title, status, rows:[{label, value, pct:int 0-100}] 3 rows, note?}
- "code": code/query panel with a slow highlighted result. text can be "". props:{lang:"SQL", code, result, note?}
- "outro": recap. props:{}
Rules:
- text = 2-3 conversational sentences, 18-34 words, spoken style, concrete numbers welcome.
  No markdown, no emoji, no stage directions, never mention being an AI.
- Chapter card, panel and code beats may have text:"" (panel/code may also carry 1 short spoken line).
- Follow the given beat plan EXACTLY (same templates, same variants, same order).
- Each chapter must have 9-13 beats total and at least 190 words of narration.
- Always set variant for server / overload / database beats.`;

async function geminiCall(model, prompt, timeoutMs = 90000) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("no GEMINI_API_KEY");
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.8, maxOutputTokens: 8192 },
        }),
        signal: ctrl.signal,
      }
    );
    if (!r.ok) throw new Error(`HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`);
    const j = await r.json();
    return (j.candidates?.[0]?.content?.parts || []).map((p) => p.text || "").join("");
  } finally {
    clearTimeout(t);
  }
}

function extractJson(s) {
  const m = s.match(/\{[\s\S]*\}/);
  if (!m) throw new Error("no JSON object in output");
  return JSON.parse(m[0]);
}

function validateBeat(b, chapterN) {
  const ok = ["hook", "statement", "chapter", "server", "overload", "balancer", "database", "cache", "stale", "cost", "panel", "code", "outro"];
  if (!b || !ok.includes(b.tpl)) return false;
  const p = b.props || {};
  const variantOk = (list) => !p.variant || list.includes(p.variant);
  if (b.tpl === "chapter") {
    return p.n === chapterN && typeof p.title === "string" && p.title.length > 0;
  }
  if (b.tpl === "cost") {
    return Array.isArray(p.items) && p.items.length >= 1 && p.items.length <= 3 &&
      p.items.every((i) => i && typeof i.name === "string" && typeof i.cost === "string");
  }
  if (b.tpl === "panel") {
    return typeof p.title === "string" && p.title.length > 0 &&
      Array.isArray(p.rows) && p.rows.length >= 2 && p.rows.length <= 4 &&
      p.rows.every((r) => r && typeof r.label === "string" && typeof r.value === "string" && Number.isFinite(+r.pct) && +r.pct >= 0 && +r.pct <= 100);
  }
  if (b.tpl === "code") {
    return typeof p.code === "string" && p.code.length >= 8 && p.code.length <= 140 &&
      typeof p.result === "string" && p.result.length >= 3 && p.result.length <= 60;
  }
  if (b.tpl === "outro") return true;
  if (b.tpl === "server" && !variantOk(["intro", "traffic"])) return false;
  if (b.tpl === "overload" && !variantOk(["cpu", "db"])) return false;
  if (b.tpl === "database" && !variantOk(["single", "converge"])) return false;
  if (typeof b.text !== "string" || b.text.length < 40 || b.text.length > 260) return false;
  if (b.tpl === "statement" && (typeof p.highlight !== "string" || !p.highlight)) return false;
  return true;
}

function chapterWords(beats) {
  return beats.reduce((a, b) => a + (b.text || "").split(/\s+/).filter(Boolean).length, 0);
}

const CHAPTER_PLANS = [
  {
    n: 1, title: "The Viral Night",
    plan: `Beats (10-11): hook (app works, then everyone arrives at once) -> statement (this is the story of surviving success) -> chapter card -> server variant "intro" (calm: one server AND one database working together) -> server variant "traffic" (40 users is easy, then a creator mentions you; counter climbs toward 40,000) -> statement (forty becomes forty thousand overnight) -> overload variant "cpu" (all users hit one server at once, request line grows, 500s and timeouts) -> panel (title "GAME SERVER", status "OVERLOADED", rows: CPU 98%, RAM 3.8 GB, QUEUE 12,402 — the machine giving up live) -> statement (down not because code is bad, one machine has limits) -> cost (obvious fix: more servers; new question: who gets which request?).`,
  },
  {
    n: 2, title: "Spread the Load",
    plan: `Beats (10-11): chapter card -> balancer (introduce load balancer: one calm door handing out requests) -> balancer (3 servers split traffic, all at half speed) -> server variant "traffic" (crash stops, users get responses, crisis over for an hour) -> code (lang "SQL", code "SELECT * FROM orders WHERE user_id = 42;", result "1 ROW — 8.5 SECONDS", note "EVERY REQUEST, EVERY TIME" — look under the hood: every request becomes a database question) -> database variant "converge" (three servers converge on one small database, thousands of questions per minute) -> overload variant "db" (servers fine, database drowning, slow queries and locks, query time 0.05s to 8.5s) -> statement (same symptoms, different patient; scaling is a chain) -> statement (you are always as slow as your slowest part) -> cost (database upgrade path: replicas, but that is another story).`,
  },
  {
    n: 3, title: "The Memory Trick",
    plan: `Beats (9-11): chapter card -> cache (users repeat the same questions; add small fast memory in front of DB) -> cache (9 of 10 answers from memory, DB barely touched, feels instant) -> stale (cache gets old: price changed to $39, users still see $49) -> stale (real money lost at checkout, broken trust; name: stale cache) -> statement (you choose on purpose which data may be old, which must be fresh) -> statement (cart prices fresh, product pages can lag minutes) -> cost (cache invalidation is one of the famously hard problems).`,
  },
  {
    n: 4, title: "What It Costs",
    plan: `Beats (9-10): chapter card -> cost (nothing was free; every fix sends a bill that arrives later) -> cost (balancer = single point of failure; servers = monthly money; cache = can lie to users) -> panel (title "MONTHLY BILL", status "DUE", rows: SERVERS $240/mo, BANDWIDTH $180/mo, CACHE $60/mo — the meter never stops) -> statement (architecture is not buzzwords, it is trade-offs you chose) -> statement (senior engineers read systems as chains of trade-offs) -> outro (one server became a system, one fix per crash) -> outro (system design = answers earned one crash at a time) -> outro (now go break something on purpose).`,
  },
];

async function generateChapter(ch) {
  const prompt = `You are writing the narration for an animated system-design explainer video titled
"${FALLBACK.title}". Chapter ${ch.n} of 4: "${ch.title}".

${TPL_RULES}

Beat plan for this chapter:
${ch.plan}

Return ONLY a JSON object: {"beats":[{tpl, text, props}, ...]} — in the exact order of the plan,
with the chapter card (tpl "chapter", props {n:${ch.n}, title:"${ch.title}", total:4}) placed exactly
where the plan says.`;

  for (const model of ["gemini-3.5-flash-lite", "gemini-3.5-flash"]) {
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const raw = await geminiCall(model, prompt);
        const j = extractJson(raw);
        const beats = j.beats;
        if (!Array.isArray(beats) || beats.length < 9 || beats.length > 15) throw new Error("bad beat count " + beats?.length);
        if (!beats.every((b) => validateBeat(b, ch.n))) throw new Error("beat validation failed");
        const words = chapterWords(beats);
        if (words < MIN_WORDS_PER_CHAPTER) throw new Error(`chapter too short: ${words} words < ${MIN_WORDS_PER_CHAPTER}`);
        return { beats, model, words };
      } catch (e) {
        console.log(`  [llm] ${model} attempt ${attempt} failed: ${String(e.message).slice(0, 120)}`);
      }
    }
  }
  return null;
}

// #67: group fallback beats by chapter. Beats BEFORE the first chapter marker
// (the hook + opening statement — no props.n) belong to chapter 1: the old
// `cur = null` start keyed them under null, which the per-chapter fallback
// never fetched — all-chapters-fail videos started cold on a chapter card.
// Pure + exported for tests.
export function groupFallbackBeats(beats, firstChapterN = 1) {
  const byChapter = new Map();
  let cur = firstChapterN;
  for (const b of beats) {
    if (b.tpl === "chapter") cur = b.props.n;
    if (!byChapter.has(cur)) byChapter.set(cur, []);
    byChapter.get(cur).push(b);
  }
  return byChapter;
}

async function main() {
  const noLlm = process.argv.includes("--no-llm");
  const out = { title: FALLBACK.title, chapters: FALLBACK.chapters, beats: [] };
  let usedLlm = 0, usedFb = 0;

  const fbByChapter = groupFallbackBeats(FALLBACK.beats, CHAPTER_PLANS[0].n);

  if (!noLlm) {
    for (const ch of CHAPTER_PLANS) {
      console.log(`[script] chapter ${ch.n}: "${ch.title}"`);
      const res = await generateChapter(ch);
      if (res) {
        out.beats.push(...res.beats);
        usedLlm++;
        console.log(`  -> OK via ${res.model} (${res.beats.length} beats, ${res.words} words)`);
      } else {
        out.beats.push(...fbByChapter.get(ch.n));
        usedFb++;
        console.log("  -> fallback script used");
      }
    }
  } else {
    out.beats = FALLBACK.beats;
    usedFb = 4;
  }

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(out, null, 2));
  const words = out.beats.reduce((a, b) => a + (b.text || "").split(/\s+/).filter(Boolean).length, 0);
  console.log(`[script] wrote ${OUT}`);
  console.log(`[script] beats=${out.beats.length} words=${words} (~${(words / 150).toFixed(1)} min narration) llmChapters=${usedLlm} fallbackChapters=${usedFb}`);
  // gate on projected VIDEO duration: narration + silent chapter cards + panel/code visual beats + breathing pads
  const silent = out.beats.filter((b) => !(b.text || "").trim());
  const silentSecs = silent.reduce((a, b) => a + (b.tpl === "panel" || b.tpl === "code" ? 9 : 3.2), 0);
  const padSecs = out.beats.length * 0.42;
  const projMin = (words / 150) + (silentSecs + padSecs + 1.2) / 60;
  console.log(`[script] projected duration ~${projMin.toFixed(2)} min`);
  if (projMin < 5.0) {
    console.error(`[script] FAIL: projected only ${projMin.toFixed(2)} min — target is 5+ min. Re-run or fix.`);
    process.exit(2);
  }
}

// Run only as a CLI — importing the module (tests) must not execute the
// script build.
import { pathToFileURL } from "node:url";
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((e) => {
    console.error("[script] FATAL", e);
    process.exit(1);
  });
}
