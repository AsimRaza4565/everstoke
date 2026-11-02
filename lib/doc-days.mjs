// #96 DOC CADENCE — long-form supply for the clips-first lane. Kits may list
// several doc days (docDays: ['Tue','Fri']); the legacy single docDay keeps
// working; a kit with neither means docs are not scheduled for that channel.
// Weekday names are UTC ('Sun'..'Sat') matching yt-deepdive's existing guard.

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function docDaysOf(kit = {}) {
  if (Array.isArray(kit.docDays) && kit.docDays.length) return kit.docDays;
  if (kit.docDay) return [kit.docDay];
  return [];
}

export function isDocDay(kit, utcDate = new Date()) {
  const days = docDaysOf(kit);
  if (!days.length) return false;
  return days.includes(DAY_NAMES[utcDate.getUTCDay()]);
}
