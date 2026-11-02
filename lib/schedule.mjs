// Slot scheduling helper — shared semantics with yt-daily's nextSlotISO
// (private today; this lib copy is what the clips lane (#98) uses so the
// publisher schedules at the channel's viewer-facing slot times).
// Slots are UTC 'HH:MM'. A slot nearer than 35 minutes — or already past —
// rolls to tomorrow, matching yt-daily's upload guard.

export function nextSlotISO(hhmm, now = new Date()) {
  const [h, m] = hhmm.split(':').map(Number);
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), h, m, 0));
  if (d <= new Date(now.getTime() + 35 * 60 * 1000)) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().replace(/\.\d+Z$/, 'Z');
}

// #37: should a topup/heal run suppress tomorrow's cron? Only when tomorrow's
// slots are actually COVERED by healed reels. The old rule (any produced
// result suppresses the whole day) caused day-on/day-off oscillation: a reel
// landing TODAY covers today — tomorrow's cron must still run — and a
// partial tomorrow-coverage blanked the whole day anyway.
export function shouldSuppressNext(results, slotsCount, tomorrowStr) {
  if (!Array.isArray(results)) return false;
  const tomorrowReels = results.filter(
    (r) => r && r.videoId && String(r.publishAt || '').slice(0, 10) === String(tomorrowStr)
  ).length;
  return Number(slotsCount) > 0 && tomorrowReels >= Number(slotsCount);
}
