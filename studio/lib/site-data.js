// Curated platform data for pages that don't have a live API yet.
// Real numbers come from the repo's audits + state files (Sep 2026).

export const BRAND_META = {
  'quotequarry': { short: 'QQ', accent: '#F5E31C' },
  'investors-compass': { short: 'IC', accent: '#E8C15A' },
  'money-rulebook': { short: 'MR', accent: '#3DDC97' },
  'debt-free-doctrine': { short: 'OM', accent: '#D9C7A7' },
  'escrow-estate': { short: 'EE', accent: '#D98E4A' },
  'policy-brief': { short: 'PB', accent: '#58A6C9' },
  'old-money-code': { short: 'OM', accent: '#D9C7A7' },
  'founders-margin': { short: 'FM', accent: '#9EE04F' },
  'closing-table': { short: 'CT', accent: '#E14D6B' },
  'corner-office': { short: 'CO', accent: '#C0C6D0' },
  'tax-shield': { short: 'TS', accent: '#4ECDC4' },
  'ai-observer': { short: 'AI', accent: '#39D5FF' },
  'deep-work-os': { short: 'DW', accent: '#C8B6FF' },
  'longevity-code': { short: 'LC', accent: '#7ED957' },
  'iron-discipline': { short: 'ID', accent: '#CCFF00' },
  'sleep-architect': { short: 'SA', accent: '#8C9EFF' },
};

// Avg % watched — Analytics audit, Sep 19 2026
export const RETENTION = [
  { slug: 'quotequarry', pct: 86.3 },
  { slug: 'money-rulebook', pct: 53.5 },
  { slug: 'investors-compass', pct: 51.7 },
  { slug: 'debt-free-doctrine', pct: 35.1 },
];
export const RETENTION_GOAL = 70;

export const ALERTS = [
  {
    level: 'bad',
    title: 'Script brain still fragile',
    body: 'Groq 429 + Gemini 403 still cause ~1 channel/day to skip. Fix is planned — waiting for your go.',
    when: 'Sep 27',
    href: '/production',
  },
  {
    level: 'info',
    title: 'Facebook reels blackout plan waiting',
    body: '~60 reels across 4 pages got 2 views total. Native re-render + page rename plan awaits your go.',
    when: 'Sep 20',
    href: '/social',
  },
];

export const PIPELINES = [
  {
    id: 'yt-daily',
    name: 'Daily Shorts',
    desc: 'AI script → voice → render → upload — 1 quality short per channel, best ET-prime slot only',
    icon: 'clapperboard',
    engine: 'GitHub Actions · yt-daily.yml',
    schedule: 'QQ 22:35 · IC 23:35 · MR 00:05 · OMC 00:35 (UTC) · Sunday break',
    actions: [
      { action: 'yt-daily', slug: 'quotequarry', label: 'QQ Shorts' },
      { action: 'yt-daily', slug: 'investors-compass', label: 'IC Shorts' },
      { action: 'yt-daily', slug: 'money-rulebook', label: 'MR Shorts' },
      { action: 'yt-daily', slug: 'debt-free-doctrine', label: 'DFD Shorts' },
    ],
    stages: ['Script brain', 'Voice', 'Render', 'Poster', 'Upload'],
  },
  {
    id: 'deepdive',
    name: 'Weekly episode',
    desc: '10+ min documentary per channel — ONE fixed day a week, appointment viewing',
    icon: 'film',
    engine: 'yt-deepdive in the daily channel run',
    schedule: 'QQ Tue · IC Wed · MR Thu · OMC Fri (each at its ET-prime slot)',
    note: 'Docs are weekly since Oct 05 (cadence research). The manual uploader workflow is disabled during the Oct-1 recovery — the daily run produces the episode on each channel\'s doc day.',
    actions: [
      { action: 'deepdive', slug: 'quotequarry', label: 'QQ episode' },
      { action: 'deepdive', slug: 'investors-compass', label: 'IC episode' },
      { action: 'deepdive', slug: 'money-rulebook', label: 'MR episode' },
      { action: 'deepdive', slug: 'debt-free-doctrine', label: 'DFD episode' },
    ],
    stages: ['Research', 'Script', 'Voice', 'Scenes', 'Render', 'Upload'],
  },
  {
    id: 'tiktok',
    name: 'TikTok clips',
    name2: 'Zernio',
    desc: 'Long-forms auto-cut into 1-min sentence-aligned parts, 1 part/day + 4 shorts slots',
    icon: 'music2',
    engine: 'tiktok-post.yml · Zernio app',
    schedule: '4×/day + 1 clip part/day',
    actions: [{ action: 'tiktok', label: 'Post TikTok now' }],
    stages: ['Source video', 'Cut parts', 'Caption align', 'Post via Zernio'],
  },
];

