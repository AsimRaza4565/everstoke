import { NextResponse } from 'next/server';
import { authToken } from '@/lib/auth-token';
import { parseSessionCookie } from '@/lib/session';

// 10-08 ROLE-BASED ACCESS — the site's front door.
// Identity: qs_session (signed per-person, Google or password login) OR the
// legacy qs_key cookie (counts as owner). Then the route→role matrix below.
// Best practice: this is the FIRST gate — mutating API routes re-check the
// role server-side in lib/route-auth.js (never trust the UI alone).

const COOKIE = 'qs_key';

// Dev convenience: no STUDIO_PASSWORD set outside Vercel → studio stays open.
// On Vercel the gate is always on (fail closed).
export default async function proxy(req) {
  const password = process.env.STUDIO_PASSWORD;
  if (!password && !process.env.VERCEL) return NextResponse.next();

  const { pathname } = req.nextUrl;
  const isPublic =
    pathname === '/login' ||
    pathname === '/api/login' ||
    pathname === '/api/logout' ||
    pathname === '/api/oauth/callback' || // self-authenticating (signed link / session)
    pathname.startsWith('/api/auth/google/') ||
    pathname === '/proof' || // public sales page (stats only, no revenue data)
    pathname === '/api/proof' ||
    pathname === '/client'; // DFY client workspace (page gate itself; APIs still auth)
  if (isPublic) return NextResponse.next();

  // resolve the role
  let role = null;
  const sessCookie = req.cookies.get('qs_session')?.value;
  const claims = await parseSessionCookie(sessCookie);
  if (claims && Number(claims.x) > Date.now()) role = claims.r;
  else {
    // #58: fail closed — with no configured password the legacy qs_key check
    // compared against the hash of a fixed string (== owner for anyone)
    const legacy = password ? req.cookies.get(COOKIE)?.value : null;
    if (legacy && legacy === (await authToken(password))) role = 'owner';
  }
  if (!role) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'locked — sign in at /login first' }, { status: 401 });
    }
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    url.search = '';
    url.searchParams.set('next', pathname);
    return NextResponse.redirect(url);
  }

  // route → role matrix (first match wins; everything else = any signed-in role)
  const RULES = [
    // owner only — settings, wizard/channel management, connect-link minting, team
    { match: (p) => p === '/settings' || p === '/users' || p.startsWith('/api/users') || p.startsWith('/api/team') || p === '/api/oauth/start' || (p.startsWith('/api/channels/') && p !== '/api/channels/flow' && p !== '/api/channels/keys'), roles: ['owner'] },
    // owner + staff — the engine room (clients live on Topics/Analytics/Channels)
    { match: (p) => p === '/production' || p === '/api/action' || p === '/music' || p === '/social' || p.startsWith('/api/audit'), roles: ['owner', 'staff'] },
    { match: (p) => p === '/create' || p.startsWith('/api/create-video'), roles: ['owner', 'staff'] },
    { match: (p) => p === '/thumbs' || p.startsWith('/api/thumbs/'), roles: ['owner', 'staff', 'client'] },
    // clients join the Topic Desk for their own channels (server checks ownership)
    { match: (p) => p === '/topics' || p.startsWith('/api/topics') || p === '/api/channels/flow' || p === '/api/channels/keys', roles: ['owner', 'staff', 'client'] },
  ];
  const rule = RULES.find((r) => r.match(pathname));
  if (rule && !rule.roles.includes(role)) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'your role does not allow this' }, { status: 403 });
    }
    return NextResponse.redirect(new URL('/', req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.svg$|.*\\.png$|.*\\.ico$).*)'],
};
