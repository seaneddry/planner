# Planner

One app for work and personal to-dos, follow-ups, reminders and plans. Phone layout on a phone,
sidebar layout on a laptop. Installable as an app (PWA) and usable offline.

- **Frontend:** React, TypeScript, Vite, React Router. Installable PWA.
- **Backend:** Supabase (the same project as the expense tracker and wardrobe apps): Postgres with
  row-level security, Edge Functions and two scheduled jobs.
- **Hosting:** GitHub Pages, deployed by GitHub Actions on every push to `main`.
- **Look and feel:** the `my-wardrobe` design system (iOS-style, monochrome, light and dark).

## What's in it

| Area | Screens |
|---|---|
| Daily | Today (overdue, due today, waiting on, payments, morning brief, this week), Upcoming (next 30 days with a two-week strip), Calendar (month), Search |
| Work | Projects (cards with health, milestones, tasks, notes, links), Waiting on, Meeting notes that turn into action items, Team & leave (availability grid), Weekly review (with a copyable status update) |
| Personal | Errands and Shopping list (grouped by place), Renewals & expiries, Car & home maintenance, Birthdays & occasions, Appointments, Packing lists with templates, upcoming payments from the expense tracker |
| Everywhere | Google Calendar events (work and personal, read-only), quick capture with shortcuts, push reminders, snooze, repeats, subtasks, priority, effort, links, calendar feed (ICS), AI morning brief, offline mode |

### Quick capture

Type a line and the details are picked out for you:

```
nudge @client on UAT feedback fri #porsche !high
```

| Type | Means |
|---|---|
| `#porsche` | project (by tag; a new tag creates the project) |
| `@client` | person; starting with "nudge", "chase", "ping", "fu" or "follow up" makes it a follow-up |
| `!high` `!med` `!low` | priority |
| `~30m` `~2h` | effort |
| `+mrdiy` | place, for errands and shopping |
| `^1d` `^9am` | reminder (days before, or a time) |
| `/p` `/w` | personal or work |
| `today`, `tmr`, `fri`, `next week`, `in 3 days`, `24 oct`, `24/10`, `3pm` | due date and time |
| `every day`, `weekdays`, `every 2 weeks`, `monthly`, `every 6 months`, `yearly` | repeat |

Starting with "buy", "renew", "appt" or "errand:" sets the type, and "birthday" or "anniversary" makes a yearly occasion. Adding from a list (say, Car & home) uses that list's type. Paste several lines
to add several items. On a laptop press **N** anywhere to start typing.

## Automations

- **Reminders:** a database job runs every 5 minutes and sends due reminders as push notifications
  (`planner-push`).
- **Morning brief:** at 8am Malaysia time Gemini writes a short brief from your planner and payments
  and sends it to your phone (`planner-brief`). If Gemini is unavailable a plain summary is used.
- **Repeats:** ticking off a repeating item creates the next one (database function `planner_complete`).
- **Google Calendar:** `planner-calsync` reads each linked calendar's private iCal address every
  30 minutes and shows the events in Today, Upcoming, Calendar and the morning brief. Repeating
  events, moved or cancelled occurrences and time zones are handled. Read-only. Work calendars
  without a secret address use a Google Apps Script that pushes events to `planner-calpush` as soon
  as the calendar changes (see docs/SETUP.md).
- **Calendar feed:** `planner-ics` serves a private, read-only calendar of your dated items, leave,
  holidays, milestones and payments.
- **Offline:** the last loaded data is kept on the device; changes made offline are queued and sent
  when you're back online.

## Project layout

```
src/
  api.ts            every Supabase call
  lib/              dates, quick-capture parser (+ tests), outbox (offline writes), push, labels
  components/       Nav (tab bar + sidebar), Capture, ItemRow, Glance (brief + week), sheets
  screens/          one file per screen
  base.css          design system from my-wardrobe
  app.css           planner components and the laptop layout
supabase/migrations the planner tables (already applied to the live project)
supabase/functions  planner-push, planner-brief, planner-ics, planner-calsync, planner-calpush (already deployed)
```

## Develop

```
npm install
cp .env.example .env.local
npm run dev        # http://localhost:5173/planner/
npm test           # quick-capture parser tests
npm run typecheck
```

See [docs/SETUP.md](docs/SETUP.md) for hosting and phone setup.
