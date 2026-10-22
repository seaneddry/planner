// Date helpers. Every date in the app is a plain YYYY-MM-DD string in Malaysia time,
// which avoids time-zone surprises. Maths is done in UTC on those strings.

const TZ = 'Asia/Kuala_Lumpur';

export function todayKL(now: Date = new Date()): string {
  return now.toLocaleDateString('en-CA', { timeZone: TZ });
}

/** Current time in Malaysia as HH:MM. */
export function nowTimeKL(now: Date = new Date()): string {
  return now.toLocaleTimeString('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false });
}

function toUtc(iso: string): Date {
  return new Date(`${iso}T00:00:00Z`);
}

export function addDays(iso: string, n: number): string {
  const d = toUtc(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function addMonths(iso: string, n: number): string {
  const [y, m, day] = iso.split('-').map(Number);
  const target = new Date(Date.UTC(y, m - 1 + n, 1));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(day, last));
  return target.toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string): number {
  return Math.round((toUtc(to).getTime() - toUtc(from).getTime()) / 86400000);
}

/** 1 = Monday … 7 = Sunday */
export function isoWeekday(iso: string): number {
  const d = toUtc(iso).getUTCDay();
  return d === 0 ? 7 : d;
}

export function startOfWeek(iso: string): string {
  return addDays(iso, 1 - isoWeekday(iso));
}

export function monthStart(iso: string): string {
  return `${iso.slice(0, 7)}-01`;
}

export function isWeekend(iso: string): boolean {
  return isoWeekday(iso) >= 6;
}

export function dateRange(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

function fmt(iso: string, opts: Intl.DateTimeFormatOptions): string {
  return toUtc(iso).toLocaleDateString('en-GB', { ...opts, timeZone: 'UTC' });
}

/** "Fri 23 Oct" */
export function shortDate(iso: string): string {
  return fmt(iso, { weekday: 'short', day: 'numeric', month: 'short' });
}

/** "23 Oct 2026" */
export function longDate(iso: string): string {
  return fmt(iso, { day: 'numeric', month: 'short', year: 'numeric' });
}

/** "Thursday, 22 October" */
export function fullDate(iso: string): string {
  return fmt(iso, { weekday: 'long', day: 'numeric', month: 'long' });
}

export function monthLabel(iso: string): string {
  return fmt(iso, { month: 'long', year: 'numeric' });
}

export function weekdayShort(iso: string): string {
  return fmt(iso, { weekday: 'short' });
}

/** Today, Tomorrow, Yesterday, a weekday name within the coming week, otherwise "Fri 23 Oct". */
export function relativeDay(iso: string, today: string = todayKL()): string {
  const diff = daysBetween(today, iso);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  if (diff > 1 && diff < 7) return fmt(iso, { weekday: 'long' });
  const sameYear = iso.slice(0, 4) === today.slice(0, 4);
  return sameYear ? shortDate(iso) : longDate(iso);
}

/** "3pm", "3:30pm" from "15:00" or "15:30:00" */
export function timeLabel(t: string | null | undefined): string {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  const suffix = h >= 12 ? 'pm' : 'am';
  const hr = h % 12 === 0 ? 12 : h % 12;
  return m ? `${hr}:${String(m).padStart(2, '0')}${suffix}` : `${hr}${suffix}`;
}

/** A Malaysia-time date and time as an ISO timestamp. */
export function klTimestamp(date: string, time: string): string {
  return new Date(`${date}T${time.slice(0, 5)}:00+08:00`).toISOString();
}

/** Splits a timestamp into its Malaysia-time date and HH:MM. */
export function klParts(ts: string): { date: string; time: string } {
  const d = new Date(ts);
  return { date: todayKL(d), time: nowTimeKL(d) };
}

/** "2 days", "1 week" style duration for waiting times. */
export function ageLabel(days: number): string {
  if (days <= 0) return 'today';
  if (days < 14) return `${days}d`;
  if (days < 60) return `${Math.floor(days / 7)}w`;
  return `${Math.floor(days / 30)}mo`;
}

/** relativeDay for use mid-sentence: "tomorrow", but "Friday" and "Fri 23 Oct" keep their capitals. */
export function relativeInline(iso: string, today: string = todayKL()): string {
  const r = relativeDay(iso, today);
  return /^(Today|Tomorrow|Yesterday)$/.test(r) ? r.toLowerCase() : r;
}
