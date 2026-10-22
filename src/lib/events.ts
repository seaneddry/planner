import { listEvents } from '../api';
import { useQuery } from './useQuery';
import { dateRange, klParts, timeLabel } from './dates';
import type { CalEvent, SpaceFilter } from '../types';

/** Events from linked calendars between two dates, cached for offline use. */
export function useEvents(from: string, to: string, cacheKey?: string) {
  return useQuery(() => listEvents(from, to), [from, to], cacheKey);
}

export function eventInSpace(e: CalEvent, space: SpaceFilter): boolean {
  return space === 'all' || (e.calendar?.space ?? 'work') === space;
}

/** All-day first, then by start time. */
export function sortEvents(a: CalEvent, b: CalEvent): number {
  if (a.all_day !== b.all_day) return a.all_day ? -1 : 1;
  return a.starts_at < b.starts_at ? -1 : a.starts_at > b.starts_at ? 1 : a.title.localeCompare(b.title);
}

/** Groups events by every day they cover, within [from, to]. */
export function eventsByDay(events: CalEvent[] | undefined, from: string, to: string, space: SpaceFilter): Map<string, CalEvent[]> {
  const m = new Map<string, CalEvent[]>();
  for (const e of events ?? []) {
    if (!eventInSpace(e, space)) continue;
    const s = e.start_date < from ? from : e.start_date;
    const t = e.end_date > to ? to : e.end_date;
    for (const d of dateRange(s, t)) m.set(d, [...(m.get(d) ?? []), e]);
  }
  for (const list of m.values()) list.sort(sortEvents);
  return m;
}

/** How the time reads on a given day: "All day", "10am", "from 11pm", "until 1am". */
export function eventTimes(e: CalEvent, day: string): { start: string; end: string } {
  if (e.all_day) return { start: 'All day', end: e.start_date !== e.end_date ? `till ${shortDayMonth(e.end_date)}` : '' };
  const s = klParts(e.starts_at);
  const en = klParts(e.ends_at);
  if (s.date === day && en.date === day) return { start: timeLabel(s.time), end: s.time === en.time ? '' : timeLabel(en.time) };
  if (s.date === day) return { start: timeLabel(s.time), end: 'overnight' };
  if (en.date === day) return { start: 'Until', end: timeLabel(en.time) };
  return { start: 'All day', end: '' };
}

/** "10am–11am" for a one-line label. */
export function eventTimeText(e: CalEvent, day: string): string {
  const t = eventTimes(e, day);
  return t.end && t.start !== 'All day' ? `${t.start}–${t.end}` : t.start;
}

/** True once a timed event has finished. */
export function eventIsPast(e: CalEvent, now = Date.now()): boolean {
  return !e.all_day && new Date(e.ends_at).getTime() < now;
}

function shortDayMonth(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
}
