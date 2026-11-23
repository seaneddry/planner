import { useState } from 'react';
import { Screen } from '../components/Screen';
import { Icon } from '../components/Icon';
import { BackLink } from '../components/Bits';
import { ConfirmSheet } from '../components/ConfirmSheet';
import { ErrorNotice, Loading } from '../components/States';
import { useToast } from '../components/Toast';
import { addTaskLink, deleteTaskLink, listTaskLinks, updateTaskLink } from '../api';
import { errorMessage, useBump, useQuery } from '../lib/useQuery';
import { newPushKey } from '../lib/appsScript';
import { buildTasksScript } from '../lib/tasksScript';
import type { Space, TaskLink } from '../types';

function ago(ts: string | null): string {
  if (!ts) return '';
  const min = Math.round((Date.now() - new Date(ts).getTime()) / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} h ago`;
  return `${Math.round(h / 24)} d ago`;
}

function status(t: TaskLink): string {
  if (t.last_error) return t.last_error;
  if (!t.enabled) return 'Paused';
  if (!t.last_synced_at) return 'Waiting for the script’s first run';
  return `${t.task_count} open ${t.task_count === 1 ? 'task' : 'tasks'} in Google · last change ${ago(t.last_synced_at)}`;
}

function SpaceToggle({ value, onChange, label }: { value: Space; onChange: (s: Space) => void; label: string }) {
  return (
    <div className="segmented segmented-inline" role="radiogroup" aria-label={label}>
      {(['work', 'personal'] as Space[]).map((s) => (
        <button key={s} type="button" role="radio" aria-checked={value === s} className={value === s ? 'on' : ''} onClick={() => onChange(s)}>
          {s === 'work' ? 'Work' : 'Personal'}
        </button>
      ))}
    </div>
  );
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** Step-by-step setup for the Apps Script that sends Google Tasks to the planner. */
function ScriptSetup({ link, onClose }: { link: TaskLink; onClose: () => void }) {
  const toast = useToast();
  const script = buildTasksScript(link.push_key, link.name);
  const [shown, setShown] = useState(false);

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet script-sheet" role="dialog" aria-modal="true" aria-label={`Set up ${link.name}`} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-grabber" aria-hidden="true" />
        <div className="sheet-head">
          <span />
          <h2>Link “{link.name}”</h2>
          <button className="nav-button nav-button-strong" onClick={onClose}>
            Done
          </button>
        </div>
        <div className="sheet-body">
          <ol className="setup-steps">
            <li>
              On a computer, sign in to the Google account whose tasks you want (your <b>Agmo</b> account) and open <b>script.google.com</b>. Click{' '}
              <b>New project</b>.
            </li>
            <li>
              Delete the sample code, then paste the script.
              <div className="button-row">
                <button
                  className="button button-primary button-small"
                  onClick={() =>
                    void copyText(script).then((ok) => {
                      if (ok) toast('Script copied');
                      else setShown(true);
                    })
                  }
                >
                  Copy script
                </button>
                <button className="button button-secondary button-small" onClick={() => setShown((s) => !s)}>
                  {shown ? 'Hide script' : 'Show script'}
                </button>
              </div>
              {shown ? (
                <textarea className="script-box" readOnly value={script} rows={12} onFocus={(e) => e.currentTarget.select()} aria-label="Apps Script code" />
              ) : null}
            </li>
            <li>
              In the left bar, click the <b>+</b> next to <b>Services</b>, pick <b>Google Tasks API</b> and click <b>Add</b>.
            </li>
            <li>
              Click <b>Save</b> (the disk icon). In the function list next to <b>Run</b>, pick <b>setup</b>, then click <b>Run</b>.
            </li>
            <li>
              Google asks for permission to see your tasks and connect to an external service. Choose the same account and <b>Allow</b>. If it says the app
              isn’t verified, that’s because it’s your own script: click <b>Advanced</b>, then <b>Go to … (unsafe)</b>.
            </li>
            <li>Come back here. Your open Google tasks appear as tasks, and the script checks Google every minute after that.</li>
          </ol>
          <p className="footnote">
            Only open tasks are imported; ones already done in Google are skipped. If a Google list has the same name as one of your projects, its tasks
            go into that project. To send only some lists, put their names in <b>LISTS</b> near the top of the script. If step 4 or 5 fails with
            “disabled” or “not allowed”, your Workspace admin blocks the Tasks API or outside connections. The script holds a private key for this link
            only; don’t share it.
          </p>
        </div>
      </div>
    </div>
  );
}

/** Import Google Tasks into the planner (one-way). */
export function TaskLinks() {
  const links = useQuery(listTaskLinks, [], 'tasklinks');
  const bump = useBump();
  const toast = useToast();
  const [name, setName] = useState('');
  const [space, setSpace] = useState<Space>('work');
  const [busy, setBusy] = useState(false);
  const [remove, setRemove] = useState<TaskLink | null>(null);
  const [setup, setSetup] = useState<TaskLink | null>(null);

  const list = links.data ?? [];

  async function add() {
    if (!name.trim()) return;
    setBusy(true);
    try {
      const key = newPushKey();
      const id = await addTaskLink({ name: name.trim(), space, push_key: key });
      const created: TaskLink = {
        id,
        name: name.trim(),
        space,
        push_key: key,
        enabled: true,
        last_synced_at: null,
        last_error: null,
        task_count: 0,
        created_at: new Date().toISOString(),
      };
      setName('');
      bump();
      setSetup(created);
    } catch (e) {
      toast(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function patch(t: TaskLink, p: Partial<TaskLink>) {
    try {
      await updateTaskLink(t.id, p);
      bump();
    } catch (e) {
      toast(errorMessage(e));
    }
  }

  async function confirmRemove() {
    if (!remove) return;
    try {
      await deleteTaskLink(remove.id);
      toast(`Removed ${remove.name}`);
      bump();
    } catch (e) {
      toast(errorMessage(e));
    } finally {
      setRemove(null);
    }
  }

  return (
    <Screen title="Google Tasks" left={<BackLink to="/settings" label="Settings" />}>
      <main className="page">
        <div className="stack">
          {links.error && !links.data ? <ErrorNotice message={links.error} onRetry={links.reload} /> : null}
          {links.loading && !links.data ? <Loading /> : null}

          {list.length ? (
            <div className="group">
              <div className="group-header">Linked</div>
              <div className="group-body">
                {list.map((t) => (
                  <div key={t.id} className="cal-feed">
                    <div className="cal-feed-top">
                      <span className="row-icon">
                        <Icon name="check" size={18} />
                      </span>
                      <span className="row-label">
                        {t.name}
                        <span className={`row-sub ${t.last_error ? 'is-danger' : ''}`}>{status(t)}</span>
                      </span>
                      <span className="switch">
                        <input
                          type="checkbox"
                          role="switch"
                          checked={t.enabled}
                          onChange={(e) => void patch(t, { enabled: e.target.checked })}
                          aria-label={`Import from ${t.name}`}
                        />
                        <span className="switch-track" />
                      </span>
                    </div>
                    <div className="cal-feed-actions">
                      <SpaceToggle value={t.space} onChange={(s) => void patch(t, { space: s })} label={`New tasks from ${t.name} go to`} />
                      <button className="mini-button" onClick={() => setSetup(t)}>
                        Setup
                      </button>
                      <button className="icon-clear" onClick={() => setRemove(t)} aria-label={`Remove ${t.name}`}>
                        <Icon name="trash" size={16} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              <div className="group-footer">
                One-way: new Google tasks appear here within about a minute, and ticking one done in Google ticks it here. Edits and ticks made here aren’t
                sent to Google. A task deleted in Google is dropped here. To hide one for good, mark it done or drop it rather than deleting it, or it comes
                back on the next check.
              </div>
            </div>
          ) : null}

          <div className="group">
            <div className="group-header">Link a Google account</div>
            <div className="group-body">
              <label className="row-input">
                <span className="row-label">Name</span>
                <input placeholder="e.g. Agmo tasks" value={name} onChange={(e) => setName(e.target.value)} />
              </label>
              <div className="row-input">
                <span className="row-label">Space</span>
                <SpaceToggle value={space} onChange={setSpace} label="Space" />
              </div>
            </div>
            <div className="group-footer">A small script in that Google account sends its tasks here. Works on work accounts too.</div>
            <div className="button-row">
              <button className="button button-primary button-small" onClick={() => void add()} disabled={busy || !name.trim()}>
                {busy ? 'Working…' : 'Create and show setup'}
              </button>
            </div>
          </div>
        </div>
      </main>
      {setup ? <ScriptSetup link={setup} onClose={() => setSetup(null)} /> : null}
      {remove ? (
        <ConfirmSheet
          title={`Stop importing from “${remove.name}”? Tasks already imported stay in Planner, and nothing changes in Google. The script’s key stops working; delete the script project too.`}
          confirmLabel="Remove link"
          danger
          onConfirm={() => void confirmRemove()}
          onCancel={() => setRemove(null)}
        />
      ) : null}
    </Screen>
  );
}
