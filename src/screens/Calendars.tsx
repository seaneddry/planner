import { useState } from 'react';
import { Screen } from '../components/Screen';
import { Icon } from '../components/Icon';
import { BackLink } from '../components/Bits';
import { ConfirmSheet } from '../components/ConfirmSheet';
import { ErrorNotice, Loading } from '../components/States';
import { useToast } from '../components/Toast';
import { addCalendar, addPushCalendar, deleteCalendar, listCalendars, syncCalendars, updateCalendar } from '../api';
import type { SyncResult } from '../api';
import { errorMessage, useBump, useQuery } from '../lib/useQuery';
import { buildAppsScript, newPushKey } from '../lib/appsScript';
import type { CalendarFeed, Space } from '../types';

function ago(ts: string | null): string {
  if (!ts) return 'not read yet';
  const min = Math.round((Date.now() - new Date(ts).getTime()) / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} h ago`;
  return `${Math.round(h / 24)} d ago`;
}

function status(c: CalendarFeed): string {
  if (c.last_error) return c.last_error;
  if (c.source === 'push') {
    return c.last_synced_at ? `${c.event_count} events · updated ${ago(c.last_synced_at)} by Apps Script` : 'Waiting for the script’s first run';
  }
  return `${c.event_count} events · synced ${ago(c.last_synced_at)}`;
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

/** Step-by-step setup for a calendar linked through Google Apps Script. */
function ScriptSetup({ cal, onClose }: { cal: CalendarFeed; onClose: () => void }) {
  const toast = useToast();
  const script = buildAppsScript(cal.push_key ?? '', cal.name);
  const [shown, setShown] = useState(false);

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet script-sheet" role="dialog" aria-modal="true" aria-label={`Set up ${cal.name}`} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-grabber" aria-hidden="true" />
        <div className="sheet-head">
          <span />
          <h2>Link “{cal.name}”</h2>
          <button className="nav-button nav-button-strong" onClick={onClose}>
            Done
          </button>
        </div>
        <div className="sheet-body">
          <ol className="setup-steps">
            <li>
              On a computer, sign in to your <b>work</b> Google account and open <b>script.google.com</b>. Click <b>New project</b>.
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
              Click <b>Save</b> (the disk icon). In the function list next to <b>Run</b>, pick <b>setup</b>, then click <b>Run</b>.
            </li>
            <li>
              Google asks for permission to read your calendar and connect to an external service. Choose your work account and <b>Allow</b>. If it says
              the app isn’t verified, that’s because it’s your own script: click <b>Advanced</b>, then <b>Go to … (unsafe)</b>.
            </li>
            <li>Come back here. Within a minute this calendar shows its events. After that it updates by itself whenever the calendar changes.</li>
          </ol>
          <p className="footnote">
            If step 3 or 4 fails with “disabled”, “not allowed” or a UrlFetch error, your Google Workspace admin blocks Apps Script or outside
            connections. The script includes your private key for this calendar only; don’t share it. Removing the calendar here turns the key off.
          </p>
        </div>
      </div>
    </div>
  );
}

/** Link Google Calendars so their events show in the planner. Read-only. */
export function Calendars() {
  const cals = useQuery(listCalendars, [], 'calendars');
  const bump = useBump();
  const toast = useToast();
  const [method, setMethod] = useState<'ical' | 'push'>('ical');
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [space, setSpace] = useState<Space>('work');
  const [busy, setBusy] = useState(false);
  const [remove, setRemove] = useState<CalendarFeed | null>(null);
  const [setup, setSetup] = useState<CalendarFeed | null>(null);
  const [showHelp, setShowHelp] = useState(false);

  const list = cals.data ?? [];
  const icalCount = list.filter((c) => c.source !== 'push').length;
  const validUrl = /^(https|webcal):\/\/\S+$/i.test(url.trim());
  const canAdd = Boolean(name.trim()) && (method === 'push' || validUrl);

  function report(results: SyncResult[]) {
    const failed = results.filter((r) => r.error);
    if (failed.length) toast(`${failed[0].name}: ${failed[0].error}`);
    else if (results.length === 1) toast(`${results[0].name}: ${results[0].events ?? 0} events`);
    else if (results.length) toast(`Synced ${results.length} calendars`);
  }

  async function add() {
    if (!canAdd) return;
    setBusy(true);
    try {
      if (method === 'push') {
        const key = newPushKey();
        const id = await addPushCalendar({ name: name.trim(), space, push_key: key });
        const created: CalendarFeed = {
          id,
          name: name.trim(),
          source: 'push',
          url: null,
          push_key: key,
          space,
          enabled: true,
          last_synced_at: null,
          last_error: null,
          event_count: 0,
          created_at: new Date().toISOString(),
        };
        setName('');
        bump();
        setSetup(created);
      } else {
        const id = await addCalendar({ name: name.trim(), url: url.trim(), space });
        setName('');
        setUrl('');
        bump();
        report(await syncCalendars(id));
        bump();
      }
    } catch (e) {
      toast(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function syncAll() {
    setBusy(true);
    try {
      report(await syncCalendars());
      bump();
    } catch (e) {
      toast(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function patch(c: CalendarFeed, p: Partial<CalendarFeed>) {
    try {
      await updateCalendar(c.id, p);
      bump();
    } catch (e) {
      toast(errorMessage(e));
    }
  }

  async function confirmRemove() {
    if (!remove) return;
    try {
      await deleteCalendar(remove.id);
      toast(`Removed ${remove.name}`);
      bump();
    } catch (e) {
      toast(errorMessage(e));
    } finally {
      setRemove(null);
    }
  }

  return (
    <Screen
      title="Calendars"
      left={<BackLink to="/settings" label="Settings" />}
      right={
        icalCount ? (
          <button className="nav-button" onClick={() => void syncAll()} disabled={busy}>
            {busy ? 'Syncing…' : 'Sync now'}
          </button>
        ) : null
      }
    >
      <main className="page">
        <div className="stack">
          {cals.error && !cals.data ? <ErrorNotice message={cals.error} onRetry={cals.reload} /> : null}
          {cals.loading && !cals.data ? <Loading /> : null}

          {list.length ? (
            <div className="group">
              <div className="group-header">Linked</div>
              <div className="group-body">
                {list.map((c) => (
                  <div key={c.id} className="cal-feed">
                    <div className="cal-feed-top">
                      <span className="row-icon">
                        <Icon name={c.source === 'push' ? 'refresh' : 'calendar'} size={18} />
                      </span>
                      <span className="row-label">
                        {c.name}
                        <span className={`row-sub ${c.last_error ? 'is-danger' : ''}`}>{status(c)}</span>
                      </span>
                      <span className="switch">
                        <input
                          type="checkbox"
                          role="switch"
                          checked={c.enabled}
                          onChange={(e) => void patch(c, { enabled: e.target.checked })}
                          aria-label={`Show ${c.name}`}
                        />
                        <span className="switch-track" />
                      </span>
                    </div>
                    <div className="cal-feed-actions">
                      <SpaceToggle value={c.space} onChange={(s) => void patch(c, { space: s })} label={`${c.name} is`} />
                      {c.source === 'push' ? (
                        <button className="mini-button" onClick={() => setSetup(c)}>
                          Setup
                        </button>
                      ) : (
                        <button
                          className="mini-button"
                          disabled={busy}
                          onClick={() => {
                            setBusy(true);
                            void syncCalendars(c.id)
                              .then((r) => {
                                report(r);
                                bump();
                              })
                              .catch((e) => toast(errorMessage(e)))
                              .finally(() => setBusy(false));
                          }}
                        >
                          Sync
                        </button>
                      )}
                      <button className="icon-clear" onClick={() => setRemove(c)} aria-label={`Remove ${c.name}`}>
                        <Icon name="trash" size={16} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              <div className="group-footer">
                Secret-address calendars refresh every 30 minutes. Apps Script calendars update within about a minute of any change, with a check every 15
                minutes. Edit events in Google Calendar; here they’re read-only.
              </div>
            </div>
          ) : null}

          <div className="group">
            <div className="group-header">Add a calendar</div>
            <div className="segmented method-switch" role="radiogroup" aria-label="How to link">
              <button role="radio" aria-checked={method === 'ical'} className={method === 'ical' ? 'on' : ''} onClick={() => setMethod('ical')}>
                Secret address
              </button>
              <button role="radio" aria-checked={method === 'push'} className={method === 'push' ? 'on' : ''} onClick={() => setMethod('push')}>
                Apps Script
              </button>
            </div>
            <div className="group-body">
              <label className="row-input">
                <span className="row-label">Name</span>
                <input placeholder={method === 'push' ? 'e.g. Work (Agmo)' : 'e.g. Personal'} value={name} onChange={(e) => setName(e.target.value)} />
              </label>
              <div className="row-input">
                <span className="row-label">Space</span>
                <SpaceToggle value={space} onChange={setSpace} label="Space" />
              </div>
              {method === 'ical' ? (
                <label className="row-input">
                  <span className="row-label">Address</span>
                  <input
                    placeholder="https://calendar.google.com/calendar/ical/…/basic.ics"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    inputMode="url"
                  />
                </label>
              ) : null}
            </div>
            <div className="group-footer">
              {method === 'ical'
                ? 'Use this for calendars that offer a “Secret address in iCal format”, such as personal Gmail.'
                : 'Use this when the secret address is blocked, as on most work accounts. A small script in that Google account sends the events here.'}
            </div>
            <div className="button-row">
              <button className="button button-primary button-small" onClick={() => void add()} disabled={busy || !canAdd}>
                {busy ? 'Working…' : method === 'push' ? 'Create and show setup' : 'Link calendar'}
              </button>
              {method === 'ical' ? (
                <button className="button button-secondary button-small" onClick={() => setShowHelp((h) => !h)}>
                  {showHelp ? 'Hide steps' : 'Where do I find the address?'}
                </button>
              ) : null}
            </div>
          </div>

          {method === 'ical' && (showHelp || !list.length) ? (
            <div className="group">
              <div className="group-header">Getting the address from Google Calendar</div>
              <div className="group-body group-pad help-steps">
                <ol>
                  <li>
                    Open <b>calendar.google.com</b> on a computer (the phone app doesn’t show this).
                  </li>
                  <li>
                    Click the gear › <b>Settings</b>, then under <b>Settings for my calendars</b> click the calendar you want.
                  </li>
                  <li>
                    Scroll to <b>Integrate calendar</b> and copy the <b>Secret address in iCal format</b>.
                  </li>
                  <li>Paste it above, give it a name, and choose Work or Personal.</li>
                </ol>
                <p className="muted">If there’s no secret address (common on work accounts), switch to Apps Script above.</p>
                <p className="muted">The secret address lets anyone who has it read the calendar, so it is only stored in your private account here.</p>
              </div>
            </div>
          ) : null}
        </div>
      </main>
      {setup ? <ScriptSetup cal={setup} onClose={() => setSetup(null)} /> : null}
      {remove ? (
        <ConfirmSheet
          title={`Stop showing “${remove.name}”? Nothing changes in Google Calendar.${remove.source === 'push' ? ' The script’s key stops working; delete the script project too.' : ''}`}
          confirmLabel="Remove calendar"
          danger
          onConfirm={() => void confirmRemove()}
          onCancel={() => setRemove(null)}
        />
      ) : null}
    </Screen>
  );
}
