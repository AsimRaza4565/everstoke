// 10-05 CHANNEL FACTORY — brand-kit generator (wizard step 3).
// Deterministic draft from the niche + label: identity fields, SEO tags,
// script rules, music mood. Fully editable by the user in the wizard before
// saving — the machine drafts, the human approves. (No LLM key needed on the
// server; the fields are plain templates.)
import { requireRole } from '@/lib/route-auth';
import { NICHE_MAP } from '@/lib/niches';

export const dynamic = 'force-dynamic';

const MOOD_FEELS = {
  calm: ['calming', 'mystical'],
  bright: ['bright', 'uplifting', 'grooving'],
  epic: ['epic', 'heroic', 'inspir'],
};
const MOOD_HINTS = {
  calm: ['stoic', 'stoicism', 'calm', 'old money', 'quiet', 'luxury', 'discipline', 'mindful', 'minimal'],
  epic: ['motivation', 'success', 'grind', 'mindset', 'discipline', 'strength'],
  bright: ['money', 'finance', 'invest', 'wealth', 'budget', 'business', 'productivity'],
};

const titleCase = (s) => String(s || '').replace(/\b[a-z]/g, (c) => c.toUpperCase());
const hash = (s) => [...String(s)].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 9973, 7);

function detectMood(low) {
  for (const [mood, hints] of Object.entries(MOOD_HINTS)) {
    if (hints.some((h) => low.includes(h))) return mood;
  }
  return 'calm';
}

export async function POST(req) {
  if (!(await requireRole(req, ['owner']))) return Response.json({ error: 'not signed in' }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const { slug, niche, label } = body;
  const nick = String(niche || '').trim();
  const lab = String(label || slug || 'new channel').trim();
  if (!nick) return Response.json({ error: 'niche is required' }, { status: 400 });

  const low = nick.toLowerCase();
  const words = low.split(/[^a-z0-9]+/).filter((w) => w.length > 2);
  const mood = detectMood(low);
  const kwShort = words.slice(0, 2).join(' ') || low;

  const tagSet = new Set([low, ...words]);
  for (const suffix of ['explained', 'habits', 'for beginners', 'mindset', 'rules', 'motivation', 'guide', 'secrets']) {
    tagSet.add(`${low} ${suffix}`);
  }
  const tags = [...tagSet].slice(0, 12);

  const taglines = [
    'Play the long game.',
    'Quiet moves, loud results.',
    'Standards over storms.',
    'Discipline is freedom.',
    'Compound everything.',
  ];

  // 10-16 PRODUCT SCALE: resolve curated sub-niches from NICHE_MAP or smart-generate
  const foundMap = Object.entries(NICHE_MAP).find(([k]) => low.includes(k.toLowerCase()) || k.toLowerCase().includes(low));
  const subNiches = foundMap
    ? foundMap[1]
    : [
        low,
        ...words.map((w) => `${w} psychology`),
        ...words.map((w) => `${w} rules`),
        ...words.map((w) => `${w} habits`),
      ].slice(0, 6);

  const kit = {
    eyebrow: `${nick.toUpperCase()} // ${lab.toUpperCase()}`.slice(0, 60),
    tagline: taglines[hash(slug || lab) % taglines.length],
    keyword: low,
    kwShort,
    theme: nick,
    niches: subNiches,
    authority: `${titleCase(nick)} Wisdom`,
    tags,
    musicFeels: MOOD_FEELS[mood],
    mood,
    description: `${nick} in 60 seconds — the habits, rules, and quiet standards that compound. New Shorts every day. Subscribe for daily ${kwShort}.`.slice(0, 900),
    script: {
      targetSeconds: 32,
      points: 4,
      lineWords: '9-12',
      titleStyle: 'numbered listicle + stakes',
      titleExamples: '"7 Habits That Quietly Set You Apart", "The Rule Nobody Talks About"',
    },
  };
  return Response.json({ kit });
}
