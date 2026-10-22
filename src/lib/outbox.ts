import { supabase } from '../supabase';
import { errorMessage, isNetworkError, readCache, writeCache } from './useQuery';
import type { Item } from '../types';

/**
 * Offline writes. A change that cannot reach the server because the device is offline is
 * saved here (in localStorage) and sent, in order, as soon as the connection is back.
 * New rows get their id in the browser, so sending the same change twice is harmless.
 */
export type Op =
  | { type: 'insert'; table: string; row: Record<string, unknown> }
  | { type: 'update'; table: string; id: string; patch: Record<string, unknown> }
  | { type: 'delete'; table: string; id: string }
  | { type: 'rpc'; fn: string; args: Record<string, unknown> };

const KEY = 'planner:outbox';
const listeners = new Set<(n: number) => void>();

function load(): Op[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '[]') as Op[];
  } catch {
    return [];
  }
}

function save(ops: Op[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(ops));
  } catch {
    /* ignore */
  }
  for (const l of listeners) l(ops.length);
}

export function pendingCount(): number {
  return load().length;
}

export function onPendingChange(fn: (n: number) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

async function run(op: Op): Promise<void> {
  if (op.type === 'insert') {
    const { error } = await supabase.from(op.table).upsert(op.row, { onConflict: 'id', ignoreDuplicates: false });
    if (error) throw error;
  } else if (op.type === 'update') {
    const { error } = await supabase.from(op.table).update(op.patch).eq('id', op.id);
    if (error) throw error;
  } else if (op.type === 'delete') {
    const { error } = await supabase.from(op.table).delete().eq('id', op.id);
    if (error) throw error;
  } else {
    const { error } = await supabase.rpc(op.fn, op.args);
    if (error) throw error;
  }
}

/** Runs a change now, or queues it when offline. Returns true if it went straight through. */
export async function write(op: Op): Promise<boolean> {
  if (load().length === 0 && navigator.onLine !== false) {
    try {
      await run(op);
      return true;
    } catch (e) {
      if (!isNetworkError(e)) throw new Error(errorMessage(e));
    }
  }
  save([...load(), op]);
  applyToCache(op);
  return false;
}

let flushing = false;

/** Sends queued changes. Stops at the first network failure and tries again later. */
export async function flush(): Promise<number> {
  if (flushing) return 0;
  flushing = true;
  let sent = 0;
  try {
    let ops = load();
    while (ops.length) {
      try {
        await run(ops[0]);
        sent++;
      } catch (e) {
        if (isNetworkError(e)) break;
        // The server refused it (for example the row was deleted elsewhere). Drop it so the
        // queue does not get stuck, and log why.
        console.warn('Dropped offline change', ops[0], errorMessage(e));
      }
      ops = ops.slice(1);
      save(ops);
    }
  } finally {
    flushing = false;
  }
  return sent;
}

// ------------------------------------------------------------- optimistic cache

export const OPEN_ITEMS_KEY = 'items-open';

/** Keeps the saved list of open items in step with queued changes, so the offline view is right. */
function applyToCache(op: Op) {
  if (!('table' in op) && op.type === 'rpc' && op.fn === 'planner_complete') {
    const id = String(op.args.p_id);
    patchOpenItems((items) => items.filter((i) => i.id !== id));
    return;
  }
  if (!('table' in op) || op.table !== 'planner_items') return;
  if (op.type === 'insert') {
    const row = op.row as unknown as Item;
    patchOpenItems((items) => [...items.filter((i) => i.id !== row.id), { subtasks: [], ...row, links: row.links ?? [] } as Item]);
  } else if (op.type === 'update') {
    patchOpenItems((items) =>
      items
        .map((i) => (i.id === op.id ? ({ ...i, ...op.patch } as Item) : i))
        .filter((i) => i.status === 'open'),
    );
  } else if (op.type === 'delete') {
    patchOpenItems((items) => items.filter((i) => i.id !== op.id));
  }
}

export function patchOpenItems(fn: (items: Item[]) => Item[]) {
  const items = readCache<Item[]>(OPEN_ITEMS_KEY);
  if (items) writeCache(OPEN_ITEMS_KEY, fn(items));
}

export function startOutbox(onSent: () => void) {
  const go = () => {
    if (navigator.onLine === false || pendingCount() === 0) return;
    void flush().then((n) => {
      if (n > 0) onSent();
    });
  };
  window.addEventListener('online', go);
  document.addEventListener('visibilitychange', go);
  const timer = window.setInterval(go, 30000);
  go();
  return () => {
    window.removeEventListener('online', go);
    document.removeEventListener('visibilitychange', go);
    window.clearInterval(timer);
  };
}
