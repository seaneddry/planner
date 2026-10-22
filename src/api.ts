// Every Supabase call the app makes lives here.
import { supabase } from './supabase';
import { write } from './lib/outbox';
import { addDays, todayKL } from './lib/dates';
import type {
  Brief,
  Holiday,
  Item,
  ItemInput,
  Leave,
  ListEntry,
  Milestone,
  Note,
  Payment,
  Person,
  PlannerList,
  Project,
  Review,
  Settings,
  Subtask,
} from './types';

function check<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
}

export function newId(): string {
  return crypto.randomUUID();
}

// --------------------------------------------------------------------- settings

export async function getSettings(): Promise<Settings> {
  const existing = check(await supabase.from('planner_settings').select('*').maybeSingle());
  if (existing) return existing as Settings;
  // First run: create the settings row (defaults come from the database).
  const created = await supabase.from('planner_settings').insert({}).select('*').single();
  if (created.error) {
    // Another tab created it at the same moment.
    return check(await supabase.from('planner_settings').select('*').single()) as Settings;
  }
  return created.data as Settings;
}

export async function updateSettings(patch: Partial<Settings>): Promise<void> {
  const { data: auth } = await supabase.auth.getUser();
  check(await supabase.from('planner_settings').update(patch).eq('user_id', auth.user?.id ?? ''));
}

export async function regenerateIcsToken(): Promise<void> {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const token = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  await updateSettings({ ics_token: token });
}

// ------------------------------------------------------------------------ items

export const ITEM_SELECT =
  '*, project:planner_projects(id,name,tag,rag,space), person:planner_people(id,name,handle), subtasks:planner_subtasks(id,done)';

export async function listOpenItems(): Promise<Item[]> {
  return check(
    await supabase
      .from('planner_items')
      .select(ITEM_SELECT)
      .eq('status', 'open')
      .order('due_on', { ascending: true, nullsFirst: false })
      .order('due_time', { ascending: true, nullsFirst: false })
      .order('priority', { ascending: false })
      .order('created_at', { ascending: true })
      .limit(3000),
  ) as Item[];
}

/** Items completed between two Malaysia dates (inclusive). */
export async function listDoneBetween(from: string, to: string): Promise<Item[]> {
  return check(
    await supabase
      .from('planner_items')
      .select(ITEM_SELECT)
      .eq('status', 'done')
      .gte('done_at', `${from}T00:00:00+08:00`)
      .lt('done_at', `${addDays(to, 1)}T00:00:00+08:00`)
      .order('done_at', { ascending: false })
      .limit(1000),
  ) as Item[];
}

export async function listProjectItems(projectId: string): Promise<Item[]> {
  return check(
    await supabase
      .from('planner_items')
      .select(ITEM_SELECT)
      .eq('project_id', projectId)
      .neq('status', 'dropped')
      .order('status', { ascending: false })
      .order('due_on', { ascending: true, nullsFirst: false })
      .limit(500),
  ) as Item[];
}

export async function listNoteItems(noteId: string): Promise<Item[]> {
  return check(await supabase.from('planner_items').select(ITEM_SELECT).eq('note_id', noteId).order('created_at')) as Item[];
}

export async function getItem(id: string): Promise<Item | null> {
  return check(await supabase.from('planner_items').select(ITEM_SELECT).eq('id', id).maybeSingle()) as Item | null;
}

export async function searchItems(q: string): Promise<Item[]> {
  const term = q.replace(/[%_,()]/g, ' ').trim();
  if (!term) return [];
  return check(
    await supabase
      .from('planner_items')
      .select(ITEM_SELECT)
      .or(`title.ilike.%${term}%,notes.ilike.%${term}%,place.ilike.%${term}%`)
      .neq('status', 'dropped')
      .order('updated_at', { ascending: false })
      .limit(60),
  ) as Item[];
}

/** Saves a new item. Works offline: it is queued and sent later. */
export async function createItem(input: ItemInput & { title: string }): Promise<string> {
  const id = input.id ?? newId();
  const now = new Date().toISOString();
  const row = {
    space: 'work',
    kind: 'task',
    priority: 0,
    repeat_every: 1,
    links: [],
    status: 'open',
    sort: 0,
    created_at: now,
    updated_at: now,
    ...input,
    id,
  };
  await write({ type: 'insert', table: 'planner_items', row });
  return id;
}

export async function updateItem(id: string, patch: ItemInput): Promise<void> {
  await write({ type: 'update', table: 'planner_items', id, patch: { ...patch, updated_at: new Date().toISOString() } });
}

/** Marks done. Repeating items get their next occurrence created by the database. */
export async function completeItem(id: string): Promise<void> {
  await write({ type: 'rpc', fn: 'planner_complete', args: { p_id: id } });
}

export async function reopenItem(id: string): Promise<void> {
  await updateItem(id, { status: 'open', done_at: null });
}

export async function deleteItem(id: string): Promise<void> {
  await write({ type: 'delete', table: 'planner_items', id });
}

