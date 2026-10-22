import { useState } from 'react';
import type { MouseEvent } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from './Icon';
import { useToast } from './Toast';
import { SnoozeSheet } from './SnoozeSheet';
import { completeItem, reopenItem } from '../api';
import { useRefs } from '../lib/refs';
import { errorMessage, useBump } from '../lib/useQuery';
import { patchOpenItems } from '../lib/outbox';
import { ageLabel, relativeDay, timeLabel, todayKL } from '../lib/dates';
import { effortLabel, KINDS } from '../lib/labels';
import { waitingDays } from '../lib/items';
import type { Item } from '../types';

interface ItemRowProps {
  item: Item;
  /** Hide the date (rows already grouped under a date heading). */
  hideDate?: boolean;
  hideProject?: boolean;
  showSnooze?: boolean;
}

export function ItemRow({ item, hideDate, hideProject, showSnooze }: ItemRowProps) {
  const { projectById, personById } = useRefs();
  const bump = useBump();
  const toast = useToast();
  const [done, setDone] = useState(item.status === 'done');
  const [snooze, setSnooze] = useState(false);
  const today = todayKL();

  const project = item.project ?? (item.project_id ? projectById.get(item.project_id) : undefined);
  const person = item.person ?? (item.person_id ? personById.get(item.person_id) : undefined);
  const overdue = item.status === 'open' && item.due_on !== null && item.due_on < today;
  const subtasks = item.subtasks ?? [];
  const subDone = subtasks.filter((s) => s.done).length;
  const isFollow = item.kind === 'follow_up';
  const waited = isFollow ? waitingDays(item, today) : 0;

  async function toggle(e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    try {
      if (done) {
        setDone(false);
        await reopenItem(item.id);
        bump();
        return;
      }
      setDone(true);
      await completeItem(item.id);
      // Remove from the saved list straight away so the offline view matches.
      patchOpenItems((items) => items.filter((i) => i.id !== item.id));
      window.setTimeout(bump, 450);
      toast(item.repeat ? 'Done. Next one scheduled' : 'Done', {
        label: 'Undo',
        run: () => {
          void reopenItem(item.id).then(bump);
        },
      });
    } catch (err) {
      setDone(item.status === 'done');
      toast(errorMessage(err));
    }
  }

  const meta: string[] = [];
  if (!hideProject && project) meta.push(project.name);
  if (person) meta.push(isFollow ? `Waiting on ${person.name}` : person.name);
  if (item.place) meta.push(item.place);
  if (!hideDate && item.due_on) {
    const rel = relativeDay(item.due_on, today);
    const label = isFollow ? `Nudge ${/^(Today|Tomorrow|Yesterday)$/.test(rel) ? rel.toLowerCase() : rel}` : rel;
    meta.push(`${label}${item.due_time ? ' ' + timeLabel(item.due_time) : ''}`);
  } else if (hideDate && item.due_time) {
    meta.push(timeLabel(item.due_time));
  }
  if (subtasks.length) meta.push(`${subDone}/${subtasks.length}`);
  if (item.effort_min) meta.push(effortLabel(item.effort_min));
  if (item.kind !== 'task' && item.kind !== 'follow_up') meta.unshift(KINDS[item.kind].label);

  return (
    <div className={`item-row ${done ? 'is-done' : ''} ${item.space === 'personal' ? 'is-personal' : ''}`}>
      <button
        className={`check ${overdue ? 'check-overdue' : ''} ${isFollow ? 'check-follow' : ''}`}
        onClick={toggle}
        aria-label={done ? `Mark "${item.title}" not done` : `Mark "${item.title}" done`}
        aria-pressed={done}
      >
        <span className="check-ring">{done ? <Icon name="check" size={14} strokeWidth={3} /> : null}</span>
      </button>
      <Link to={`/item/${item.id}`} className="item-main">
        <span className="item-title">{item.title}</span>
        {meta.length ? (
          <span className={`item-meta ${overdue && !hideDate ? 'is-overdue' : ''}`}>
            {item.repeat ? <Icon name="repeat" size={12} strokeWidth={2.2} /> : null}
            {item.remind_at && item.status === 'open' ? <Icon name="bell" size={12} strokeWidth={2.2} /> : null}
            {meta.join(' · ')}
          </span>
        ) : null}
      </Link>
      <div className="item-side">
        {item.priority === 3 ? <span className="prio prio-high">High</span> : item.priority === 2 ? <span className="prio">Med</span> : null}
        {isFollow ? <span className={`age ${waited >= 5 ? 'age-hot' : ''}`}>{ageLabel(waited)}</span> : null}
        {showSnooze && !done ? (
          <button className="mini-button" onClick={() => setSnooze(true)}>
            Snooze
          </button>
        ) : null}
      </div>
      {snooze ? <SnoozeSheet item={item} onClose={() => setSnooze(false)} /> : null}
    </div>
  );
}
