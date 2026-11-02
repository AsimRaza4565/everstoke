// build-music-menu.mjs — builds a 40-track approval menu per YouTube channel.
// Picks from the same incompetech whitelist music-engine.mjs uses (pieces.json
// cached in .music-cache/). Deterministic: same inputs -> same list.
//
// Output: music-menu-2026-09-13.md (full menu with moods) + compact console print.
// After user approval, approved lists get locked into the engine (next step).
// Also importable: `import { buildMenu, CHANNELS } from './build-music-menu.mjs'`
// (CLI write/print only happens when run directly).
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';

const cat = JSON.parse(fs.readFileSync('.music-cache/pieces.json', 'utf8'));

const GOOD = ['epic', 'uplifting', 'driving', 'action', 'bright', 'grooving', 'calming', 'heroic', 'inspir', 'mystical'];
const BAD = ['dark', 'somber', 'sad', 'horror', 'tense', 'eerie', 'scary', 'ominous', 'creepy', 'humorous', 'unnerving'];

// novelty / off-brand titles that must never reach a channel menu
const BLOCK_WORDS = [
  'christmas', 'xmas', 'rap', 'polka', 'goblin', 'sauropod', 'dentaneo', 'cretaceous',
  'ninja', 'cartoon', 'bridal', 'opium', 'brady', 'pinball', 'malt shop', 'boogie party',
  'crunk', 'comin round', 'kerfuffle', 'four beers', 'newssting', 'presenterator',
  'anglozulu', 'danse macabre', 'wagner', 'menagerie', 'corncob', 'bama country',
  'ballgame', 'jingle', 'balloon', 'trolley', 'peeker', 'plucky', 'porridge',
  'silent night', 'holy night', 'midnight clear', 'deck the halls', 'adeste fideles',
];

const hash = (s) => { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; };

const pool = cat
  .filter((t) => t.filename && t.filename.endsWith('.mp3') && (t.feel || '').trim())
  .filter((t) => {
    const f = (t.feel || '').toLowerCase();
    const title = String(t.title).toLowerCase();
    return GOOD.some((g) => f.includes(g))
      && !BAD.some((b) => f.includes(b))
      && !BLOCK_WORDS.some((w) => title.includes(w));
  });

// feels per channel, most important first (weight 4/3/2/1).
// noBouncy: calm channels never get jumpy/party tracks.
// onlyFeels: hard limit (sleep channel gets ONLY slow soft tracks).
// bonus: +6 per matched title keyword — steers lists toward fitting names.
const CHANNELS = [
  { slug: 'quotequarry', label: 'QUOTE QUARRY', niche: 'Stoicism & daily motivation', theme: 'Big, deep, inspiring', feels: ['epic', 'uplifting', 'mystical', 'calming'], noBouncy: true },
  { slug: 'investors-compass', label: "INVESTOR'S COMPASS", niche: 'Investing psychology & market wisdom', theme: 'Calm, wise, confident', feels: ['calming', 'mystical', 'calm', 'relaxed'], noBouncy: true, bonus: ['zen', 'healing', 'meditat', 'deep', 'flow', 'mind'] },
  { slug: 'money-rulebook', label: 'THE MONEY RULEBOOK', niche: 'Personal finance rules & money habits', theme: 'Bright, positive, upbeat', feels: ['bright', 'uplifting', 'grooving'], bonus: ['bright', 'sun', 'gold', 'happy', 'clear', 'fresh'] },
  { slug: 'debt-free-doctrine', label: 'DEBT-FREE DOCTRINE', niche: 'Debt payoff & credit smarts', theme: 'Determined, pushing forward', feels: ['driving', 'action', 'epic'], bonus: ['hero', 'strength', 'titan', 'victory', 'long time', 'road'] },
  { slug: 'escrow-estate', label: 'ESCROW & ESTATE', niche: 'Real estate wisdom & property', theme: 'Premium, warm, successful', feels: ['calming', 'uplifting', 'bright', 'relaxed'], noBouncy: true, bonus: ['manor', 'estate', 'home', 'shore', 'sun', 'voyage', 'island'] },
  { slug: 'policy-brief', label: 'THE POLICY BRIEF', niche: 'Insurance explained simply', theme: 'Simple, safe, trustworthy', feels: ['calming', 'calm', 'relaxed'], noBouncy: true, bonus: ['clear', 'safe', 'gentle', 'soft', 'calm', 'shelter'] },
  { slug: 'old-money-code', label: 'OLD MONEY CODE', niche: 'Old money habits & quiet wealth', theme: 'Classy, quiet, elegant', feels: ['calming', 'relaxed', 'mystical', 'calm'], noBouncy: true, bonus: ['waltz', 'suite', 'concerto', 'nocturne', 'prelude', 'sonata', 'garden', 'manor', 'velvet', 'classic'] },
  { slug: 'founders-margin', label: 'FOUNDERS MARGIN', niche: 'Entrepreneurship & lean business', theme: 'Energetic, building, moving', feels: ['driving', 'bright', 'uplifting', 'grooving'], bonus: ['start', 'rise', 'build', 'move', 'go', 'forward', 'momentum'] },
  { slug: 'closing-table', label: 'THE CLOSING TABLE', niche: 'Sales & negotiation psychology', theme: 'Confident, bold, groovy', feels: ['grooving', 'driving', 'action'], bonus: ['deal', 'cool', 'smooth', 'silk', 'deep', 'club', 'funk', 'swing'] },
  { slug: 'corner-office', label: 'CORNER OFFICE MIND', niche: 'Leadership & management wisdom', theme: 'Wise, confident, calm', feels: ['calming', 'uplifting', 'relaxed'], noBouncy: true, bonus: ['wisdom', 'vision', 'summit', 'perspective', 'light', 'hope'] },
  { slug: 'tax-shield', label: 'TAX SHIELD', niche: 'Small-business tax & legal principles', theme: 'Steady, clear, professional', feels: ['calm', 'grooving', 'calming'], noBouncy: true, bonus: ['order', 'rule', 'steady', 'clean', 'clear', 'structure'] },
  { slug: 'ai-observer', label: 'THE AI OBSERVER', niche: 'AI & future tech', theme: 'Modern, electronic, curious', feels: ['bright', 'grooving', 'driving'], bonus: ['ai', 'bit', 'blip', 'byte', 'cipher', 'cyber', 'digit', 'disco', 'electro', 'laser', 'neon', 'pixel', 'retro', 'robo', 'synth', 'tech', 'trance', 'volt', 'wave', 'circuit', 'machine'] },
  { slug: 'deep-work-os', label: 'DEEP WORK OS', niche: 'Focus & productivity systems', theme: 'Deep focus, flow, minimal', feels: ['calming', 'mystical', 'relaxed'], noBouncy: true, bonus: ['deep', 'focus', 'concentration', 'thought', 'flow', 'still', 'quiet', 'study'] },
  { slug: 'longevity-code', label: 'THE LONGEVITY CODE', niche: 'Healthspan & longevity habits', theme: 'Fresh, healthy, optimistic', feels: ['uplifting', 'bright', 'calming'], noBouncy: true, bonus: ['life', 'healing', 'sun', 'fresh', 'bloom', 'morning', 'daybreak', 'vital', 'heart'] },
  { slug: 'iron-discipline', label: 'IRON DISCIPLINE', niche: 'Gym & training motivation', theme: 'Hard, strong, powerful', feels: ['driving', 'action', 'aggressive', 'epic'], bonus: ['titan', 'hero', 'power', 'strong', 'iron', 'muscle', 'impact', 'fight', 'strength', 'gear'] },
  { slug: 'sleep-architect', label: 'THE SLEEP ARCHITECT', niche: 'Sleep & recovery science', theme: 'Soft, slow, peaceful', feels: ['calming', 'relaxed', 'calm'], noBouncy: true, onlyFeels: ['calming', 'relaxed', 'calm', 'mystical'], bonus: ['dream', 'night', 'sleep', 'relax', 'calm', 'moon', 'star', 'lull', 'cloud', 'zen', 'meditat', 'drift'] },
];

