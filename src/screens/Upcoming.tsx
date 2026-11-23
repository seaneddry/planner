import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Screen } from '../components/Screen';
import { ItemRow } from '../components/ItemRow';
import { OfflineBanner, PaymentRow, Section, SpaceSwitch } from '../components/Bits';
import { Icon } from '../components/Icon';
import { EventRow } from '../components/EventRow';
import { eventsByDay, useEvents } from '../lib/events';
import { listHolidays, listLeave, listMilestones, listPayments } from '../api';
import { inSpace, sortItems, useOpenItems } from '../lib/items';
import { useRefs, useWide } from '../lib/refs';
import { useQuery } from '../lib/useQuery';
import { addDays, dateRange, isWeekend, relativeDay, shortDate, todayKL, weekdayShort } from '../lib/dates';
import { KIND_ORDER, KINDS } from '../lib/labels';
import type { CalEvent, Holiday, Item, ItemKind, Leave, Milestone, Payment } from '../types';

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

/** What the list can be narrowed to: one item kind, or one of the other sources. */
type Filter = 'all' | 'events' | 'leave' | 'payments' | 'milestones' | 'holidays' | ItemKind;

const SOURCE_LABEL: Record<Exclude<Filter, 'all' | ItemKind>, string> = {
  events: 'Calendar',
  leave: 'Leave',
  payments: 'Payments',
  milestones: 'Milestones',
  holidays: 'Holidays',
};

/** Chip order: tasks and calendar first, then the other sources, then the remaining item kinds. */
const FILTER_ORDER: Exclude<Filter, 'all'>[] = [
  'task',
  'events',
  'follow_up',
  'leave',
  'payments',
  'milestones',
  'holidays',
  ...KIND_ORDER.filter((k) => k !== 'task' && k !== 'follow_up'),
];

function filterLabel(f: Exclude<Filter, 'all'>): string {
  if (f in SOURCE_LABEL) return SOURCE_LABEL[f as keyof typeof SOURCE_LABEL];
  return f === 'follow_up' ? 'Follow-ups' : KINDS[f as ItemKind].plural;
}

const FILTER_KEY = 'planner.upcoming.filter';

function readFilter(): Filter {
  try {
    const v = localStorage.getItem(FILTER_KEY);
    if (v === 'all' || (v && (FILTER_ORDER as string[]).includes(v))) return v as Filter;
  } catch {
    /* storage unavailable */
  }
  return 'all';
}

/** Keeps only what the filter shows. */
function narrow(d: Day, f: Filter): Day {
  if (f === 'all') return d;
  const empty: Day = { date: d.date, items: [], payments: [], milestones: [], leave: [], holidays: [], events: [] };
  if (f === 'events') return { ...empty, events: d.events };
  if (f === 'leave') return { ...empty, leave: d.leave };
  if (f === 'payments') return { ...empty, payments: d.payments };
  if (f === 'milestones') return { ...empty, milestones: d.milestones };
  if (f === 'holidays') return { ...empty, holidays: d.holidays };
  return { ...empty, items: d.items.filter((i) => i.kind === f) };
}

const total = (d: Day) => d.items.length + d.payments.length + d.milestones.length + d.leave.length + d.holidays.length + d.events.length;

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

  const [filter, setFilterState] = useState<Filter>(readFilter);
  function setFilter(f: Filter) {
    setFilterState(f);
    try {
      localStorage.setItem(FILTER_KEY, f);
    } catch {
      /* storage unavailable */
    }
  }

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

  // How many of each type are coming up, for the chips (leave shows no number: it counts person-days).
  const counts = useMemo(() => {
    const c = new Map<Exclude<Filter, 'all'>, number>();
    const add = (k: Exclude<Filter, 'all'>, n: number) => n && c.set(k, (c.get(k) ?? 0) + n);
    for (const d of days) {
      for (const i of d.items) add(i.kind, 1);
      add('events', d.events.length);
      add('leave', d.leave.length);
      add('payments', d.payments.length);
      add('milestones', d.milestones.length);
      add('holidays', d.holidays.length);
    }
    for (const i of later) add(i.kind, 1);
    return c;
  }, [days, later]);
  const chips = FILTER_ORDER.filter((f) => counts.has(f) || f === filter);

  const shown = days.map((d) => narrow(d, filter));
  const shownLater = filter === 'all' ? later : later.filter((i) => i.kind === filter);
  const strip = shown.slice(0, 14);
  const busy = shown.filter((d) => total(d) > 0);
  const emptyText = filter === 'all' ? 'Nothing planned for the next 30 days.' : `No ${filterLabel(filter).toLowerCase()} in the next 30 days.`;

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
        <div className="chips type-filter" role="radiogroup" aria-label="Show">
          <button role="radio" aria-checked={filter === 'all'} className={`chip chip-small ${filter === 'all' ? 'chip-on' : ''}`} onClick={() => setFilter('all')}>
            All
          </button>
          {chips.map((f) => (
            <button key={f} role="radio" aria-checked={filter === f} className={`chip chip-small ${filter === f ? 'chip-on' : ''}`} onClick={() => setFilter(f)}>
              {filterLabel(f)}
              {counts.get(f) && f !== 'leave' ? <span className="chip-count">{counts.get(f)}</span> : null}
            </button>
          ))}
        </div>
        <OfflineBanner show={items.offline} />

        <div className="week-strip" role="list" aria-label="Next two weeks">
          {strip.map((d) => {
            const count = d.items.length + d.payments.length + d.milestones.length + d.events.length + (filter === 'holidays' ? d.holidays.length : 0);
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
          {busy.length === 0 && shownLater.length === 0 ? <div className="empty-line">{emptyText}</div> : null}
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
          {shownLater.length ? (
            <Section title="Later" count={shownLater.length} collapsible defaultOpen={false}>
              {shownLater.map((i) => (
                <ItemRow key={i.id} item={i} />
              ))}
            </Section>
          ) : null}
        </div>
      </main>
    </Screen>
  );
}
