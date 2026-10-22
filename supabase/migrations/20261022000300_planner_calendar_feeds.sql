-- Google Calendar (or any iCal feed) shown inside the planner, read-only.
-- Each feed is a private iCal address; the planner-calsync Edge Function reads it every 30 minutes
-- and stores the events for the next few months in planner_events.

create table public.planner_calendars (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name            text not null check (length(trim(name)) > 0),
  url             text not null check (url ~* '^(https|webcal)://'),
  space           text not null default 'work' check (space in ('work', 'personal')),
  enabled         boolean not null default true,
  last_synced_at  timestamptz,
  last_error      text,
  event_count     int not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index planner_calendars_user_idx on public.planner_calendars (user_id);

create table public.planner_events (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  calendar_id  uuid not null references public.planner_calendars (id) on delete cascade,
  uid          text not null,
  title        text not null,
  location     text,
  all_day      boolean not null default false,
  starts_at    timestamptz not null,
  ends_at      timestamptz not null,
  start_date   date not null,   -- Malaysia-time date the event starts
  end_date     date not null,   -- Malaysia-time date the event ends (inclusive)
  synced_at    timestamptz not null default now(),
  unique (calendar_id, uid)
);
create index planner_events_user_date_idx on public.planner_events (user_id, start_date, end_date);
create index planner_events_calendar_idx on public.planner_events (calendar_id);

create trigger planner_calendars_updated before update on public.planner_calendars
  for each row execute function public.set_updated_at();

alter table public.planner_calendars enable row level security;
create policy "owner access" on public.planner_calendars for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
revoke all on public.planner_calendars from anon;

-- Events are written only by the sync function; the app reads them.
alter table public.planner_events enable row level security;
create policy "owner read" on public.planner_events for select to authenticated
  using (user_id = (select auth.uid()));
revoke all on public.planner_events from anon;
revoke insert, update, delete on public.planner_events from authenticated;

select cron.schedule(
  'planner-calendar-sync',
  '7,37 * * * *',
  $cmd$
  select net.http_post(
    url     := 'https://sqtfdpxhtnspdnthabwj.supabase.co/functions/v1/planner-calsync',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select cron_secret from public.push_config where id = 1)),
    body    := jsonb_build_object('action', 'run'),
    timeout_milliseconds := 120000);
  $cmd$
);
