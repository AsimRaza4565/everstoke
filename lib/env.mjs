// Shared .env loader across all automation scripts (issue #79).
// Order / behavior:
//   - Reads repo root .env if it exists
//   - Parses KEY=VALUE lines
//   - Preserves ??= semantics (only sets keys that are not already set in process.env)
//   - Safe against missing files (never throws on ENOENT)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

export function parseEnv(raw) {
  const result = {};
  if (!raw || typeof raw !== 'string') return result;
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const m = line.match(/^\s*([A-Z_0-9]+)=(.*)$/);
    if (m) {
      result[m[1]] ??= m[2].trim();
    }
  }
  return result;
}

export function loadEnvWith({
  env = process.env,
  envPath = path.join(ROOT, '.env'),
  readFile = (p) => (fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null),
} = {}) {
  try {
    const raw = readFile(envPath);
    if (!raw) return env;
    const parsed = parseEnv(raw);
    for (const [key, val] of Object.entries(parsed)) {
      env[key] ??= val;
    }
    return env;
  } catch {
    return env;
  }
}

export function loadEnv(envPathOrOpts) {
  if (typeof envPathOrOpts === 'string') {
    return loadEnvWith({ envPath: envPathOrOpts });
  }
  if (envPathOrOpts && typeof envPathOrOpts === 'object') {
    return loadEnvWith(envPathOrOpts);
  }
  return loadEnvWith();
}

export function envOf(key, fallback = '') {
  return process.env[key] || fallback;
}
