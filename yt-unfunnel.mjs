// 10-05: pause the cross-channel funnel — the "More From Quarry Studios"
// channelSections (multipleChannels) linking all 4 channels to each other.
// Part of the Oct-1 feed-collapse recovery: YouTube scored the network as one
// mass-production cluster, so the links are coming OFF until the network is
// healthy again. Sections are backed up to yt-mcp/funnel-backup.json first so
// they can be restored with the same ids later.
// Usage: node yt-unfunnel.mjs [--dry-run]
import fs from 'node:fs';
import path from 'node:path';
import { google } from 'googleapis';
import { loadEnv } from './lib/env.mjs';

loadEnv();



const DRY = process.argv.includes('--dry-run');
const CHANNELS = ['quotequarry', 'investors-compass', 'money-rulebook', 'debt-free-doctrine'];

function channelAuth(slug) {
  const raw = process.env[`YT_TOKEN_${slug.toUpperCase().replace(/-/g, '_')}`]
    || (fs.existsSync(path.join('yt-mcp', 'channels', slug, 'token.json'))
      ? fs.readFileSync(path.join('yt-mcp', 'channels', slug, 'token.json'), 'utf8') : '');
  const t = JSON.parse(raw || '{}');
  if (!t.refresh_token) throw new Error('no token for ' + slug);
  const a = new google.auth.OAuth2(process.env.YOUTUBE_CLIENT_ID, process.env.YOUTUBE_CLIENT_SECRET);
  a.setCredentials({ refresh_token: t.refresh_token });
  return a;
}

const backup = fs.existsSync('yt-mcp/funnel-backup.json')
  ? JSON.parse(fs.readFileSync('yt-mcp/funnel-backup.json', 'utf8'))
  : { removedAt: new Date().toISOString(), sections: [] };
const knownIds = new Set(backup.sections.map((s) => s.id));

for (const slug of CHANNELS) {
  try {
    const y = google.youtube({ version: 'v3', auth: channelAuth(slug) });
    const r = await y.channelSections.list({ part: 'snippet,contentDetails', mine: true });
    // #54: only the documented funnel sections — a legit "featured channels"
    // section (also has contentDetails.channels) must survive
    const cross = (r.data.items || []).filter((s) =>
      (s.contentDetails?.channels || []).length > 0 &&
      /quarry studios/i.test(s.snippet?.title || ''));
    if (!cross.length) { console.log(`✓ [${slug}] no cross-channel sections — nothing to do`); continue; }
    for (const s of cross) {
      console.log(`[${slug}] found section "${s.snippet?.title || s.id}" → channels: ${(s.contentDetails.channels || []).join(', ')}`);
      if (!knownIds.has(s.id)) {
        backup.sections.push({ id: s.id, slug, title: s.snippet?.title || '', channels: s.contentDetails.channels || [] });
        knownIds.add(s.id);
      }
      if (!DRY) {
        await y.channelSections.delete({ id: s.id });
        console.log(`  ✓ deleted ${s.id}`);
        // #54: persist immediately — the old write-once-at-end lost every
        // deleted id if the run died mid-loop (restore then impossible)
        fs.writeFileSync('yt-mcp/funnel-backup.json', JSON.stringify(backup, null, 2));
      } else {
        console.log(`  (dry-run — kept)`);
      }
    }
  } catch (e) {
    console.log(`✗ [${slug}] ${String(e.message).slice(0, 100)}`);
  }
}
if (!DRY) {
  fs.writeFileSync('yt-mcp/funnel-backup.json', JSON.stringify(backup, null, 2) + '\n');
  console.log(`backup saved: yt-mcp/funnel-backup.json (${backup.sections.length} sections total)`);
}
