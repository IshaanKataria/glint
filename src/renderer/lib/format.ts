// Time and date formatting for the overlay timer and history list.

/** 22:18, or 1:02:05 past an hour. */
export function fmtDuration(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  const hh = Math.floor(s / 3600);
  const mm = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return hh ? `${hh}:${String(mm).padStart(2, '0')}:${ss}` : `${mm}:${ss}`;
}

/** 00:07 style timer for the recording bar. */
export function fmtTimer(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const mm = Math.floor(s / 60);
  return `${String(mm).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

/** Seconds from session start -> 0:04 / 12:31. */
export function fmtOffset(sec: number): string {
  return fmtDuration(sec * 1000);
}

const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

/** History group heading: "Today", "Yesterday", "Fri, Aug 15" (adds the year when it differs). */
export function dayHeading(t: number, now = new Date()): string {
  const d = new Date(t);
  if (sameDay(d, now)) return 'Today';
  const y = new Date(now);
  y.setDate(now.getDate() - 1);
  if (sameDay(d, y)) return 'Yesterday';
  const opts: Intl.DateTimeFormatOptions = { weekday: 'short', month: 'short', day: 'numeric' };
  if (d.getFullYear() !== now.getFullYear()) opts.year = 'numeric';
  return d.toLocaleDateString('en-US', opts);
}

export const dayKey = (t: number) => {
  const d = new Date(t);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
};

/** "Tuesday, Nov 4" for the note breadcrumb. */
export function longDate(t: number): string {
  return new Date(t).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
}

/** "2:41 PM" */
export function clockTime(t: number): string {
  return new Date(t).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}
