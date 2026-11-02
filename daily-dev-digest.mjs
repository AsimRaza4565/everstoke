// Daily.dev news digest -> ntfy phone push
// Pulls trending dev posts + fresh AI-tag posts from the daily.dev public API
// and sends one short digest each morning to NTFY_TOPIC.
// Token: Settings > API at daily.dev (starts with dda_). Free plan = 200 req/month,
// this job uses 2/day. API docs: https://docs.daily.dev
import fs from 'fs';

const API = 'https://api.daily.dev/public/v1';

function log(m) { console.log('[dailydev] ' + m); }

async function fetchFeed(pathname) {
  const token = (process.env.DAILY_DEV_TOKEN || '').trim();
  if (!token) throw new Error('no DAILY_DEV_TOKEN');
  const res = await fetch(API + pathname, { headers: { Authorization: 'Bearer ' + token } });
  if (!res.ok) throw new Error(pathname + ' HTTP ' + res.status);
  const json = await res.json();
  const raw = Array.isArray(json.data) ? json.data : ((json.data && json.data.edges) ? json.data.edges.map(e => e.node || e) : []);
  return raw.filter(p => p && p.title);
}

// Keep only real articles from the last N hours (drops freeform threads + reposts)
function rank(posts, hours) {
  const cutoff = Date.now() - hours * 3600 * 1000;
  return posts
    .filter(p => p.url && p.type !== 'freeform' && p.createdAt && new Date(p.createdAt).getTime() >= cutoff)
    .sort((a, b) => (b.numUpvotes || 0) - (a.numUpvotes || 0));
}

// X/Twitter reposts carry multi-line embed text — keep the first line only
function cleanTitle(t) {
  return String(t).split('\n')[0].replace(/\s+/g, ' ').trim().slice(0, 140);
}

function render(posts) {
  return posts.map(function (p, i) {
    const meta = (p.numUpvotes ? p.numUpvotes + ' up' : 'new')
      + (p.numComments ? ', ' + p.numComments + ' comments' : '')
      + (p.readTime ? ' · ' + p.readTime + ' min read' : '');
    return (i + 1) + '. ' + cleanTitle(p.title) + '\n' + meta + '\n' + p.url;
  }).join('\n\n');
}

async function main() {
  log('Fetching feeds from daily.dev...');

  let popular = [];
  let ai = [];
  let feedErrors = [];
  try {
    popular = rank(await fetchFeed('/feeds/popular?limit=15'), 48).slice(0, 8);
    log('Popular feed: ' + popular.length + ' fresh articles (48h)');
  } catch (e) { feedErrors.push('popular: ' + e.message); }
  try {
    const seen = new Set(popular.map(p => p.title.toLowerCase()));
    ai = rank(await fetchFeed('/feeds/tag/ai?limit=15'), 48).filter(p => !seen.has(p.title.toLowerCase())).slice(0, 5);
    log('AI feed: ' + ai.length + ' fresh articles (48h)');
  } catch (e) { feedErrors.push('ai: ' + e.message); }

  if (!popular.length && !ai.length) {
    log('FAIL: both feeds failed — ' + feedErrors.join(' | '));
    process.exit(1);
  }
  const sections = [];
  if (popular.length) sections.push('🔥 TRENDING\n\n' + render(popular));
  if (ai.length) sections.push('🤖 AI WATCH\n\n' + render(ai));
  const body = sections.join('\n\n———\n\n');
  const total = popular.length + ai.length;
  log('Digest built: ' + total + ' stories');

  const topic = (process.env.NTFY_TOPIC || '').trim().replace(/[^a-zA-Z0-9_-]/g, '');
  if (!topic) {
    log('GAP: no NTFY_TOPIC — digest not pushed to phone');
    console.log('\n' + body);
    return;
  }
  // ntfy headers must be ASCII-only (body can be UTF-8)
  const res = await fetch('https://ntfy.sh/' + topic, {
    method: 'POST',
    headers: {
      'Title': 'Daily.dev digest - ' + new Date().toISOString().slice(0, 10) + ' (' + total + ' stories)',
      'Tags': 'newspaper',
      'Filename': 'daily-dev-' + new Date().toISOString().slice(0, 10) + '.txt'
    },
    body: body
  });
  if (res.ok) log('NTFY: digest sent to phone OK');
  else { log('FAIL: NTFY HTTP ' + res.status); process.exit(1); }
}

main().catch(e => { log('FAIL: ' + e.message); process.exit(1); });
