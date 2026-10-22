import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Screen } from '../components/Screen';
import { ItemRow } from '../components/ItemRow';
import { EmptyLine, PaymentRow, Section, SpaceSwitch } from '../components/Bits';
import { Icon } from '../components/Icon';
import { EventRow } from '../components/EventRow';
import { eventsByDay, eventTimeText, useEvents } from '../lib/events';
import { listHolidays, listLeave, listMilestones, listPayments } from '../api';
import { inSpace, sortItems, useOpenItems } from '../lib/items';
import { useRefs, useWide } from '../lib/refs';
import { useQuery } from '../lib/useQuery';
import { addDays, addMonths, dateRange, isWeekend, monthLabel, monthStart, relativeDay, shortDate, startOfWeek, todayKL } from '../lib/dates';

const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

type Sources = { tasks: boolean; events: boolean };
const SOURCES_KEY = 'calendar-sources';

function loadSources(): Sources {
  try {
    const v = JSON.parse(localStorage.getItem(SOURCES_KEY) ?? 'null');
    if (v && typeof v.tasks === 'boolean' && typeof v.events === 'boolean' && (v.tasks || v.events)) return v;
  } catch {
    /* storage unavailable */
  }
  return { tasks: true, events: true };
}

/** Which sources the calendar shows: your planner tasks and/or linked Google Calendar events. */
function SourceSwitch({ value, onChange }: { value: Sources; onChange: (v: Sources) => void }) {
  const toggle = (k: keyof Sources) => {
    const next = { ...value, [k]: !value[k] };
    if (!next.tasks && !next.events) return; // keep at least one on
    onChange(next);
  };
  const opts: { k: keyof Sources; label: string }[] = [
    { k: 'tasks', label: 'Tasks' },
    { k: 'events', label: 'Calendar' },
  ];
  return (
    <div className="chips cal-sources" role="group" aria-label="Show on calendar">
      {opts.map((o) => (
        <button key={o.k} className={`chip chip-small ${value[o.k] ? 'chip-on' : ''}`} aria-pressed={value[o.k]} onClick={() => toggle(o.k)}>
          {value[o.k] ? <Icon name="check" size={14} strokeWidth={2.6} /> : null}
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Calendar() {
  const today = todayKL();
  const wide = useWide();
  const [month, setMonth] = useState(monthStart(today));
  const [selected, setSelected] = useState(today);
  const { space, settings, projectById } = useRefs();
  const [sources, setSourcesState] = useState<Sources>(loadSources);
  const setSources = (v: Sources) => {
    setSourcesState(v);
    try {
      localStorage.setItem(SOURCES_KEY, JSON.stringify(v));
    } catch {
      /* storage unavailable */
    }
  };
  const scopes = settings?.holiday_scopes ?? ['national', 'selangor'];

  const gridStart = startOfWeek(month);
  const monthEnd = addDays(addMonths(month, 1), -1);
  const gridEnd = addDays(startOfWeek(monthEnd), 6);
  const days = dateRange(gridStart, gridEnd);

  const items = useOpenItems();
  const payments = useQuery(() => listPayments(400), [], 'payments-400');
  const milestones = useQuery(() => listMilestones(), [], 'milestones');
  const leave = useQuery(() => listLeave(gridStart, gridEnd), [gridStart, gridEnd]);
  const holidays = useQuery(() => listHolidays(gridStart, gridEnd, scopes), [gridStart, gridEnd, scopes.join()]);
  const events = useEvents(gridStart, gridEnd, `events-${gridStart}`);
  const evByDay = useMemo(
    () => (sources.events ? eventsByDay(events.data, gridStart, gridEnd, space) : new Map<string, NonNullable<typeof events.data>>()),
    [events.data, gridStart, gridEnd, space, sources.events],
  );

  const showWork = space !== 'personal';
  const showPersonal = space !== 'work';

  const byDay = useMemo(() => {
    const m = new Map<string, { items: typeof items.data; pay: NonNullable<typeof payments.data>; ms: NonNullable<typeof milestones.data>; leave: NonNullable<typeof leave.data>; hol: NonNullable<typeof holidays.data> }>();
    const get = (d: string) => {
      if (!m.has(d)) m.set(d, { items: [], pay: [], ms: [], leave: [], hol: [] });
      return m.get(d)!;
    };
    if (sources.tasks) for (const i of items.data ?? []) if (i.due_on && i.due_on >= gridStart && i.due_on <= gridEnd && inSpace(i, space)) get(i.due_on).items!.push(i);
    if (showPersonal && sources.tasks) for (const p of payments.data ?? []) if (!p.paid && p.next_due >= gridStart && p.next_due <= gridEnd) get(p.next_due).pay.push(p);
    if (showWork) {
      for (const x of milestones.data ?? []) if (x.due_on && x.due_on >= gridStart && x.due_on <= gridEnd) get(x.due_on).ms.push(x);
      for (const l of leave.data ?? []) for (const d of dateRange(l.starts_on, l.ends_on)) if (d >= gridStart && d <= gridEnd && !isWeekend(d)) get(d).leave.push(l);
    }
    for (const h of holidays.data ?? []) get(h.holiday_on).hol.push(h);
    for (const v of m.values()) v.items!.sort(sortItems);
    return m;
  }, [items.data, payments.data, milestones.data, leave.data, holidays.data, space, gridStart, gridEnd, showWork, showPersonal, sources.tasks]);

  const sel = byDay.get(selected);

  return (
    <Screen
      title="Calendar"
      right={
        <Link to={`/item/new?date=${selected}`} className="nav-icon-button" aria-label={`Add on ${shortDate(selected)}`}>
          <Icon name="plus" size={22} />
        </Link>
      }
    >
      <main className="page">
        <div className="toolbar toolbar-split">
          <div className="month-switch">
            <button className="nav-icon-button" onClick={() => setMonth(addMonths(month, -1))} aria-label="Previous month">
              <Icon name="chevron-left" size={20} />
            </button>
            <h2 className="month-title">{monthLabel(month)}</h2>
            <button className="nav-icon-button" onClick={() => setMonth(addMonths(month, 1))} aria-label="Next month">
              <Icon name="chevron-right" size={20} />
            </button>
            {month !== monthStart(today) ? (
              <button
                className="mini-button"
                onClick={() => {
                  setMonth(monthStart(today));
                  setSelected(today);
                }}
              >
                Today
              </button>
            ) : null}
          </div>
          <SpaceSwitch />
        </div>
        <SourceSwitch value={sources} onChange={setSources} />
        {events.data && events.data.length === 0 && !events.offline ? (
          <p className="footnote calendars-hint">
            <Link to="/settings/calendars">Link your Google Calendars</Link> to see meetings and events here.
          </p>
        ) : null}

        <div className={`cal-layout ${wide ? 'is-wide' : ''}`}>
          <div className="calendar" role="grid" aria-label={monthLabel(month)}>
            <div className="cal-head" role="row">
              {DOW.map((d) => (
                <div key={d} role="columnheader" className="cal-dow">
                  {wide ? d : d.charAt(0)}
                </div>
              ))}
            </div>
            <div className="cal-body">
              {days.map((d) => {
                const info = byDay.get(d);
                const ev = evByDay.get(d) ?? [];
                const n = (info?.items?.length ?? 0) + (info?.pay.length ?? 0) + ev.length;
                const out = d.slice(0, 7) !== month.slice(0, 7);
                return (
                  <button
                    key={d}
                    role="gridcell"
                    className={`cal-cell ${out ? 'is-out' : ''} ${d === today ? 'is-today' : ''} ${d === selected ? 'is-selected' : ''} ${isWeekend(d) ? 'is-weekend' : ''} ${info?.hol.length ? 'is-holiday' : ''}`}
                    onClick={() => setSelected(d)}
                    aria-label={`${shortDate(d)}${n ? `, ${n} items` : ''}${info?.hol.length ? `, ${info.hol[0].name}` : ''}${info?.leave.length ? `, ${info.leave.length} on leave` : ''}`}
                  >
                    <span className="cal-num">{Number(d.slice(8))}</span>
                    {wide ? (
                      <span className="cal-lines">
                        {info?.hol.map((h) => (
                          <span key={h.id} className="cal-line cal-line-holiday">
                            {h.name}
                          </span>
                        ))}
                        {info?.leave.length ? <span className="cal-line cal-line-leave">{info.leave.length} on leave</span> : null}
                        {info?.ms.map((x) => (
                          <span key={x.id} className="cal-line cal-line-ms">
                            ◆ {x.name}
                          </span>
                        ))}
                        {ev.slice(0, 3).map((e) => (
                          <span key={e.id} className={`cal-line cal-line-event ${e.calendar?.space === 'personal' ? 'is-personal' : ''}`}>
                            {e.all_day ? '' : `${eventTimeText(e, d).split('–')[0]} `}
                            {e.title}
                          </span>
                        ))}
                        {info?.items?.slice(0, Math.max(0, 3 - ev.length)).map((i) => (
                          <span key={i.id} className={`cal-line ${i.space === 'personal' ? 'is-personal' : ''}`}>
                            {i.title}
                          </span>
                        ))}
                        {n > 3 ? <span className="cal-more">+{n - 3} more</span> : null}
                      </span>
                    ) : (
                      <span className="cal-marks" aria-hidden="true">
                        {ev.length ? <span className="dot dot-event" /> : null}
                        {n - ev.length ? <span className="dot" /> : null}
                        {info?.leave.length ? <span className="dot dot-leave" /> : null}
                        {info?.ms.length ? <span className="dot dot-ms" /> : null}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="cal-detail">
            <Section title={`${relativeDay(selected, today)}${relativeDay(selected, today) !== shortDate(selected) ? ' · ' + shortDate(selected) : ''}`}>
              {sel?.hol.map((h) => (
                <div key={h.id} className="info-row info-holiday">
                  <Icon name="flag" size={16} /> {h.name}
                </div>
              ))}
              {sel?.leave.length ? (
                <div className="info-row info-leave">
                  <Icon name="users" size={16} /> Out: {[...new Set(sel.leave.map((l) => `${l.person?.name ?? 'Someone'}${l.part !== 'full' ? ` (${l.part.toUpperCase()})` : ''}`))].join(', ')}
                </div>
              ) : null}
              {sel?.ms.map((x) => (
                <Link key={x.id} to={`/projects/${x.project_id}`} className="info-row info-milestone">
                  <span className="diamond" aria-hidden="true" /> {projectById.get(x.project_id)?.name}: {x.name}
                </Link>
              ))}
              {(evByDay.get(selected) ?? []).map((e) => (
                <EventRow key={e.id} event={e} day={selected} />
              ))}
              {sel?.items?.map((i) => (
                <ItemRow key={i.id} item={i} hideDate />
              ))}
              {sel?.pay.map((p) => (
                <PaymentRow key={p.id} p={p} showDate={false} />
              ))}
              {!sel && !evByDay.get(selected)?.length ? <EmptyLine>Nothing on this day.</EmptyLine> : null}
            </Section>
          </div>
        </div>
      </main>
    </Screen>
  );
}
