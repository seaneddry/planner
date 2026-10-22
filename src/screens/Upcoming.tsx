import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Screen } from '../components/Screen';
import { ItemRow } from '../components/ItemRow';
import { OfflineBanner, PaymentRow, Section, SpaceSwitch } from '../components/Bits';
import { CaptureBar } from '../components/Capture';
import { Icon } from '../components/Icon';
import { EventRow } from '../components/EventRow';
import { eventsByDay, useEvents } from '../lib/events';
import { listHolidays, listLeave, listMilestones, listPayments } from '../api';
import { inSpace, sortItems, useOpenItems } from '../lib/items';
import { useRefs, useWide } from '../lib/refs';
import { useQuery } from '../lib/useQuery';
import { addDays, dateRange, isWeekend, relativeDay, shortDate, todayKL, weekdayShort } from '../lib/dates';
import type { CalEvent, Holiday, Item, Leave, Milestone, Payment } from '../types';

interface Day {
  date: string;
  items: Item[];
  payments: Payment[];
  milestones: Milestone[];
  leave: Leave[];
  holidays: Holiday[];
  events: CalEvent[];
}

const DAYS = 30;

export function Upcoming() {
  const today = todayKL();
  const end = addDays(today, DAYS);
  const wide = useWide();
  const { space, settings, projectById } = useRefs();
  const scopes = settings?.holiday_scopes ?? ['national', 'selangor'];
  const items = useOpenItems();
  const payments = useQuery(() => listPayments(DAYS), [], 'payments-30');
  const milestones = useQuery(() => listMilestones(), [], 'milestones');
  const leave = useQuery(() => listLeave(today, end), [today], 'leave-30');
  const holidays = useQuery(() => listHolidays(today, end, scopes), [today, scopes.join()], 'holidays-30');
  const events = useEvents(addDays(today, 1), end, 'events-30');

  const showWork = space !== 'personal';
  const showPersonal = space !== 'work';

  const { days, later } = useMemo(() => {
    const map = new Map<string, Day>();
    for (const d of dateRange(addDays(today, 1), end)) map.set(d, { date: d, items: [], payments: [], milestones: [], leave: [], holidays: [], events: [] });
    const laterItems: Item[] = [];
    for (const i of items.data ?? []) {
      if (!i.due_on || !inSpace(i, space)) continue;
      if (i.due_on > end) laterItems.push(i);
      else map.get(i.due_on)?.items.push(i);
    }
    if (showPersonal) for (const p of payments.data ?? []) if (!p.paid) map.get(p.next_due)?.payments.push(p);
    if (showWork) {
      for (const m of milestones.data ?? []) if (!m.done && m.due_on) map.get(m.due_on)?.milestones.push(m);
      for (const l of leave.data ?? [])
        for (const d of dateRange(l.starts_on > today ? l.starts_on : addDays(today, 1), l.ends_on < end ? l.ends_on : end))
          if (!isWeekend(d)) map.get(d)?.leave.push(l);
    }
    for (const h of holidays.data ?? []) map.get(h.holiday_on)?.holidays.push(h);
    for (const [d, list] of eventsByDay(events.data, addDays(today, 1), end, space)) map.get(d)?.events.push(...list);
    for (const d of map.values()) d.items.sort(sortItems);
    return { days: [...map.values()], later: laterItems.sort(sortItems) };
  }, [items.data, payments.data, milestones.data, leave.data, holidays.data, events.data, space, today, end, showWork, showPersonal]);

  const strip = days.slice(0, 14);
  const busy = days.filter((d) => d.items.length + d.payments.length + d.milestones.length + d.leave.length + d.holidays.length + d.events.length > 0);

  function jump(date: string) {
    document.getElementById(`day-${date}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  return (
    <Screen
      title="Upcoming"
      sub="Next 30 days"
      right={
        <Link to="/calendar" className="nav-button">
          <Icon name="calendar" size={20} /> {wide ? 'Calendar' : ''}
        </Link>
      }
    >
      <main className="page">
        <div className="toolbar">
          <SpaceSwitch />
        </div>
        <OfflineBanner show={items.offline} />
        {wide ? <CaptureBar placeholder="Add for later… e.g. renew road tax 1/12 /p" /> : null}

        <div className="week-strip" role="list" aria-label="Next two weeks">
          {strip.map((d) => {
            const count = d.items.length + d.payments.length + d.milestones.length + d.events.length;
            return (
              <button
                key={d.date}
                role="listitem"
                className={`week-day ${isWeekend(d.date) ? 'is-weekend' : ''} ${d.holidays.length ? 'is-holiday' : ''}`}
                onClick={() => jump(d.date)}
                aria-label={`${shortDate(d.date)}, ${count} items${d.holidays.length ? ', public holiday' : ''}`}
              >
                <span className="week-dow">{weekdayShort(d.date)}</span>
                <span className="week-num">{Number(d.date.slice(8))}</span>
                <span className="week-dots" aria-hidden="true">
                  {count ? <span className="dot" /> : null}
                  {d.leave.length ? <span className="dot dot-leave" /> : null}
                </span>
              </button>
            );
          })}
        </div>

        <div className="stack-tight">
          {busy.length === 0 && later.length === 0 ? <div className="empty-line">Nothing planned for the next 30 days.</div> : null}
          {busy.map((d) => (
            <div key={d.date} id={`day-${d.date}`} className="day-block">
              <Section
                title={
                  <>
                    {relativeDay(d.date, today)}
                    {relativeDay(d.date, today) !== shortDate(d.date) ? <span className="section-sub"> {shortDate(d.date)}</span> : null}
                  </>
                }
                action={
                  <Link to={`/item/new?date=${d.date}`} className="section-link" aria-label={`Add on ${shortDate(d.date)}`}>
                    <Icon name="plus" size={16} />
                  </Link>
                }
              >
                {d.holidays.map((h) => (
                  <div key={h.id} className="info-row info-holiday">
                    <Icon name="flag" size={16} /> {h.name}
                    {h.estimated ? <span className="muted"> (estimated)</span> : null}
                  </div>
                ))}
                {d.leave.length ? (
                  <div className="info-row info-leave">
                    <Icon name="users" size={16} /> Out: {[...new Set(d.leave.map((l) => l.person?.name ?? 'Someone'))].join(', ')}
                  </div>
                ) : null}
                {d.milestones.map((m) => (
                  <Link key={m.id} to={`/projects/${m.project_id}`} className="info-row info-milestone">
                    <span className="diamond" aria-hidden="true" /> {projectById.get(m.project_id)?.name}: {m.name}
                  </Link>
                ))}
                {d.events.map((e) => (
                  <EventRow key={e.id} event={e} day={d.date} />
                ))}
                {d.items.map((i) => (
                  <ItemRow key={i.id} item={i} hideDate />
                ))}
                {d.payments.map((p) => (
                  <PaymentRow key={p.id} p={p} showDate={false} />
                ))}
              </Section>
            </div>
          ))}
          {later.length ? (
            <Section title="Later" count={later.length} collapsible defaultOpen={false}>
              {later.map((i) => (
                <ItemRow key={i.id} item={i} />
              ))}
            </Section>
          ) : null}
        </div>
      </main>
    </Screen>
  );
}
