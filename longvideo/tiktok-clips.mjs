// TikTok clip engine for QuoteQuarry long-forms.
// Modes:
//   node tiktok-clips.mjs ensure-queue   -- finds the newest successful long-form
//       render run, downloads its video, cuts it into ~1-minute sentence-aligned
//       parts, uploads parts as GitHub Release assets, writes the posting queue.
//   node tiktok-clips.mjs post-next      -- PAUSED 10-17: Zernio removed; publishing moves to the own TikTok app (#91/#92 comment)
//       (1 part per run — the daily cron calls this up to 4x/day).
// Needs: GITHUB_TOKEN (or GITHUB_PAT), ffmpeg on PATH.
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const DIR = import.meta.dirname;
const ROOT = path.resolve(DIR, "..");
// 10-09: longforms render INSIDE this repo now (channel workflows Phase 5,
// quarry-render is retired). The doc render is uploaded as artifacts by
// channel-quotequarry.yml on docDay (Tue).
const REPO = process.env.GH_REPO || "muzzamilhassan/automation";
const SRC_WORKFLOW = process.env.TT_SRC_WORKFLOW || "channel-quotequarry.yml";
const SLUG = "quotequarry";
const BRAND = "QUOTE QUARRY";
const TAGS = "#stoicism #wisdom #mindset #discipline #fyp";
const STATE = path.join(ROOT, "state", "tiktok-clips.json");
const FFMPEG = process.env.FFMPEG_PATH || "ffmpeg";
const MODE = process.argv[2] || "";

