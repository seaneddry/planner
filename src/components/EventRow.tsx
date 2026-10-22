import { eventIsPast, eventTimes } from '../lib/events';
import type { CalEvent } from '../types';

/** One event from a linked calendar. Read-only: change it in Google Calendar. */
export function EventRow({ event, day, showCalendar = true }: { event: CalEvent; day: string; showCalendar?: boolean }) {
  const t = eventTimes(event, day);
  const past = eventIsPast(event);
  const meta = [showCalendar ? event.calendar?.name : null, event.location].filter(Boolean).join(' · ');
  return (
    <div className={`event-row ${past ? 'is-past' : ''} ${event.calendar?.space === 'personal' ? 'is-personal' : ''}`}>
      <span className="event-time">
        <span className="event-start">{t.start}</span>
        {t.end ? <span className="event-end">{t.end}</span> : null}
      </span>
      <span className="event-bar" aria-hidden="true" />
      <span className="item-main">
        <span className="item-title">{event.title}</span>
        {meta ? <span className="item-meta">{meta}</span> : null}
      </span>
    </div>
  );
}
