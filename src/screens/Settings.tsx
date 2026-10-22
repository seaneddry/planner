import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Screen } from '../components/Screen';
import { Icon } from '../components/Icon';
import { BackLink, Section, EmptyLine } from '../components/Bits';
import { ConfirmSheet } from '../components/ConfirmSheet';
import { ErrorNotice } from '../components/States';
import { useToast } from '../components/Toast';
import { useAuth } from '../auth';
import { addHoliday, deleteHoliday, EXPENSE_APP_URL, ICS_BASE, listHolidays, regenerateIcsToken, updateSettings } from '../api';
import { useRefs } from '../lib/refs';
import { clearCache, errorMessage, useBump, useQuery } from '../lib/useQuery';
import { flush, onPendingChange, pendingCount } from '../lib/outbox';
import { disablePush, enablePush, getPushState, sendTestPush } from '../lib/push';
import type { PushState } from '../lib/push';
import { addDays, relativeDay, shortDate, todayKL } from '../lib/dates';
import type { Settings as SettingsRow, Space } from '../types';

function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <span className="switch">
      <input type="checkbox" role="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} aria-label={label} />
      <span className="switch-track" />
    </span>
  );
}

export function Settings() {
  const { session, signOut } = useAuth();
  const { settings } = useRefs();
  const bump = useBump();
  const toast = useToast();
  const [push, setPush] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState(pendingCount());
  const [confirmToken, setConfirmToken] = useState(false);
  const [remindTime, setRemindTime] = useState('');

  useEffect(() => {
    void getPushState().then(setPush);
    return onPendingChange(setPending);
  }, []);

  useEffect(() => {
    if (settings) setRemindTime(settings.default_remind_time.slice(0, 5));
  }, [settings]);

  async function patch(p: Partial<SettingsRow>, message = 'Saved') {
    try {
      await updateSettings(p);
      bump();
      toast(message);
    } catch (e) {
      toast(errorMessage(e));
    }
  }

  async function togglePush(on: boolean) {
    if (!session) return;
    setBusy(true);
    try {
      if (on) {
        await enablePush(session.user.id);
        toast('Notifications on');
      } else {
        await disablePush();
        toast('Notifications off on this device');
      }
    } catch (e) {
      toast(errorMessage(e));
    } finally {
      setPush(await getPushState());
      setBusy(false);
    }
  }

  async function test() {
    setBusy(true);
    try {
      await sendTestPush();
      toast('Test sent');
    } catch (e) {
      toast(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const feed = settings ? `${ICS_BASE}?token=${settings.ics_token}` : '';
  const webcal = feed.replace(/^https:/, 'webcal:');

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast('Link copied');
    } catch {
      window.prompt('Copy this link', text);
    }
  }

  const scopes = settings?.holiday_scopes ?? ['national', 'selangor'];
  function toggleScope(scope: string, on: boolean) {
    const next = on ? [...new Set([...scopes, scope])] : scopes.filter((s) => s !== scope);
    void patch({ holiday_scopes: next });
  }

  return (
    <Screen title="Settings">
      <main className="page">
        <div className="stack">
          {/* ------------------------------------------------------------ notifications */}
          <div className="group">
            <div className="group-header">Notifications on this device</div>
            <div className="group-body">
              {push?.kind === 'needs-install' ? (
                <div className="group-pad">
                  On iPhone, notifications only work once Planner is on your Home Screen. In Safari tap Share, then <b>Add to Home Screen</b>, open it from
                  there and come back here.
                </div>
              ) : push?.kind === 'unsupported' ? (
                <div className="group-pad">This browser cannot show notifications.</div>
              ) : push?.kind === 'blocked' ? (
                <div className="group-pad">Notifications are blocked for this site. Allow them in the browser or phone settings, then reload.</div>
              ) : (
                <>
                  <div className="row">
                    <span className="row-label">
                      Reminders and morning brief
                      <span className="row-sub">Each item’s reminder, plus the brief at 8am</span>
                    </span>
                    <Switch checked={push?.kind === 'on'} onChange={(v) => void togglePush(v)} label="Notifications" />
                  </div>
                  {push?.kind === 'on' ? (
                    <button className="row" onClick={() => void test()} disabled={busy}>
                      <span className="row-label">Send a test notification</span>
                    </button>
                  ) : null}
                </>
              )}
              <label className="row-input">
                <span className="row-label">Morning time</span>
                <input
                  type="time"
                  value={remindTime}
                  onChange={(e) => setRemindTime(e.target.value)}
                  onBlur={() => remindTime && settings && remindTime !== settings.default_remind_time.slice(0, 5) && void patch({ default_remind_time: remindTime })}
                />
              </label>
            </div>
            <div className="group-footer">“Morning” reminders and “days before” reminders go off at this time.</div>
          </div>

          {/* ------------------------------------------------------------------ brief */}
          <div className="group">
            <div className="group-header">Morning brief</div>
            <div className="group-body">
              <div className="row">
                <span className="row-label">
                  Write a brief every morning
                  <span className="row-sub">Gemini summarises your day at 8am</span>
                </span>
                <Switch checked={settings?.brief_enabled ?? true} onChange={(v) => void patch({ brief_enabled: v })} label="Daily brief" />
              </div>
              <div className="row">
                <span className="row-label">Send it as a notification</span>
                <Switch checked={settings?.brief_push ?? true} onChange={(v) => void patch({ brief_push: v })} label="Brief notification" />
              </div>
              <Link to="/brief" className="row">
                <span className="row-label">Open today’s brief</span>
                <span className="row-chevron">
                  <Icon name="chevron-right" size={18} />
                </span>
              </Link>
            </div>
          </div>

          {/* --------------------------------------------------------------- defaults */}
          <div className="group">
            <div className="group-header">Defaults</div>
            <div className="group-body">
              <div className="row-input">
                <span className="row-label">New items</span>
                <div className="segmented segmented-inline" role="radiogroup" aria-label="Default space">
                  {(['work', 'personal'] as Space[]).map((s) => (
                    <button
                      key={s}
                      role="radio"
                      aria-checked={settings?.default_space === s}
                      className={settings?.default_space === s ? 'on' : ''}
                      onClick={() => void patch({ default_space: s })}
                    >
                      {s === 'work' ? 'Work' : 'Personal'}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="group-footer">Used when the Work/Personal filter is on All and you don’t type /p or /w.</div>
          </div>

          {/* ------------------------------------------------------- google calendars */}
          <div className="group">
            <div className="group-header">Google Calendar</div>
            <div className="group-body">
              <Link to="/settings/calendars" className="row">
                <span className="row-icon">
                  <Icon name="calendar" size={18} />
                </span>
                <span className="row-label">
                  Linked calendars
                  <span className="row-sub">Show your work and personal Google Calendar events here</span>
                </span>
                <span className="row-chevron">
                  <Icon name="chevron-right" size={18} />
                </span>
              </Link>
            </div>
          </div>

          {/* ----------------------------------------------------------- calendar feed */}
          <div className="group">
            <div className="group-header">Calendar feed</div>
            <div className="group-body">
              <a className="row" href={webcal}>
                <span className="row-icon">
                  <Icon name="calendar" size={18} />
                </span>
                <span className="row-label">
                  Subscribe in Calendar
                  <span className="row-sub">Apple Calendar or Outlook on this device</span>
                </span>
              </a>
              <button className="row" onClick={() => void copy(feed)}>
                <span className="row-icon">
                  <Icon name="copy" size={18} />
                </span>
                <span className="row-label">
                  Copy the link
                  <span className="row-sub">For Google Calendar: Other calendars › From URL</span>
                </span>
              </button>
              <div className="row">
                <span className="row-label">
                  Hide work details
                  <span className="row-sub">Work items show only the project name</span>
                </span>
                <Switch
                  checked={settings?.ics_work_detail === 'minimal'}
                  onChange={(v) => void patch({ ics_work_detail: v ? 'minimal' : 'full' })}
                  label="Hide work details"
                />
              </div>
              <button className="row row-danger" onClick={() => setConfirmToken(true)}>
                <span className="row-label">Make a new link</span>
              </button>
            </div>
            <div className="group-footer">
              Read-only. Anyone with the link can see what’s in it, so keep it private. Calendars refresh it every few hours.
            </div>
          </div>

          {/* ---------------------------------------------------------------- holidays */}
          <div className="group">
            <div className="group-header">Public holidays</div>
            <div className="group-body">
              <div className="row">
                <span className="row-label">Malaysia (national)</span>
                <Switch checked={scopes.includes('national')} onChange={(v) => toggleScope('national', v)} label="National holidays" />
              </div>
              <div className="row">
                <span className="row-label">Selangor</span>
                <Switch checked={scopes.includes('selangor')} onChange={(v) => toggleScope('selangor', v)} label="Selangor holidays" />
              </div>
              <Link to="/settings/holidays" className="row">
                <span className="row-label">See and add holidays</span>
                <span className="row-chevron">
                  <Icon name="chevron-right" size={18} />
                </span>
              </Link>
            </div>
          </div>

          {/* ----------------------------------------------------------------- offline */}
          <div className="group">
            <div className="group-header">Offline</div>
            <div className="group-body">
              <div className="row">
                <span className="row-label">
                  Changes waiting to sync
                  <span className="row-sub">Made while offline; sent automatically when you’re back online</span>
                </span>
                <span className="row-value">{pending}</span>
              </div>
              {pending ? (
                <button
                  className="row"
                  onClick={() =>
                    void flush().then((n) => {
                      bump();
                      toast(n ? `Synced ${n}` : 'Still offline');
                    })
                  }
                >
                  <span className="row-label">Sync now</span>
                </button>
              ) : null}
              <button
                className="row"
                onClick={() => {
                  clearCache();
                  bump();
                  toast('Saved copy cleared. Reloading data…');
                }}
              >
                <span className="row-label">Clear the saved copy</span>
              </button>
            </div>
          </div>

          {/* ----------------------------------------------------------------- account */}
          <div className="group">
            <div className="group-header">Account</div>
            <div className="group-body">
              <div className="row">
                <span className="row-label">Signed in as</span>
                <span className="row-value">{session?.user.email}</span>
              </div>
              <a className="row" href={EXPENSE_APP_URL} target="_blank" rel="noreferrer">
                <span className="row-icon">
                  <Icon name="wallet" size={18} />
                </span>
                <span className="row-label">Open the expense tracker</span>
                <span className="row-chevron">
                  <Icon name="external" size={16} />
                </span>
              </a>
              <button className="row row-danger" onClick={() => void signOut().then(clearCache)}>
                <span className="row-label">Sign out</span>
              </button>
            </div>
            <div className="group-footer">Planner {__APP_VERSION__}</div>
          </div>
        </div>
      </main>
      {confirmToken ? (
        <ConfirmSheet
          title="Make a new calendar link? Calendars using the old link stop updating until you subscribe again."
          confirmLabel="Make a new link"
          danger
          onConfirm={() => {
            setConfirmToken(false);
            void regenerateIcsToken()
              .then(() => {
                bump();
                toast('New link ready');
              })
              .catch((e) => toast(errorMessage(e)));
          }}
          onCancel={() => setConfirmToken(false)}
        />
      ) : null}
    </Screen>
  );
}

/** Public holidays for the next year, plus your own (company days, cuti peristiwa). */
export function Holidays() {
  const today = todayKL();
  const { settings } = useRefs();
  const scopes = settings?.holiday_scopes ?? ['national', 'selangor'];
  const list = useQuery(() => listHolidays(addDays(today, -7), addDays(today, 400), scopes), [today, scopes.join()], 'holidays-year');
  const bump = useBump();
  const toast = useToast();
  const [date, setDate] = useState('');
  const [name, setName] = useState('');

  async function add() {
    if (!date || !name.trim()) return;
    try {
      await addHoliday(date, name.trim());
      setDate('');
      setName('');
      bump();
      toast('Holiday added');
    } catch (e) {
      toast(errorMessage(e));
    }
  }

  async function remove(id: string) {
    try {
      await deleteHoliday(id);
      bump();
    } catch (e) {
      toast(errorMessage(e));
    }
  }

  return (
    <Screen title="Public holidays" left={<BackLink to="/settings" label="Settings" />}>
      <main className="page">
        <div className="stack-tight">
          <div className="inline-form">
            <input className="input input-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label="Holiday date" />
            <input className="input" placeholder="Add a holiday, e.g. Company day off" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void add()} aria-label="Holiday name" />
            <button className="button button-primary button-small" onClick={() => void add()} disabled={!date || !name.trim()}>
              Add
            </button>
          </div>
          {list.error && !list.data ? <ErrorNotice message={list.error} onRetry={list.reload} /> : null}
          <Section title="Coming up" count={list.data?.length}>
            {(list.data ?? []).map((h) => (
              <div key={h.id} className="item-row">
                <span className="row-glyph" aria-hidden="true">
                  <Icon name="flag" size={16} />
                </span>
                <span className="item-main">
                  <span className="item-title">{h.name}</span>
                  <span className="item-meta">
                    {shortDate(h.holiday_on)} {h.holiday_on.slice(0, 4)} · {relativeDay(h.holiday_on, today)} ·{' '}
                    {h.user_id ? 'yours' : h.scope === 'selangor' ? 'Selangor' : 'National'}
                    {h.estimated ? ' · date estimated' : ''}
                  </span>
                </span>
                {h.user_id ? (
                  <button className="icon-clear" onClick={() => void remove(h.id)} aria-label={`Remove ${h.name}`}>
                    <Icon name="trash" size={16} />
                  </button>
                ) : null}
              </div>
            ))}
            {list.data && !list.data.length ? <EmptyLine>No holidays found.</EmptyLine> : null}
          </Section>
          <p className="footnote">
            Built-in dates cover 2026 to 2030. Dates marked “estimated” depend on moon sighting or later announcements and may move; check closer to the
            time and add any extra days yourself.
          </p>
        </div>
      </main>
    </Screen>
  );
}
