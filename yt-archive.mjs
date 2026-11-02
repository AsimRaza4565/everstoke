// GitHub archive helpers: renders are stored as Release assets named
// <videoId>.mp4 under tags archive-YYYY-MM so nothing ever needs to be
// re-downloaded from YouTube. (The recycle flow itself was REMOVED 09-18 —
// re-uploads read as reused content to YouTube and caused channel-wide
// view suppression. Fresh production only; a skipped slot is free.)
import fs from 'node:fs';

function ghRepo() { return process.env.GH_REPO || 'muzzamilhassan/automation'; }
function ghToken() { return process.env.GH_TOKEN || process.env.GITHUB_PAT || ''; }

async function ghApi(pathname) {
  const r = await fetch(`https://api.github.com/repos/${ghRepo()}/${pathname}`, {
    headers: { Authorization: `Bearer ${ghToken()}`, Accept: 'application/vnd.github+json', 'User-Agent': 'quarry-archive' },
  });
  if (!r.ok) throw new Error(`gh api ${pathname}: HTTP ${r.status}`);
  return r.json();
}

async function findArchiveAsset(videoId) {
  for (let page = 1; page <= 3; page++) {
    const rels = await ghApi(`releases?per_page=30&page=${page}`);
    if (!Array.isArray(rels) || !rels.length) break;
    for (const rel of rels) {
      if (!String(rel.tag_name || '').startsWith('archive-')) continue;
      const a = (rel.assets || []).find((x) => x.name === `${videoId}.mp4`);
      if (a) return { url: a.url, tag: rel.tag_name };
    }
  }
  return null;
}

// Returns true when the file was fetched from the archive.
export async function downloadFromArchive(videoId, outFile, log = () => {}) {
  const hit = await findArchiveAsset(videoId);
  if (!hit) return false;
  const res = await fetch(hit.url, {
    headers: { Authorization: `Bearer ${ghToken()}`, Accept: 'application/octet-stream', 'User-Agent': 'quarry-archive' },
    redirect: 'follow',
  });
  if (!res.ok) throw new Error(`archive download HTTP ${res.status}`);
  fs.writeFileSync(outFile, Buffer.from(await res.arrayBuffer()));
  if (fs.statSync(outFile).size < 100_000) throw new Error('archive file too small');
  log(`archive: downloaded ${videoId} from ${hit.tag} (${Math.round(fs.statSync(outFile).size / 1024)} KB)`);
  return true;
}

// Attach a file to this month's archive release (creates the release if missing).
export async function archiveUpload(videoId, filePath, log = () => {}) {
  const tag = 'archive-' + new Date().toISOString().slice(0, 7);
  let rel = null;
  // lookup can fail transiently (rate limits) — retry once before creating
  for (let attempt = 0; attempt < 2 && !rel; attempt++) {
    try { rel = await ghApi(`releases/tags/${tag}`); } catch { await new Promise(r => setTimeout(r, 1500)); }
  }
  if (!rel || !rel.id) {
    const res = await fetch(`https://api.github.com/repos/${ghRepo()}/releases`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${ghToken()}`, Accept: 'application/vnd.github+json', 'User-Agent': 'quarry-archive', 'Content-Type': 'application/json' },
      body: JSON.stringify({ tag_name: tag, name: 'Video archive ' + tag.slice(8), body: 'Monthly render archive (auto-generated).' }),
    });
    if (res.status === 422) {
      rel = await ghApi(`releases/tags/${tag}`);
    } else if (!res.ok) {
      throw new Error(`release create HTTP ${res.status}`);
    } else {
      rel = await res.json();
    }
  }
  const up = await fetch(`https://uploads.github.com/repos/${ghRepo()}/releases/${rel.id}/assets?name=${videoId}.mp4`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${ghToken()}`, 'User-Agent': 'quarry-archive', 'Content-Type': 'application/octet-stream' },
    body: fs.readFileSync(filePath),
  });
  if (!up.ok) throw new Error(`archive asset upload HTTP ${up.status}`);
  log(`archive: stored ${videoId}.mp4 in ${tag}`);
}
