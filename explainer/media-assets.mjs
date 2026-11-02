// Multi-platform free media fetcher (NO Pexels, NO Pixabay per user).
// Chain: Wikimedia Commons -> Openverse -> Met Museum -> Pollinations (AI, no key).
// Every source is free/public-domain/CC; returns { file, source, credit }.
import fs from "node:fs";
import { fetchBuffer } from "../lib/fetch-safe.mjs";
import path from "node:path";

const UA = "QuarryStudio-Teacher/1.0 (educational video demo)";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function dl(url, outPath, headers = {}) {
  const ctrl = new AbortController();
  // #65: deadline covers the body transfer
  const { buf } = await fetchBuffer(url, { timeoutMs: 45000, headers: { "User-Agent": UA, ...headers } });
  if (buf.length < 8000) throw new Error("too small");
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, buf);
  return true;
}

// 1) Wikimedia Commons search — historical/famous photos, public domain or CC
async function wikimedia(query, outPath) {
  const api = `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(query)}&gsrlimit=12&gsrnamespace=6&prop=imageinfo&iiprop=url%7Csize%7Cextmetadata&iiurlwidth=1400&format=json`;
  const r = await fetch(api, { headers: { "User-Agent": UA } });
  if (!r.ok) throw new Error(`wiki HTTP ${r.status}`);
  const pages = Object.values((await r.json()).query?.pages || {});
  const cands = pages
    .map((p) => ({ ii: p.imageinfo?.[0], meta: p.imageinfo?.[0]?.extmetadata || {} }))
    .filter((c) => c.ii && /\.(jpe?g|png)$/i.test(c.ii.url) && (c.ii.width || 0) >= 800)
    .filter((c) => {
      const lic = String(c.meta.LicenseShortName?.value || "").toLowerCase();
      return !lic.includes("fair use");
    });
  cands.sort((a, b) => (b.ii.width * b.ii.height) - (a.ii.width * a.ii.height));
  if (!cands.length) throw new Error("no wiki results");
  const pick = cands[Math.floor(Math.random() * Math.min(3, cands.length))];
  await dl(pick.ii.thumburl || pick.ii.url, outPath);
  const artist = String(pick.meta.Artist?.value || "Wikimedia").replace(/<[^>]+>/g, "").trim().slice(0, 60);
  return { source: "Wikimedia Commons", credit: `${artist} via Wikimedia Commons` };
}

// 2) Openverse — CC-licensed images across the web
async function openverse(query, outPath) {
  const api = `https://api.openverse.org/v1/images/?q=${encodeURIComponent(query)}&license_type=commercial,modification&page_size=12`;
  const r = await fetch(api, { headers: { "User-Agent": UA } });
  if (!r.ok) throw new Error(`openverse HTTP ${r.status}`);
  const hits = (await r.json()).results || [];
  if (!hits.length) throw new Error("no openverse results");
  const pick = hits[Math.floor(Math.random() * Math.min(6, hits.length))];
  await dl(pick.url, outPath);
  return { source: "Openverse", credit: `"${pick.title || query}" by ${pick.creator || "unknown"} (${pick.license || "cc"})` };
}

// 3) Met Museum — public-domain art (great for history/money/society beats)
async function metmuseum(query, outPath) {
  const s = await fetch(`https://collectionapi.metmuseum.org/public/collection/v1/search?q=${encodeURIComponent(query)}&hasImages=true&isPublicDomain=true`);
  if (!s.ok) throw new Error(`met HTTP ${s.status}`);
  const ids = (await s.json()).objectIDs || [];
  if (!ids.length) throw new Error("no met results");
  for (const id of ids.slice(0, 5).sort(() => Math.random() - 0.5)) {
    try {
      const o = await (await fetch(`https://collectionapi.metmuseum.org/public/collection/v1/objects/${id}`)).json();
      if (o.isPublicDomain && o.primaryImageSmall) {
        await dl(o.primaryImageSmall, outPath);
        return { source: "The Met", credit: `${o.title || "Artwork"}, ${o.artistDisplayName || "Unknown"} (public domain, The Met)` };
      }
    } catch { }
  }
  throw new Error("met: none usable");
}

// 4) Pollinations — free AI illustration, no key (concept visuals when no real photo fits)
async function pollinations(query, outPath) {
  const prompt = `editorial magazine illustration, muted colors, paper texture, about: ${query}`;
  const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=1280&height=800&nologo=true&seed=${Math.floor(Math.random() * 99999)}`;
  await dl(url, outPath);
  return { source: "Pollinations AI", credit: "AI illustration (Pollinations)" };
}

export async function fetchTeachingMedia({ query, outPath }) {
  const chain = [wikimedia, openverse, metmuseum, pollinations];
  for (const fn of chain) {
    try {
      const meta = await fn(query, outPath);
      return { file: path.resolve(outPath), ...meta };
    } catch (e) {
      console.log(`  [media] ${fn.name}: ${String(e.message).slice(0, 70)}`);
      await sleep(600);
    }
  }
  return null;
}
