// Private calendar feed (iCalendar / .ics) for Google Calendar, Apple Calendar or Outlook.
//
// GET /functions/v1/planner-ics?token=<secret from planner_settings.ics_token>
// No login: the long random token in the link is the key, so the link must stay private.
// Regenerating it in Settings cuts off old subscribers. Read-only.
import { createClient } from 'npm:@supabase/supabase-js@2';

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false },
});

function klToday(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kuala_Lumpur' });
}
function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
const ymd = (iso: string) => iso.replaceAll('-', '');

function esc(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

/** RFC 5545 line folding: lines longer than 75 octets continue on the next line after a space. */
function fold(line: string): string {
  const bytes = new TextEncoder().encode(line);
  if (bytes.length <= 75) return line;
  const out: string[] = [];
  let current = '';
  let size = 0;
  for (const ch of line) {
    const n = new TextEncoder().encode(ch).length;
    if (size + n > (out.length === 0 ? 75 : 74)) {
      out.push(current);
      current = '';
      size = 0;
    }
    current += ch;
    size += n;
  }
  out.push(current);
  return out.join('\r\n ');
}

interface Ev {
  uid: string;
  summary: string;
  description?: string;
  date?: string; // all-day start (YYYY-MM-DD)
  endDate?: string; // all-day end, inclusive (YYYY-MM-DD)
  start?: string; // timed start, local KL time YYYY-MM-DDTHH:MM
  minutes?: number;
  url?: string;
}

function eventLines(e: Ev, stamp: string): string[] {
  const lines = ['BEGIN:VEVENT', `UID:${e.uid}`, `DTSTAMP:${stamp}`];
  if (e.start) {
    const [d, t] = e.start.split('T');
    const startLocal = `${ymd(d)}T${t.replace(':', '').slice(0, 4)}00`;
    const startMs = Date.parse(`${d}T${t.slice(0, 5)}:00+08:00`);
    const end = new Date(startMs + (e.minutes ?? 30) * 60000);
    const endKl = new Date(end.getTime() + 8 * 3600000).toISOString();
    const endLocal = `${ymd(endKl.slice(0, 10))}T${endKl.slice(11, 16).replace(':', '')}00`;
    lines.push(`DTSTART;TZID=Asia/Kuala_Lumpur:${startLocal}`, `DTEND;TZID=Asia/Kuala_Lumpur:${endLocal}`);
  } else if (e.date) {
    lines.push(`DTSTART;VALUE=DATE:${ymd(e.date)}`, `DTEND;VALUE=DATE:${ymd(addDays(e.endDate ?? e.date, 1))}`);
    lines.push('TRANSP:TRANSPARENT');
  }
  lines.push(`SUMMARY:${esc(e.summary)}`);
  if (e.description) lines.push(`DESCRIPTION:${esc(e.description)}`);
  if (e.url) lines.push(`URL:${e.url}`);
  lines.push('END:VEVENT');
  return lines;
}

const KIND_LABEL: Record<string, string> = {
  task: 'Task',
  follow_up: 'Follow up',
  reminder: 'Reminder',
  errand: 'Errand',
  shopping: 'Buy',
  appointment: 'Appointment',
  renewal: 'Renewal',
  maintenance: 'Maintenance',
  occasion: 'Occasion',
};

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);
  const token = url.searchParams.get('token') ?? '';
  if (!/^[a-f0-9]{32,128}$/.test(token)) return new Response('Not found', { status: 404 });

  const { data: settings } = await admin
    .from('planner_settings')
    .select('user_id,ics_work_detail,holiday_scopes')
    .eq('ics_token', token)
    .maybeSingle();
  if (!settings) return new Response('Not found', { status: 404 });

  const userId = settings.user_id as string;
  const minimal = settings.ics_work_detail === 'minimal';
  const scopes: string[] = settings.holiday_scopes ?? ['national', 'selangor'];
  const today = klToday();
  const from = addDays(today, -30);
  const to = addDays(today, 400);

  const [items, ms, leave, hol, pay] = await Promise.all([
    admin
      .from('planner_items')
      .select('id,title,kind,space,due_on,due_time,effort_min,notes,place,project:planner_projects(name),person:planner_people(name)')
      .eq('user_id', userId)
      .eq('status', 'open')
      .gte('due_on', from)
      .lte('due_on', to)
      .limit(2000),
    admin
      .from('planner_milestones')
      .select('id,name,due_on,done,project:planner_projects(name)')
      .eq('user_id', userId)
      .gte('due_on', from)
      .lte('due_on', to),
    admin
      .from('planner_leave')
      .select('id,starts_on,ends_on,part,kind,person:planner_people(name)')
      .eq('user_id', userId)
      .gte('ends_on', from)
      .lte('starts_on', to),
    admin
      .from('planner_holidays')
      .select('id,name,holiday_on,scope,user_id')
      .or(`user_id.is.null,user_id.eq.${userId}`)
      .gte('holiday_on', from)
      .lte('holiday_on', to),
    admin.rpc('planner_payments_for', { p_user: userId, p_days: 60 }),
  ]);

  const events: Ev[] = [];
  type Row = Record<string, unknown> & { project?: { name: string } | null; person?: { name: string } | null };

  for (const i of (items.data ?? []) as unknown as Row[]) {
    const isWork = i.space === 'work';
    const hide = minimal && isWork;
    const project = i.project?.name;
    const person = i.person?.name;
    const kind = String(i.kind);
    let summary = String(i.title);
    if (kind === 'follow_up') summary = `Follow up: ${summary}${person ? ` (${person})` : ''}`;
    if (hide) summary = project ? `${project}: ${KIND_LABEL[kind] ?? 'Task'}` : `Work ${String(KIND_LABEL[kind] ?? 'task').toLowerCase()}`;
    const desc = hide
      ? undefined
      : [project ? `Project: ${project}` : '', i.place ? `Where: ${i.place}` : '', i.notes ? String(i.notes) : '']
          .filter(Boolean)
          .join('\n') || undefined;
    events.push({
      uid: `item-${i.id}@planner`,
      summary,
      description: desc,
      ...(i.due_time
        ? { start: `${i.due_on}T${String(i.due_time).slice(0, 5)}`, minutes: Number(i.effort_min) || 30 }
        : { date: String(i.due_on) }),
    });
  }

  for (const m of (ms.data ?? []) as unknown as Row[]) {
    if (!m.due_on) continue;
    events.push({
      uid: `milestone-${m.id}@planner`,
      summary: `${m.done ? '✓ ' : '◆ '}${m.project?.name ? m.project.name + ': ' : ''}${m.name}`,
      date: String(m.due_on),
    });
  }

  for (const l of (leave.data ?? []) as unknown as Row[]) {
    const part = l.part === 'am' ? ' (AM)' : l.part === 'pm' ? ' (PM)' : '';
    events.push({
      uid: `leave-${l.id}@planner`,
      summary: `${l.person?.name ?? 'Team member'} on leave${part}`,
      date: String(l.starts_on),
      endDate: String(l.ends_on),
    });
  }

  for (const h of (hol.data ?? []) as unknown as Row[]) {
    if (h.user_id === null && !scopes.includes(String(h.scope))) continue;
    events.push({ uid: `holiday-${h.id}@planner`, summary: `Public holiday: ${h.name}`, date: String(h.holiday_on) });
  }

  for (const p of (pay.data ?? []) as unknown as Row[]) {
    if (p.paid) continue;
    const amount = p.amount === null || p.amount === undefined ? '' : ` RM${Number(p.amount).toFixed(2)}`;
    events.push({ uid: `payment-${p.id}-${p.next_due}@planner`, summary: `Pay: ${p.name}${amount}`, date: String(p.next_due) });
  }

  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//seaneddry//Planner//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:Planner',
    'X-WR-TIMEZONE:Asia/Kuala_Lumpur',
    'REFRESH-INTERVAL;VALUE=DURATION:PT1H',
    'X-PUBLISHED-TTL:PT1H',
    'BEGIN:VTIMEZONE',
    'TZID:Asia/Kuala_Lumpur',
    'BEGIN:STANDARD',
    'DTSTART:19820101T000000',
    'TZOFFSETFROM:+0800',
    'TZOFFSETTO:+0800',
    'TZNAME:MYT',
    'END:STANDARD',
    'END:VTIMEZONE',
    ...events.flatMap((e) => eventLines(e, stamp)),
    'END:VCALENDAR',
  ];

  return new Response(lines.map(fold).join('\r\n') + '\r\n', {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'inline; filename="planner.ics"',
      'Cache-Control': 'private, max-age=300',
    },
  });
});
