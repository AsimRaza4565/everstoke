// #91 ALERT DELIVERY — 2026-11-11: the ntfy.sh push transport was REMOVED by
// owner decision (delivery to the phone was never confirmable). The alert
// channel is now GitHub Issues via the gh CLI (GITHUB_TOKEN env on runners).
// The filename is kept (lib/ntfy-alert.mjs) so existing importers stay valid.
// Contract: never throws, logs every outcome, files/comments exactly one
// issue per alert. issueTitle defaults to `title` when not provided, so
// legacy callers that only passed text+title still get a durable alert.
import { execFileSync } from 'node:child_process';

// Header values must be ByteStrings (Latin-1); anything above U+00FF makes
// undici reject the whole request. (Kept: ci-doctor still formats titles.)
export function asciiHeaderValue(s) {
  return String(s ?? '').replace(/[^\x20-\x7E]/g, '').trim();
}

// Returns { channel: 'github-issue' | 'none', ok: boolean }.
export async function sendAlert({
  text,
  title = 'Pipeline alert',
  issueTitle = null,   // defaults to `title` — every alert files an issue
  issueSearch = null,  // if set and an open match exists, comment instead
  execImpl = null,     // injectable for tests; default execFileSync('gh', ...)
  log = console.log,
} = {}) {
  const run = (cmd, args) =>
    execImpl ? execImpl(cmd, args) : execFileSync(cmd, args, { encoding: 'utf8', timeout: 30000 });
  const issue = asciiHeaderValue(issueTitle || title) || 'Pipeline alert';
  try {
    let num = null;
    if (issueSearch) {
      const listing = run('gh', ['issue', 'list', '--state', 'open', '--search', issueSearch, '--limit', '1']);
      const first = String(listing).split('\n').find((l) => l.trim());
      if (first) num = first.split('\t')[0];
    }
    if (num) {
      run('gh', ['issue', 'comment', num, '--body', `${text}\n\n_Alerted at ${new Date().toISOString()} — pipeline alert channel (#91, ntfy removed 11-11)._`]);
      log(`[alert] GitHub issue: commented on #${num}`);
    } else {
      const created = run('gh', ['issue', 'create', '--title', issue, '--body', `${text}\n\n_Auto-filed by the pipeline alert channel (ntfy removed 11-11)._`]);
      log(`[alert] GitHub issue: created ${String(created).trim().split('/').pop() || '(url)'}`);
    }
    return { channel: 'github-issue', ok: true };
  } catch (e) {
    log(`[alert] GitHub issue failed: ${String(e.message).slice(0, 80)}`);
    return { channel: 'none', ok: false };
  }
}
