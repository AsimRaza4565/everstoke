// HyperFrames job bridge for Quarry Studio.
// Jobs live in the automation repo under hf-out/<id>/status.json (queued -> done|failed).
// Rendering runs on GitHub Actions (hyperframes-create.yml), results commit back to hf-out/.
import { ENV } from './data.mjs';

const GITHUB_REPO = ENV.GITHUB_REPO || 'muzzamilhassan/automation';
const GH_TOKEN = ENV.GITHUB_TOKEN || ENV.GITHUB_PAT || '';
const GH_HEADERS = {
  Authorization: `Bearer ${GH_TOKEN}`,
  Accept: 'application/vnd.github+json',
  'User-Agent': 'quarry-studio',
  'X-GitHub-Api-Version': '2022-11-28',
  'Content-Type': 'application/json',
};

export const DNA_STYLES = [
  { id: 'luxury', name: 'Old Money Luxury', desc: 'Serif elegance, gold on ink, slow reveals' },
  { id: 'neon-tech', name: 'Neon Tech', desc: 'Grid lines, cyan glow, fast snaps' },
  { id: 'vox-paper', name: 'Editorial Paper', desc: 'Magazine layout, bold ink on warm paper' },
  { id: 'cinematic', name: 'Cinematic Trailer', desc: 'Huge caps, letterbox, movie gravity' },
];

// genre ids mirror hyperframes/dna.mjs GENRES (inlined: Vercel deploys studio/ only)
const GENRES = Object.fromEntries(['documentary', 'listicle', 'tutorial', 'news', 'fun'].map((id) => [id, true]));
export const GENRE_LIST = [
  { id: 'documentary', name: 'Documentary' },
  { id: 'listicle', name: 'Listicle' },
  { id: 'tutorial', name: 'Tutorial' },
  { id: 'news', name: 'News Recap' },
  { id: 'fun', name: 'Fun / Social' },
];

export const VOICES = [
  { id: 'en-US-AndrewNeural', name: 'Andrew (US, deep male)' },
  { id: 'en-US-BrianNeural', name: 'Brian (US, male)' },
  { id: 'en-US-EmmaNeural', name: 'Emma (US, female)' },
  { id: 'en-US-AriaNeural', name: 'Aria (US, female)' },
  { id: 'en-GB-RyanNeural', name: 'Ryan (UK, male)' },
];

export function ghReady() {
  return Boolean(GH_TOKEN);
}

async function ghPutFile(path, contentJson, message) {
  // create-or-update; fetch existing sha first (404 = create)
  let sha;
  const get = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/contents/${path}?ref=main`, { headers: { ...GH_HEADERS, Accept: 'application/vnd.github+json' } });
  if (get.ok) sha = (await get.json()).sha;
  const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/contents/${path}`, {
    method: 'PUT', headers: GH_HEADERS,
    body: JSON.stringify({ message, content: Buffer.from(contentJson).toString('base64'), sha, branch: 'main' }),
  });
  if (!res.ok) throw new Error(`github put ${res.status}: ${(await res.text()).slice(0, 140)}`);
  return res.json();
}

export async function createJob({ topic, dna, brand, subline, voice, beatCount, slug }) {
  if (!ghReady()) throw new Error('no GITHUB_TOKEN on the server — cannot queue renders');
  const id = `${(slug || 'video').replace(/[^a-z0-9-]/gi, '').slice(0, 24) || 'video'}-${Date.now().toString(36)}`;
  const brief = {
    slug: id, topic: String(topic).slice(0, 200), dna, brand: String(brand).slice(0, 60),
    subline: String(subline || '').slice(0, 80), voice, beatCount: Math.min(8, Math.max(3, Number(beatCount) || 5)),
  };
  const status = { id, state: 'queued', topic: brief.topic, dna, brand: brief.brand, createdAt: new Date().toISOString() };
  await ghPutFile(`hf-out/${id}/status.json`, JSON.stringify(status, null, 1), `hf-job: queue ${id}`);
  const b64 = Buffer.from(JSON.stringify(brief), 'utf8').toString('base64');
  const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/actions/workflows/hyperframes-create.yml/dispatches`, {
    method: 'POST', headers: GH_HEADERS,
    body: JSON.stringify({ ref: 'main', inputs: { job_id: id, brief_b64: b64 } }),
  });
  if (!res.ok) throw new Error(`workflow dispatch ${res.status}: ${(await res.text()).slice(0, 140)}`);
  return { id, brief };
}

const cache = { at: 0, val: null };
export async function listJobs(max = 24) {
  if (cache.val && Date.now() - cache.at < 30_000) return cache.val;
  if (!ghReady()) return [];
  const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/contents/hf-out?ref=main`, { headers: GH_HEADERS });
  if (!res.ok) { cache.at = Date.now(); cache.val = []; return []; }
  const dirs = (await res.json()).filter((e) => e.type === 'dir').slice(0, max);
  const jobs = await Promise.all(dirs.map(async (d) => {
    try {
      const r = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/contents/hf-out/${d.name}/status.json?ref=main`, { headers: { ...GH_HEADERS, Accept: 'application/vnd.github.raw' } });
      if (!r.ok) return { id: d.name, state: 'unknown' };
      const s = await r.json();
      return { ...s, videoUrl: s.state === 'done' ? `https://raw.githubusercontent.com/${GITHUB_REPO}/main/hf-out/${d.name}/video.mp4` : null };
    } catch { return { id: d.name, state: 'unknown' }; }
  }));
  const val = jobs.sort((a, b) => String(b.createdAt || b.finishedAt || '').localeCompare(String(a.createdAt || a.finishedAt || '')));
  cache.at = Date.now(); cache.val = val;
  return val;
}
