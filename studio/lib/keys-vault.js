// BYOK vault core (Studio side). Keep the crypto in sync with /lib/channel-keys.mjs (CI side).
// #104 (D8): the AES key is derived from MASTER_KEY when set; the legacy derivation
// (YOUTUBE_CLIENT_SECRET-based) remains as a deprecated fallback so pre-existing rows
// keep reading — readKeys() migrates them to key_version 2 on first read under MASTER_KEY.
// Legacy rows never lock out: without MASTER_KEY everything decrypts exactly as before.
import crypto from 'node:crypto';

export const PROVIDERS = {
  gemini:   { env: 'GEMINI_API_KEY',   label: 'Gemini (Google AI Studio)', url: 'https://aistudio.google.com/apikey',            hint: 'script brain #1' },
  groq:     { env: 'GROQ_API_KEY',     label: 'Groq',                       url: 'https://console.groq.com/keys',                 hint: 'script brain #2' },
  cerebras: { env: 'CEREBRAS_API_KEY', label: 'Cerebras',                   url: 'https://cloud.cerebras.ai',                     hint: 'script brain #3' },
  mistral:  { env: 'MISTRAL_API_KEY',  label: 'Mistral',                    url: 'https://console.mistral.ai/api-keys',           hint: 'script brain #4' },
  hf:       { env: 'HF_TOKEN',         label: 'HuggingFace',                url: 'https://huggingface.co/settings/tokens',        hint: 'script brain #5 (fallback)' },
  openai:   { env: 'OPENAI_API_KEY',   label: 'OpenAI',                     url: 'https://platform.openai.com/api-keys',          hint: 'voice + transcription' },
  pixabay:  { env: 'PIXABAY_API_KEY',  label: 'Pixabay',                    url: 'https://pixabay.com/api/docs/',                 hint: '4K footage + photos' },
  pexels:   { env: 'PEXELS_API_KEY',   label: 'Pexels',                     url: 'https://www.pexels.com/api/',                   hint: 'documentary photos' },
  openrouter: { env: 'OPENROUTER_API_KEY', label: 'OpenRouter',               url: 'https://openrouter.ai/keys',                    hint: '200+ models, one key (#28)' },
  elevenlabs: { env: 'ELEVENLABS_API_KEY', label: 'ElevenLabs',             url: 'https://elevenlabs.io/app/api-keys',            hint: 'voice cloning & premium narration (#29)' },
};

export const KEY_VERSION_LEGACY = 1; // derived from YOUTUBE_CLIENT_SECRET (deprecated)
export const KEY_VERSION_MASTER = 2; // derived from MASTER_KEY

let legacyWarned = false;
function warnLegacyDerivationOnce() {
  if (legacyWarned) return;
  legacyWarned = true;
  console.warn('[keys-vault] DEPRECATED: MASTER_KEY is not set — falling back to the legacy YOUTUBE_CLIENT_SECRET key derivation. Set MASTER_KEY and re-save channel keys to migrate to key_version 2.');
}

export function masterEncKey() {
  return crypto.createHash('sha256').update('quarry-channel-keys-v2|' + String(process.env.MASTER_KEY || '')).digest();
}

// Legacy derivation (key_version 1) — kept byte-identical to the pre-#104 vault
// so existing stored rows remain readable (no lockout ever).
export function legacyEncKey() {
  return crypto.createHash('sha256').update('quarry-channel-keys-v1|' + String(process.env.YOUTUBE_CLIENT_SECRET || '')).digest();
}

// version: KEY_VERSION_LEGACY | KEY_VERSION_MASTER; omitted → prefer MASTER_KEY,
// falling back to the legacy derivation with a one-per-process deprecation warning.
export function keysEncKey(version) {
  if (version === KEY_VERSION_MASTER) return masterEncKey();
  if (version === KEY_VERSION_LEGACY) return legacyEncKey();
  if (process.env.MASTER_KEY) return masterEncKey();
  warnLegacyDerivationOnce();
  return legacyEncKey();
}

export function currentKeyVersion() {
  return process.env.MASTER_KEY ? KEY_VERSION_MASTER : KEY_VERSION_LEGACY;
}

function encryptWith(obj, key) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([c.update(JSON.stringify(obj), 'utf8'), c.final()]);
  return [iv.toString('base64'), c.getAuthTag().toString('base64'), ct.toString('base64')].join('.');
}

export function encryptKeys(obj) {
  return encryptWith(obj, keysEncKey());
}

function decryptWith(s, key) {
  try {
    const [iv, tag, ct] = String(s).split('.');
    const d = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64'));
    d.setAuthTag(Buffer.from(tag, 'base64'));
    return JSON.parse(Buffer.concat([d.update(Buffer.from(ct, 'base64')), d.final()]).toString('utf8'));
  } catch {
    return null;
  }
}

