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

## 4. Calendar feed (optional)

**Settings › Calendar feed**:

- iPhone or Mac: **Subscribe in Calendar**.
- Google Calendar: **Copy the link**, then in Google Calendar on the web choose
  **Other calendars › + › From URL** and paste it.

Turn on **Hide work details** if your calendar is shared with others. **Make a new link** cuts off
the old one.

## 5. Morning brief

The brief uses the `GEMINI_API_KEY` Edge Function secret, the same one the expense tracker's Ask feature uses, so it works as soon as Ask does. To use
a different key or model, change the Edge Function secrets `GEMINI_API_KEY` or `BRIEF_MODEL` in
Supabase (**Project Settings › Edge Functions › Secrets**).

## Quick capture from the iPhone Action Button (optional)

The app supports `https://seaneddry.github.io/planner/?capture=1`, which opens straight into quick
capture. In Shortcuts, make a shortcut with **Open URLs** pointing there and assign it to the Action
Button.
