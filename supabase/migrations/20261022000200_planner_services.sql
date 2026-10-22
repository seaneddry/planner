-- Server-side helpers for the planner's Edge Functions (morning brief, calendar feed,
-- reminders) and the cron jobs that drive them.

-- Upcoming recurring payments from the expense tracker for one user, for the brief and the
-- calendar feed (which run without a user session). Read-only. Service role only.
create or replace function public.planner_payments_for(p_user uuid, p_days int)
returns table (id uuid, name text, kind text, amount numeric, next_due date, days_until int, paid boolean)
language sql
stable
security definer
set search_path = public
as $$
  select i.id, i.name, i.kind, i.amount, n.d, (n.d - public.kl_today())::int,
         coalesce(i.last_paid_due = n.d, false)
  from public.recurring_items i
  cross join lateral (select public.recurring_next_due(i.anchor_date, i.cycle, public.kl_today()) as d) n
  where i.user_id = p_user
    and i.status = 'active'
    and n.d is not null
    and (i.ends_on is null or n.d <= i.ends_on)
    and n.d <= public.kl_today() + p_days
  order by n.d;
$$;

revoke execute on function public.planner_payments_for(uuid, int) from public, anon, authenticated;
grant execute on function public.planner_payments_for(uuid, int) to service_role;

-- Reminders: every 5 minutes. Morning brief: 08:00 Malaysia time (00:00 UTC).
-- Same pattern as the expense tracker's alerts: the anon key gets the request past the
-- function gateway; the x-cron-secret header is what authorises the job.
select cron.schedule(
  'planner-reminders',
  '*/5 * * * *',
  $cmd$
  select net.http_post(
    url     := 'https://sqtfdpxhtnspdnthabwj.supabase.co/functions/v1/planner-push',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNxdGZkcHhodG5zcGRudGhhYndqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE0NDQyMDksImV4cCI6MjEwNzAyMDIwOX0._Zv9tc36cUmLc_RInmJjke_Q3s0MW6E-xq49L3qd7JI',
      'x-cron-secret', (select cron_secret from public.push_config where id = 1)),
    body    := jsonb_build_object('action', 'run'));
  $cmd$
);

select cron.schedule(
  'planner-morning-brief',
  '0 0 * * *',
  $cmd$
  select net.http_post(
    url     := 'https://sqtfdpxhtnspdnthabwj.supabase.co/functions/v1/planner-brief',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNxdGZkcHhodG5zcGRudGhhYndqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE0NDQyMDksImV4cCI6MjEwNzAyMDIwOX0._Zv9tc36cUmLc_RInmJjke_Q3s0MW6E-xq49L3qd7JI',
      'x-cron-secret', (select cron_secret from public.push_config where id = 1)),
    body    := jsonb_build_object('action', 'run'),
    timeout_milliseconds := 60000);
  $cmd$
);
