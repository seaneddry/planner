// Reference copy. Planner generates this with your private key filled in; use that one.
/**
 * Planner Google Tasks link: (copy the ready-made version from Planner > Settings > Google Tasks > Setup)
 *
 * Sends this Google account's tasks to your Planner. One-way: Google -> Planner.
 * New tasks appear in Planner; ticking a task done in Google ticks it in Planner too.
 * Checks every minute and only sends when something changed.
 *
 * First time:
 *   1. In the left bar click "Services" (+), pick "Google Tasks API", click Add.
 *   2. Choose "setup" in the function list above and press Run, then allow access.
 * Nothing showing up? Choose "diagnose" and press Run to see what the script can read.
 * To stop: choose "removeTriggers" and press Run (or delete this project).
 */

const PLANNER_URL = 'https://sqtfdpxhtnspdnthabwj.supabase.co/functions/v1/planner-taskpush';
const PLANNER_KEY = 'PASTE_YOUR_KEY_FROM_PLANNER'; // private: lets this script update this one link in Planner
const LISTS = [];              // empty = all your task lists; or names, e.g. ['My Tasks', 'Porsche']
const EVERY_MINUTES = 1;       // 1, 5, 10, 15 or 30
const DONE_DAYS_BACK = 30;     // also send tasks completed in the last N days, so ticks come across

function setup() {
  checkService_();
  removeTriggers();
  ScriptApp.newTrigger('sync').timeBased().everyMinutes(EVERY_MINUTES).create();
  const test = post_({ test: true });
  if (!test.ok) throw new Error('Planner did not accept the key: ' + test.error);
  PropertiesService.getScriptProperties().deleteAllProperties();
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
    const seen = {};
    const add = function (t) {
      if (seen[t.id]) return;
      if (!t.title && !t.notes) return; // blank rows Google leaves behind
      seen[t.id] = true;
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
    };
    // Open tasks (including ones assigned to you from Docs or Chat).
    listAll_(list.id, { showCompleted: false, showHidden: false, showAssigned: true }).forEach(add);
    // Recently completed tasks, so a tick in Google comes across. completedMin only returns completed tasks.
    listAll_(list.id, { showCompleted: true, showHidden: true, showAssigned: true, completedMin: doneSince })
      .filter(function (t) { return t.status === 'completed'; })
      .forEach(add);
  });
  return out;
}

function listAll_(listId, options) {
  const all = [];
  let token;
  do {
    const opts = Object.assign({ maxResults: 100, showDeleted: false }, options);
    if (token) opts.pageToken = token;
    let page;
    try {
      page = Tasks.Tasks.list(listId, opts);
    } catch (e) {
      if (!opts.showAssigned) throw e;
      delete opts.showAssigned; // older API versions don't know this option
      page = Tasks.Tasks.list(listId, opts);
    }
    (page.items || []).forEach(function (t) { all.push(t); });
    token = page.nextPageToken;
  } while (token);
  return all;
}

/** Run this to see what the script can read from Google Tasks (View > Logs / Execution log). */
function diagnose() {
  checkService_();
  const tasks = readTasks_();
  const byList = {};
  tasks.forEach(function (t) {
    const k = t.list + (t.status === 'completed' ? ' (done)' : ' (open)');
    byList[k] = (byList[k] || 0) + 1;
  });
  Logger.log('Task lists: ' + Tasks.Tasklists.list({ maxResults: 100 }).items.map(function (l) { return l.title; }).join(', '));
  Logger.log('Tasks found: ' + JSON.stringify(byList));
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
