// Binary repo file storage for branding assets (face images etc.) — same
// dual-mode pattern as writeRepoJSON in channels-registry.js: local fs when
// running locally, GitHub Contents API (base64 PUT) when deployed.
import fs from 'node:fs';
import path from 'node:path';
import { ENV } from './data.mjs';

const ROOT = path.resolve(process.cwd(), '..');
const REPO = ENV.GITHUB_REPO || 'muzzamilhassan/automation';
const CLOUD = ENV.FORCE_GITHUB === '1' || !fs.existsSync(path.resolve(ROOT, 'yt-mcp'));

const ghHeaders = (extra = {}) => ({
  Authorization: `Bearer ${ENV.GITHUB_TOKEN}`,
  'User-Agent': 'quarry-studio',
  Accept: 'application/vnd.github+json',
  ...extra,
});

export async function writeRepoBinary(repoPath, buffer, message) {
  if (!CLOUD) {
    const local = path.join(ROOT, repoPath);
    fs.mkdirSync(path.dirname(local), { recursive: true });
    fs.writeFileSync(local, buffer);
    return { ok: true, mode: 'local' };
  }
  const cur = await fetch(`https://api.github.com/repos/${REPO}/contents/${repoPath}?ref=main`, {
    headers: ghHeaders(),
  });
  const sha = cur.ok ? (await cur.json()).sha : undefined;
  const res = await fetch(`https://api.github.com/repos/${REPO}/contents/${repoPath}`, {
    method: 'PUT',
    headers: ghHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({
      message,
      content: Buffer.from(buffer).toString('base64'),
      branch: 'main',
      ...(sha ? { sha } : {}),
    }),
  });
  if (!res.ok) throw new Error(`github ${res.status} writing ${repoPath}: ${(await res.text()).slice(0, 120)}`);
  return { ok: true, mode: 'cloud' };
}

export async function readRepoBinary(repoPath) {
  if (!CLOUD) {
    const local = path.join(ROOT, repoPath);
    if (!fs.existsSync(local)) return null;
    return fs.readFileSync(local);
  }
  const res = await fetch(`https://api.github.com/repos/${REPO}/contents/${repoPath}?ref=main`, {
    headers: ghHeaders({ Accept: 'application/vnd.github.raw' }),
  });
  if (!res.ok) return null;
  return Buffer.from(await res.arrayBuffer());
}

export async function deleteRepoBinary(repoPath, message) {
  if (!CLOUD) {
    const local = path.join(ROOT, repoPath);
    if (fs.existsSync(local)) fs.rmSync(local);
    return { ok: true, mode: 'local' };
  }
  const cur = await fetch(`https://api.github.com/repos/${REPO}/contents/${repoPath}?ref=main`, {
    headers: ghHeaders(),
  });
  if (!cur.ok) return { ok: true }; // already gone
  const sha = (await cur.json()).sha;
  const res = await fetch(`https://api.github.com/repos/${REPO}/contents/${repoPath}`, {
    method: 'DELETE',
    headers: ghHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ message: message || 'remove branding asset', sha, branch: 'main' }),
  });
  return { ok: res.ok };
}

export const IS_CLOUD = CLOUD;
