// Competitor scan: pull top videos, views, titles, TAGS and descriptions from
// given YouTube channels, then aggregate ranking keyword patterns.
// Usage: node competitor-scan.mjs
import fs from 'node:fs';
import { google } from 'googleapis';

const HANDLES = ['thestoicmode', 'LegacyMindset-c2e', 'Psygena5', 'StoicLegend-MR'];
import { loadEnv, envOf } from './lib/env.mjs';
loadEnv();

const o = new google.auth.OAuth2(envOf('YOUTUBE_CLIENT_ID'), envOf('YOUTUBE_CLIENT_SECRET'), 'http://localhost:3000/oauth2callback');
o.setCredentials({ refresh_token: envOf('YOUTUBE_REFRESH_TOKEN') });
const y = google.youtube({ version: 'v3', auth: o });

const durSec = (iso) => {
  const m = /PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/.exec(iso || '');
  return m ? (Number(m[1]) || 0) * 3600 + (Number(m[2]) || 0) * 60 + (Number(m[3]) || 0) : 0;
};

const out = { channels: [] };
for (const handle of HANDLES) {
  try {
    const ch = await y.channels.list({ part: 'snippet,statistics,contentDetails', forHandle: '@' + handle });
    const c = ch.data.items?.[0];
    if (!c) { console.log(`✗ ${handle}: channel not found`); continue; }
    console.log(`\n=== @${handle} — ${c.snippet.title} | ${Number(c.statistics.subscriberCount).toLocaleString()} subs | ${Number(c.statistics.viewCount).toLocaleString()} views ===`);
    const pl = await y.playlistItems.list({ part: 'contentDetails', playlistId: c.contentDetails.relatedPlaylists.uploads, maxResults: 50 });
    const ids = pl.data.items.map((i) => i.contentDetails.videoId).filter(Boolean);
    const vids = [];
    for (let i = 0; i < ids.length; i += 50) {
      const v = await y.videos.list({ part: 'snippet,statistics,contentDetails', id: ids.slice(i, i + 50).join(',') });
      vids.push(...v.data.items);
    }
    const shorts = vids.filter((v) => durSec(v.contentDetails?.duration) <= 180)
      .sort((a, b) => (Number(b.statistics?.viewCount) || 0) - (Number(a.statistics?.viewCount) || 0));
    const top = shorts.slice(0, 15);
    const chanData = {
      handle, title: c.snippet.title, subs: c.statistics.subscriberCount, totalViews: c.statistics.viewCount,
      shortsCount: shorts.length, top: top.map((v) => ({
        title: v.snippet.title, views: Number(v.statistics?.viewCount) || 0,
        likes: Number(v.statistics?.likeCount) || 0, comments: Number(v.statistics?.commentCount) || 0,
        tags: v.snippet.tags || [], desc: (v.snippet.description || '').slice(0, 300)
      }))
    };
    for (const t of chanData.top) console.log(`  ${t.views.toLocaleString().padStart(10)} | ${t.title}`);
    out.channels.push(chanData);
  } catch (e) {
    console.log(`✗ ${handle}: ${String(e.message).slice(0, 100)}`);
  }
}
fs.mkdirSync('research', { recursive: true });
fs.writeFileSync('research/competitor-scan-data.json', JSON.stringify(out, null, 2));
console.log('\nSaved research/competitor-scan-data.json');
