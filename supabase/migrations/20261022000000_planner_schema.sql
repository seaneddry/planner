-- Planner: work and personal to-dos, follow-ups, reminders, projects, meeting notes,
-- leave, public holidays, personal lists and the AI morning brief.
--
-- Lives in the shared "expense-tracker" Supabase project next to the expense and wardrobe
-- tables. Every planner table starts with "planner_" and is locked to its owner with
-- row-level security. Upcoming payments are read straight from the expense tracker's
-- recurring_overview view; the planner never writes to expense tables.

-- ------------------------------------------------------------------------- settings

create table public.planner_settings (
  user_id             uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  default_space       text not null default 'work' check (default_space in ('work', 'personal')),
  default_remind_time time not null default '09:00',
  brief_enabled       boolean not null default true,
  brief_push          boolean not null default true,
  -- Secret part of the private calendar-feed link. Regenerate it to cut off old subscribers.
  ics_token           text not null unique
                      default (replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')),
  ics_work_detail     text not null default 'full' check (ics_work_detail in ('full', 'minimal')),
  holiday_scopes      text[] not null default '{national,selangor}',
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- ------------------------------------------------------------------- projects and people

create table public.planner_projects (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name        text not null check (length(trim(name)) > 0),
  -- Short code used in quick capture, e.g. "porsche" for #porsche.
  tag         text check (tag ~ '^[a-z0-9][a-z0-9_-]*$'),
  space       text not null default 'work' check (space in ('work', 'personal')),
  status      text not null default 'active' check (status in ('active', 'on_hold', 'done')),
  rag         text check (rag in ('green', 'amber', 'red')),
  client      text,
  pic         text,
  phase       text,
  summary     text,
  links       jsonb not null default '[]'::jsonb,
  sort        int not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create unique index planner_projects_tag_key on public.planner_projects (user_id, tag) where tag is not null;
create index planner_projects_user_idx on public.planner_projects (user_id);

create table public.planner_milestones (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  project_id  uuid not null references public.planner_projects (id) on delete cascade,
  name        text not null check (length(trim(name)) > 0),
  due_on      date,
  done        boolean not null default false,
  sort        int not null default 0,
  created_at  timestamptz not null default now()
);
create index planner_milestones_project_idx on public.planner_milestones (project_id);
create index planner_milestones_user_idx on public.planner_milestones (user_id, due_on);

create table public.planner_people (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name        text not null check (length(trim(name)) > 0),
  -- Short handle used in quick capture, e.g. "client" for @client.
  handle      text check (handle ~ '^[a-z0-9][a-z0-9_.-]*$'),
  org         text,
  role        text,
  -- Team members appear in the availability view and can have leave.
  is_team     boolean not null default false,
  notes       text,
  created_at  timestamptz not null default now()
);
create unique index planner_people_handle_key on public.planner_people (user_id, handle) where handle is not null;
create index planner_people_user_idx on public.planner_people (user_id);

-- --------------------------------------------------------------------- meeting notes

create table public.planner_notes (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  project_id  uuid references public.planner_projects (id) on delete set null,
  title       text not null check (length(trim(title)) > 0),
  met_on      date not null default public.kl_today(),
  attendees   text,
  body        text not null default '',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index planner_notes_user_idx on public.planner_notes (user_id, met_on desc);
create index planner_notes_project_idx on public.planner_notes (project_id);

-- ------------------------------------------------------------------------------ items

-- One table for everything with a date or a checkbox: tasks, follow-ups, reminders,
-- errands, shopping, appointments, renewals, maintenance and occasions.
create table public.planner_items (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  space       text not null default 'work' check (space in ('work', 'personal')),
  kind        text not null default 'task' check (kind in (
                'task', 'follow_up', 'reminder', 'errand', 'shopping',
                'appointment', 'renewal', 'maintenance', 'occasion')),
  title       text not null check (length(trim(title)) > 0),
  notes       text,
  project_id  uuid references public.planner_projects (id) on delete set null,
  -- For follow-ups: who you are waiting on. Otherwise: who it is about.
  person_id   uuid references public.planner_people (id) on delete set null,
  note_id     uuid references public.planner_notes (id) on delete set null,
  due_on      date,
  due_time    time,
  remind_at   timestamptz,
  priority    smallint not null default 0 check (priority between 0 and 3),
  effort_min  int check (effort_min > 0),
  -- Errands and shopping: where it gets done (a shop, the pharmacy, the bank).
  place       text,
  repeat      text check (repeat in ('daily', 'weekdays', 'weekly', 'monthly', 'yearly')),
  repeat_every int not null default 1 check (repeat_every between 1 and 365),
  -- Follow-ups: when you asked, so the app can show how long you have been waiting.
  asked_on    date,
  links       jsonb not null default '[]'::jsonb,
  status      text not null default 'open' check (status in ('open', 'done', 'dropped')),
  done_at     timestamptz,
  sort        int not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index planner_items_open_idx on public.planner_items (user_id, status, due_on);
create index planner_items_project_idx on public.planner_items (project_id);
create index planner_items_person_idx on public.planner_items (person_id);
create index planner_items_note_idx on public.planner_items (note_id);
create index planner_items_remind_idx on public.planner_items (remind_at) where status = 'open' and remind_at is not null;
create index planner_items_done_idx on public.planner_items (user_id, done_at) where status = 'done';

create table public.planner_subtasks (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  item_id     uuid not null references public.planner_items (id) on delete cascade,
  title       text not null check (length(trim(title)) > 0),
  done        boolean not null default false,
  sort        int not null default 0,
  created_at  timestamptz not null default now()
);
create index planner_subtasks_item_idx on public.planner_subtasks (item_id);
create index planner_subtasks_user_idx on public.planner_subtasks (user_id);

-- ---------------------------------------------------------------- leave and holidays

create table public.planner_leave (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  person_id   uuid not null references public.planner_people (id) on delete cascade,
  starts_on   date not null,
  ends_on     date not null,
  part        text not null default 'full' check (part in ('full', 'am', 'pm')),
  kind        text not null default 'annual' check (kind in ('annual', 'medical', 'training', 'other')),
  note        text,
  created_at  timestamptz not null default now(),
  check (ends_on >= starts_on)
);
create index planner_leave_user_idx on public.planner_leave (user_id, starts_on, ends_on);
create index planner_leave_person_idx on public.planner_leave (person_id);

-- Built-in rows (user_id null) are shared and read-only. People can add their own.
create table public.planner_holidays (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid default auth.uid() references auth.users (id) on delete cascade,
  holiday_on  date not null,
  name        text not null check (length(trim(name)) > 0),
  scope       text not null default 'national',
  estimated   boolean not null default false,
  created_at  timestamptz not null default now(),
  unique nulls not distinct (user_id, holiday_on, name)
);
create index planner_holidays_date_idx on public.planner_holidays (holiday_on);

-- --------------------------------------------------------------------- personal lists

-- Packing lists and checklists. Templates are copied when you start a new trip.
create table public.planner_lists (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name        text not null check (length(trim(name)) > 0),
  kind        text not null default 'packing' check (kind in ('packing', 'checklist')),
  is_template boolean not null default false,
  starts_on   date,
  archived    boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index planner_lists_user_idx on public.planner_lists (user_id);

create table public.planner_list_entries (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  list_id     uuid not null references public.planner_lists (id) on delete cascade,
  text        text not null check (length(trim(text)) > 0),
  section     text,
  done        boolean not null default false,
  sort        int not null default 0,
  created_at  timestamptz not null default now()
);
create index planner_list_entries_list_idx on public.planner_list_entries (list_id);
create index planner_list_entries_user_idx on public.planner_list_entries (user_id);

-- ------------------------------------------------------------------ review and brief

create table public.planner_reviews (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  week_start  date not null,
  wins        text,
  lessons     text,
  focus       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (user_id, week_start)
);

create table public.planner_briefs (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  brief_on    date not null,
  content     text not null,
  source      text not null default 'ai' check (source in ('ai', 'fallback')),
  created_at  timestamptz not null default now(),
  unique (user_id, brief_on)
);

-- --------------------------------------------------------------- push notifications

-- Separate from the expense tracker's push_subscriptions, because each app has its own
-- service worker and a notification must open the app it belongs to. The VAPID keys in
-- public.push_config are shared.
create table public.planner_push_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  endpoint    text not null unique,
  p256dh      text not null,
  auth        text not null,
  user_agent  text,
  created_at  timestamptz not null default now()
);
create index planner_push_subscriptions_user_idx on public.planner_push_subscriptions (user_id);

create table public.planner_push_log (
  item_id     uuid not null references public.planner_items (id) on delete cascade,
  remind_at   timestamptz not null,
  sent_at     timestamptz not null default now(),
  primary key (item_id, remind_at)
);

-- ------------------------------------------------------------------ updated_at hooks

create trigger planner_settings_updated before update on public.planner_settings
  for each row execute function public.set_updated_at();
create trigger planner_projects_updated before update on public.planner_projects
  for each row execute function public.set_updated_at();
create trigger planner_notes_updated before update on public.planner_notes
  for each row execute function public.set_updated_at();
create trigger planner_items_updated before update on public.planner_items
  for each row execute function public.set_updated_at();
create trigger planner_lists_updated before update on public.planner_lists
  for each row execute function public.set_updated_at();
create trigger planner_reviews_updated before update on public.planner_reviews
  for each row execute function public.set_updated_at();

-- ------------------------------------------------------------------ row-level security

do $$
declare t text;
begin
  foreach t in array array[
    'planner_settings', 'planner_projects', 'planner_milestones', 'planner_people',
    'planner_notes', 'planner_items', 'planner_subtasks', 'planner_leave',
    'planner_lists', 'planner_list_entries', 'planner_reviews', 'planner_push_subscriptions'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy "owner access" on public.%I for all to authenticated
         using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t);
    execute format('revoke all on public.%I from anon', t);
  end loop;
end $$;

alter table public.planner_holidays enable row level security;
create policy "read built-in and own" on public.planner_holidays
  for select to authenticated using (user_id is null or user_id = (select auth.uid()));
create policy "insert own" on public.planner_holidays
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "update own" on public.planner_holidays
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "delete own" on public.planner_holidays
  for delete to authenticated using (user_id = (select auth.uid()));
revoke all on public.planner_holidays from anon;

alter table public.planner_briefs enable row level security;
create policy "owner read" on public.planner_briefs
  for select to authenticated using (user_id = (select auth.uid()));
revoke all on public.planner_briefs from anon;

alter table public.planner_push_log enable row level security;
revoke all on public.planner_push_log from anon, authenticated;

-- ------------------------------------------------------------------ recurrence

-- The next date after p_date for a repeat rule.
create or replace function public.planner_next_date(p_date date, p_repeat text, p_every int)
returns date
language sql
immutable
set search_path = public
as $$
  select case p_repeat
    when 'daily'    then p_date + greatest(p_every, 1)
    when 'weekly'   then p_date + 7 * greatest(p_every, 1)
    when 'monthly'  then (p_date + make_interval(months => greatest(p_every, 1)))::date
    when 'yearly'   then (p_date + make_interval(years => greatest(p_every, 1)))::date
    when 'weekdays' then p_date + case extract(isodow from p_date)::int when 5 then 3 when 6 then 2 else 1 end
    else null
  end;
$$;

-- Marks an item done. If it repeats, creates the next one (with its subtasks reset)
-- and returns its id. Missed occurrences are skipped, so the next one is never in the past.
create or replace function public.planner_complete(p_id uuid)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  it public.planner_items;
  next_due date;
  next_id uuid;
begin
  update public.planner_items
     set status = 'done', done_at = now()
   where id = p_id and user_id = (select auth.uid()) and status = 'open'
  returning * into it;

  if not found or it.repeat is null or it.due_on is null then
    return null;
  end if;

  next_due := public.planner_next_date(it.due_on, it.repeat, it.repeat_every);
  while next_due < public.kl_today() loop
    next_due := public.planner_next_date(next_due, it.repeat, it.repeat_every);
  end loop;

  insert into public.planner_items (
    user_id, space, kind, title, notes, project_id, person_id, due_on, due_time, remind_at,
    priority, effort_min, place, repeat, repeat_every, asked_on, links, sort)
  values (
    it.user_id, it.space, it.kind, it.title, it.notes, it.project_id, it.person_id, next_due, it.due_time,
    case when it.remind_at is null then null else it.remind_at + (next_due - it.due_on) * interval '1 day' end,
    it.priority, it.effort_min, it.place, it.repeat, it.repeat_every,
    case when it.kind = 'follow_up' then next_due else null end, it.links, it.sort)
  returning id into next_id;

  insert into public.planner_subtasks (user_id, item_id, title, done, sort)
  select user_id, next_id, title, false, sort from public.planner_subtasks where item_id = p_id;

  return next_id;
end;
$$;

revoke execute on function public.planner_complete(uuid) from public, anon;
grant execute on function public.planner_complete(uuid) to authenticated;

-- Reminders whose time has come and that have not been sent yet (last 24 hours only,
-- so a long outage never floods the phone). Service role only.
create or replace function public.planner_due_reminders()
returns table (user_id uuid, item_id uuid, title text, kind text, space text, due_on date,
               due_time time, remind_at timestamptz, project text, person text)
language sql
stable
security definer
set search_path = public
as $$
  select i.user_id, i.id, i.title, i.kind, i.space, i.due_on, i.due_time, i.remind_at,
         p.name, pe.name
  from public.planner_items i
  left join public.planner_projects p on p.id = i.project_id
  left join public.planner_people pe on pe.id = i.person_id
  where i.status = 'open'
    and i.remind_at is not null
    and i.remind_at <= now()
    and i.remind_at > now() - interval '24 hours'
    and not exists (select 1 from public.planner_push_log l where l.item_id = i.id and l.remind_at = i.remind_at)
    and exists (select 1 from public.planner_push_subscriptions s where s.user_id = i.user_id)
  order by i.remind_at;
$$;

revoke execute on function public.planner_due_reminders() from public, anon, authenticated;
grant execute on function public.planner_due_reminders() to service_role;
