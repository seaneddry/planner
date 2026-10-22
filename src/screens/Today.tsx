import { Link } from 'react-router-dom';
import { Screen } from '../components/Screen';
import { ItemRow } from '../components/ItemRow';
import { CaptureBar } from '../components/Capture';
import { BriefCard, WeekGlance } from '../components/Glance';
import { EmptyLine, OfflineBanner, PaymentRow, Section, SpaceSwitch } from '../components/Bits';
import { ErrorNotice } from '../components/States';
import { Icon } from '../components/Icon';
import { listDoneBetween, listPayments } from '../api';
import { bucketToday, inSpace, useOpenItems } from '../lib/items';
import { useRefs, useWide } from '../lib/refs';
import { useQuery } from '../lib/useQuery';
import { fullDate, todayKL } from '../lib/dates';

export function Today() {
  const today = todayKL();
  const wide = useWide();
  const { space } = useRefs();
  const items = useOpenItems();
  const done = useQuery(() => listDoneBetween(today, today), [today], `done-${today}`);
  const payments = useQuery(() => listPayments(7), [], 'payments-7');

  const b = bucketToday(items.data ?? [], space, today);
  const showPersonal = space !== 'work';
  const payToday = showPersonal ? (payments.data ?? []).filter((p) => !p.paid && p.next_due <= today) : [];
  const doneToday = (done.data ?? []).filter((i) => inSpace(i, space));
  const dueCount = b.overdue.length + b.today.length + payToday.length;
  const waitingShown = wide ? b.waiting : b.waiting.slice(0, 5);

  const lists = (
    <div className="stack-tight">
      {b.overdue.length ? (
        <Section title="Overdue" count={b.overdue.length} tone="danger">
          {b.overdue.map((i) => (
            <ItemRow key={i.id} item={i} showSnooze />
          ))}
        </Section>
      ) : null}

      <Section title="Today" count={b.today.length + payToday.length}>
        {b.today.map((i) => (
          <ItemRow key={i.id} item={i} hideDate />
        ))}
        {payToday.map((p) => (
          <PaymentRow key={p.id} p={p} />
        ))}
        {b.today.length + payToday.length === 0 ? (
          <EmptyLine>{dueCount === 0 && b.anytime.length === 0 ? 'All clear for today.' : 'Nothing else due today.'}</EmptyLine>
        ) : null}
      </Section>

      {!wide && b.waiting.length ? (
        <Section
          title="Waiting on"
          count={b.waiting.length}
          action={
            b.waiting.length > 5 ? (
              <Link to="/waiting" className="section-link">
                See all
              </Link>
            ) : null
          }
        >
          {waitingShown.map((i) => (
            <ItemRow key={i.id} item={i} />
          ))}
        </Section>
      ) : null}

      {b.anytime.length ? (
        <Section title="Anytime" count={b.anytime.length} collapsible defaultOpen={b.anytime.length <= 6}>
          {b.anytime.map((i) => (
            <ItemRow key={i.id} item={i} />
          ))}
        </Section>
      ) : null}

      {doneToday.length ? (
        <Section title="Done today" count={doneToday.length} collapsible defaultOpen={false}>
          {doneToday.map((i) => (
            <ItemRow key={i.id} item={i} />
          ))}
        </Section>
      ) : null}
    </div>
  );

  return (
    <Screen
      title="Today"
      sub={fullDate(today)}
      right={
        <Link to="/search" className="nav-icon-button" aria-label="Search">
          <Icon name="search" size={22} />
        </Link>
      }
    >
      <main className="page">
        <div className="toolbar">
          <SpaceSwitch />
        </div>
        <OfflineBanner show={items.offline} />
        {items.error && !items.data ? <ErrorNotice message={items.error} onRetry={items.reload} /> : null}
        {wide ? <CaptureBar /> : null}

        {wide ? (
          <div className="two-col">
            <div className="col-main">{lists}</div>
            <aside className="col-side">
              <BriefCard />
              {b.waiting.length ? (
                <Section title="Waiting on" count={b.waiting.length} action={<Link to="/waiting" className="section-link">All</Link>}>
                  {waitingShown.slice(0, 8).map((i) => (
                    <ItemRow key={i.id} item={i} />
                  ))}
                </Section>
              ) : null}
              <WeekGlance />
            </aside>
          </div>
        ) : (
          <div className="stack-tight">
            <BriefCard />
            {lists}
            <WeekGlance compact />
          </div>
        )}
      </main>
    </Screen>
  );
}
