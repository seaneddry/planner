-- Calendars that send their own events (Google Apps Script running in a work account where
-- secret iCal addresses are switched off). They have a private push key instead of a URL.

alter table public.planner_calendars
  add column source text not null default 'ical' check (source in ('ical', 'push')),
  add column push_key text unique check (push_key is null or push_key ~ '^[a-f0-9]{48,128}$'),
  alter column url drop not null;

alter table public.planner_calendars
  add constraint planner_calendars_source_fields check (
    (source = 'ical' and url is not null) or (source = 'push' and push_key is not null)
  );
