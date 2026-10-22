// iCal parsing for planner-calsync: turns a feed into event rows inside the sync window,
// with repeating events expanded. Kept separate so it can be tested on its own.
import ICAL from 'npm:ical.js@2.1.0';

export const PAST_DAYS = 14;
export const FUTURE_DAYS = 180;
const MAX_OCCURRENCES = 1500;

function klDate(d: Date): string {
  return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kuala_Lumpur' });
}
function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export interface Row {
  user_id: string;
  calendar_id: string;
  uid: string;
  title: string;
  location: string | null;
  all_day: boolean;
  starts_at: string;
  ends_at: string;
  start_date: string;
  end_date: string;
}

// deno-lint-ignore no-explicit-any
type IcalTime = any;

function toRow(
  base: { user_id: string; calendar_id: string },
  uid: string,
  summary: string,
  location: string | null,
  start: IcalTime,
  end: IcalTime | null,
): Row {
  if (start.isDate) {
    const s = start.toString().slice(0, 10);
    // An all-day DTEND is exclusive: a one-day event ends the next day.
    let e = end ? end.toString().slice(0, 10) : addDays(s, 1);
    if (e <= s) e = addDays(s, 1);
    return {
      ...base,
      uid,
      title: summary,
      location,
      all_day: true,
      starts_at: `${s}T00:00:00+08:00`,
      ends_at: `${e}T00:00:00+08:00`,
      start_date: s,
      end_date: addDays(e, -1),
    };
  }
  const sd: Date = start.toJSDate();
  let ed: Date = end ? end.toJSDate() : new Date(sd.getTime() + 30 * 60000);
  if (ed.getTime() < sd.getTime()) ed = sd;
  const endForDate = ed.getTime() > sd.getTime() ? new Date(ed.getTime() - 1) : ed;
  return {
    ...base,
    uid,
    title: summary,
    location,
    all_day: false,
    starts_at: sd.toISOString(),
    ends_at: ed.toISOString(),
    start_date: klDate(sd),
    end_date: klDate(endForDate),
  };
}

/** Parses an iCal file into event rows inside the sync window, with repeats expanded. */
export function parseFeed(text: string, base: { user_id: string; calendar_id: string }, now: Date = new Date()): Row[] {
  const root = new ICAL.Component(ICAL.parse(text));
  for (const tz of root.getAllSubcomponents('vtimezone')) {
    try {
      ICAL.TimezoneService.register(tz);
    } catch {
      /* already registered */
    }
  }

  const today = klDate(now);
  const from = new Date(`${addDays(today, -PAST_DAYS)}T00:00:00+08:00`).getTime();
  const to = new Date(`${addDays(today, FUTURE_DAYS)}T00:00:00+08:00`).getTime();

  const vevents = root.getAllSubcomponents('vevent');
  const masters = new Map<string, InstanceType<typeof ICAL.Event>>();
  const exceptions: InstanceType<typeof ICAL.Event>[] = [];
  for (const v of vevents) {
    const ev = new ICAL.Event(v);
    if (!ev.uid) continue;
    if (v.hasProperty('recurrence-id')) exceptions.push(ev);
    else masters.set(ev.uid, ev);
  }
  for (const ex of exceptions) {
    const master = masters.get(ex.uid);
    if (master) master.relateException(ex);
  }

  const rows = new Map<string, Row>();
  const cancelled = (c: { getFirstPropertyValue: (n: string) => unknown }) =>
    String(c.getFirstPropertyValue('status') ?? '').toUpperCase() === 'CANCELLED';

  const push = (r: Row) => {
    const s = new Date(r.starts_at).getTime();
    const e = new Date(r.ends_at).getTime();
    if (e < from || s > to) return;
    rows.set(r.uid, r);
  };

  for (const ev of masters.values()) {
    if (cancelled(ev.component)) continue;
    const loc = (ev.location as string | null) || null;
    if (!ev.isRecurring()) {
      if (!ev.startDate) continue;
      push(toRow(base, ev.uid, ev.summary || '(No title)', loc, ev.startDate, ev.endDate));
      continue;
    }
    const it = ev.iterator();
    let next: IcalTime;
    // Old series (a daily stand-up since 2019) can have thousands of past occurrences: only the
    // ones inside the window count towards the limit, with a hard stop as a safety net.
    let kept = 0;
    let steps = 0;
    while ((next = it.next()) && kept < MAX_OCCURRENCES && steps < 50000) {
      steps++;
      const t = next.toJSDate().getTime();
      if (t > to) break;
      if (t < from - 31 * 86400000) continue;
      const d = ev.getOccurrenceDetails(next);
      if (cancelled(d.item.component)) continue;
      if (d.endDate.toJSDate().getTime() < from) continue;
      kept++;
      push(
        toRow(
          base,
          `${ev.uid}|${next.toString()}`,
          d.item.summary || ev.summary || '(No title)',
          (d.item.location as string | null) || loc,
          d.startDate,
          d.endDate,
        ),
      );
    }
  }

  // An edited occurrence whose series is not in the feed still shows on its own.
  for (const ex of exceptions) {
    if (masters.has(ex.uid) || cancelled(ex.component) || !ex.startDate) continue;
    push(toRow(base, `${ex.uid}|${ex.recurrenceId?.toString() ?? ''}`, ex.summary || '(No title)', ex.location || null, ex.startDate, ex.endDate));
  }

  return [...rows.values()];
}