// --------------------------------------------------------------------- subtasks

export async function listSubtasks(itemId: string): Promise<Subtask[]> {
  return check(await supabase.from('planner_subtasks').select('*').eq('item_id', itemId).order('sort').order('created_at')) as Subtask[];
}

export async function addSubtask(itemId: string, title: string, sort: number): Promise<void> {
  await write({ type: 'insert', table: 'planner_subtasks', row: { id: newId(), item_id: itemId, title, sort } });
}

export async function setSubtask(id: string, patch: Partial<Subtask>): Promise<void> {
  await write({ type: 'update', table: 'planner_subtasks', id, patch });
}

export async function deleteSubtask(id: string): Promise<void> {
  await write({ type: 'delete', table: 'planner_subtasks', id });
}

// --------------------------------------------------------------------- projects

export async function listProjects(): Promise<Project[]> {
  return check(await supabase.from('planner_projects').select('*').order('sort').order('name')) as Project[];
}

export async function getProject(id: string): Promise<Project | null> {
  return check(await supabase.from('planner_projects').select('*').eq('id', id).maybeSingle()) as Project | null;
}

export async function saveProject(p: Partial<Project> & { name: string }): Promise<string> {
  const id = p.id ?? newId();
  if (p.id) {
    check(await supabase.from('planner_projects').update(p).eq('id', p.id));
  } else {
    await write({ type: 'insert', table: 'planner_projects', row: { ...p, id } });
  }
  return id;
}

export async function deleteProject(id: string): Promise<void> {
  check(await supabase.from('planner_projects').delete().eq('id', id));
}

export async function listMilestones(projectId?: string): Promise<Milestone[]> {
  let q = supabase.from('planner_milestones').select('*');
  if (projectId) q = q.eq('project_id', projectId);
  return check(await q.order('due_on', { ascending: true, nullsFirst: false }).order('sort')) as Milestone[];
}

export async function saveMilestone(m: Partial<Milestone> & { project_id: string; name: string }): Promise<void> {
  if (m.id) check(await supabase.from('planner_milestones').update(m).eq('id', m.id));
  else check(await supabase.from('planner_milestones').insert({ ...m, id: newId() }));
}

export async function deleteMilestone(id: string): Promise<void> {
  check(await supabase.from('planner_milestones').delete().eq('id', id));
}

// ----------------------------------------------------------------------- people

export async function listPeople(): Promise<Person[]> {
  return check(await supabase.from('planner_people').select('*').order('name')) as Person[];
}

export async function savePerson(p: Partial<Person> & { name: string }): Promise<string> {
  const id = p.id ?? newId();
  if (p.id) check(await supabase.from('planner_people').update(p).eq('id', p.id));
  else await write({ type: 'insert', table: 'planner_people', row: { ...p, id } });
  return id;
}

export async function deletePerson(id: string): Promise<void> {
  check(await supabase.from('planner_people').delete().eq('id', id));
}

// ------------------------------------------------------------------------ notes

export async function listNotes(projectId?: string): Promise<Note[]> {
  let q = supabase.from('planner_notes').select('*');
  if (projectId) q = q.eq('project_id', projectId);
  return check(await q.order('met_on', { ascending: false }).order('created_at', { ascending: false }).limit(300)) as Note[];
}

export async function getNote(id: string): Promise<Note | null> {
  return check(await supabase.from('planner_notes').select('*').eq('id', id).maybeSingle()) as Note | null;
}

export async function saveNote(n: Partial<Note> & { title: string }): Promise<string> {
  const id = n.id ?? newId();
  // Upsert: the editor gives a new note its id up front, so the first save inserts it.
  check(await supabase.from('planner_notes').upsert({ ...n, id }, { onConflict: 'id' }));
  return id;
}

export async function deleteNote(id: string): Promise<void> {
  check(await supabase.from('planner_notes').delete().eq('id', id));
}

// ------------------------------------------------------------- leave & holidays

export async function listLeave(from: string, to: string): Promise<Leave[]> {
  return check(
    await supabase
      .from('planner_leave')
      .select('*, person:planner_people(name)')
      .lte('starts_on', to)
      .gte('ends_on', from)
      .order('starts_on'),
  ) as Leave[];
}

export async function saveLeave(l: Partial<Leave> & { person_id: string; starts_on: string; ends_on: string }): Promise<void> {
  const { person: _p, ...row } = l;
  if (row.id) check(await supabase.from('planner_leave').update(row).eq('id', row.id));
  else check(await supabase.from('planner_leave').insert({ ...row, id: newId() }));
}

export async function deleteLeave(id: string): Promise<void> {
  check(await supabase.from('planner_leave').delete().eq('id', id));
}

export async function listHolidays(from: string, to: string, scopes: string[]): Promise<Holiday[]> {
  const rows = check(
    await supabase.from('planner_holidays').select('*').gte('holiday_on', from).lte('holiday_on', to).order('holiday_on'),
  ) as Holiday[];
  return rows.filter((h) => h.user_id !== null || scopes.includes(h.scope));
}

