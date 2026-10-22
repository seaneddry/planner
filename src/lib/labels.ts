import type { ItemKind, Repeat, Space } from '../types.ts';
import { addDays, klParts, klTimestamp } from './dates.ts';

export interface KindMeta {
  label: string;
  plural: string;
  icon: string;
  space: Space | null; // null = either
  repeat?: Repeat;
}

export const KINDS: Record<ItemKind, KindMeta> = {
  task: { label: 'Task', plural: 'Tasks', icon: 'circle-check', space: null },
  follow_up: { label: 'Follow-up', plural: 'Waiting on', icon: 'hourglass', space: null },
  reminder: { label: 'Reminder', plural: 'Reminders', icon: 'bell', space: null },
  errand: { label: 'Errand', plural: 'Errands', icon: 'pin', space: 'personal' },
  shopping: { label: 'To buy', plural: 'Shopping list', icon: 'bag', space: 'personal' },
  appointment: { label: 'Appointment', plural: 'Appointments', icon: 'clock', space: 'personal' },
  renewal: { label: 'Renewal', plural: 'Renewals & expiries', icon: 'doc', space: 'personal', repeat: 'yearly' },
  maintenance: { label: 'Maintenance', plural: 'Car & home', icon: 'wrench', space: 'personal' },
  occasion: { label: 'Occasion', plural: 'Birthdays & occasions', icon: 'gift', space: 'personal', repeat: 'yearly' },
};

export const KIND_ORDER: ItemKind[] = [
  'task',
  'follow_up',
  'reminder',
  'errand',
  'shopping',
  'appointment',
  'renewal',
  'maintenance',
  'occasion',
];

export const PRIORITY_LABEL = ['None', 'Low', 'Medium', 'High'] as const;

export const REPEAT_LABEL: Record<Repeat, string> = {
  daily: 'Every day',
  weekdays: 'Every weekday',
  weekly: 'Every week',
  monthly: 'Every month',
  yearly: 'Every year',
};

export function repeatText(repeat: Repeat | null, every: number): string {
  if (!repeat) return 'Never';
  if (every <= 1 || repeat === 'weekdays') return REPEAT_LABEL[repeat];
  const unit = { daily: 'days', weekly: 'weeks', monthly: 'months', yearly: 'years' }[repeat];
  return `Every ${every} ${unit}`;
}

export const EFFORT_OPTIONS = [5, 15, 30, 60, 120, 240];

export function effortLabel(min: number | null | undefined): string {
  if (!min) return '';
  if (min < 60) return `${min} min`;
  const h = min / 60;
  return `${Number.isInteger(h) ? h : h.toFixed(1)} h`;
}

// ------------------------------------------------------------------- reminders

export type RemindOption = 'none' | 'at_time' | '15m' | '1h' | 'morning' | '1d' | '3d' | '1w' | '2w' | '30d' | 'custom';

export const REMIND_LABEL: Record<RemindOption, string> = {
  none: 'None',
  at_time: 'At the time due',
  '15m': '15 minutes before',
  '1h': '1 hour before',
  morning: 'Morning of the day',
  '1d': '1 day before',
  '3d': '3 days before',
  '1w': '1 week before',
  '2w': '2 weeks before',
  '30d': '30 days before',
  custom: 'Pick a time',
};

/** Options that make sense for an item with or without a time. */
export function remindOptions(hasTime: boolean): RemindOption[] {
  return hasTime
    ? ['none', 'at_time', '15m', '1h', 'morning', '1d', '3d', '1w', '2w', '30d', 'custom']
    : ['none', 'morning', '1d', '3d', '1w', '2w', '30d', 'custom'];
}

export function computeRemind(
  option: RemindOption,
  dueOn: string | null,
  dueTime: string | null,
  morningTime: string,
): string | null {
  if (option === 'none' || option === 'custom' || !dueOn) return null;
  const morning = morningTime.slice(0, 5);
  if (dueTime) {
    const at = new Date(klTimestamp(dueOn, dueTime));
    if (option === 'at_time') return at.toISOString();
    if (option === '15m') return new Date(at.getTime() - 15 * 60000).toISOString();
    if (option === '1h') return new Date(at.getTime() - 3600000).toISOString();
  }
  const days: Partial<Record<RemindOption, number>> = { morning: 0, '1d': 1, '3d': 3, '1w': 7, '2w': 14, '30d': 30 };
  const d = days[option];
  if (d === undefined) return null;
  return klTimestamp(addDays(dueOn, -d), morning);
}

/** Which option an existing reminder corresponds to, so the editor can show it. */
export function detectRemind(
  remindAt: string | null,
  dueOn: string | null,
  dueTime: string | null,
  morningTime: string,
): RemindOption {
  if (!remindAt) return 'none';
  for (const opt of remindOptions(Boolean(dueTime))) {
    if (opt === 'none' || opt === 'custom') continue;
    const v = computeRemind(opt, dueOn, dueTime, morningTime);
    if (v && new Date(v).getTime() === new Date(remindAt).getTime()) return opt;
  }
  return 'custom';
}

/** Reminder chosen automatically when something is created with a date. */
export function defaultRemindOption(kind: ItemKind, hasTime: boolean): RemindOption {
  switch (kind) {
    case 'reminder':
      return hasTime ? 'at_time' : 'morning';
    case 'follow_up':
      return 'morning';
    case 'appointment':
      return hasTime ? '1h' : 'morning';
    case 'renewal':
      return '2w';
    case 'occasion':
      return '3d';
    case 'maintenance':
      return 'morning';
    case 'task':
      return hasTime ? '15m' : 'none';
    default:
      return 'none';
  }
}

export function remindLabel(remindAt: string): string {
  const { date, time } = klParts(remindAt);
  return `${date} ${time}`;
}
