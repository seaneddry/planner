// Reads linked calendars (Google Calendar's private iCal address, or any iCal feed) and stores
// their events in planner_events so the planner can show them. Read-only: nothing is written back.
//
// Two ways in:
//  - The cron job every 30 minutes (header x-cron-secret): action "run" syncs every enabled calendar.
//  - A signed-in user: action "sync" syncs that user's calendars (or one, with calendar_id).
// Calendars that push their own events (Apps Script, see planner-calpush) are skipped here.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { parseFeed } from './parse.ts';

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false },
});

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
}

const MAX_BYTES = 15 * 1024 * 1024;

async function fetchFeed(url: string): Promise<string> {
  const target = url.trim().replace(/^webcal:\/\//i, 'https://');
  if (!/^https:\/\//i.test(target)) throw new Error('The address must start with https:// or webcal://');
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 30000);
  try {
    const res = await fetch(target, { signal: ctl.signal, headers: { accept: 'text/calendar, */*' } });
    if (res.status === 404) throw new Error('Calendar not found. Check the address, or make a new secret address in Google Calendar.');
    if (res.status === 401 || res.status === 403) throw new Error('Access denied. Your Google Workspace admin may not allow secret addresses.');
    if (!res.ok) throw new Error(`The calendar could not be read (HTTP ${res.status}).`);
    const text = await res.text();
    if (text.length > MAX_BYTES) throw new Error('This calendar is too large to read.');
    if (!text.includes('BEGIN:VCALENDAR')) throw new Error('That address did not return a calendar. Use the "Secret address in iCal format".');
    return text;
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw new Error('The calendar took too long to respond.');
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

interface Cal {
  id: string;
  user_id: string;
  name: string;
  url: string;
}

async function syncOne(cal: Cal): Promise<{ id: string; name: string; events?: number; error?: string }> {
  try {
    const text = await fetchFeed(cal.url);
    const rows = parseFeed(text, { user_id: cal.user_id, calendar_id: cal.id });
    const stamp = new Date().toISOString();
    for (let i = 0; i < rows.length; i += 500) {
      const chunk = rows.slice(i, i + 500).map((r) => ({ ...r, synced_at: stamp }));
      const { error } = await admin.from('planner_events').upsert(chunk, { onConflict: 'calendar_id,uid' });
      if (error) throw new Error(error.message);
    }
    // Anything not in this read was deleted or moved out of the window.
    const { error: delError } = await admin.from('planner_events').delete().eq('calendar_id', cal.id).lt('synced_at', stamp);
    if (delError) throw new Error(delError.message);
    await admin
      .from('planner_calendars')
      .update({ last_synced_at: stamp, last_error: null, event_count: rows.length })
      .eq('id', cal.id);
    return { id: cal.id, name: cal.name, events: rows.length };
  } catch (e) {
    const message = (e as Error).message.slice(0, 300);
    await admin.from('planner_calendars').update({ last_error: message }).eq('id', cal.id);
    return { id: cal.id, name: cal.name, error: message };
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  try {
    const body = (await req.json().catch(() => ({}))) as { action?: string; calendar_id?: string };

    const secret = req.headers.get('x-cron-secret');
    if (secret) {
      const { data: cfg } = await admin.from('push_config').select('cron_secret').eq('id', 1).single();
      if (!cfg || secret !== cfg.cron_secret) return json({ error: 'Unauthorized' }, 401);
      if (body.action !== 'run') return json({ error: 'Unknown action' }, 400);
      const { data: cals } = await admin.from('planner_calendars').select('id,user_id,name,url').eq('enabled', true).eq('source', 'ical');
      const results = [];
      for (const c of (cals ?? []) as Cal[]) results.push(await syncOne(c));
      return json({ calendars: results.length, failed: results.filter((r) => r.error).length });
    }

    const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
    const { data: auth, error: authError } = await admin.auth.getUser(token);
    if (authError || !auth.user) return json({ error: 'Unauthorized' }, 401);
    if (body.action !== 'sync') return json({ error: 'Unknown action' }, 400);

    let q = admin.from('planner_calendars').select('id,user_id,name,url').eq('user_id', auth.user.id).eq('source', 'ical');
    if (body.calendar_id) q = q.eq('id', body.calendar_id);
    else q = q.eq('enabled', true);
    const { data: cals, error } = await q;
    if (error) return json({ error: error.message }, 500);
    const results = [];
    for (const c of (cals ?? []) as Cal[]) results.push(await syncOne(c));
    return json({ results });
  } catch (e) {
    console.error(e);
    return json({ error: (e as Error).message }, 500);
  }
});