export async function addHoliday(holiday_on: string, name: string): Promise<void> {
  check(await supabase.from('planner_holidays').insert({ holiday_on, name, scope: 'own' }));
}

export async function deleteHoliday(id: string): Promise<void> {
  check(await supabase.from('planner_holidays').delete().eq('id', id));
}

// ----------------------------------------------------------------------- lists

export async function listLists(): Promise<PlannerList[]> {
  return check(await supabase.from('planner_lists').select('*').order('is_template').order('starts_on', { ascending: false }).order('created_at', { ascending: false })) as PlannerList[];
}

export async function getList(id: string): Promise<PlannerList | null> {
  return check(await supabase.from('planner_lists').select('*').eq('id', id).maybeSingle()) as PlannerList | null;
}

export async function saveList(l: Partial<PlannerList> & { name: string }): Promise<string> {
  const id = l.id ?? newId();
  if (l.id) check(await supabase.from('planner_lists').update(l).eq('id', l.id));
  else check(await supabase.from('planner_lists').insert({ ...l, id }));
  return id;
}

export async function deleteList(id: string): Promise<void> {
  check(await supabase.from('planner_lists').delete().eq('id', id));
}

export async function listEntries(listId: string): Promise<ListEntry[]> {
  return check(await supabase.from('planner_list_entries').select('*').eq('list_id', listId).order('section', { nullsFirst: true }).order('sort').order('created_at')) as ListEntry[];
}

export async function addEntry(listId: string, text: string, section: string | null, sort: number): Promise<void> {
  await write({ type: 'insert', table: 'planner_list_entries', row: { id: newId(), list_id: listId, text, section, sort } });
}

export async function setEntry(id: string, patch: Partial<ListEntry>): Promise<void> {
  await write({ type: 'update', table: 'planner_list_entries', id, patch });
}

export async function deleteEntry(id: string): Promise<void> {
  await write({ type: 'delete', table: 'planner_list_entries', id });
}

/** Starts a new list (a trip) from a template, copying its entries unticked. */
export async function startFromTemplate(templateId: string, name: string, startsOn: string | null): Promise<string> {
  const template = await getList(templateId);
  const id = await saveList({ name, kind: template?.kind ?? 'packing', is_template: false, starts_on: startsOn });
  const entries = await listEntries(templateId);
  if (entries.length) {
    check(
      await supabase
        .from('planner_list_entries')
        .insert(entries.map((e) => ({ id: newId(), list_id: id, text: e.text, section: e.section, sort: e.sort, done: false }))),
    );
  }
  return id;
}

// --------------------------------------------------------------------- reviews

export async function getReview(weekStart: string): Promise<Review | null> {
  return check(await supabase.from('planner_reviews').select('*').eq('week_start', weekStart).maybeSingle()) as Review | null;
}

export async function saveReview(weekStart: string, patch: Partial<Review>): Promise<void> {
  check(await supabase.from('planner_reviews').upsert({ week_start: weekStart, ...patch }, { onConflict: 'user_id,week_start' }));
}

// ---------------------------------------------------------------------- briefs

export async function getBrief(date: string): Promise<Brief | null> {
  return check(await supabase.from('planner_briefs').select('*').eq('brief_on', date).maybeSingle()) as Brief | null;
}

export async function listBriefs(): Promise<Brief[]> {
  return check(await supabase.from('planner_briefs').select('*').order('brief_on', { ascending: false }).limit(14)) as Brief[];
}

export async function generateBrief(): Promise<Brief> {
  const { data, error } = await supabase.functions.invoke('planner-brief', { body: { action: 'generate' } });
  if (error) throw new Error(await functionError(error));
  const d = data as { content: string; source: 'ai' | 'fallback'; brief_on: string; error?: string };
  if (d.error) throw new Error(d.error);
  return { id: d.brief_on, brief_on: d.brief_on, content: d.content, source: d.source, created_at: new Date().toISOString() };
}

async function functionError(error: { message: string; context?: unknown }): Promise<string> {
  const ctx = error.context as Response | undefined;
  try {
    const body = (await ctx?.json()) as { error?: string } | undefined;
    if (body?.error) return body.error;
  } catch {
    /* ignore */
  }
  return error.message;
}

// -------------------------------------------------------------------- payments

/** Upcoming recurring payments from the expense tracker. Read-only. */
export async function listPayments(days: number): Promise<Payment[]> {
  const to = addDays(todayKL(), days);
  return check(
    await supabase
      .from('recurring_overview')
      .select('id,name,kind,amount,next_due,days_until,paid,in_trial')
      .eq('status', 'active')
      .not('next_due', 'is', null)
      .lte('next_due', to)
      .order('next_due'),
  ) as Payment[];
}

export const ICS_BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/planner-ics`;
export const EXPENSE_APP_URL = 'https://seaneddry.github.io/expense-tracker/';
