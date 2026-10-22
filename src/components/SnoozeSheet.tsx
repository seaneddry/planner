import { useState } from 'react';
import { useToast } from './Toast';
import { updateItem } from '../api';
import { errorMessage, useBump } from '../lib/useQuery';
import { addDays, daysBetween, isoWeekday, relativeDay, shortDate, todayKL } from '../lib/dates';
import type { Item } from '../types';

function nextWeekday(today: string, target: number): string {
  const diff = (target - isoWeekday(today) + 7) % 7 || 7;
  return addDays(today, diff);
}

/** Moves an item to a later date. Its reminder moves by the same number of days. */
export async function snoozeTo(item: Item, date: string): Promise<void> {
  const shift = item.due_on ? daysBetween(item.due_on, date) : 0;
  let remindAt = item.remind_at;
  if (remindAt && shift) remindAt = new Date(new Date(remindAt).getTime() + shift * 86400000).toISOString();
  if (remindAt && new Date(remindAt).getTime() < Date.now()) remindAt = null;
  await updateItem(item.id, { due_on: date, remind_at: remindAt });
}

export function SnoozeSheet({ item, onClose }: { item: Item; onClose: () => void }) {
  const bump = useBump();
  const toast = useToast();
  const [picking, setPicking] = useState(false);
  const [date, setDate] = useState(addDays(todayKL(), 1));
  const today = todayKL();

  const options = [
    { label: 'Tomorrow', date: addDays(today, 1) },
    { label: 'In 2 days', date: addDays(today, 2) },
    { label: isoWeekday(today) >= 6 ? 'Next weekend' : 'This weekend', date: nextWeekday(today, 6) },
    { label: 'Next week', date: nextWeekday(today, 1) },
    { label: 'In 2 weeks', date: addDays(today, 14) },
  ];

  async function apply(d: string) {
    try {
      await snoozeTo(item, d);
      bump();
      toast(`Moved to ${relativeDay(d)}`);
      onClose();
    } catch (e) {
      toast(errorMessage(e));
    }
  }

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="action-sheet" role="dialog" aria-modal="true" aria-label="Snooze" onClick={(e) => e.stopPropagation()}>
        <div className="action-group">
          <div className="action-title">Move “{item.title}” to</div>
          {picking ? (
            <div className="action-picker">
              <input type="date" className="input" value={date} min={today} onChange={(e) => setDate(e.target.value)} aria-label="New date" />
              <button className="button button-primary" onClick={() => void apply(date)} disabled={!date}>
                Move
              </button>
            </div>
          ) : (
            <>
              {options.map((o) => (
                <button key={o.label} className="action action-split" onClick={() => void apply(o.date)}>
                  <span>{o.label}</span>
                  <span className="muted">{shortDate(o.date)}</span>
                </button>
              ))}
              <button className="action" onClick={() => setPicking(true)}>
                Pick a date…
              </button>
            </>
          )}
        </div>
        <button className="action action-cancel" onClick={onClose}>
          Cancel
        </button>
      </div>
    </div>
  );
}
