// Daily niche image post for each mapped FB page: cinematic poster in the
// FB page's own brand style, with niche content + SEO caption.
// Usage: node fb-images.mjs [slug] [--dry]     (no slug = all 4 mapped pages)
import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { google } from 'googleapis';
import { renderCinematicPoster } from './cinematic-engine.mjs';
import { loadAllStates, saveChannelState } from './lib/state.mjs';
import { loadEnv } from './lib/env.mjs';

loadEnv();





const DRY = process.argv.includes('--dry');
const args = process.argv.slice(2);
const ONLY = args.find(a => !a.startsWith('--'));

const MAP = [
  { slug: 'investors-compass', pageId: '116157974886564', hashtags: '#InvestingPsychology #StockMarket #WealthBuilding' },
  { slug: 'money-rulebook', pageId: '1077306835630491', hashtags: '#MoneyRules #PersonalFinance #FinancialFreedom' },
  { slug: 'debt-free-doctrine', pageId: '106473735839651', hashtags: '#DebtFree #MoneyTips #FinancialFreedom' },
  { slug: 'quotequarry', pageId: '114550268199751', hashtags: '#Stoicism #DailyWisdom #Mindset' }
];

function llmJSON(prompt) {
  // Gemini -> HF Llama, JSON only
  return (async () => {
    if (process.env.GEMINI_API_KEY) {
      try {
        const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.9, responseMimeType: 'application/json' } })
        });
        const d = await r.json();
        const t = d.candidates?.[0]?.content?.parts?.[0]?.text;
        const p = t ? JSON.parse(t.replace(/^```json\s*/, '').replace(/```$/, '').trim()) : null;
        if (p?.headline && p?.insight) return p;
      } catch { }
    }
    const hf = process.env.HF_TOKEN;
    if (hf) {
      const r = await fetch('https://router.huggingface.co/v1/chat/completions', {
        method: 'POST', headers: { Authorization: `Bearer ${hf}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'meta-llama/Llama-3.1-8B-Instruct', messages: [{ role: 'user', content: prompt }], max_tokens: 300 })
      });
      const d = await r.json();
      const t = (d.choices?.[0]?.message?.content || '').replace(/```json|```/g, '').trim();
      const p = JSON.parse(t.slice(t.indexOf('{'), t.lastIndexOf('}') + 1));
      if (p?.headline && p?.insight) return p;
    }
    throw new Error('no poster text provider');
  })();
}

const b = (await import('./yt-brands/brands.mjs')).bySlug;
const { researchTrend } = await import('./trend-research.mjs');
const stateFile = 'yt-mcp/schedule-state.json';
const loadState = () => loadAllStates();

const auth = new google.auth.OAuth2(process.env.YOUTUBE_CLIENT_ID || '', process.env.YOUTUBE_CLIENT_SECRET || '');

for (const job of MAP) {
  if (ONLY && job.slug !== ONLY) continue;
  const brand = b[job.slug];
  if (!brand) continue;
  // #64: one bad LLM response or network hiccup must not kill the whole
  // 4-page poster pass — every per-job failure skips only this page.
  try {
  const st = loadState();
  if (st[job.slug]?.imageDate === new Date().toISOString().slice(0, 10) && !DRY) {
    console.log(`[fb-img] ${job.slug}: already posted today`); continue;
  }
  // channel token -> trend (cached) + auth for nothing else
  try {
    const t = JSON.parse(fs.readFileSync(`yt-mcp/channels/${job.slug}/token.json`, 'utf8'));
    auth.setCredentials({ refresh_token: t.refresh_token });
    var trend = await researchTrend(job.slug, auth, [...brand.niches, ...brand.tags.slice(0, 2)]);
  } catch { var trend = { hotKeywords: [] }; }

  const prompt = `Write ONE social media image post for "${brand.label}" (Niche: ${brand.niche}).
Hot keywords right now: ${trend.hotKeywords.join(', ') || brand.tags.slice(0, 4).join(', ')}.
Return ONLY JSON: {"headline":"punchy <=5 word line in title case (MUST fit 3 short lines)","insight":"1-2 short sentences (max 25 words) that make the reader feel smarter"}`;
  console.log(`[fb-img] ${job.slug}: writing poster...`);
  let post;
  try { post = await llmJSON(prompt); } catch (e) { console.log(`[fb-img] ${job.slug}: LLM failed — skipping page: ${String(e.message).slice(0, 80)}`); continue; }
  if (!post?.headline || !post?.insight) { console.log(`[fb-img] ${job.slug}: LLM returned no usable post — skipping page`); continue; }
  console.log(`[fb-img] poster text: "${post.headline}"`);

  const out = `demos/fb-img-${job.slug}.jpg`;
  const caption = `${post.headline}\n\n${post.insight}\n\nFollow for daily ${brand.kwShort}. ${job.hashtags}`;

  if (DRY) { console.log(`[fb-img] DRY ${job.slug}: "${post.headline}" -> ${out}`); continue; }

  fs.mkdirSync('demos', { recursive: true });
  try {
    await renderCinematicPoster({ id: job.pageId }, { headline: post.headline, insight_body: post.insight }, out);
    console.log(`[fb-img] poster rendered: ${out}`);
  } catch (e) {
    console.log(`[fb-img] ${job.slug}: poster render failed — skipping: ${String(e.message).slice(0, 80)}`);
    continue;
  }

  const pageTokenRes = await fetch(`https://graph.facebook.com/v20.0/me/accounts?fields=access_token&limit=500&access_token=${process.env.FB_PAGE_TOKEN}`);
  const pj = await pageTokenRes.json().catch(() => ({}));
  if (pj.error) throw new Error(`me/accounts: ${String(pj.error.message).slice(0, 80)}`);
  const pages = pj.data || [];
  const pt = pages.find(p => p.id === job.pageId)?.access_token || process.env.FB_PAGE_TOKEN;
  const form = new FormData();
  form.append('source', new Blob([fs.readFileSync(out)], { type: 'image/jpeg' }), 'post.jpg');
  form.append('caption', caption.slice(0, 4000));
  const res = await fetch(`https://graph.facebook.com/v20.0/${job.pageId}/photos?access_token=${encodeURIComponent(pt)}`, { method: 'POST', body: form });
  const data = await res.json();
  if (data.id) {
    console.log(`  ✓ FB image live on page ${job.pageId} — "${post.headline}" (post ${data.id})`);
    const st2 = loadState();
    st2[job.slug] = st2[job.slug] || {};
    st2[job.slug].imageDate = new Date().toISOString().slice(0, 10);
    saveChannelState(job.slug, st2[job.slug]);
  } else {
    console.log(`  ✗ FB image failed:`, JSON.stringify(data).slice(0, 140));
  }
  } catch (e) {
    console.log(`[fb-img] ${job.slug}: page failed — continuing: ${String(e.message).slice(0, 100)}`);
  }
}
function saveState(s) { fs.writeFileSync(stateFile, JSON.stringify(s, null, 2)); }
