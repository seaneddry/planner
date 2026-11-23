// Receives Google Tasks sent by the user's own Google Apps Script (e.g. in the Agmo work account)
// and keeps planner items in step with them. One-way: Google -> Planner.
//
// Rules
// - A new open Google task becomes a planner task (space from the link; project matched by list name).
//   Tasks already completed in Google before they were ever seen are not imported.
// - Title, notes and due date are copied again only when Google's "updated" time changes, so edits
//   made in the planner stay until the task is changed in Google.
// - Done / not done follows Google only when Google's state changes (ticking in Google ticks it here;
//   ticking here does not get undone by the next sync).
// - A task deleted in Google is marked "dropped" here if it was still open.
// - Google subtasks become planner subtasks under their parent.
//
// Auth: the private key from Planner (Settings > Google Tasks), sent as x-planner-key.
import { createClient } from 'npm:@supabase/supabase-js@2';

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false },
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

const MAX_TASKS = 5000;
const isDate = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
const str = (v: unknown, max: number): string | null => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);
const ts = (v: unknown): string | null => {
  if (typeof v !== 'string') return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '');

interface InTask {
  id: string;
  list: string;
  parent: string | null;
  title: string;
  notes: string | null;
  due: string | null;
  completed: boolean;
  completed_at: string | null;
  updated: string | null;
  position: string;
}

