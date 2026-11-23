-- Google Tasks imported into the planner (one-way: Google -> Planner).
-- A small Apps Script in the Google account (e.g. the Agmo work account) reads its task lists and
-- POSTs them to the planner-taskpush Edge Function with a private key. New Google tasks become
-- planner items; when a task's title, notes, date or done state changes in Google, the planner copy
-- follows. Changes made in the planner are never sent back to Google.

create table public.planner_task_links (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name            text not null check (length(trim(name)) > 0),
  space           text not null default 'work' check (space in ('work', 'personal')),
  push_key        text not null unique check (push_key ~ '^[a-f0-9]{48,128}$'),
  enabled         boolean not null default true,
  last_synced_at  timestamptz,
  last_error      text,
  task_count      int not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index planner_task_links_user_idx on public.planner_task_links (user_id);

create trigger planner_task_links_updated before update on public.planner_task_links
  for each row execute function public.set_updated_at();

alter table public.planner_task_links enable row level security;
create policy "owner access" on public.planner_task_links for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
revoke all on public.planner_task_links from anon;

-- Where an item came from. Removing the link keeps the items as ordinary planner items.
alter table public.planner_items
  add column gtask_link_id  uuid references public.planner_task_links (id) on delete set null,
  add column gtask_id       text,
  add column gtask_list     text,                -- Google list name, shown on the item
  add column gtask_status   text,                -- last state seen in Google: needsAction, completed, deleted
  add column gtask_updated  timestamptz;         -- Google's "updated" time last applied
create unique index planner_items_gtask_key on public.planner_items (gtask_link_id, gtask_id) where gtask_id is not null;

alter table public.planner_subtasks
  add column gtask_id    text,
  add column gtask_done  boolean;                -- last done state seen in Google
create unique index planner_subtasks_gtask_key on public.planner_subtasks (item_id, gtask_id) where gtask_id is not null;