// 14-day views sample series per channel (labels: D-13..today). Sample data —
// the Analytics page labels it as such until the metrics API is wired.
const seed = (n) => {
  let s = n * 2654435761 % 4294967296;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
};
const SERIES_BASE = { quotequarry: 5200, 'money-rulebook': 1900, 'investors-compass': 2400, 'debt-free-doctrine': 1100 };
export const VIEWS_SERIES = Object.fromEntries(
  Object.entries(SERIES_BASE).map(([slug, base], ci) => {
    const rnd = seed(ci + 7);
    let v = base;
    return [slug, Array.from({ length: 14 }, (_, i) => {
      v = Math.max(200, v * (0.82 + rnd() * 0.5));
      return Math.round(v);
    })];
  })
);

export const TRACKED_KEYWORDS = [
  { kw: 'how does compound interest work', pos: 6, delta: +4, channel: 'investors-compass' },
  { kw: 'debt snowball vs avalanche', pos: 9, delta: +7, channel: 'debt-free-doctrine' },
  { kw: 'stoic morning routine', pos: 12, delta: -1, channel: 'quotequarry' },
  { kw: '50/30/20 budget rule', pos: 14, delta: +3, channel: 'money-rulebook' },
  { kw: 'emergency fund first', pos: 21, delta: +11, channel: 'debt-free-doctrine' },
  { kw: 'dividend investing explained', pos: 26, delta: +2, channel: 'investors-compass' },
];

// Music — locked 13-track pool (approved Sep 16) + per-brand moods.
export const MUSIC_POOL = [
  { name: 'Skye Cuillin', mood: 'EPIC', brand: 'shared' },
  { name: 'Heroic Age', mood: 'EPIC', brand: 'quotequarry' },
  { name: 'Strength of the Titans', mood: 'EPIC', brand: 'quotequarry' },
  { name: 'Fanfare for Space', mood: 'EPIC', brand: 'shared' },
  { name: 'That Zen Moment', mood: 'CALM', brand: 'investors-compass' },
  { name: 'Frozen Star', mood: 'CALM', brand: 'shared' },
  { name: 'Deep Relaxation', mood: 'CALM', brand: 'investors-compass' },
  { name: 'Gymnopedie No. 1', mood: 'CALM', brand: 'shared' },
  { name: 'Deliberate Thought', mood: 'TECH', brand: 'tech' },
  { name: 'Cut Trance', mood: 'TECH', brand: 'tech' },
  { name: 'Voltaic', mood: 'TECH', brand: 'tech' },
  { name: 'Bass Walker', mood: 'DRIVE', brand: 'shared' },
  { name: 'Hustle', mood: 'DRIVE', brand: 'money-rulebook' },
];

export const MUSIC_MOODS = {
  quotequarry: ['Epic', 'Inspiring', 'Heroic'],
  'investors-compass': ['Calming', 'Inspiring', 'Mystical'],
  'money-rulebook': ['Bright', 'Uplifting', 'Grooving'],
  'debt-free-doctrine': ['Driving', 'Hopeful'],
};

