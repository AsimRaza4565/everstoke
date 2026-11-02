// #65: fetch whose deadline covers the BODY, not just the headers.
// The old per-site pattern (clearTimeout immediately after `await fetch`)
// left the body transfer unbounded — a server that stalls mid-body hung the
// whole build inside unwatched await chains.
export async function fetchBuffer(url, { timeoutMs = 180000, headers, signal } = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(new Error(`download deadline ${timeoutMs}ms exceeded`)), timeoutMs);
  const onExternal = () => ctrl.abort(new Error('external abort'));
  signal?.addEventListener('abort', onExternal, { once: true });
  try {
    const r = await fetch(url, { headers, signal: ctrl.signal });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const buf = Buffer.from(await r.arrayBuffer()); // timer still armed here
    return { buf, status: r.status };
  } finally {
    clearTimeout(t);
    signal?.removeEventListener('abort', onExternal);
  }
}
