import { createItem, newId, savePerson, saveProject } from '../api';
import { addDays, klTimestamp, todayKL } from './dates';
import { computeRemind, defaultRemindOption, KINDS } from './labels';
import type { Parsed } from './parse';
import type { ItemInput, Settings } from '../types';

function titleCase(s: string): string {
  return s
    .split(/[-_.]/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/** Turns a parsed quick-capture line into an item input, filling in sensible defaults. */
export function toItemInput(p: Parsed, settings: Settings | undefined, extra: Partial<ItemInput> = {}): ItemInput & { title: string } {
  const today = todayKL();
  const morning = settings?.default_remind_time ?? '09:00';
  let dueOn = p.dueOn;

  // Follow-ups get a nudge date in 3 working-ish days; reminders without a date are for today.
  if (!dueOn && p.kind === 'follow_up') dueOn = addDays(today, 3);
  if (!dueOn && p.kind === 'reminder') dueOn = today;

  let remindAt: string | null = null;
  if (p.remind === 'custom' && p.remindTime) remindAt = klTimestamp(dueOn ?? today, p.remindTime);
  else if (p.remind) remindAt = computeRemind(p.remind, dueOn, p.dueTime, morning);
  else if (dueOn) remindAt = computeRemind(defaultRemindOption(p.kind, Boolean(p.dueTime)), dueOn, p.dueTime, morning);

  // A reminder already in the past is pointless; drop it.
  if (remindAt && new Date(remindAt).getTime() < Date.now() - 60000) remindAt = null;

  return {
    id: newId(),
    title: p.title,
    kind: p.kind,
    space: p.space,
    project_id: p.projectId,
    person_id: p.personId,
    due_on: dueOn,
    due_time: p.dueTime,
    remind_at: remindAt,
    priority: p.priority,
    effort_min: p.effortMin,
    place: p.place,
    repeat: p.repeat ?? KINDS[p.kind].repeat ?? null,
    repeat_every: p.repeatEvery,
    asked_on: p.kind === 'follow_up' ? today : null,
    ...extra,
  };
}

/** Saves a parsed line: creates any new project or person it mentions, then the item. */
export async function saveCapture(p: Parsed, settings: Settings | undefined, extra: Partial<ItemInput> = {}): Promise<string> {
  let projectId = p.projectId;
  let personId = p.personId;
  if (!projectId && p.newProjectTag) {
    projectId = await saveProject({ name: titleCase(p.newProjectTag), tag: p.newProjectTag, space: p.space });
  }
  if (!personId && p.newPersonHandle) {
    personId = await savePerson({ name: titleCase(p.newPersonHandle), handle: p.newPersonHandle });
  }
  const input = toItemInput({ ...p, projectId, personId }, settings, extra);
  return createItem(input);
}
