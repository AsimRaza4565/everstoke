// Studio finishing checklist for the 15 branded channels — served at
// http://localhost:3000/
// For each channel: live rename/handle status (from the API), one-click
// "Open Studio for this channel", the exact name+handle to paste (copy
// buttons), avatar file, phone-verify link, and persistent done-checkboxes.
// Usage: node studio-checklist.mjs   (run anytime; progress saved to
// yt-mcp/studio-progress.json)
import fs from 'node:fs';
import http from 'node:http';
import { google } from 'googleapis';
import { BRANDS } from './yt-brands/brands.mjs';

const envStr = fs.readFileSync('.env', 'utf8');
const CLIENT_ID = envStr.match(/^YOUTUBE_CLIENT_ID=(.+)$/m)?.[1]?.trim();
const CLIENT_SECRET = envStr.match(/^YOUTUBE_CLIENT_SECRET=(.+)$/m)?.[1]?.trim();
const PROGRESS_FILE = 'yt-mcp/studio-progress.json';

const oauth = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET);
const clients = new Map();
for (const b of BRANDS) {
  const t = JSON.parse(fs.readFileSync(`yt-mcp/channels/${b.slug}/token.json`, 'utf8'));
  const auth = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET);
  auth.setCredentials({ refresh_token: t.refresh_token });
  clients.set(b.slug, auth);
}

let cache = null, cacheAt = 0;
async function liveStatus() {
  if (cache && Date.now() - cacheAt < 60_000) return cache;
  const out = {};
  await Promise.all(BRANDS.map(async (b) => {
    try {
      const yt = google.youtube({ version: 'v3', auth: clients.get(b.slug) });
      const { data } = await yt.channels.list({ part: 'snippet', mine: true });
      const c = data.items?.[0];
      out[b.slug] = c ? { id: c.id, title: c.snippet.title, customUrl: c.snippet.customUrl || '' } : null;
    } catch { out[b.slug] = null; }
  }));
  cache = out; cacheAt = Date.now();
  return out;
}

