// #44: shared text-hash for TTS resume caches — a cached mp3/duration may only
// be reused when its text is unchanged. sha256[:16], matching edge_batch.py's
// _hash (same digest for the same string — pinned by tests/state of the
// cross-language check in the #44 close comment).
import crypto from 'node:crypto';
export const textHash = (s) => crypto.createHash('sha256').update(String(s ?? '')).digest('hex').slice(0, 16);
