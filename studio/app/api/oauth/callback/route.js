// Google redirects here after the user picks an account + channel and clicks
// Allow. One login = ONE YouTube channel (Google's channel chooser handles
// accounts that own several channels). This route:
//   1. exchanges the code for tokens (offline → refresh_token),
//   2. identifies the channel via YouTube channels.list (title/handle/subs),
//   3. saves the token as the YT_TOKEN_<SLUG> GitHub secret (CI + Studio read it),
//   4. registers the channel in yt-mcp/studio-channels.json (no token in it),
//   5. redirects back to /channels/add?connected=<slug>.
import { ENV } from '@/lib/data.mjs';
import { isAuthed, getUser } from '@/lib/route-auth';
import { hmacToken } from '@/lib/auth-token';
import { readRegistry, upsertChannel, writeTokenSecret, writeLocalTokenFile, hasGithubToken, encryptJSON } from '@/lib/channels-registry';

export const dynamic = 'force-dynamic';

const LIVE_SLUGS = ['quotequarry', 'investors-compass', 'money-rulebook', 'debt-free-doctrine'];

function fail(req, msg) {
  const origin = new URL(req.url).origin;
  return Response.redirect(`${origin}/channels/add?error=${encodeURIComponent(msg.slice(0, 160))}`, 302);
}

