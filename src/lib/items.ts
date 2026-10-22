import { listOpenItems } from '../api';
import { OPEN_ITEMS_KEY } from './outbox';
import { useQuery } from './useQuery';
import { daysBetween, todayKL } from './dates';
import type { Item, SpaceFilter } from '../types';

export function useOpenItems() {
  return useQuery(listOpenItems, [], OPEN_ITEMS_KEY);
}

export function inSpace(item: { space: string }, space: SpaceFilter): boolean {
  return space === 'all' || item.space === space;
}

/** Days since a follow-up was asked (or created). */
export function waitingDays(item: Item, today = todayKL()): number {
  return daysBetween(item.asked_on ?? item.created_at.slice(0, 10), today);
}

export function sortItems(a: Item, b: Item): number {
  const da = a.due_on ?? '9999-12-31';
  const db = b.due_on ?? '9999-12-31';
  if (da !== db) return da < db ? -1 : 1;
  const ta = a.due_time ?? '99:99';
  const tb = b.due_time ?? '99:99';
  if (ta !== tb) return ta < tb ? -1 : 1;
  if (a.priority !== b.priority) return b.priority - a.priority;
  return a.created_at < b.created_at ? -1 : 1;
}

export interface TodayBuckets {
  overdue: Item[];
  today: Item[];
  waiting: Item[];
  anytime: Item[];
}

/**
 * Splits open items for the Today screen. Follow-ups always sit in "Waiting on" (with their
 * nudge date shown); shopping and errands without a date live on their own lists.
 */
export function bucketToday(items: Item[], space: SpaceFilter, today = todayKL()): TodayBuckets {
  const b: TodayBuckets = { overdue: [], today: [], waiting: [], anytime: [] };
  for (const i of items) {
    if (!inSpace(i, space)) continue;
    if (i.kind === 'follow_up') {
      b.waiting.push(i);
      continue;
    }
    if (i.due_on && i.due_on < today) b.overdue.push(i);
    else if (i.due_on === today) b.today.push(i);
    else if (!i.due_on && (i.kind === 'task' || i.kind === 'reminder')) b.anytime.push(i);
  }
  b.overdue.sort(sortItems);
  b.today.sort(sortItems);
  b.waiting.sort((x, y) => waitingDays(y, today) - waitingDays(x, today));
  b.anytime.sort((x, y) => y.priority - x.priority || (x.created_at < y.created_at ? 1 : -1));
  return b;
}

export function countBadges(items: Item[] | undefined, today = todayKL()) {
  let due = 0;
  let waiting = 0;
  for (const i of items ?? []) {
    if (i.kind === 'follow_up') waiting++;
    else if (i.due_on && i.due_on <= today) due++;
  }
  return { due, waiting };
}
