// 10-08 PHASE R2 — AUDIT TRAIL: who did what, newest first. Stored in Neon
// (audit_log table, capped reads at 150) — dashboard-only, the engine never
// reads it.
import { db, dbReady } from './db.mjs';
import fs from 'node:fs';
import path from 'node:path';

export async function appendAudit(actor, action, detail = '') {
  try {
    if (dbReady) {
      await db`INSERT INTO audit_log (actor, action, detail) VALUES (${actor || 'unknown'}, ${action}, ${String(detail).slice(0, 160)})`;
      return;
    }
    // local/no-DB fallback: the original audit.json (repo)
    const p = path.resolve(process.cwd(), '..', 'yt-mcp', 'audit.json');
    let events = [];
    try { events = JSON.parse(fs.readFileSync(p, 'utf8')).events || []; } catch { }
    events.unshift({ at: new Date().toISOString(), actor: actor || 'unknown', action, detail: String(detail).slice(0, 160) });
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, JSON.stringify({ events: events.slice(0, 150) }, null, 2) + '\n');
  } catch {
    // audit is best-effort — never break the action it records
  }
}

export async function listAudit(limit = 100) {
  if (dbReady) {
    try {
      const rows = await db`SELECT at, actor, action, detail FROM audit_log ORDER BY at DESC LIMIT ${limit}`;
      return rows.map((r) => ({ at: new Date(r.at).toISOString(), actor: r.actor, action: r.action, detail: r.detail || '' }));
    } catch { }
  }
  try {
    const p = path.resolve(process.cwd(), '..', 'yt-mcp', 'audit.json');
    return JSON.parse(fs.readFileSync(p, 'utf8')).events || [];
  } catch {
    return [];
  }
}
