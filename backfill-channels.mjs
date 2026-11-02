// ONE-OFF (Phase 1 E2E backfill, issue #102): seed the Neon `channels` table
// from the brand registry (yt-brands/brands.mjs) — the factory channels were
// provisioned via brand files + GitHub secrets and never went through the
// Studio connect wizard, so the DB the validator reads was empty.
// Usage: DATABASE_URL=... node .tmp-backfill-channels.mjs   (idempotent upsert)
process.env.DATABASE_URL = process.env.DATABASE_URL || '';
const { BRANDS } = await import('./yt-brands/brands.mjs');
const { upsertChannel } = await import('./studio/lib/channels-registry.js');

const OWNER = 'muzzamilhassan302@gmail.com';
let n = 0;
for (const b of BRANDS) {
  if (b.active === false) { console.log(`skip ${b.slug} (inactive)`); continue; }
  await upsertChannel({
    slug: b.slug,
    ownerEmail: OWNER,
    label: b.label,
    handle: b.handle || '',
    niche: b.niche || '',
    accent: b.accent || '#38BDF8',
    voice: b.voice || '',
    slots: b.slots || [],
    docDay: b.docDay || '',
    autopilot: b.autopilot !== false,
    status: 'active',
    // validator-facing kit: niches (verbatim strings) + longSlot (formats derivation)
    kit: { niches: b.niches || [], longSlot: b.longSlot || '', slots: b.slots || [], docDay: b.docDay || '', voice: b.voice || '' },
  }, 'backfill: factory channels from brand registry (issue #102 E2E)');
  console.log(`upserted ${b.slug} — niche: ${b.niche}`);
  n++;
}
console.log(`BACKFILL OK — ${n} channels`);
