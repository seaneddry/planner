import { Link } from 'react-router-dom';
import { Screen } from '../components/Screen';
import { Icon } from '../components/Icon';
import { PERSONAL_LISTS } from '../components/Nav';
import { countBadges, useOpenItems } from '../lib/items';
import { KINDS } from '../lib/labels';

function Row({ to, icon, label, count }: { to: string; icon: string; label: string; count?: number }) {
  return (
    <Link to={to} className="row">
      <span className="row-icon">
        <Icon name={icon} size={18} />
      </span>
      <span className="row-label">{label}</span>
      {count ? <span className="row-value">{count}</span> : null}
      <span className="row-chevron">
        <Icon name="chevron-right" size={18} />
      </span>
    </Link>
  );
}

/** Everything that does not fit in the phone's tab bar. */
export function More() {
  const items = useOpenItems();
  const { waiting } = countBadges(items.data);
  const byKind = new Map<string, number>();
  for (const i of items.data ?? []) byKind.set(i.kind, (byKind.get(i.kind) ?? 0) + 1);

  return (
    <Screen title="More">
      <main className="page">
        <div className="stack">
          <div className="group">
            <div className="group-header">Plan</div>
            <div className="group-body">
              <Row to="/calendar" icon="calendar" label="Calendar" />
              <Row to="/waiting" icon="hourglass" label="Waiting on" count={waiting} />
              <Row to="/brief" icon="sparkle" label="Morning brief" />
              <Row to="/search" icon="search" label="Search" />
            </div>
          </div>

          <div className="group">
            <div className="group-header">Work</div>
            <div className="group-body">
              <Row to="/notes" icon="note" label="Meeting notes" />
              <Row to="/team" icon="users" label="Team & leave" />
              <Row to="/review" icon="review" label="Weekly review" />
            </div>
          </div>

          <div className="group">
            <div className="group-header">Personal</div>
            <div className="group-body">
              {PERSONAL_LISTS.map((l) => (
                <Row key={l.kind} to={l.path} icon={KINDS[l.kind].icon} label={KINDS[l.kind].plural} count={byKind.get(l.kind)} />
              ))}
              <Row to="/packing" icon="suitcase" label="Packing lists" />
            </div>
          </div>

          <div className="group">
            <div className="group-body">
              <Row to="/settings" icon="gear" label="Settings" />
            </div>
          </div>
        </div>
      </main>
    </Screen>
  );
}
