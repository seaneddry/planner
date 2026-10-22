// Quick capture: turns a typed line such as
//   "nudge @client on UAT feedback fri #porsche !high"
// into a structured item. Pure functions, no network, so it works offline and is unit-tested.
//
// Syntax
//   #tag         project (matched by tag, then by name)        e.g. #porsche
//   @handle      person (waiting on / about)                    e.g. @client
//   !high !med !low  (or !3 !2 !1, !!!)                         priority
//   ~30m ~1h ~1.5h                                              effort
//   +place       where an errand or purchase happens            e.g. +guardian
//   /work /w /personal /p                                       space
//   ^9am ^1d ^3d ^1w ^none                                      reminder
//   dates: today, tomorrow, tmr, mon…sun, next week, weekend, eow, eom,
//          in 3 days, in 2 weeks, 23/10, 23 oct, oct 23
//   times: 3pm, 3:30pm, 15:00, noon
//   repeat: daily, weekly, monthly, yearly, every weekday, every 2 weeks, every mon
//   leading words: "fu", "follow up", "nudge", "chase" (follow-up), "remind me to" (reminder),
//   "buy" (shopping), "errand:" (errand), "appt" (appointment), "renew" (renewal)

import type { ItemKind, Repeat, Space } from '../types.ts';
import { addDays, addMonths, isoWeekday } from './dates.ts';
import type { RemindOption } from './labels.ts';

export interface ProjectLite {
  id: string;
  name: string;
  tag: string | null;
  space: Space;
}

export interface PersonLite {
  id: string;
  name: string;
  handle: string | null;
}

export interface ParseContext {
  today: string;
  projects: ProjectLite[];
  people: PersonLite[];
  defaultSpace: Space;
  /** Pre-selected project (capturing from inside a project page or meeting note). */
  projectId?: string | null;
  kind?: ItemKind;
}

export type TokenType = 'project' | 'person' | 'priority' | 'effort' | 'place' | 'space' | 'remind' | 'date' | 'time' | 'repeat' | 'kind';

export interface Span {
  start: number;
  end: number;
  type: TokenType;
}

export interface Parsed {
  title: string;
  kind: ItemKind;
  space: Space;
  projectId: string | null;
  /** A #tag with no matching project. Saving creates the project. */
  newProjectTag: string | null;
  personId: string | null;
  /** An @handle with no matching person. Saving creates the person. */
  newPersonHandle: string | null;
  dueOn: string | null;
  dueTime: string | null;
  priority: number;
  effortMin: number | null;
  place: string | null;
  repeat: Repeat | null;
  repeatEvery: number;
  remind: RemindOption | null;
  /** Explicit reminder clock time from ^9am (on the due date, or today). */
  remindTime: string | null;
  spans: Span[];
}

const WEEKDAYS: Record<string, number> = {
  mon: 1, monday: 1,
  tue: 2, tues: 2, tuesday: 2,
  wed: 3, weds: 3, wednesday: 3,
  thu: 4, thur: 4, thurs: 4, thursday: 4,
  fri: 5, friday: 5,
  sat: 6, saturday: 6,
  sun: 7, sunday: 7,
};

const MONTHS: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4, may: 5,
  jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9, september: 9,
  oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
};

const WD = Object.keys(WEEKDAYS).sort((a, b) => b.length - a.length).join('|');
const MO = Object.keys(MONTHS).sort((a, b) => b.length - a.length).join('|');

// A token must stand on its own: start of text or whitespace before, end/space/punctuation after.
const B = '(?<=^|\\s)';
const E = '(?=$|\\s|[,.;!?])';

