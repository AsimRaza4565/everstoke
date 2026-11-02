// Finds duplicate reels per page (same description posted 2+ times — the
// backfill double-posted on 09-19) and deletes the NEWER copies, keeping the
// oldest. Dry run by default; pass --apply to really delete.
// Usage: node fb-dedupe.mjs [--apply]
import fs from 'node:fs';

import { loadEnv } from './lib/env.mjs';
loadEnv();
const FB_PAGE_TOKEN = process.env.FB_PAGE_TOKEN || '';
const APPLY = process.argv.includes('--apply');
const PAGES = {
  'Silent Wealth (IC)': '116157974886564',
  'Reliq North (QQ)': '114550268199751',
  'Eon Ventures (MR)': '1077306835630491',
  'The Boundaries Club (DFD)': '106473735839651'
};

(async () => {
  const r = await fetch(`https://graph.facebook.com/v20.0/me/accounts?fields=id,name,access_token&access_token=${FB_PAGE_TOKEN}`);
  const tokens = {};
  for (const p of (await r.json()).data || []) tokens[p.id] = p.access_token;
  let deleted = 0;
  for (const [name, id] of Object.entries(PAGES)) {
    const tk = tokens[id];
    if (!tk) { console.log(`${name}: no page token`); continue; }
    // #64: follow paging.next — the first-100 scan silently missed older dups
    let vids = [];
    let url = `https://graph.facebook.com/v20.0/${id}/videos?fields=id,created_time,description,length&limit=100&access_token=${tk}`;
    for (let page = 0; url && page < 10; page++) {
      const res = await fetch(url);
      const j = await res.json().catch(() => ({}));
      vids.push(...(j.data || []));
      url = j.paging && j.paging.next;
    }
    // group by description, but only treat as duplicates when the LENGTH also
    // matches (±3s) — same-template weekly compilations share descriptions but
    // are different videos and must be kept.
    const byDesc = {};
    for (const v of vids) {
      const key = String(v.description || '').slice(0, 120);
      (byDesc[key] = byDesc[key] || []).push(v);
    }
    const dups = [];
    for (const group of Object.values(byDesc)) {
      if (group.length < 2) continue;
      group.sort((a, b) => new Date(a.created_time) - new Date(b.created_time));
      const keep = [group[0]];
      for (const v of group.slice(1)) {
        const twin = keep.some(k => Math.abs((+k.length || 0) - (+v.length || 0)) <= 3);
        if (twin) dups.push(v);
        else keep.push(v);
      }
    }
    console.log(`${name}: ${vids.length} reels, ${dups.length} duplicate(s)`);
    for (const d of dups) {
      console.log(`   ${APPLY ? 'deleting' : 'would delete'} ${d.id} (${d.created_time.slice(0, 16)}) — ${(d.description || '').slice(0, 48).replace(/\n/g, ' ')}`);
      if (APPLY) {
        const del = await fetch(`https://graph.facebook.com/v20.0/${d.id}?access_token=${tk}`, { method: 'DELETE' });
        const dj = await del.json();
        if (dj.success) { deleted++; console.log('   -> deleted'); }
        else console.log('   -> FAILED:', JSON.stringify(dj).slice(0, 90));
      }
    }
  }
  console.log(APPLY ? `done — ${deleted} duplicate(s) deleted` : 'DRY RUN — rerun with --apply to delete');
})();
