# Setup

The database tables, functions, scheduled jobs and Edge Functions are already live in the Supabase
project the expense tracker uses. These are the steps that happen outside it.

## 1. Turn on GitHub Pages (once)

1. Open the repository on GitHub, then **Settings › Pages**.
2. Under **Build and deployment › Source**, choose **GitHub Actions**.
3. Open the **Actions** tab and re-run the latest "Deploy to GitHub Pages" run (or push any change).

The app is then at **https://seaneddry.github.io/planner/**.

## 2. Sign in

Use the same email and password as the expense tracker. Sign-ups are off; the planner shares that
account.

## 3. Put it on your iPhone

1. Open the link in Safari, tap **Share › Add to Home Screen**.
2. Open Planner from the Home Screen, then **More › Settings** and switch on notifications.
3. Tap **Send a test notification** to check.

Notifications only work from the Home Screen app on iPhone.

## 4. Link your Google Calendars

Do this once for each calendar (for example your personal Gmail calendar and your work calendar).

1. On a computer, open calendar.google.com, then the gear › **Settings**.
2. Under **Settings for my calendars**, click the calendar.
3. In **Integrate calendar**, copy the **Secret address in iCal format**.
4. In Planner, go to **Settings › Linked calendars**, paste the address, give it a name and choose
   **Work** or **Personal**, then **Link calendar**.

Events then appear in Today, Upcoming, Calendar and the morning brief, refreshed every 30 minutes
(or tap **Sync now**). They are read-only; change them in Google Calendar. If a work calendar shows
no secret address, the Google Workspace admin has turned it off; use the Apps Script route below.

### Work calendar without a secret address (Apps Script)

1. In Planner, **Settings › Linked calendars › Add a calendar**, choose **Apps Script**, name it
   (say "Work") and tap **Create and show setup**.
2. On a computer signed in to the work Google account, open script.google.com › **New project**,
   delete the sample code and paste the script (**Copy script** in Planner).
3. Save, pick **setup** in the function list and press **Run**, then allow access.

The script sends the calendar's events whenever the calendar changes (usually within a minute) and
checks again every 15 minutes. Declined meetings are left out. To stop it, run **removeTriggers** in
the script or delete the project; removing the calendar in Planner also turns its key off.
[docs/apps-script.gs](apps-script.gs) is a reference copy of the script.

## 4b. Import Google Tasks (Apps Script)

One-way, Google → Planner. New Google tasks become planner tasks; ticking one done in Google ticks it
in Planner too.

1. In Planner, **Settings › Google › Google Tasks**, name the link (say "Agmo tasks"), choose
   **Work** or **Personal** and tap **Create and show setup**.
2. On a computer signed in to that Google account, open script.google.com › **New project**, delete
   the sample code and paste the script (**Copy script** in Planner).
3. In the left bar, **Services › +** › **Google Tasks API** › **Add**.
4. Save, pick **setup** in the function list and press **Run**, then allow access.

The script checks Google every minute and only sends when something changed (plus once an hour as a
safety net). Rules:

- Only open tasks are imported; ones already done in Google are skipped.
- Title, notes and due date follow Google whenever the task changes there. Google Tasks only keeps a
  date, not a time.
- Done / not done follows Google when it changes there. Ticking a task in Planner is not sent to
  Google and is not undone by the next check.
- A task deleted in Google is dropped in Planner. Deleting an imported task in Planner brings it back
  on the next check; mark it done or drop it instead.
- Google subtasks become subtasks. A list with the same name as a project files its tasks in that
  project. Set `LISTS` in the script to send only some lists.

[docs/apps-script-tasks.gs](apps-script-tasks.gs) is a reference copy of the script.

## 5. Calendar feed (optional)

**Settings › Calendar feed**:

- iPhone or Mac: **Subscribe in Calendar**.
- Google Calendar: **Copy the link**, then in Google Calendar on the web choose
  **Other calendars › + › From URL** and paste it.

Turn on **Hide work details** if your calendar is shared with others. **Make a new link** cuts off
the old one.

## 6. Morning brief

The brief uses the `GEMINI_API_KEY` Edge Function secret, the same one the expense tracker's Ask feature uses, so it works as soon as Ask does. To use
a different key or model, change the Edge Function secrets `GEMINI_API_KEY` or `BRIEF_MODEL` in
Supabase (**Project Settings › Edge Functions › Secrets**).

## Quick capture from the iPhone Action Button (optional)

The app supports `https://seaneddry.github.io/planner/?capture=1`, which opens straight into quick
capture. In Shortcuts, make a shortcut with **Open URLs** pointing there and assign it to the Action
Button.