function loadProgress() {
  try { return JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8')); } catch { return {}; }
}
function saveProgress(p) { fs.writeFileSync(PROGRESS_FILE, JSON.stringify(p, null, 2)); }

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function card(b, live, prog) {
  const id = live?.id || '?';
  const renamed = live && live.title === b.label;
  const handleOk = live && live.customUrl && live.customUrl.toLowerCase() === b.handle.toLowerCase();
  const p = prog[b.slug] || {};
  const done = p.done;
  const style = done ? 'opacity:.45' : '';
  const accent = b.accent;
  return `<div class="card" style="border-left:6px solid ${accent};${style}">
    <div class="row1"><span class="brand" style="color:${accent}">${esc(b.label)}</span>
      <label class="chk"><input type="checkbox" ${done ? 'checked' : ''} onchange="toggle('${b.slug}','done',this.checked)"> all done</label></div>
    <div class="niche">${esc(b.niche)}</div>
    <div class="mapline">dummy channel: <b>${esc(live?.title || '?')}</b> <span class="dim">(${esc(id)})</span></div>
    <div class="step">${renamed ? '✅ name' : `1. rename to: <code>${esc(b.label)}</code> <button onclick="copy(this,'${esc(b.label)}')">copy</button>`}</div>
    <div class="step">${handleOk ? `✅ handle <span class="dim">${esc(live?.customUrl)}</span>` : `2. set handle: <code>${esc(b.handle)}</code> <button onclick="copy(this,'${esc(b.handle)}')">copy</button>`}</div>
    <div class="step">3. upload avatar <span class="dim">(yt-brands/avatars/${b.slug}.jpg)</span></div>
    <div class="step"><label class="chk"><input type="checkbox" ${p.avatar ? 'checked' : ''} onchange="toggle('${b.slug}','avatar',this.checked)"> avatar uploaded</label>
      <label class="chk"><input type="checkbox" ${p.verify ? 'checked' : ''} onchange="toggle('${b.slug}','verify',this.checked)"> phone-verified</label></div>
    <div class="btns">
      <a class="btn" href="https://studio.youtube.com/channel/${id}/editing" target="_blank">▶ Open Studio for this channel</a>
      <a class="btn grey" href="https://www.youtube.com/channel/${id}" target="_blank">view channel</a>
      <a class="btn grey" href="https://www.youtube.com/verify" target="_blank">verify phone</a>
    </div>
  </div>`;
}

async function page() {
  const live = await liveStatus();
  const prog = loadProgress();
  const doneCount = BRANDS.filter(b => (prog[b.slug] || {}).done).length;
  const autoOk = BRANDS.filter(b => live[b.slug]?.title === b.label && live[b.slug]?.customUrl?.toLowerCase() === b.handle.toLowerCase()).length;
  return `<html><head><meta charset="utf-8"><title>15-Channel Studio Checklist</title><style>
  body{font-family:Segoe UI,sans-serif;background:#0d1117;color:#e6edf3;margin:0;padding:24px}
  h1{font-size:24px;margin:0 0 4px} .sub{color:#8b949e;margin-bottom:20px}
  .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(420px,1fr));gap:14px}
  .card{background:#161b22;border:1px solid #30363d;border-radius:12px;padding:14px 16px}
  .row1{display:flex;justify-content:space-between;align-items:center}
  .brand{font-weight:700;font-size:17px;letter-spacing:.5px}
  .niche{color:#8b949e;font-size:13px;margin:2px 0 8px}
  .mapline{font-size:13px;margin-bottom:8px;color:#c9d1d9}
  .dim{color:#8b949e;font-size:12px}
  .step{font-size:13.5px;margin:5px 0;display:flex;align-items:center;gap:6px;flex-wrap:wrap}
  code{background:#0d1117;border:1px solid #30363d;padding:1px 6px;border-radius:5px;font-size:12.5px}
  button{background:#21262d;color:#c9d1d9;border:1px solid #30363d;border-radius:5px;padding:1px 8px;cursor:pointer;font-size:12px}
  .btn{display:inline-block;background:#238636;color:#fff;padding:7px 12px;border-radius:7px;text-decoration:none;font-weight:600;font-size:13px;margin-top:8px;margin-right:6px}
  .btn.grey{background:#21262d;color:#c9d1d9;border:1px solid #30363d}
  .chk{font-size:13px;color:#8b949e;margin-right:12px;cursor:pointer}
  .top{position:sticky;top:0;background:#0d1117;padding:8px 0;z-index:5}
  </style></head><body>
  <div class="top"><h1>15-Channel Studio Checklist</h1>
  <div class="sub">Studio-renamed/handled: <b>${autoOk}/15</b> · fully marked done: <b>${doneCount}/15</b> · progress saves automatically · refresh to update live status</div></div>
  <div class="grid">${BRANDS.map(b => card(b, live[b.slug], prog)).join('')}</div>
  <p class="sub" style="margin-top:20px">More dummy channels later? Run <code>node onboard-links.mjs</code> (same flow as before) — new brands are added in <code>yt-brands/brands.mjs</code>.</p>
  <script>
  function copy(btn, text){ navigator.clipboard.writeText(text); btn.textContent='copied ✓'; setTimeout(()=>btn.textContent='copy', 1200); }
  async function toggle(slug, key, val){ await fetch('/toggle/'+slug+'?k='+key+'&v='+(val?1:0), {method:'POST'}); }
  </script>
  </body></html>`;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost:3000');
  if (url.pathname === '/toggle' && req.method === 'POST') {
    const slug = url.pathname.split('/')[2];
    const k = url.searchParams.get('k'), v = url.searchParams.get('v') === '1';
    const p = loadProgress();
    p[slug] = p[slug] || {};
    p[slug][k] = v;
    p[slug].done = !!(p[slug].avatar && p[slug].verify && p[slug].done !== false && (k === 'done' ? v : p[slug].done));
    saveProgress(p);
    res.writeHead(204); res.end();
    return;
  }
  if (url.pathname === '/') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(await page());
    return;
  }
  res.writeHead(404); res.end();
});

server.listen(3000, () => console.log('[checklist] open http://localhost:3000/ — progress saves to yt-mcp/studio-progress.json'));
