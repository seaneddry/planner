// Receives calendar events sent by the user's own Google Apps Script (for work calendars where
// Google's secret iCal address is switched off). The script runs inside that Google account,
// reads the calendar and POSTs the events here whenever the calendar changes.
//
// Auth: the private push key from Planner (Settings > Linked calendars), sent as x-planner-key.
// The key only lets the sender replace the events of that one calendar. Nothing is read back.
import { createClient } from 'npm:@supabase/supabase-js@2';

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false },
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

const MAX_EVENTS = 5000;

function klDate(d: Date): string {
  return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kuala_Lumpur' });
}
function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
const isDate = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);

interface Incoming {
  id?: unknown;
  title?: unknown;
  location?: unknown;
  all_day?: unknown;
  start?: unknown;
  end?: unknown;
}

function toRow(e: Incoming, base: { user_id: string; calendar_id: string }, stamp: string) {
  const uid = String(e.id ?? '').slice(0, 300);
  if (!uid) return null;
  const title = (typeof e.title === 'string' && e.title.trim() ? e.title.trim() : '(No title)').slice(0, 500);
  const location = typeof e.location === 'string' && e.location.trim() ? e.location.trim().slice(0, 300) : null;

  if (e.all_day === true) {
    if (!isDate(e.start)) return null;
    let end = isDate(e.end) ? e.end : addDays(e.start, 1); // exclusive
    if (end <= e.start) end = addDays(e.start, 1);
    return {
      ...base,
      uid,
      title,
      location,
      all_day: true,
      starts_at: `${e.start}T00:00:00+08:00`,
      ends_at: `${end}T00:00:00+08:00`,
      start_date: e.start,
      end_date: addDays(end, -1),
      synced_at: stamp,
    };
  }

  const s = new Date(String(e.start));
  if (Number.isNaN(s.getTime())) return null;
  let en = new Date(String(e.end ?? ''));
  if (Number.isNaN(en.getTime()) || en < s) en = new Date(s.getTime() + 30 * 60000);
  const endForDate = en > s ? new Date(en.getTime() - 1) : en;
  return {
    ...base,
    uid,
    title,
    location,
    all_day: false,
    starts_at: s.toISOString(),
    ends_at: en.toISOString(),
    start_date: klDate(s),
    end_date: klDate(endForDate),
    synced_at: stamp,
  };
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  const key = (req.headers.get('x-planner-key') ?? '').trim();
  if (!/^[a-f0-9]{48,128}$/.test(key)) return json({ error: 'Missing or malformed key' }, 401);

  const { data: cal } = await admin
    .from('planner_calendars')
    .select('id,user_id,name,enabled,source')
    .eq('push_key', key)
    .maybeSingle();
  if (!cal || cal.source !== 'push') return json({ error: 'Unknown key. Copy it again from Planner.' }, 401);

  let body: { test?: boolean; events?: Incoming[]; error?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Body must be JSON' }, 400);
  }

  // The script reports its own failures (for example a calendar it cannot open).
  if (typeof body.error === 'string') {
    await admin.from('planner_calendars').update({ last_error: body.error.slice(0, 300) }).eq('id', cal.id);
    return json({ ok: true });
  }

  if (body.test) return json({ ok: true, calendar: cal.name });
  if (!Array.isArray(body.events)) return json({ error: 'events must be a list' }, 400);
  if (body.events.length > MAX_EVENTS) return json({ error: `Too many events (max ${MAX_EVENTS})` }, 400);

  const stamp = new Date().toISOString();
  const base = { user_id: cal.user_id as string, calendar_id: cal.id as string };
  const rows = new Map<string, NonNullable<ReturnType<typeof toRow>>>();
  for (const e of body.events) {
    const r = toRow(e, base, stamp);
    if (r) rows.set(r.uid, r);
  }
  const list = [...rows.values()];

  try {
    for (let i = 0; i < list.length; i += 500) {
      const { error } = await admin.from('planner_events').upsert(list.slice(i, i + 500), { onConflict: 'calendar_id,uid' });
      if (error) throw new Error(error.message);
    }
    // Events the script no longer sends were deleted, declined or moved out of range.
    const { error: delError } = await admin.from('planner_events').delete().eq('calendar_id', cal.id).lt('synced_at', stamp);
    if (delError) throw new Error(delError.message);
    await admin
      .from('planner_calendars')
      .update({ last_synced_at: stamp, last_error: null, event_count: list.length })
      .eq('id', cal.id);
    return json({ ok: true, calendar: cal.name, events: list.length });
  } catch (e) {
    const message = (e as Error).message.slice(0, 300);
    await admin.from('planner_calendars').update({ last_error: message }).eq('id', cal.id);
    return json({ error: message }, 500);
  }
});