export function decryptKeys(s) {
  // With MASTER_KEY set, try the master derivation first, then the legacy one —
  // pre-migration rows must keep decrypting (wrong MASTER_KEY → null, never garbage).
  if (process.env.MASTER_KEY) {
    const viaMaster = decryptWith(s, masterEncKey());
    if (viaMaster !== null) return viaMaster;
  }
  return decryptWith(s, legacyEncKey());
}

// Read a vault record ({ enc, key_version? }) → { keys, enc, key_version, migrated }.
// Migration-on-read (#104): a legacy (v1, or version-less) row read while MASTER_KEY
// is set is re-encrypted under the master key (content unchanged) and returned with
// key_version 2 — the caller persists enc/key_version on the record. Without
// MASTER_KEY, legacy rows read exactly as before and are returned untouched.
// Fail-closed: wrong/missing key material → keys null, never garbage.
export function readKeys(entry) {
  if (!entry?.enc) return { keys: null, enc: entry?.enc, key_version: KEY_VERSION_LEGACY, migrated: false };
  const declared = Number(entry.key_version) || KEY_VERSION_LEGACY;
  let version = declared;
  let keys = decryptWith(entry.enc, keysEncKey(declared));
  if (keys === null && declared !== KEY_VERSION_MASTER && process.env.MASTER_KEY) {
    // row declared/assumed legacy but is actually master-encrypted (or vice versa) — try v2 before failing
    keys = decryptWith(entry.enc, masterEncKey());
    if (keys !== null) version = KEY_VERSION_MASTER;
  }
  if (keys === null) return { keys: null, enc: entry.enc, key_version: declared, migrated: false };
  if (version === KEY_VERSION_MASTER || !process.env.MASTER_KEY) {
    return { keys, enc: entry.enc, key_version: version, migrated: false };
  }
  return { keys, enc: encryptWith(keys, masterEncKey()), key_version: KEY_VERSION_MASTER, migrated: true };
}

// Test-only: reset the once-per-process deprecation flag (used by the test suite).
export function _resetLegacyWarnForTests() {
  legacyWarned = false;
}

export function maskKey(k) {
  const s = String(k || '');
  return s.length > 8 ? '••••' + s.slice(-4) : '••••';
}

const withTimeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timed out')), ms))]);

// Live test call per provider — validate-before-save is mandatory (Google now
// rejects broken/unrestricted keys at call time anyway; failing here is kinder).
export async function validateKey(provider, key) {
  const k = String(key || '').trim();
  if (!k) return { ok: false, detail: 'empty key' };
  const bad = (msg) => ({ ok: false, detail: String(msg || 'rejected').slice(0, 140) });
  const bearer = (url) => withTimeout(fetch(url, { headers: { Authorization: `Bearer ${k}` } }), 12000);
  try {
    let r;
    switch (provider) {
      case 'gemini':
        r = await withTimeout(fetch(`https://generativelanguage.googleapis.com/v1beta/models?pageSize=1&key=${encodeURIComponent(k)}`), 12000);
        if (!r.ok) return bad((await r.json().catch(() => ({})))?.error?.message || `HTTP ${r.status}`);
        return { ok: true, detail: '' };
      case 'groq':
        r = await bearer('https://api.groq.com/openai/v1/models');
        break;
      case 'cerebras':
        r = await bearer('https://api.cerebras.ai/v1/models');
        break;
      case 'mistral':
        r = await bearer('https://api.mistral.ai/v1/models');
        break;
      case 'openai':
        r = await bearer('https://api.openai.com/v1/models');
        break;
      case 'openrouter': // #28: OpenAI-compatible — one key, 200+ models
        r = await bearer('https://openrouter.ai/api/v1/models');
        break;
      case 'elevenlabs': // #29: xi-api-key header auth
        r = await withTimeout(fetch('https://api.elevenlabs.io/v1/user', { headers: { 'xi-api-key': k } }), 12000);
        break;
      case 'hf': {
        r = await bearer('https://huggingface.co/api/whoami-v2');
        if (r.ok) return { ok: true, detail: '' };
        break;
      }
      case 'pixabay': {
        r = await withTimeout(fetch(`https://pixabay.com/api/?key=${encodeURIComponent(k)}&q=morning&per_page=3`), 12000);
        if (r.ok) {
          const j = await r.json().catch(() => ({}));
          if (typeof j.totalHits === 'number') return { ok: true, detail: '' };
          return bad(j.message || 'unexpected response');
        }
        break;
      }
      case 'pexels':
        r = await withTimeout(fetch('https://api.pexels.com/v1/curated?per_page=1', { headers: { Authorization: k } }), 12000);
        break;
      default:
        return bad('unknown provider');
    }
    if (r.ok) return { ok: true, detail: '' };
    const body = await r.json().catch(() => ({}));
    return bad(body?.error?.message || body?.error || `HTTP ${r.status}`);
  } catch (e) {
    return bad(e.message);
  }
}