function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function nextWeekday(today: string, target: number, allowToday: boolean): string {
  const cur = isoWeekday(today);
  let diff = (target - cur + 7) % 7;
  if (diff === 0 && !allowToday) diff = 7;
  return addDays(today, diff);
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function validDate(y: number, m: number, d: number): string | null {
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const iso = `${y}-${pad(m)}-${pad(d)}`;
  const check = new Date(`${iso}T00:00:00Z`);
  return check.getUTCMonth() + 1 === m && check.getUTCDate() === d ? iso : null;
}

/** A day and month with no year: this year, or next year if that date has passed. */
function dayMonth(today: string, d: number, m: number, y?: number): string | null {
  if (y) return validDate(y < 100 ? 2000 + y : y, m, d);
  const thisYear = Number(today.slice(0, 4));
  const iso = validDate(thisYear, m, d);
  if (!iso) return null;
  return iso < today ? validDate(thisYear + 1, m, d) : iso;
}

function to24(h: number, min: number, ampm: string | undefined): string | null {
  let hour = h;
  if (ampm) {
    const pm = ampm.toLowerCase().startsWith('p');
    if (hour < 1 || hour > 12) return null;
    if (pm && hour !== 12) hour += 12;
    if (!pm && hour === 12) hour = 0;
  }
  if (hour > 23 || min > 59) return null;
  return `${pad(hour)}:${pad(min)}`;
}

interface Rule {
  type: TokenType;
  re: RegExp;
  apply: (m: RegExpExecArray, st: State, ctx: ParseContext) => boolean; // false = not a match
}

interface State {
  kind: ItemKind | null;
  space: Space | null;
  projectId: string | null;
  newProjectTag: string | null;
  personId: string | null;
  newPersonHandle: string | null;
  dueOn: string | null;
  dueTime: string | null;
  priority: number;
  effortMin: number | null;
  place: string | null;
  repeat: Repeat | null;
  repeatEvery: number;
  remind: RemindOption | null;
  remindTime: string | null;
  stripLeading: number; // characters of a leading kind phrase to drop from the title
}

const RULES: Rule[] = [
  // ------------------------------------------------------------------ leading kind words
  {
    type: 'kind',
    re: /^(?:fu|f\/u|follow[- ]?up(?: on| with)?|nudge|chase|ping)\s+/i,
    apply: (m, st) => {
      st.kind = 'follow_up';
      // "nudge"/"chase"/"ping" read naturally in a title; keep them. Drop "fu"/"follow up".
      if (!/^(nudge|chase|ping)/i.test(m[0])) st.stripLeading = m[0].length;
      return true;
    },
  },
  {
    type: 'kind',
    re: /^remind me (?:to |about )?/i,
    apply: (m, st) => {
      st.kind = 'reminder';
      st.stripLeading = m[0].length;
      return true;
    },
  },
  {
    type: 'kind',
    re: /^buy\s+/i,
    apply: (m, st) => {
      st.kind = 'shopping';
      st.stripLeading = m[0].length;
      return true;
    },
  },
  {
    type: 'kind',
    re: /^errand:?\s+/i,
    apply: (m, st) => {
      st.kind = 'errand';
      st.stripLeading = m[0].length;
      return true;
    },
  },
  {
    type: 'kind',
    re: /^(?:appt|appointment):?\s+/i,
    apply: (m, st) => {
      st.kind = 'appointment';
      st.stripLeading = m[0].length;
      return true;
    },
  },
  {
    type: 'kind',
    re: /^renew\s+/i,
    apply: (_m, st) => {
      st.kind = 'renewal';
      return true; // "Renew road tax" is a good title
    },
  },

  // ------------------------------------------------------------------ sigils
  {
    type: 'project',
    re: new RegExp(`${B}#([a-z0-9][a-z0-9_-]*)${E}`, 'gi'),
    apply: (m, st, ctx) => {
      const want = m[1].toLowerCase();
      const byTag = ctx.projects.find((p) => p.tag?.toLowerCase() === want);
      const byName = byTag ?? ctx.projects.find((p) => norm(p.name).startsWith(norm(want)));
      if (byName) {
        st.projectId = byName.id;
        st.newProjectTag = null;
        if (!st.space) st.space = byName.space;
      } else {
        st.projectId = null;
        st.newProjectTag = want;
      }
      return true;
    },
  },
  {
    type: 'person',
    re: new RegExp(`${B}@([a-z0-9][a-z0-9_.-]*[a-z0-9]|[a-z0-9])${E}`, 'gi'),
    apply: (m, st, ctx) => {
      const want = m[1].toLowerCase();
      const byHandle = ctx.people.find((p) => p.handle?.toLowerCase() === want);
      const byName =
        byHandle ??
        ctx.people.find((p) => norm(p.name) === norm(want)) ??
        ctx.people.find((p) => norm(p.name.split(/\s+/)[0]) === norm(want));
      if (byName) {
        st.personId = byName.id;
        st.newPersonHandle = null;
      } else {
        st.personId = null;
        st.newPersonHandle = want;
      }
      return true;
    },
  },
  {
    type: 'priority',
    re: new RegExp(`${B}(!!!|!!|!(?:high|hi|h|3|urgent|med|medium|m|2|low|lo|l|1))${E}`, 'gi'),
    apply: (m, st) => {
      const v = m[1].toLowerCase();
      st.priority = v === '!!!' || /^!(high|hi|h|3|urgent)$/.test(v) ? 3 : v === '!!' || /^!(med|medium|m|2)$/.test(v) ? 2 : 1;
      return true;
    },
  },
  {
    type: 'effort',
    re: new RegExp(`${B}~(\\d+(?:\\.\\d+)?)\\s?(m|min|mins|h|hr|hrs|hour|hours)?${E}`, 'gi'),
    apply: (m, st) => {
      const n = Number(m[1]);
      const unit = (m[2] ?? 'm').toLowerCase();
      const minutes = unit.startsWith('h') ? Math.round(n * 60) : Math.round(n);
      if (!minutes) return false;
      st.effortMin = minutes;
      return true;
    },
  },
  {
    type: 'place',
    re: new RegExp(`${B}\\+([\\p{L}0-9][\\p{L}0-9_'-]*)${E}`, 'giu'),
    apply: (m, st) => {
      const raw = m[1].replace(/_/g, ' ');
      st.place = raw.charAt(0).toUpperCase() + raw.slice(1);
      return true;
    },
  },
  {
    type: 'space',
    re: new RegExp(`${B}/(work|w|personal|p|home)${E}`, 'gi'),
    apply: (m, st) => {
      st.space = m[1].toLowerCase().startsWith('w') ? 'work' : 'personal';
      return true;
    },
  },
  {
    type: 'remind',
    re: new RegExp(`${B}\\^(none|no|0|1d|3d|1w|2w|30d|1h|15m|morning|am|(\\d{1,2})(?::(\\d{2}))?\\s?(am|pm)?)${E}`, 'gi'),
    apply: (m, st) => {
      const v = m[1].toLowerCase();
      const map: Record<string, RemindOption> = {
        none: 'none', no: 'none', '0': 'none', '1d': '1d', '3d': '3d', '1w': '1w', '2w': '2w', '30d': '30d',
        '1h': '1h', '15m': '15m', morning: 'morning', am: 'morning',
      };
      if (map[v]) {
        st.remind = map[v];
        return true;
      }
      if (m[2]) {
        const t = to24(Number(m[2]), Number(m[3] ?? 0), m[4]);
        if (!t || (!m[3] && !m[4])) return false; // "^9" alone is ambiguous
        st.remind = 'custom';
        st.remindTime = t;
        return true;
      }
      return false;
    },
  },

  // ------------------------------------------------------------------ repeat (before dates, so "every mon" wins)
  {
    type: 'repeat',
    re: new RegExp(`${B}every\\s+(${WD})${E}`, 'gi'),
    apply: (m, st, ctx) => {
      st.repeat = 'weekly';
      st.repeatEvery = 1;
      if (!st.dueOn) st.dueOn = nextWeekday(ctx.today, WEEKDAYS[m[1].toLowerCase()], true);
      return true;
    },
  },
  {
    type: 'repeat',
    re: new RegExp(`${B}(?:every\\s+(\\d+)\\s+(day|days|week|weeks|month|months|year|years)|every\\s+(day|weekday|week|month|year)|(daily|weekdays|weekly|monthly|yearly|annually))${E}`, 'gi'),
    apply: (m, st) => {
      const unit = (m[2] ?? m[3] ?? m[4]).toLowerCase();
      const every = m[1] ? Math.max(1, Number(m[1])) : 1;
      const r: Repeat =
        unit.startsWith('weekday') ? 'weekdays'
        : unit.startsWith('day') || unit === 'daily' ? 'daily'
        : unit.startsWith('week') ? 'weekly'
        : unit.startsWith('month') ? 'monthly'
        : 'yearly';
      st.repeat = r;
      st.repeatEvery = r === 'weekdays' ? 1 : every;
      return true;
    },
  },

  // ------------------------------------------------------------------ dates
  {
    type: 'date',
    re: new RegExp(`${B}(today|tod|tonight|tomorrow|tmr|tmrw|tml|tom)${E}`, 'gi'),
    apply: (m, st, ctx) => {
      const v = m[1].toLowerCase();
      st.dueOn = v === 'today' || v === 'tod' || v === 'tonight' ? ctx.today : addDays(ctx.today, 1);
      if (v === 'tonight' && !st.dueTime) st.dueTime = '20:00';
      return true;
    },
  },
  {
    type: 'date',
    re: /(?<=^|\s)(?:in\s+(\d+|a|an|one|two|three)\s+(day|days|week|weeks|month|months))(?=$|\s|[,.;!?])/gi,
    apply: (m, st, ctx) => {
      const words: Record<string, number> = { a: 1, an: 1, one: 1, two: 2, three: 3 };
      const n = words[m[1].toLowerCase()] ?? Number(m[1]);
      const unit = m[2].toLowerCase();
      st.dueOn = unit.startsWith('day') ? addDays(ctx.today, n) : unit.startsWith('week') ? addDays(ctx.today, 7 * n) : addMonths(ctx.today, n);
      return true;
    },
  },
  {
    type: 'date',
    re: /(?<=^|\s)(next week|this weekend|weekend|eow|end of week|eom|end of month|next month)(?=$|\s|[,.;!?])/gi,
    apply: (m, st, ctx) => {
      const v = m[1].toLowerCase();
      if (v === 'next week') st.dueOn = nextWeekday(ctx.today, 1, false);
      else if (v.includes('weekend')) st.dueOn = nextWeekday(ctx.today, 6, true);
      else if (v === 'eow' || v === 'end of week') st.dueOn = nextWeekday(ctx.today, 5, true);
      else if (v === 'next month') st.dueOn = `${addMonths(ctx.today.slice(0, 8) + '01', 1)}`;
      else {
        const first = addMonths(`${ctx.today.slice(0, 8)}01`, 1);
        st.dueOn = addDays(first, -1);
      }
      return true;
    },
  },
  {
    type: 'date',
    re: new RegExp(`${B}(?:(next|this|on)\\s+)?(${WD})${E}`, 'gi'),
    apply: (m, st, ctx) => {
      const word = m[2].toLowerCase();
      // "sun", "sat" and "wed" are also ordinary words ("buy sun cream"): only treat them as days
      // with "on/next/this" in front, or as the last word.
      if (!m[1] && ['sun', 'sat', 'wed'].includes(word) && m.input.slice(m.index + m[0].length).trim() !== '') return false;
      const target = WEEKDAYS[word];
      if (m[1]?.toLowerCase() === 'next') {
        // "next fri" = the Friday of next week
        const monNext = nextWeekday(ctx.today, 1, false);
        st.dueOn = addDays(monNext, target - 1);
      } else {
        st.dueOn = nextWeekday(ctx.today, target, true);
      }
      return true;
    },
  },
  {
    type: 'date',
    re: /(?<=^|\s)(\d{1,2})\/(\d{1,2})(?:\/(\d{2}|\d{4}))?(?=$|\s|[,.;!?])/g,
    apply: (m, st, ctx) => {
      const iso = dayMonth(ctx.today, Number(m[1]), Number(m[2]), m[3] ? Number(m[3]) : undefined);
      if (!iso) return false;
      st.dueOn = iso;
      return true;
    },
  },
  {
    type: 'date',
    re: new RegExp(`${B}(?:on\\s+)?(\\d{1,2})(?:st|nd|rd|th)?\\s+(${MO})(?:\\s+(\\d{4}))?${E}`, 'gi'),
    apply: (m, st, ctx) => {
      const iso = dayMonth(ctx.today, Number(m[1]), MONTHS[m[2].toLowerCase()], m[3] ? Number(m[3]) : undefined);
      if (!iso) return false;
      st.dueOn = iso;
      return true;
    },
  },
  {
    type: 'date',
    re: new RegExp(`${B}(?:on\\s+)?(${MO})\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(\\d{4}))?${E}`, 'gi'),
    apply: (m, st, ctx) => {
      const iso = dayMonth(ctx.today, Number(m[2]), MONTHS[m[1].toLowerCase()], m[3] ? Number(m[3]) : undefined);
      if (!iso) return false;
      st.dueOn = iso;
      return true;
    },
  },

  // ------------------------------------------------------------------ times
  {
    type: 'time',
    re: /(?<=^|\s)(?:at\s+)?(noon|midday|(\d{1,2})(?::(\d{2}))?\s?(am|pm)|(\d{1,2}):(\d{2}))(?=$|\s|[,.;!?])/gi,
    apply: (m, st) => {
      let t: string | null;
      if (/^(noon|midday)$/i.test(m[1])) t = '12:00';
      else if (m[4]) t = to24(Number(m[2]), Number(m[3] ?? 0), m[4]);
      else t = to24(Number(m[5]), Number(m[6]), undefined);
      if (!t) return false;
      st.dueTime = t;
      return true;
    },
  },
];

const KIND_SPACE: Partial<Record<ItemKind, Space>> = {
  errand: 'personal',
  shopping: 'personal',
  appointment: 'personal',
  renewal: 'personal',
  maintenance: 'personal',
  occasion: 'personal',
};

export function parseCapture(input: string, ctx: ParseContext): Parsed {
  const text = input;
  const st: State = {
    kind: null,
    space: null,
    projectId: null,
    newProjectTag: null,
    personId: null,
    newPersonHandle: null,
    dueOn: null,
    dueTime: null,
    priority: 0,
    effortMin: null,
    place: null,
    repeat: null,
    repeatEvery: 1,
    remind: null,
    remindTime: null,
    stripLeading: 0,
  };

  const claimed: Span[] = [];
  const overlaps = (s: number, e: number) => claimed.some((c) => s < c.end && e > c.start);

  for (const rule of RULES) {
    const re = new RegExp(rule.re.source, rule.re.flags.includes('g') ? rule.re.flags : rule.re.flags + 'g');
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) {
      if (m[0].length === 0) {
        re.lastIndex++;
        continue;
      }
      const start = m.index;
      const end = m.index + m[0].length;
      if (overlaps(start, end)) continue;
      // A date or time already found: keep the first one, leave later look-alikes in the title.
      if ((rule.type === 'date' && st.dueOn) || (rule.type === 'time' && st.dueTime) || (rule.type === 'repeat' && st.repeat)) continue;
      const before = { ...st };
      if (rule.apply(m, st, ctx)) {
        if (rule.type === 'kind') {
          claimed.push({ start, end: start + (st.stripLeading > 0 ? st.stripLeading : 0), type: 'kind' });
          st.stripLeading = 0;
        } else {
          claimed.push({ start, end, type: rule.type });
        }
      } else {
        Object.assign(st, before);
      }
      if (!rule.re.flags.includes('g')) break;
    }
  }

  // "birthday"/"anniversary" in the text makes it a yearly occasion.
  if (!st.kind && /\b(birthday|bday|anniversary)\b/i.test(text)) {
    st.kind = 'occasion';
    if (!st.repeat) st.repeat = 'yearly';
  }
  if (!st.kind && st.personId === null && st.newPersonHandle === null && /^waiting (on|for)\b/i.test(text.trim())) {
    st.kind = 'follow_up';
  }

  const kind: ItemKind = st.kind ?? ctx.kind ?? (st.place ? 'errand' : 'task');
  if (!st.projectId && !st.newProjectTag && ctx.projectId) {
    st.projectId = ctx.projectId;
    const p = ctx.projects.find((x) => x.id === ctx.projectId);
    if (p && !st.space) st.space = p.space;
  }
  const space: Space = st.space ?? KIND_SPACE[kind] ?? ctx.defaultSpace;

  // Title = the text with every recognised token removed.
  const sorted = claimed.filter((c) => c.end > c.start).sort((a, b) => a.start - b.start);
  let title = '';
  let pos = 0;
  for (const c of sorted) {
    title += text.slice(pos, c.start) + ' ';
    pos = c.end;
  }
  title += text.slice(pos);
  title = title
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.;!?])/g, '$1')
    .replace(/^[\s,.;:-]+|[\s,;:-]+$/g, '')
    .replace(/\s(on|at|by|for|due)$/i, '')
    .trim();
  if (title) title = title.charAt(0).toUpperCase() + title.slice(1);

  return {
    title,
    kind,
    space,
    projectId: st.projectId,
    newProjectTag: st.newProjectTag,
    personId: st.personId,
    newPersonHandle: st.newPersonHandle,
    dueOn: st.dueOn,
    dueTime: st.dueTime,
    priority: st.priority,
    effortMin: st.effortMin,
    place: st.place,
    repeat: st.repeat,
    repeatEvery: st.repeatEvery,
    remind: st.remind,
    remindTime: st.remindTime,
    spans: sorted,
  };
}

