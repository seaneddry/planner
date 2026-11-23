// The Google Apps Script that sends a Google account's tasks (Google Tasks) to Planner. It runs inside
// the user's own Google account (script.google.com), so it works on Workspace accounts like Agmo's.
// Generated with the link's private key filled in; a reference copy is in docs/apps-script-tasks.gs.

export const TASKPUSH_URL = `${import.meta.env?.VITE_SUPABASE_URL ?? 'https://sqtfdpxhtnspdnthabwj.supabase.co'}/functions/v1/planner-taskpush`;

export function buildTasksScript(key: string, name: string, url: string = TASKPUSH_URL): string {
  return `/**
 * Planner Google Tasks link: ${name.replace(/\*\//g, '')}
 *
 * Sends this Google account's tasks to your Planner. One-way: Google -> Planner.
 * New tasks appear in Planner; ticking a task done in Google ticks it in Planner too.
 * Checks every minute and only sends when something changed.
 *
 * First time:
 *   1. In the left bar click "Services" (+), pick "Google Tasks API", click Add.
 *   2. Choose "setup" in the function list above and press Run, then allow access.
 * To stop: choose "removeTriggers" and press Run (or delete this project).
 */

const PLANNER_URL = '${url}';
const PLANNER_KEY = '${key}'; // private: lets this script update this one link in Planner
const LISTS = [];              // empty = all your task lists; or names, e.g. ['My Tasks', 'Porsche']
const EVERY_MINUTES = 1;       // 1, 5, 10, 15 or 30
const DONE_DAYS_BACK = 30;     // also send tasks completed in the last N days, so ticks come across

function setup() {
  checkService_();
  removeTriggers();
  ScriptApp.newTrigger('sync').timeBased().everyMinutes(EVERY_MINUTES).create();
  const test = post_({ test: true });
  if (!test.ok) throw new Error('Planner did not accept the key: ' + test.error);
  PropertiesService.getScriptProperties().deleteProperty('lastHash');
  const result = sync();
  Logger.log('Linked to Planner "' + test.link + '". ' + result.tasks + ' open tasks, ' + result.added + ' new.');
}

function sync() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) return { skipped: true };
  try {
    checkService_();
    const tasks = readTasks_();
    const props = PropertiesService.getScriptProperties();
    const payload = JSON.stringify({ tasks: tasks });
    const hash = Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, payload));
    const lastSent = Number(props.getProperty('lastSent') || 0);
    // Nothing changed: skip, but still send once an hour as a safety net.
    if (hash === props.getProperty('lastHash') && Date.now() - lastSent < 3600000) return { skipped: true };
    const res = post_({ tasks: tasks });
    if (!res.ok) throw new Error(res.error || 'Planner refused the update');
    props.setProperties({ lastHash: hash, lastSent: String(Date.now()) });
    return res;
  } catch (err) {
    try { post_({ error: 'Apps Script: ' + err.message }); } catch (ignored) {}
    throw err;
  } finally {
    lock.releaseLock();
  }
}

function readTasks_() {
  const doneSince = new Date(Date.now() - DONE_DAYS_BACK * 86400000).toISOString();
  const wanted = LISTS.map(function (n) { return String(n).toLowerCase(); });
  const out = [];
  let pageToken;
  const lists = [];
  do {
    const page = Tasks.Tasklists.list({ maxResults: 100, pageToken: pageToken });
    (page.items || []).forEach(function (l) { lists.push(l); });
    pageToken = page.nextPageToken;
  } while (pageToken);

  lists.forEach(function (list) {
    if (wanted.length && wanted.indexOf(String(list.title).toLowerCase()) < 0) return;
    let token;
    do {
      const page = Tasks.Tasks.list(list.id, {
        maxResults: 100,
        pageToken: token,
        showCompleted: true,
        showHidden: true,
        showDeleted: false,
        completedMin: doneSince,
      });
      (page.items || []).forEach(function (t) {
        if (!t.title && !t.notes) return; // blank rows Google leaves behind
        out.push({
          id: list.id + '|' + t.id,
          list: list.title,
          parent: t.parent ? list.id + '|' + t.parent : null,
          title: t.title,
          notes: t.notes || null,
          due: t.due ? String(t.due).slice(0, 10) : null, // Google keeps the date only
          status: t.status,
          completed: t.completed || null,
          updated: t.updated,
          position: t.position || '',
        });
      });
      token = page.nextPageToken;
    } while (token);
  });
  return out;
}

function removeTriggers() {
  ScriptApp.getProjectTriggers().forEach(function (t) { ScriptApp.deleteTrigger(t); });
}

function checkService_() {
  if (typeof Tasks === 'undefined') {
    throw new Error('Add the Google Tasks API first: left bar > Services (+) > Google Tasks API > Add.');
  }
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
`;
}