function slugify(text) {
  return (
    String(text || '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'channel'
  );
}

export async function GET(req) {
  // safety net: a connect must NEVER end in a raw 500 — any unexpected error
  // becomes a readable message back on the wizard page
  try {
    return await handle(req);
  } catch (e) {
    console.error('[oauth/callback] unexpected:', e);
    return fail(req, 'Connect failed unexpectedly: ' + String(e.message || e).slice(0, 140));
  }
}

async function handle(req) {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state') || '';

  if (!code) return fail(req, 'Google did not return a code (login cancelled?)');

  // Two ways in:
  //  LINK mode — state is a signed expiring token (L.<expiry>.<hmac>) minted by
  //  /api/oauth/start?mode=link. Works in ANY browser; no Studio session there.
  //  SESSION mode — state must match the start cookie AND the user must be
  //  signed in to Studio.
  let linkMode = false;
  const m = /^L\.(\d+)\.([a-f0-9]{64})$/.exec(state);
  if (m) {
    // #58: links are signed with STUDIO_PASSWORD only (no CI-secret fallback)
    const key = process.env.STUDIO_PASSWORD || null;
    const want = await hmacToken(m[1], key);
    if (want !== m[2]) return fail(req, 'Connect link invalid — generate a new one in Studio.');
    if (Number(m[1]) < Date.now()) return fail(req, 'Connect link expired — generate a new one (links last 15 minutes).');
    linkMode = true;
  } else {
    if (!(await isAuthed(req))) return fail(req, 'Studio session expired — sign in again.');
    const cookies = req.headers.get('cookie') || '';
    const cookieState = cookies.match(/qs_oauth=([a-f0-9]+)/)?.[1];
    if (!cookieState || state !== cookieState) return fail(req, 'Login state mismatch — start the connect again.');
  }

  // 1. exchange code → tokens
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: ENV.YOUTUBE_CLIENT_ID,
      client_secret: ENV.YOUTUBE_CLIENT_SECRET,
      redirect_uri: `${url.origin}/api/oauth/callback`,
      grant_type: 'authorization_code',
    }),
  });
  const tokens = await tokenRes.json();
  if (!tokens.access_token || !tokens.refresh_token) {
    return fail(req, `Token exchange failed: ${(tokens.error_description || tokens.error || 'no refresh token').slice(0, 120)}`);
  }

  // 2. identify the channel this token belongs to (+ fetch its existing
  // branding so the wizard can prefill description/keywords from YouTube)
  const chRes = await fetch('https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics,brandingSettings&mine=true', {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });
  const chData = await chRes.json();
  const ch = chData.items?.[0];
  if (!ch) return fail(req, 'No YouTube channel came back — did the channel chooser get skipped?');
  const title = ch.snippet?.title || 'Unnamed channel';
  const handle = (ch.snippet?.customUrl || '').toLowerCase();
  const channelId = ch.id;
  const subs = Number(ch.statistics?.subscriberCount || 0);
  const ytDescription = String(ch.brandingSettings?.channel?.description || ch.snippet?.description || '').slice(0, 900);
  const ytKeywords = String(ch.brandingSettings?.channel?.keywords || '').slice(0, 500);

  // 3. slug — unique; reconnecting the SAME channel just updates its entry
  let slug = slugify(handle || title);
  let reg;
  try {
    reg = await readRegistry();
  } catch (e) {
    return fail(req, e.message);
  }
  const existing = (reg.channels || []).find((c) => c.channelId === channelId);
  const taken = new Set([...LIVE_SLUGS, ...(reg.channels || []).map((c) => c.slug)]);
  if (!existing) {
    while (taken.has(slug)) slug = `${slugify(handle || title).slice(0, 34)}-${Math.floor(Math.random() * 90 + 10)}`;
  }

  const tokenJson = JSON.stringify(
    {
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      scope: tokens.scope,
      token_type: 'Bearer',
      expiry_date: Date.now() + 3650 * 86400000,
    },
    null,
    2,
  );
  const secretName = `YT_TOKEN_${slug.toUpperCase().replace(/-/g, '_')}`;

  let secretWarning = null;
  try {
    if (!hasGithubToken()) throw new Error('no GITHUB_TOKEN on the server');
    await writeTokenSecret(secretName, tokenJson);
  } catch (e) {
    secretWarning = e.message;
  }
  // Local mode mirror (gitignored) so local tools see the new channel too.
  writeLocalTokenFile(slug, tokenJson);

  // 4. registry entry (never contains the token)
  // 10-08 P2: record WHO connected this channel (the dashboard account that
  // minted the link / pressed connect). Client-role users only ever see
  // channels whose ownerEmail matches their own email.
  const connector = await getUser(req);
  const entry = {
    slug,
    ownerEmail: connector?.email?.includes('@') ? connector.email : '',
    label: title.toUpperCase(),
    channelId,
    handle,
    subs,
    accent: '#38BDF8',
    niche: '',
    style: '',
    voice: '',
    slots: [],
    tokenSecret: secretName,
    tokenSecretSaved: !secretWarning,
    connectedAt: new Date().toISOString(),
    status: secretWarning ? 'connected · token secret FAILED (see note)' : 'connected · automation wiring pending',
    ...(secretWarning ? { tokenSecretError: secretWarning } : {}),
  };
  // 10-08: fetch what the channel ALREADY has on YouTube — description and
  // keywords prefill the wizard so the user doesn't retype their own channel
  entry.ytDescription = ytDescription;
  entry.ytKeywords = ytKeywords;
  // 10-09 ACTIVATION FLOW: connect ≠ publish. New channels start with the
  // autopilot explicitly OFF — production begins only when the user reviews
  // their setup and presses "Start Autopilot" (YouTube API Developer Policies
  // require express pre-execution consent for automated uploads).
  entry.autopilot = false;
  entry.autopilotStartedAt = null;
  // 10-08: encrypted copy of the token (AES-GCM, STUDIO_PASSWORD key) — the
  // ONLY way the dashboard can read wizard-channel stats (GitHub secrets are
  // write-only). Registry stays private-repo-only. Non-fatal: if encryption
  // fails the channel is still connected, the dashboard just can't read it.
  try {
    entry.tokenEnc = encryptJSON({ access_token: tokens.access_token, refresh_token: tokens.refresh_token, scope: tokens.scope, expiry_date: Date.now() + 3650 * 86400000 });
  } catch (e) {
    entry.tokenEncError = 'encrypt failed: ' + String(e.message || e).slice(0, 80);
  }
  try {
    await upsertChannel(entry);
  } catch (e) {
    return fail(req, `Channel connected (secret ${secretWarning ? 'FAILED: ' + secretWarning : 'saved'}) but registry commit failed: ${e.message}`);
  }

  // 5. back to the wizard
  const origin = url.origin;
  const qs = new URLSearchParams({ connected: slug });
  if (secretWarning) qs.set('secretWarning', secretWarning.slice(0, 140));
  return Response.redirect(`${origin}/channels/add?${qs}`, 302);
}
