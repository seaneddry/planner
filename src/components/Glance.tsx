import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from './Icon';
import { PaymentRow } from './Bits';
import { generateBrief, getBrief, listHolidays, listLeave, listMilestones, listPayments } from '../api';
import { useRefs } from '../lib/refs';
import { errorMessage, useBump, useQuery } from '../lib/useQuery';
import { addDays, relativeDay, shortDate, todayKL } from '../lib/dates';

/** Today's AI morning brief. Written automatically at 8am; can be refreshed any time. */
export function BriefCard() {
  const today = todayKL();
  const { settings } = useRefs();
  const brief = useQuery(() => getBrief(today), [today], `brief-${today}`);
  const bump = useBump();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const tried = useRef(false);

  async function write() {
    setBusy(true);
    setError(null);
    try {
      await generateBrief();
      bump();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  // Opened before the 8am run, or the run missed you: write it once, automatically.
  useEffect(() => {
    if (tried.current || brief.loading || brief.offline || brief.data || !settings?.brief_enabled) return;
    tried.current = true;
    const flag = `planner:brief-auto:${today}`;
    try {
      if (localStorage.getItem(flag)) return;
      localStorage.setItem(flag, '1');
    } catch {
      /* ignore */
    }
    void write();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brief.loading, brief.data, brief.offline, settings?.brief_enabled, today]);

  if (settings && !settings.brief_enabled) return null;

  return (
    <div className="brief-card">
      <div className="brief-head">
        <span className="brief-label">
          <Icon name="sparkle" size={14} /> Morning brief
          {brief.data ? ` · ${new Date(brief.data.created_at).toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Asia/Kuala_Lumpur' })}` : ''}
        </span>
        <span className="brief-actions">
          <button className="brief-button" onClick={() => void write()} disabled={busy} aria-label="Rewrite the brief">
            <Icon name="refresh" size={15} />
          </button>
          <Link to="/brief" className="brief-button" aria-label="Open the brief">
            <Icon name="arrow-right" size={15} />
          </Link>
        </span>
      </div>
      {busy && !brief.data ? <p className="brief-text muted-inverse">Writing your brief…</p> : null}
      {brief.data ? <p className={`brief-text ${busy ? 'is-busy' : ''}`}>{brief.data.content}</p> : null}
      {!brief.data && !busy && !error ? (
        <button className="brief-write" onClick={() => void write()}>
          Write today’s brief
        </button>
      ) : null}
      {error ? <p className="brief-text muted-inverse">{error}</p> : null}
    </div>
  );
}

/** The week at a glance: leave, holidays, milestones and payments. */
export function WeekGlance({ compact }: { compact?: boolean }) {
  const today = todayKL();
  const in7 = addDays(today, 6);
  const in14 = addDays(today, 14);
  const { settings, projectById, space } = useRefs();
  const scopes = settings?.holiday_scopes ?? ['national', 'selangor'];
  const leave = useQuery(() => listLeave(today, in7), [today], 'glance-leave');
  const holidays = useQuery(() => listHolidays(today, in14, scopes), [today, scopes.join()], 'glance-holidays');
  const milestones = useQuery(() => listMilestones(), [], 'milestones');
  const payments = useQuery(() => listPayments(7), [], 'payments-7');

  const ms = (milestones.data ?? []).filter((m) => !m.done && m.due_on && m.due_on >= today && m.due_on <= in14);
  const showWork = space !== 'personal';
  const showPersonal = space !== 'work';
  const pays = showPersonal ? (payments.data ?? []).filter((p) => !p.paid) : [];
  const rows = (showWork ? (leave.data?.length ?? 0) + ms.length : 0) + (holidays.data?.length ?? 0) + pays.length;

  return (
    <div className="glance">
      <div className="glance-head">This week</div>
      <div className="group-body">
        {showWork &&
          (leave.data ?? []).map((l) => (
            <div key={l.id} className="glance-row">
              <Icon name="users" size={16} />
              <span className="glance-text">
                {l.person?.name ?? 'Someone'} on leave{l.part !== 'full' ? ` (${l.part.toUpperCase()})` : ''}
              </span>
              <span className="glance-when">
                {l.starts_on === l.ends_on ? relativeDay(l.starts_on) : `${shortDate(l.starts_on < today ? today : l.starts_on)} – ${shortDate(l.ends_on)}`}
              </span>
            </div>
          ))}
        {(holidays.data ?? []).map((h) => (
          <div key={h.id} className="glance-row">
            <Icon name="flag" size={16} />
            <span className="glance-text">{h.name}</span>
            <span className="glance-when">{relativeDay(h.holiday_on)}</span>
          </div>
        ))}
        {showWork &&
          ms.map((m) => (
            <Link key={m.id} to={`/projects/${m.project_id}`} className="glance-row">
              <span className="diamond" aria-hidden="true" />
              <span className="glance-text">
                {projectById.get(m.project_id)?.name ?? 'Project'}: {m.name}
              </span>
              <span className="glance-when">{relativeDay(m.due_on!)}</span>
            </Link>
          ))}
        {compact ? null : pays.map((p) => <PaymentRow key={p.id} p={p} />)}
        {compact && pays.length ? (
          <div className="glance-row">
            <Icon name="wallet" size={16} />
            <span className="glance-text">{pays.map((p) => p.name).join(', ')}</span>
            <span className="glance-when">payments</span>
          </div>
        ) : null}
        {rows === 0 ? <div className="glance-row muted">Nothing else on this week.</div> : null}
      </div>
    </div>
  );
}