// .env load MUST run before TOK is read — local runs take GITHUB_PAT +
// ZERNIO_API_KEY from .env; CI injects them as real env vars.
let envLines = [];
try { envLines = fs.readFileSync(path.join(ROOT, ".env"), "utf8").split("\n"); } catch { }
for (const line of envLines) {
  const m = line.match(/^([A-Z_0-9]+)=(.*)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
}
const TOK = process.env.GITHUB_TOKEN || process.env.GITHUB_PAT || "";

const ghApi = async (pathname) => {
  const r = await fetch(`https://api.github.com/repos/${REPO}/${pathname}`, {
    headers: { Authorization: `Bearer ${TOK}`, Accept: "application/vnd.github+json", "User-Agent": "quarry-tiktok" },
  });
  if (!r.ok) throw new Error(`gh api ${pathname}: HTTP ${r.status}`);
  return r.json();
};
const ghDelete = async (url) => {
  const r = await fetch(url, { headers: { Authorization: `Bearer ${TOK}`, "User-Agent": "quarry-tiktok" } }).catch(() => null);
  try { if (r) await r.arrayBuffer(); } catch { }
};
const loadState = () => { try { return JSON.parse(fs.readFileSync(STATE, "utf8")); } catch { return {}; } };
const saveState = (s) => { fs.mkdirSync(path.dirname(STATE), { recursive: true }); fs.writeFileSync(STATE, JSON.stringify(s, null, 2)); };

// ---------- parse SRT into cue times + sentence boundaries ----------
function parseSrt(text) {
  const cues = [];
  const blocks = text.replace(/\r/g, "").split("\n\n");
  const toMs = (t) => {
    const m = t.trim().match(/(\d+):(\d+):(\d+)[,.](\d+)/);
    return m ? (+m[1]) * 3600000 + (+m[2]) * 60000 + (+m[3]) * 1000 + (+m[4]) : null;
  };
  for (const b of blocks) {
    const lines = b.split("\n").filter(Boolean);
    const tl = lines.find((l) => l.includes("-->"));
    if (!tl) continue;
    const [a, z] = tl.split("-->");
    const t0 = toMs(a), t1 = toMs(z);
    const text = lines.slice(lines.indexOf(tl) + 1).join(" ").replace(/<[^>]+>/g, "").trim();
    if (t0 != null && t1 != null && text) cues.push({ t0, t1, text });
  }
  return cues;
}

// cut points at sentence ends nearest under each 58s step
function cutPoints(cues, totalMs, stepMs = 58000) {
  const ends = cues.map((c) => c.t1).filter((t) => t > 5000);
  const points = [0];
  let target = stepMs;
  while (target < totalMs - 15000) {
    const cands = ends.filter((t) => t > points[points.length - 1] + 20000 && t <= target);
    points.push(cands.length ? cands[cands.length - 1] : target);
    target = points[points.length - 1] + stepMs;
  }
  points.push(totalMs);
  return points;
}

// ---------- ensure-queue: clip newest long-form into 1-min parts ----------
async function ensureQueue() {
  const state = loadState();
  const runs = await ghApi(`actions/workflows/${SRC_WORKFLOW}/runs?status=success&per_page=14`);
  let chosen = null;
  for (const run of runs.workflow_runs || []) {
    if (String(run.id) === String(state.lastRunId)) break;
    const arts = (await ghApi(`actions/runs/${run.id}/artifacts`)).artifacts || [];
    const vid = arts.find((a) => a.name === `lf-${SLUG}` && !a.expired);
    if (!vid) continue;
    const done = state.doneRuns?.includes(String(run.id));
    if (done) { console.log(`[queue] run ${run.id} already clipped`); break; }
    chosen = { runId: String(run.id), vid, metaArt: arts.find((a) => a.name === `lf-meta-${SLUG}` && !a.expired), srtArt: arts.find((a) => a.name === `lf-srt-${SLUG}` && !a.expired) };
    break;
  }
  if (!chosen) { console.log("[queue] nothing new to clip"); return; }
  console.log(`[queue] clipping run ${chosen.runId}`);

  const tmp = path.join(ROOT, "tt-tmp");
  fs.rmSync(tmp, { recursive: true, force: true });
  fs.mkdirSync(tmp, { recursive: true });

  // download meta + srt (small) for caption + cut points
  for (const a of [chosen.metaArt, chosen.srtArt]) {
    if (!a) continue;
    const r = await fetch(a.archive_download_url, { headers: { Authorization: `Bearer ${TOK}`, Accept: "application/vnd.github+json", "User-Agent": "quarry-tiktok" } });
    const zip = Buffer.from(await r.arrayBuffer());
    const zpath = path.join(tmp, a.name + ".zip");
    fs.writeFileSync(zpath, zip);
    spawnSync("unzip", ["-o", zpath, "-d", tmp], { stdio: "ignore" });
  }
  const metaPath = path.join(tmp, `lf-meta-${SLUG}.json`);
  const srtPath = path.join(tmp, `lf-srt-${SLUG}.srt`);
  const meta = fs.existsSync(metaPath) ? JSON.parse(fs.readFileSync(metaPath, "utf8")) : { title: "Quote Quarry story", keyword: "stoic wisdom" };
  const cues = fs.existsSync(srtPath) ? parseSrt(fs.readFileSync(srtPath, "utf8")) : [];

  // download the video artifact (zip) and extract the mp4
  const r = await fetch(chosen.vid.archive_download_url, { headers: { Authorization: `Bearer ${TOK}`, Accept: "application/vnd.github+json", "User-Agent": "quarry-tiktok" } });
  const vzip = path.join(tmp, "v.zip");
  fs.writeFileSync(vzip, Buffer.from(await r.arrayBuffer()));
  const ex = spawnSync("unzip", ["-o", vzip, `-d`, tmp]);
  if (ex.status !== 0) throw new Error("video zip extract failed");
  const videoFile = path.join(tmp, `lf-${SLUG}.mp4`);
  if (!fs.existsSync(videoFile)) throw new Error("video mp4 missing after extract");

  // probe duration
  const durR = spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", videoFile], { encoding: "utf8" });
  const totalMs = Math.round(parseFloat(String(durR.stdout).trim()) * 1000);
  if (!Number.isFinite(totalMs) || totalMs < 60000) throw new Error("video too short for clipping");

  // cut points at sentence ends near each minute
  const points = cutPoints(cues, totalMs);
  const parts = [];
  for (let i = 0; i < points.length - 1; i++) {
    const start = points[i] / 1000, dur = (points[i + 1] - points[i]) / 1000;
    if (dur < 20) continue; // skip tiny tail fragments
    const out = path.join(tmp, `part-${String(parts.length + 1).padStart(2, "0")}.mp4`);
    const enc = spawnSync(FFMPEG, ["-y", "-v", "error", "-ss", String(start), "-i", videoFile, "-t", String(dur), "-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-c:a", "aac", "-b:a", "128k", out], { stdio: "inherit" });
    if (enc.status !== 0 || !fs.existsSync(out) || fs.statSync(out).size < 100000) { console.log(`[warn] clip ${i} encode failed`); continue; }
    parts.push({ file: out, part: parts.length + 1, start: Math.round(start) });
  }
  if (!parts.length) throw new Error("no clips encoded");
  console.log(`[clips] ${parts.length} parts created`);

  // release the parts
  const tag = `tt-clips-${chosen.runId}`;
  let rel = null;
  try { rel = await ghApi(`releases/tags/${tag}`); } catch { }
  if (!rel || !rel.id) {
    const cr = await fetch(`https://api.github.com/repos/${REPO}/releases`, {
      method: "POST",
      headers: { Authorization: `Bearer ${TOK}`, "Content-Type": "application/json", "User-Agent": "quarry-tiktok" },
      body: JSON.stringify({ tag_name: tag, name: `TikTok clips ${tag.slice(9)}`, body: "1-minute parts of the long-form for TikTok posting." }),
    });
    rel = cr.ok ? await cr.json() : await ghApi(`releases/tags/${tag}`);
  }
  const queue = [];
  for (const p of parts) {
    const name = path.basename(p.file);
    const existing = (rel.assets || []).find((a) => a.name === name);
    if (existing) { queue.push({ part: p.part, asset: existing.name, url: existing.url, start: p.start }); continue; }
    const up = await fetch(`https://uploads.github.com/repos/${REPO}/releases/${rel.id}/assets?name=${name}`, {
      method: "POST", headers: { Authorization: `Bearer ${TOK}`, "User-Agent": "quarry-tiktok", "Content-Type": "application/octet-stream" }, body: fs.readFileSync(p.file),
    });
    if (!up.ok) { console.log(`[warn] asset upload failed for ${name}`); continue; }
    const asset = await up.json();
    queue.push({ part: p.part, asset: asset.name, url: asset.url, start: p.start });
  }

  state.lastRunId = chosen.runId;
  state.lastArtifactId = chosen.vid.id;
  state.doneRuns = [...(state.doneRuns || []), String(chosen.runId)].slice(-12);
  state.queue = { title: meta.title || "", keyword: meta.keyword || "stoic wisdom", total: queue.length, parts: queue };
  saveState(state);
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(`[queue] ready: ${queue.length} parts from run ${chosen.runId}`);
}

// ---------- post-next: post one unposted part ----------
async function postNext() {
  // PAUSED 10-17: Zernio publisher removed (owner decision — TikTok moves to
  // the own developer app once approved, direct-post flow already proven in
  // quarry-studio-server.mjs). Staged clips in tt-tmp/ + state are preserved.
  console.log('[tiktok] publishing paused — own TikTok app pending approval (issue #89)');
}

if (MODE === "ensure-queue") await ensureQueue();
else if (MODE === "post-next") await postNext();
else console.log("usage: node tiktok-clips.mjs ensure-queue | post-next");
