import { useState } from 'react';
import { Screen } from '../components/Screen';
import { Icon } from '../components/Icon';
import { BackLink } from '../components/Bits';
import { ConfirmSheet } from '../components/ConfirmSheet';
import { ErrorNotice, Loading } from '../components/States';
import { useToast } from '../components/Toast';
import { addCalendar, deleteCalendar, listCalendars, syncCalendars, updateCalendar } from '../api';
import type { SyncResult } from '../api';
import { errorMessage, useBump, useQuery } from '../lib/useQuery';
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

/** Link Google Calendars (or any iCal feed) so their events show in the planner. Read-only. */
export function Calendars() {
  const cals = useQuery(listCalendars, [], 'calendars');
  const bump = useBump();
  const toast = useToast();
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [space, setSpace] = useState<Space>('work');
  const [busy, setBusy] = useState(false);
  const [remove, setRemove] = useState<CalendarFeed | null>(null);
  const [showHelp, setShowHelp] = useState(false);

  const list = cals.data ?? [];
  const validUrl = /^(https|webcal):\/\/\S+$/i.test(url.trim());

  function report(results: SyncResult[]) {
    const failed = results.filter((r) => r.error);
    if (failed.length) toast(`${failed[0].name}: ${failed[0].error}`);
    else if (results.length === 1) toast(`${results[0].name}: ${results[0].events ?? 0} events`);
    else toast(`Synced ${results.length} calendars`);
  }

  async function add() {
    if (!name.trim() || !validUrl) return;
    setBusy(true);
    try {
      const id = await addCalendar({ name: name.trim(), url: url.trim(), space });
      setName('');
      setUrl('');
      bump();
      report(await syncCalendars(id));
      bump();
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
        list.length ? (
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
                        <Icon name="calendar" size={18} />
                      </span>
                      <span className="row-label">
                        {c.name}
                        <span className={`row-sub ${c.last_error ? 'is-danger' : ''}`}>
                          {c.last_error ? c.last_error : `${c.event_count} events · synced ${ago(c.last_synced_at)}`}
                        </span>
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
                      <button className="icon-clear" onClick={() => setRemove(c)} aria-label={`Remove ${c.name}`}>
                        <Icon name="trash" size={16} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              <div className="group-footer">Events refresh every 30 minutes. Edit them in Google Calendar; here they’re read-only.</div>
            </div>
          ) : null}

          <div className="group">
            <div className="group-header">Add a calendar</div>
            <div className="group-body">
              <label className="row-input">
                <span className="row-label">Name</span>
                <input placeholder="e.g. Work (Agmo)" value={name} onChange={(e) => setName(e.target.value)} />
              </label>
              <div className="row-input">
                <span className="row-label">Space</span>
                <SpaceToggle value={space} onChange={setSpace} label="Space" />
              </div>
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
            </div>
            <div className="button-row">
              <button className="button button-primary button-small" onClick={() => void add()} disabled={busy || !name.trim() || !validUrl}>
                {busy ? 'Reading calendar…' : 'Link calendar'}
              </button>
              <button className="button button-secondary button-small" onClick={() => setShowHelp((h) => !h)}>
                {showHelp ? 'Hide steps' : 'Where do I find the address?'}
              </button>
            </div>
          </div>

          {showHelp || !list.length ? (
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
                <p className="muted">
                  Do this once for your personal Gmail calendar and once for your work calendar. If the work calendar has no secret address, your
                  Google Workspace admin has switched secret addresses off; ask IT whether they can allow it.
                </p>
                <p className="muted">The secret address lets anyone who has it read the calendar, so it is only stored in your private account here.</p>
              </div>
            </div>
          ) : null}
        </div>
      </main>
      {remove ? (
        <ConfirmSheet
          title={`Stop showing “${remove.name}”? Nothing changes in Google Calendar.`}
          confirmLabel="Remove calendar"
          danger
          onConfirm={() => void confirmRemove()}
          onCancel={() => setRemove(null)}
        />
      ) : null}
    </Screen>
  );
}
