// #97 CLIPPER PURE CORE — candidate windows, LLM-selection parsing, dup-safe
// titles, caption re-timing and the branded title card. All network/ffmpeg I/O
// lives in longvideo/shorts-clips.mjs; this module is unit-tested.

// cues: [{start, end, text}] (seconds) from the episode SRT. Builds candidate
// clip windows of >= minDur seconds (capped at maxDur) sliding stepCues at a
// time, so the LLM ranks a handful of discrete options instead of the whole
// transcript.
export function candidateWindows(cues, { minDur = 20, maxDur = 60, stepCues = 2 } = {}) {
  const out = [];
  if (!Array.isArray(cues) || !cues.length) return out;
  for (let i = 0; i < cues.length; i += stepCues) {
    const start = cues[i].start;
    let j = i;
    let end = cues[i].end;
    const texts = [];
    while (j < cues.length && end - start < maxDur) {
      texts.push(cues[j].text);
      end = cues[j].end;
      j++;
      if (end - start >= minDur) break;
    }
    const durSec = Math.round((end - start) * 10) / 10;
    if (durSec < minDur) continue; // tail fragments below the minimum are not highlight candidates
    out.push({
      i: out.length,
      startSec: Math.round(start * 10) / 10,
      endSec: Math.round(end * 10) / 10,
      durSec,
      text: texts.join(' ').replace(/\s+/g, ' ').trim(),
    });
    if (end >= cues[cues.length - 1].end) break;
  }
  return out;
}

// Extract the ranked picks JSON from raw LLM output; index refers to the
// candidate window index and is validated against the windows we sent.
export function parseSelection(llmText, windows) {
  let parsed = null;
  try {
    const m = String(llmText || '').match(/\{[\s\S]*\}/);
    if (m) parsed = JSON.parse(m[0]);
  } catch { }
  const picks = Array.isArray(parsed?.picks) ? parsed.picks : [];
  return picks
    .filter((p) => Number.isInteger(p?.index) && p.index >= 0 && p.index < windows.length)
    .map((p) => ({ index: p.index, title: String(p.title || '').trim(), altTitle: String(p.altTitle || '').trim() }));
}

// Dup-gate at queue time: prefer title, then altTitle, then drop the clip.
// isDup injects lib/dup-gate.mjs isDupTitle(title, existing) — the same
// signature used everywhere else.
export function pickTitles(picks, recentTitles, isDup) {
  const out = [];
  const dup = (t) => (recentTitles || []).some((r) => isDup(t, r));
  for (const p of picks || []) {
    if (p.title && !dup(p.title)) { out.push({ ...p, title: p.title }); continue; }
    if (p.altTitle && !dup(p.altTitle)) { out.push({ ...p, title: p.altTitle }); continue; }
    // both titles collide with the channel's recent uploads — clip is skipped
  }
  return out;
}

// Cues -> word timestamps [{w, s, d}] relative to the clip start, the input
// shape youtube-engine buildAssCaptions expects (house caption style).
export function cuesToWords(cues, clipStartSec) {
  const words = [];
  for (const c of cues || []) {
    const rel = c.start - clipStartSec;
    const parts = String(c.text || '').split(/\s+/).filter(Boolean);
    if (!parts.length || rel < 0) continue;
    const span = Math.max(0.5, c.end - c.start);
    const per = span / parts.length;
    parts.forEach((w, i) => words.push({ w, s: +(rel + i * per).toFixed(3), d: +per.toFixed(3) }));
  }
  return words;
}

// Pick the next clip to publish: first queue entry that is neither already
// posted nor a title-dup against the channel's LIVE recent uploads. Returns
// { clip, skipped } or null when the queue is exhausted. Pure — the caller
// marks postedAt and persists.
export function nextUnposted(clips, liveTitles, isDup) {
  const skipped = [];
  const dup = (t) => (liveTitles || []).some((r) => isDup(t, r));
  for (const c of clips || []) {
    if (c.postedAt) { skipped.push({ part: c.part, reason: 'posted' }); continue; }
    if (c.title && dup(c.title)) { skipped.push({ part: c.part, reason: 'dup' }); continue; }
    return { clip: c, skipped };
  }
  return null;
}

// Branded 1080x1920 title card SVG (brand-padded top zone), rendered to PNG by
// sharp in the CLI and overlaid on the first ~0.8s (Shorts API can't take
// custom thumbnails).
export function cardSvg({ title, brand, subline = '', accent = '#F5E31C', bg = '#0A0A0A' }) {
  const esc = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const words = String(title || '').split(/\s+/);
  const lines = [];
  let cur = '';
  for (const w of words) {
    if ((cur + ' ' + w).trim().length > 16) { if (cur) lines.push(cur.trim()); cur = w; }
    else cur = (cur + ' ' + w).trim();
  }
  if (cur) lines.push(cur.trim());
  const titleEls = lines.slice(0, 4).map((l, i) =>
    `<text x="60" y="${560 + i * 130}" font-family="Anton, Archivo Black, sans-serif" font-size="104" font-weight="700" fill="#FFFFFF">${esc(l)}</text>`).join('\n  ');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920" viewBox="0 0 1080 1920">
  <rect width="1080" height="1920" fill="${esc(bg)}"/>
  <rect x="60" y="380" width="130" height="10" fill="${esc(accent)}"/>
  <text x="60" y="330" font-family="Oswald, sans-serif" font-size="40" letter-spacing="8" fill="${esc(accent)}">${esc(brand)}</text>
  ${titleEls}
  ${subline ? `<text x="60" y="${560 + Math.min(lines.length, 4) * 130 + 40}" font-family="Oswald, sans-serif" font-size="44" fill="#FFFFFF" fill-opacity="0.65">${esc(subline)}</text>` : ''}
</svg>`;
}
