// Sends the planner's Web Push reminders.
//
// Two ways in:
//  - A signed-in user (browser): action "public-key" or "test".
//  - The cron job every 5 minutes (header x-cron-secret): action "run".
// Uses the VAPID key pair the expense tracker already keeps in public.push_config (service role
// only), but its own subscription table, so planner notifications open the planner.
import { createClient } from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';

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

interface Cfg {
  vapid_public: string;
  vapid_private: string;
  contact: string | null;
  cron_secret: string;
}

async function loadConfig(contact?: string): Promise<Cfg> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const { data, error } = await admin
      .from('push_config')
      .select('vapid_public,vapid_private,contact,cron_secret')
      .eq('id', 1)
      .single();
    if (error || !data) throw new Error('push_config is missing: ' + (error?.message ?? 'no row'));
    if (data.vapid_public && data.vapid_private) return data as Cfg;
    const keys = webpush.generateVAPIDKeys();
    await admin
      .from('push_config')
      .update({ vapid_public: keys.publicKey, vapid_private: keys.privateKey, contact: contact ?? data.contact })
      .eq('id', 1)
      .is('vapid_public', null);
  }
  throw new Error('Could not create push keys');
}

interface Sub {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

async function sendAll(subs: Sub[], payload: unknown, cfg: Cfg): Promise<number> {
  webpush.setVapidDetails(
    cfg.contact ? `mailto:${cfg.contact}` : 'mailto:notifications@example.com',
    cfg.vapid_public,
    cfg.vapid_private,
  );
  let delivered = 0;
  for (const s of subs) {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        JSON.stringify(payload),
        { TTL: 6 * 3600, urgency: 'high' },
      );
      delivered++;
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410) {
        await admin.from('planner_push_subscriptions').delete().eq('id', s.id);
      } else {
        console.error('push failed', code, (e as Error).message);
      }
    }
  }
  return delivered;
}

function klToday(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kuala_Lumpur' });
}

function timeLabel(t: string | null): string {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  const suffix = h >= 12 ? 'pm' : 'am';
  const hr = h % 12 === 0 ? 12 : h % 12;
  return m ? `${hr}:${String(m).padStart(2, '0')}${suffix}` : `${hr}${suffix}`;
}

function dayLabel(iso: string | null): string {
  if (!iso) return '';
  const today = klToday();
  const diff = Math.round((Date.parse(iso) - Date.parse(today)) / 86400000);
  if (diff === 0) return 'today';
  if (diff === 1) return 'tomorrow';
  if (diff === -1) return 'yesterday';
  if (diff < 0) return `${-diff} days ago`;
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
}

interface Due {
  user_id: string;
  item_id: string;
  title: string;
  kind: string;
  space: string;
  due_on: string | null;
  due_time: string | null;
  remind_at: string;
  project: string | null;
  person: string | null;
}

function messageFor(d: Due) {
  const bits: string[] = [];
  if (d.kind === 'follow_up' && d.person) bits.push(`Waiting on ${d.person}`);
  if (d.due_on) bits.push(`Due ${dayLabel(d.due_on)}${d.due_time ? ' ' + timeLabel(d.due_time) : ''}`);
  if (d.project) bits.push(d.project);
  const prefix = d.kind === 'follow_up' ? 'Follow up: ' : '';
  return { title: `${prefix}${d.title}`, body: bits.join(' · ') || 'Reminder', url: `item/${d.item_id}`, tag: d.item_id };
}

async function runReminders(cfg: Cfg) {
  const { data, error } = await admin.rpc('planner_due_reminders');
  if (error) throw new Error(error.message);
  const due = (data ?? []) as Due[];

  const byUser = new Map<string, Due[]>();
  for (const d of due) byUser.set(d.user_id, [...(byUser.get(d.user_id) ?? []), d]);

  let notifications = 0;
  for (const [userId, items] of byUser) {
    const { data: subs } = await admin
      .from('planner_push_subscriptions')
      .select('id,endpoint,p256dh,auth')
      .eq('user_id', userId);
    if (!subs || subs.length === 0) continue;

    const payloads =
      items.length <= 4
        ? items.map((d) => ({ payload: messageFor(d), covered: [d] }))
        : [
            {
              payload: {
                title: `${items.length} reminders`,
                body: items.slice(0, 4).map((d) => d.title).join(', ') + ' and more',
                url: '',
                tag: 'reminders',
              },
              covered: items,
            },
          ];

    for (const { payload, covered } of payloads) {
      const delivered = await sendAll(subs as Sub[], payload, cfg);
      if (delivered > 0) notifications++;
      // Logged even when delivery failed, so a dead phone does not get retried every 5 minutes.
      await admin
        .from('planner_push_log')
        .upsert(covered.map((d) => ({ item_id: d.item_id, remind_at: d.remind_at })), {
          onConflict: 'item_id,remind_at',
          ignoreDuplicates: true,
        });
    }
  }
  return { due: due.length, users: byUser.size, notifications };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  try {
    const body = (await req.json().catch(() => ({}))) as { action?: string };

    const secret = req.headers.get('x-cron-secret');
    if (secret) {
      const cfg = await loadConfig();
      if (secret !== cfg.cron_secret) return json({ error: 'Unauthorized' }, 401);
      if (body.action !== 'run') return json({ error: 'Unknown action' }, 400);
      return json(await runReminders(cfg));
    }

    const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
    const { data: auth, error: authError } = await admin.auth.getUser(token);
    if (authError || !auth.user) return json({ error: 'Unauthorized' }, 401);
    const user = auth.user;
    const cfg = await loadConfig(user.email ?? undefined);

    if (body.action === 'public-key') return json({ publicKey: cfg.vapid_public });

    if (body.action === 'test') {
      const { data: subs } = await admin
        .from('planner_push_subscriptions')
        .select('id,endpoint,p256dh,auth')
        .eq('user_id', user.id);
      if (!subs || subs.length === 0) return json({ sent: 0, error: 'This device is not subscribed yet.' });
      const sent = await sendAll(
        subs as Sub[],
        { title: 'Planner notifications are on', body: 'Reminders and your morning brief will arrive here.', url: '', tag: 'test' },
        cfg,
      );
      return json({ sent });
    }

    return json({ error: 'Unknown action' }, 400);
  } catch (e) {
    console.error(e);
    return json({ error: (e as Error).message }, 500);
  }
});