/** Splits the input into plain and recognised pieces, for highlighting as you type. */
export function highlight(input: string, spans: Span[]): { text: string; type?: TokenType }[] {
  const out: { text: string; type?: TokenType }[] = [];
  let pos = 0;
  for (const s of spans) {
    if (s.start > pos) out.push({ text: input.slice(pos, s.start) });
    out.push({ text: input.slice(s.start, s.end), type: s.type });
    pos = s.end;
  }
  if (pos < input.length) out.push({ text: input.slice(pos) });
  return out;
}

/** Lines in meeting notes that should become action items. */
export const ACTION_LINE = /^\s*(?:[-*•]\s*)?(?:\[\s?\]|AI:|Action:|TODO:|->|→)\s*(.+)$/i;

export function findActionLines(body: string): { index: number; text: string }[] {
  return body
    .split('\n')
    .map((line, index) => {
      const m = ACTION_LINE.exec(line);
      return m ? { index, text: m[1].trim() } : null;
    })
    .filter((x): x is { index: number; text: string } => Boolean(x && x.text));
}

/** Marks the given lines as turned into items, so they are not created twice. */
export function markActionLines(body: string, indexes: number[]): string {
  const set = new Set(indexes);
  return body
    .split('\n')
    .map((line, i) => {
      if (!set.has(i)) return line;
      const m = ACTION_LINE.exec(line);
      return m ? `✓ ${m[1].trim()}` : line;
    })
    .join('\n');
}
