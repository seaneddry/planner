import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Screen } from '../components/Screen';
import { Icon } from '../components/Icon';
import { WeekGlance } from '../components/Glance';
import { ErrorNotice, Loading } from '../components/States';
import { generateBrief, listBriefs } from '../api';
import { useRefs } from '../lib/refs';
import { errorMessage, useBump, useQuery } from '../lib/useQuery';
import { fullDate, relativeDay, todayKL } from '../lib/dates';

/** Today's morning brief in full, with the last two weeks below. */
export function BriefPage() {
  const today = todayKL();
  const { settings } = useRefs();
  const briefs = useQuery(listBriefs, [], 'briefs');
  const bump = useBump();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const todays = (briefs.data ?? []).find((b) => b.brief_on === today);
  const older = (briefs.data ?? []).filter((b) => b.brief_on !== today);

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

  return (
    <Screen title="Morning brief" sub={fullDate(today)}>
      <main className="page">
        <div className="stack-tight">
          {settings && !settings.brief_enabled ? (
            <div className="notice">
              The daily brief is switched off. <Link to="/settings">Turn it on in Settings</Link>.
            </div>
          ) : null}

          <div className="brief-card brief-card-large">
            <div className="brief-head">
              <span className="brief-label">
                <Icon name="sparkle" size={14} /> Today
                {todays?.source === 'fallback' ? ' · basic version (AI unavailable)' : ''}
              </span>
            </div>
            {briefs.loading && !briefs.data ? <p className="brief-text muted-inverse">Loading…</p> : null}
            {todays ? <p className={`brief-text ${busy ? 'is-busy' : ''}`}>{todays.content}</p> : null}
            {!todays && !briefs.loading ? <p className="brief-text muted-inverse">No brief yet today.</p> : null}
            <button className="brief-write" onClick={() => void write()} disabled={busy}>
              {busy ? 'Writing…' : todays ? 'Rewrite with the latest' : 'Write today’s brief'}
            </button>
          </div>
          {error ? <ErrorNotice message={error} /> : null}
          {briefs.error && !briefs.data ? <ErrorNotice message={briefs.error} onRetry={briefs.reload} /> : null}

          <WeekGlance />

          <p className="footnote">
            A new brief is written at 8am every day{settings?.brief_push ? ' and sent to your phone' : ''}. It only uses what is in the planner and your
            expense tracker’s payments.
          </p>

          {older.length ? (
            <div className="group">
              <div className="group-header">Earlier</div>
              <div className="group-body">
                {older.map((b) => (
                  <div key={b.id} className="brief-old">
                    <div className="brief-old-date">{relativeDay(b.brief_on, today)}</div>
                    <p>{b.content}</p>
                  </div>
                ))}
              </div>
            </div>
          ) : briefs.loading ? (
            <Loading />
          ) : null}
        </div>
      </main>
    </Screen>
  );
}
