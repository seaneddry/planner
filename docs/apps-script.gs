// Reference copy. Planner generates this with your private key filled in; use that one.
/**
 * Planner calendar link: (copy the ready-made version from Planner > Settings > Linked calendars > Setup)
 *
 * Sends this Google account's calendar events to your Planner (read-only copy).
 * Runs by itself whenever the calendar changes, plus a safety run every 15 minutes.
 *
 * First time: choose "setup" in the function list above and press Run, then allow access.
 * To stop: choose "removeTriggers" and press Run (or delete this project).
 */

const PLANNER_URL = 'https://sqtfdpxhtnspdnthabwj.supabase.co/functions/v1/planner-calpush';
const PLANNER_KEY = 'PASTE_YOUR_KEY_FROM_PLANNER'; // private: lets this script update this one calendar in Planner
const CALENDAR_ID = 'primary'; // or a calendar's ID from Google Calendar > Settings > Integrate calendar
const SAFETY_MINUTES = 15;     // 1, 5, 10, 15 or 30
const DAYS_BACK = 14;
const DAYS_AHEAD = 180;
const SKIP_DECLINED = true;

function setup() {
  removeTriggers();
  const cal = getCalendar_();
  ScriptApp.newTrigger('sync').forUserCalendar(cal.getId()).onEventUpdated().create();
  ScriptApp.newTrigger('sync').timeBased().everyMinutes(SAFETY_MINUTES).create();
  const test = post_({ test: true });
  if (!test.ok) throw new Error('Planner did not accept the key: ' + test.error);
  const result = sync();
  Logger.log('Linked to Planner calendar "' + test.calendar + '". Sent ' + result.events + ' events.');
}

function sync() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) return { skipped: true };
  try {
    const cal = getCalendar_();
    const tz = cal.getTimeZone() || Session.getScriptTimeZone();
    const now = new Date();
    const from = new Date(now.getTime() - DAYS_BACK * 86400000);
    const to = new Date(now.getTime() + DAYS_AHEAD * 86400000);
    const events = [];
    cal.getEvents(from, to).forEach(function (e) {
      if (SKIP_DECLINED && e.getMyStatus() === CalendarApp.GuestStatus.NO) return;
      const allDay = e.isAllDayEvent();
      events.push({
        id: e.getId() + '|' + e.getStartTime().getTime(),
        title: e.getTitle(),
        location: e.getLocation(),
        all_day: allDay,
        start: allDay ? Utilities.formatDate(e.getAllDayStartDate(), tz, 'yyyy-MM-dd') : e.getStartTime().toISOString(),
        end: allDay ? Utilities.formatDate(e.getAllDayEndDate(), tz, 'yyyy-MM-dd') : e.getEndTime().toISOString(),
      });
    });
    const res = post_({ events: events });
    if (!res.ok) throw new Error(res.error || 'Planner refused the update');
    return res;
  } catch (err) {
    try { post_({ error: 'Apps Script: ' + err.message }); } catch (ignored) {}
    throw err;
  } finally {
    lock.releaseLock();
  }
}

function removeTriggers() {
  ScriptApp.getProjectTriggers().forEach(function (t) { ScriptApp.deleteTrigger(t); });
}

function getCalendar_() {
  const cal = CALENDAR_ID === 'primary' ? CalendarApp.getDefaultCalendar() : CalendarApp.getCalendarById(CALENDAR_ID);
  if (!cal) throw new Error('Calendar not found: ' + CALENDAR_ID);
  return cal;
}

function post_(body) {
  const res = UrlFetchApp.fetch(PLANNER_URL, {
    method: 'post',
    contentType: 'application/json',
    headers: { 'x-planner-key': PLANNER_KEY },
    payload: JSON.stringify(body),
    muteHttpExceptions: true,
  });
  let data = {};
  try { data = JSON.parse(res.getContentText()); } catch (e) { data = { error: res.getContentText().slice(0, 200) }; }
  if (res.getResponseCode() >= 300 && !data.error) data.error = 'HTTP ' + res.getResponseCode();
  return data;
}
