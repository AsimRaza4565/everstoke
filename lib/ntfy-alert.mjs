// #91 ALERT DELIVERY — ntfy pushes used to be silent-by-design: a missing
// NTFY_TOPIC returned without a word (the Oct-9 investors-compass ALERT died
// there), a failed fetch was swallowed by `catch {}` (so Oct 13-15 deliveries
// were unknowable), and ci-doctor's emoji Title header was rejected
// client-side by undici ("Cannot convert argument to a ByteString", run
// 39055331728) so even the #69 wiring never reached the phone.
// One sender for pipeline alerts: ASCII-safe headers, logged outcome on every
// path, ntfy retried, GitHub issue as the second channel. Never throws.
import { execFileSync } from 'node:child_process';

// Header values must be ByteStrings (Latin-1); anything above U+00FF — the
// emoji in run 39055331728's Title — makes undici reject the whole request.
export function asciiHeaderValue(s) {
  return String(s ?? '').replace(/[^\x20-\x7E]/g, '').trim();
}

// Returns { channel: 'ntfy' | 'github-issue' | 'none', ok: boolean }.
export async function sendAlert({
  text,
  title = 'Pipeline alert',
  topic = process.env.NTFY_TOPIC,
  issueTitle = null,   // second channel: issue created if no open match
  issueSearch = null,  // second channel: comment on newest open match
  fetchImpl = fetch,
  execImpl = null,     // injectable for tests; default execFileSync('gh', ...)
  sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
  attempts = 3,
  log = console.log,
} = {}) {
  const t = (topic || '').trim();
  if (t) {
    const headers = { 'Content-Type': 'text/plain', Priority: 'high', Title: asciiHeaderValue(title) };
    for (let n = 1; n <= attempts; n++) {
      try {
        const res = await fetchImpl(`https://ntfy.sh/${t}`, { method: 'POST', headers, body: String(text) });
        if (res.ok) { log(`[alert] ntfy push: sent`); return { channel: 'ntfy', ok: true }; }
        log(`[alert] ntfy attempt ${n}/${attempts}: HTTP ${res.status}`);
      } catch (e) {
        log(`[alert] ntfy attempt ${n}/${attempts} failed: ${String(e.message).slice(0, 80)}`);
      }
      if (n < attempts) await sleep(1000 * n);
    }
  } else {
    log(`[alert] no NTFY_TOPIC — push skipped, falling back to GitHub issue`);
  }

  if (!issueTitle && !issueSearch) {
    log(`[alert] all channels failed — no GitHub-issue fallback configured`);
    return { channel: 'none', ok: false };
  }
  const run = (cmd, args) =>
    execImpl ? execImpl(cmd, args) : execFileSync(cmd, args, { encoding: 'utf8', timeout: 30000 });
  try {
    let num = null;
    if (issueSearch) {
      const listing = run('gh', ['issue', 'list', '--state', 'open', '--search', issueSearch, '--limit', '1']);
      const first = String(listing).split('\n').find((l) => l.trim());
      if (first) num = first.split('\t')[0];
    }
    if (num) {
      run('gh', ['issue', 'comment', num, '--body', `${text}\n\n_Alerted at ${new Date().toISOString()} — ntfy second channel (verify-run #91)._`]);
      log(`[alert] GitHub issue: commented on #${num}`);
    } else {
      const created = run('gh', ['issue', 'create', '--title', issueTitle, '--body', `${text}\n\n_Auto-filed as the second alert channel (#91) after the ntfy push did not confirm._`]);
      log(`[alert] GitHub issue: created ${String(created).trim().split('/').pop() || '(url)'}`);
    }
    return { channel: 'github-issue', ok: true };
  } catch (e) {
    log(`[alert] GitHub issue fallback failed: ${String(e.message).slice(0, 80)}`);
    return { channel: 'none', ok: false };
  }
}