export const ROADMAP = [
  {
    group: 'Fix now',
    icon: 'alert',
    items: [
      { t: 'Script brain fallback — Groq 429 + Gemini 403 fail ~1 channel/day', state: 'waiting-you' },
      { t: 'FB reels blackout plan — native re-render + page renames', state: 'waiting-you' },
      { t: 'Refresh Threads token before ~Oct 29', state: 'waiting-you' },
      { t: 'Premium upgrade groups 1–3 (SFX, ducking, loudnorm) — plan ready', state: 'waiting-you' },
    ],
  },
  {
    group: 'Running live',
    icon: 'zap',
    items: [
      { t: 'Daily Shorts — 1 quality short per channel (best ET slot), Sunday break', state: 'live' },
      { t: 'Weekly doc episode per channel (QQ Tue · IC Wed · MR Thu · OMC Fri)', state: 'live' },
      { t: 'Channel Factory — wizard channels run on the nightly Autopilot automatically', state: 'live' },
      { t: 'Topic Desk — research proposes, you approve, machine runs your picks first', state: 'live' },
      { t: 'Flow switches — per-channel pause/resume + network master switch', state: 'live' },
      { t: 'TikTok via Zernio — 4 slots/day + 1 clip part/day (QQ)', state: 'live' },
      { t: 'FB reels + posters, IG reels ×4 accounts, Threads ×1/day (legacy channels)', state: 'live' },
      { t: 'SEO pack live + in-pipeline US keyword checker', state: 'live' },
      { t: 'Photo-poster thumbnails live + 34 old videos backfilled', state: 'live' },
      { t: 'Role-based access — Google sign-in, owner/staff/client roles', state: 'live' },
    ],
  },
  {
    group: 'Waiting on you',
    icon: 'user',
    items: [
      { t: 'Check YouTube Studio on QQ for any recovery/policy notice', state: 'pending' },
      { t: 'Refresh Threads token before ~Oct 29', state: 'pending' },
      { t: 'FB reels blackout plan — native re-render + page renames', state: 'pending' },
      { t: 'Premium upgrade groups 1–3 (SFX, ducking, loudnorm) — plan ready', state: 'waiting-you' },
      { t: 'Affiliate money — Payoneer KYC + network signups', state: 'pending' },
      { t: 'Buy blog domain (~$10/yr) for AdSense route', state: 'pending' },
    ],
  },
  {
    group: 'Next up',
    icon: 'rocket',
    items: [
      { t: 'Feeder "views machine" channel — blocked on you creating it', state: 'next' },
      { t: 'daily.dev API digest — waiting for your API token', state: 'next' },
      { t: 'Blog + auto-articles once domain is bought', state: 'next' },
      { t: 'Retention re-judge after 10 videos on new scripts', state: 'next' },
    ],
  },
  {
    group: 'Decided / parked',
    icon: 'archive',
    items: [
      { t: 'Weekly QQ compilation — disabled, awaiting your call', state: 'parked' },
      { t: 'DFD fix vs pause decision — open', state: 'parked' },
      { t: 'Bluesky — do not integrate (your call, Sep 1)', state: 'parked' },
      { t: 'Recycler (same-file re-uploads) — removed forever (strike risk)', state: 'parked' },
    ],
  },
];

export const INTEGRATIONS = [
  { name: 'YouTube Data API', status: 'ok', note: '5 channels linked (4 legacy + FAJR OF QUR\'AN) · uploads own bucket', icon: 'youtube' },
  { name: 'Channel Autopilot', status: 'ok', note: 'nightly 02:33 UTC · wizard channels run automatically', icon: 'cloud' },
  { name: 'Weekly docs', status: 'ok', note: 'docDay per channel: QQ Tue · IC Wed · MR Thu · OMC Fri', icon: 'film' },
  { name: 'Facebook Pages', status: 'ok', note: '4 legacy pages wired · reels + posters', icon: 'facebook' },
  { name: 'Instagram Graph', status: 'ok', note: '4 legacy accounts · reels daily', icon: 'instagram' },
  { name: 'TikTok (Zernio)', status: 'ok', note: '@arzo22345 · 4 slots/day + clips (QQ)', icon: 'music2' },
  { name: 'Threads', status: 'warn', note: 'Token valid until ~Oct 29', icon: 'at-sign' },
  { name: 'Roles (Google sign-in)', status: 'ok', note: 'owner: muzzamilhassan302 · staff/client via access.json', icon: 'zap' },
  { name: 'Script brain', status: 'bad', note: 'Groq 429 bursts — fallback fix pending', icon: 'sparkles' },
  { name: 'ntfy alerts', status: 'ok', note: 'quarry-x7f2k-reports topic', icon: 'bell' },
];

export const DAILY_REPORTS = [
  { name: 'daily-report-2026-09-19.xlsx', when: 'Sep 19, 2026' },
  { name: 'daily-report-2026-09-12.xlsx', when: 'Sep 12, 2026' },
];