const feelsOf = (t) => (t.feel || '').toLowerCase();

const scoreTrack = (t, ch) => {
  const f = feelsOf(t);
  if (ch.onlyFeels) {
    const words = f.split(',').map((s) => s.trim()).filter(Boolean);
    if (!words.length || !words.every((w) => ch.onlyFeels.some((ok) => w.includes(ok)))) return -1;
  }
  if (ch.noBouncy && f.includes('bouncy')) return -1;
  let s = 0;
  ch.feels.forEach((want, i) => { if (f.includes(want)) s += ch.feels.length - i; });
  if (!s) return -1;
  const title = String(t.title).toLowerCase();
  for (const kw of ch.bonus || []) if (title.includes(kw)) s += 6;
  return s;
};

const PER_CHANNEL = 40;
export function buildMenu() {
  const menu = {};
  for (const ch of CHANNELS) {
    menu[ch.slug] = pool
      .map((t) => ({ t, s: scoreTrack(t, ch) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s || hash(String(a.t.title)) - hash(String(b.t.title)))
      .slice(0, PER_CHANNEL)
      .map((x) => x.t);
  }
  return menu;
}
export { CHANNELS, pool };

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
  const menu = buildMenu();
  // markdown doc
  let md = `# Music Approval Menu — 40 tracks per channel (2026-09-13)\n\n`;
  md += `Source: incompetech.com (Kevin MacLeod), CC BY 4.0 — free, credit added to captions automatically.\n`;
  md += `Reply with approvals; only approved tracks will play on that channel.\n\n`;
  for (const ch of CHANNELS) {
    md += `## ${ch.label} — ${ch.niche}\n*Mood: ${ch.theme}* (${menu[ch.slug].length} tracks)\n\n`;
    menu[ch.slug].forEach((t, i) => { md += `${i + 1}. **${String(t.title).trim()}** — ${t.feel}\n`; });
    md += `\n`;
  }
  fs.writeFileSync('music-menu-2026-09-13.md', md);

  // compact console print for chat
  for (const ch of CHANNELS) {
    console.log(`\n### ${ch.label} (${ch.niche}) — mood: ${ch.theme} [${menu[ch.slug].length}]`);
    console.log(menu[ch.slug].map((t, i) => `${i + 1}.${String(t.title).trim()}`).join(' · '));
  }
  const uniq = new Set(Object.values(menu).flat().map((t) => t.title));
  console.log(`\n[summary] channels: ${CHANNELS.length}, unique tracks across all lists: ${uniq.size}`);
  const short = CHANNELS.filter((c) => menu[c.slug].length < PER_CHANNEL);
  if (short.length) console.log('[warn] channels under 40:', short.map((c) => `${c.slug}=${menu[c.slug].length}`).join(', '));
}