function clean(t: Record<string, unknown>): InTask | null {
  const id = str(t.id, 200);
  if (!id) return null;
  return {
    id,
    list: str(t.list, 200) ?? 'Tasks',
    parent: str(t.parent, 200),
    title: str(t.title, 500) ?? '(No title)',
    notes: str(t.notes, 8000),
    due: isDate(t.due) ? t.due : null,
    completed: t.status === 'completed',
    completed_at: ts(t.completed),
    updated: ts(t.updated),
    position: typeof t.position === 'string' ? t.position : '',
  };
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  const key = (req.headers.get('x-planner-key') ?? '').trim();
  if (!/^[a-f0-9]{48,128}$/.test(key)) return json({ error: 'Missing or malformed key' }, 401);

  const { data: link } = await admin
    .from('planner_task_links')
    .select('id,user_id,name,space,enabled')
    .eq('push_key', key)
    .maybeSingle();
  if (!link) return json({ error: 'Unknown key. Copy the script again from Planner.' }, 401);

  let body: { test?: boolean; tasks?: Record<string, unknown>[]; error?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Body must be JSON' }, 400);
  }

  if (typeof body.error === 'string') {
    await admin.from('planner_task_links').update({ last_error: body.error.slice(0, 300) }).eq('id', link.id);
    return json({ ok: true });
  }
  if (body.test) return json({ ok: true, link: link.name });
  if (!link.enabled) return json({ ok: true, paused: true, tasks: 0 });
  if (!Array.isArray(body.tasks)) return json({ error: 'tasks must be a list' }, 400);
  if (body.tasks.length > MAX_TASKS) return json({ error: `Too many tasks (max ${MAX_TASKS})` }, 400);

  const userId = link.user_id as string;
  const linkId = link.id as string;
  const now = new Date().toISOString();

  try {
    const incoming = new Map<string, InTask>();
    for (const raw of body.tasks) {
      const t = clean(raw ?? {});
      if (t) incoming.set(t.id, t);
    }
    // Subtasks whose parent is not in the payload are treated as top-level tasks.
    const tops = [...incoming.values()].filter((t) => !t.parent || !incoming.has(t.parent));
    const subs = [...incoming.values()].filter((t) => t.parent && incoming.has(t.parent));

    const { data: existingRows, error: exErr } = await admin
      .from('planner_items')
      .select('id,gtask_id,gtask_status,gtask_updated,status,done_at')
      .eq('gtask_link_id', linkId);
    if (exErr) throw new Error(exErr.message);
    const existing = new Map((existingRows ?? []).map((r) => [r.gtask_id as string, r]));

    const { data: projects } = await admin.from('planner_projects').select('id,name,tag').eq('user_id', userId).neq('status', 'done');
    const projectFor = (list: string): string | null => {
      const n = norm(list);
      const p = (projects ?? []).find((x) => norm(x.name) === n || (x.tag && norm(x.tag) === n));
      return p ? (p.id as string) : null;
    };

    let added = 0;
    let updated = 0;
    let completed = 0;
    const itemIdByTask = new Map<string, string>();

    // ---------------------------------------------------------------- top-level tasks
    const inserts: Record<string, unknown>[] = [];
    for (const t of tops) {
      const row = existing.get(t.id);
      const gStatus = t.completed ? 'completed' : 'needsAction';
      if (!row) {
        if (t.completed) continue; // finished before we ever saw it
        const id = crypto.randomUUID();
        itemIdByTask.set(t.id, id);
        inserts.push({
          id,
          user_id: userId,
          space: link.space,
          kind: 'task',
          title: t.title,
          notes: t.notes,
          due_on: t.due,
          project_id: projectFor(t.list),
          gtask_link_id: linkId,
          gtask_id: t.id,
          gtask_list: t.list,
          gtask_status: gStatus,
          gtask_updated: t.updated,
        });
        added++;
        continue;
      }

      itemIdByTask.set(t.id, row.id as string);
      const patch: Record<string, unknown> = {};
      const changedInGoogle = !row.gtask_updated || !t.updated || new Date(row.gtask_updated as string).getTime() !== new Date(t.updated).getTime();
      if (changedInGoogle) {
        Object.assign(patch, { title: t.title, notes: t.notes, due_on: t.due, gtask_list: t.list, gtask_updated: t.updated });
      }
      if (row.gtask_status !== gStatus) {
        patch.gtask_status = gStatus;
        if (gStatus === 'completed' && row.status !== 'done') {
          Object.assign(patch, { status: 'done', done_at: t.completed_at ?? now });
          completed++;
        } else if (gStatus === 'needsAction' && row.status !== 'open') {
          Object.assign(patch, { status: 'open', done_at: null });
        }
      }
      if (Object.keys(patch).length) {
        const { error } = await admin.from('planner_items').update(patch).eq('id', row.id);
        if (error) throw new Error(error.message);
        updated++;
      }
    }
    for (let i = 0; i < inserts.length; i += 500) {
      const { error } = await admin.from('planner_items').insert(inserts.slice(i, i + 500));
      if (error) throw new Error(error.message);
    }

    // ------------------------------------------------- tasks deleted (or hidden) in Google
    const gone = [...existing.values()].filter((r) => !incoming.has(r.gtask_id as string) && r.gtask_status !== 'deleted');
    for (const r of gone) {
      const patch: Record<string, unknown> = { gtask_status: 'deleted' };
      if (r.status === 'open') patch.status = 'dropped';
      const { error } = await admin.from('planner_items').update(patch).eq('id', r.id);
      if (error) throw new Error(error.message);
    }

    // ---------------------------------------------------------------------- subtasks
    const allItemIds = [...itemIdByTask.values()];
    const existingSubs = new Map<string, { id: string; item_id: string; gtask_done: boolean | null; done: boolean; title: string }>();
    for (let i = 0; i < allItemIds.length; i += 300) {
      const { data, error } = await admin
        .from('planner_subtasks')
        .select('id,item_id,gtask_id,gtask_done,done,title')
        .in('item_id', allItemIds.slice(i, i + 300))
        .not('gtask_id', 'is', null);
      if (error) throw new Error(error.message);
      for (const s of data ?? []) {
        existingSubs.set(`${s.item_id}|${s.gtask_id}`, {
          id: s.id as string,
          item_id: s.item_id as string,
          gtask_done: s.gtask_done as boolean | null,
          done: s.done as boolean,
          title: s.title as string,
        });
      }
    }
    const seenSubs = new Set<string>();
    const subInserts: Record<string, unknown>[] = [];
    const ordered = [...subs].sort((a, b) => a.position.localeCompare(b.position));
    for (const [index, s] of ordered.entries()) {
      const itemId = itemIdByTask.get(s.parent!);
      if (!itemId) continue; // parent was not imported (already completed in Google)
      const k = `${itemId}|${s.id}`;
      seenSubs.add(k);
      const ex = existingSubs.get(k);
      if (!ex) {
        subInserts.push({ user_id: userId, item_id: itemId, title: s.title, done: s.completed, gtask_id: s.id, gtask_done: s.completed, sort: index });
        continue;
      }
      const patch: Record<string, unknown> = {};
      if (ex.title !== s.title) patch.title = s.title;
      if (ex.gtask_done !== s.completed) Object.assign(patch, { gtask_done: s.completed, done: s.completed });
      if (Object.keys(patch).length) {
        const { error } = await admin.from('planner_subtasks').update(patch).eq('id', ex.id);
        if (error) throw new Error(error.message);
      }
    }
    if (subInserts.length) {
      const { error } = await admin.from('planner_subtasks').insert(subInserts);
      if (error) throw new Error(error.message);
    }
    const goneSubs = [...existingSubs.entries()].filter(([k]) => !seenSubs.has(k)).map(([, s]) => s.id);
    if (goneSubs.length) {
      const { error } = await admin.from('planner_subtasks').delete().in('id', goneSubs);
      if (error) throw new Error(error.message);
    }

    const openCount = tops.filter((t) => !t.completed).length;
    await admin.from('planner_task_links').update({ last_synced_at: now, last_error: null, task_count: openCount }).eq('id', linkId);
    return json({ ok: true, link: link.name, tasks: openCount, added, updated, completed });
  } catch (e) {
    const message = (e as Error).message.slice(0, 300);
    await admin.from('planner_task_links').update({ last_error: message }).eq('id', linkId);
    return json({ error: message }, 500);
  }
});
