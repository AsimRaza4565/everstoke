// #96 SRT BUILDER — the doc render produces word-level timestamps per chapter
// (youtube-flow/narrate.py -> narr-*.mp3.meta.json words [{w, s, d}]); this
// turns them into one episode-wide SRT so the clips-first lane (#97) can cut
// sentence-aligned Shorts without re-transcribing. Format is standard SRT —
// longvideo/tiktok-clips.mjs parseSrt must read it back untouched.

const pad = (n, w = 2) => String(n).padStart(w, '0');

function srtTimestamp(sec) {
  const total = Math.max(0, Math.round(sec * 1000));
  const h = Math.floor(total / 3600000);
  const m = Math.floor((total % 3600000) / 60000);
  const s = Math.floor((total % 60000) / 1000);
  const ms = total % 1000;
  return `${pad(h)}:${pad(m)}:${pad(s)},${pad(ms, 3)}`;
}

// words: [{w, s, d}] in seconds relative to the chapter; offsetSec shifts them
// to the episode timeline. Groups consecutive words into cues of <= maxWords,
// breaking early at sentence ends (. ! ?) so cues stay readable and the
// clipper's LLM sees sentence-shaped text.
export function cuesFromWords(words, offsetSec = 0, maxWords = 8) {
  const cues = [];
  let group = [];
  const flush = () => {
    if (!group.length) return;
    const start = offsetSec + group[0].s;
    const last = group[group.length - 1];
    const end = Math.max(start + 0.3, offsetSec + last.s + (last.d || 0.2));
    cues.push({ start, end, text: group.map((x) => x.w).join(' ').replace(/\s+/g, ' ').trim() });
    group = [];
  };
  for (const w of words || []) {
    if (!w || !String(w.w || '').trim()) continue;
    group.push(w);
    if (group.length >= maxWords || /[.!?]$/.test(String(w.w))) flush();
  }
  flush();
  return cues;
}

// cues: [{start, end, text}] seconds -> standard SRT string
export function toSrt(cues) {
  return (cues || [])
    .map((c, i) => `${i + 1}\n${srtTimestamp(c.start)} --> ${srtTimestamp(c.end)}\n${c.text}`)
    .join('\n\n') + '\n';
}

// Standard SRT -> [{start, end, text}] seconds. Same tolerant shape the
// production consumers use (longvideo/tiktok-clips.mjs parseSrt).
export function parseSrt(text) {
  const toSec = (t) => {
    const m = t.trim().match(/(\d+):(\d+):(\d+)[,.](\d+)/);
    return m ? (+m[1]) * 3600 + (+m[2]) * 60 + (+m[3]) + (+m[4]) / 1000 : null;
  };
  const cues = [];
  for (const b of String(text || '').replace(/\r/g, '').split('\n\n')) {
    const lines = b.split('\n').filter(Boolean);
    const tl = lines.find((l) => l.includes('-->'));
    if (!tl) continue;
    const [a, z] = tl.split('-->');
    const start = toSec(a), end = toSec(z);
    const body = lines.slice(lines.indexOf(tl) + 1).join(' ').replace(/<[^>]+>/g, '').trim();
    if (start != null && end != null && body) cues.push({ start, end, text: body });
  }
  return cues;
}
