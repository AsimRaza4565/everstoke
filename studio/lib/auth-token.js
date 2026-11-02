// Shared, dependency-free auth token (works in Edge middleware + Node routes).
// The cookie never stores the password — only this one-way hash of it.
const SALT = 'quarry-studio-v1';

export async function authToken(password) {
  const data = new TextEncoder().encode(`${password || ''}::${SALT}`);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// 10-05: HMAC for connect links — state the callback can verify in ANY browser
// without a Studio session (only Studio can mint these; they expire).
export async function hmacToken(payload, keyMaterial) {
  // #58: no in-repo fallback key — callers must pass real secret material
  if (!keyMaterial) throw new Error('hmac key material missing');
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(keyMaterial),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(String(payload)));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
