export type Space = 'work' | 'personal';
export type SpaceFilter = Space | 'all';

export type ItemKind =
  | 'task'
  | 'follow_up'
  | 'reminder'
  | 'errand'
  | 'shopping'
  | 'appointment'
  | 'renewal'
  | 'maintenance'
  | 'occasion';

export type Repeat = 'daily' | 'weekdays' | 'weekly' | 'monthly' | 'yearly';
export type ItemStatus = 'open' | 'done' | 'dropped';
export type Rag = 'green' | 'amber' | 'red';

export interface Link {
  label: string;
  url: string;
}

export interface ProjectRef {
  id: string;
  name: string;
  tag: string | null;
  rag: Rag | null;
  space: Space;
}

export interface PersonRef {
  id: string;
  name: string;
  handle: string | null;
}

export interface Item {
  id: string;
  space: Space;
  kind: ItemKind;
  title: string;
  notes: string | null;
  project_id: string | null;
  person_id: string | null;
  note_id: string | null;
  due_on: string | null;
  due_time: string | null;
  remind_at: string | null;
  priority: number;
  effort_min: number | null;
  place: string | null;
  repeat: Repeat | null;
  repeat_every: number;
  asked_on: string | null;
  links: Link[];
  status: ItemStatus;
  done_at: string | null;
  sort: number;
  created_at: string;
  updated_at: string;
  project?: ProjectRef | null;
  person?: PersonRef | null;
  subtasks?: { id: string; done: boolean }[];
}

/** What a create or update sends. Joined fields are left out. */
export type ItemInput = Partial<Omit<Item, 'project' | 'person' | 'subtasks' | 'created_at' | 'updated_at'>>;

export interface Subtask {
  id: string;
  item_id: string;
  title: string;
  done: boolean;
  sort: number;
}

export interface Project {
  id: string;
  name: string;
  tag: string | null;
  space: Space;
  status: 'active' | 'on_hold' | 'done';
  rag: Rag | null;
  client: string | null;
  pic: string | null;
  phase: string | null;
  summary: string | null;
  links: Link[];
  sort: number;
  created_at: string;
}

export interface Milestone {
  id: string;
  project_id: string;
  name: string;
  due_on: string | null;
  done: boolean;
  sort: number;
}

export interface Person {
  id: string;
  name: string;
  handle: string | null;
  org: string | null;
  role: string | null;
  is_team: boolean;
  notes: string | null;
}

export interface Note {
  id: string;
  project_id: string | null;
  title: string;
  met_on: string;
  attendees: string | null;
  body: string;
  created_at: string;
  updated_at: string;
}

export interface Leave {
  id: string;
  person_id: string;
  starts_on: string;
  ends_on: string;
  part: 'full' | 'am' | 'pm';
  kind: 'annual' | 'medical' | 'training' | 'other';
  note: string | null;
  person?: { name: string } | null;
}

export interface Holiday {
  id: string;
  user_id: string | null;
  holiday_on: string;
  name: string;
  scope: string;
  estimated: boolean;
}

export interface PlannerList {
  id: string;
  name: string;
  kind: 'packing' | 'checklist';
  is_template: boolean;
  starts_on: string | null;
  archived: boolean;
  created_at: string;
}

export interface ListEntry {
  id: string;
  list_id: string;
  text: string;
  section: string | null;
  done: boolean;
  sort: number;
}

export interface Review {
  id: string;
  week_start: string;
  wins: string | null;
  lessons: string | null;
  focus: string | null;
}

export interface Brief {
  id: string;
  brief_on: string;
  content: string;
  source: 'ai' | 'fallback';
  created_at: string;
}

export interface Settings {
  user_id: string;
  default_space: Space;
  default_remind_time: string;
  brief_enabled: boolean;
  brief_push: boolean;
  ics_token: string;
  ics_work_detail: 'full' | 'minimal';
  holiday_scopes: string[];
}

/** A recurring payment from the expense tracker (read-only). */
export interface Payment {
  id: string;
  name: string;
  kind: string;
  amount: number | null;
  next_due: string;
  days_until: number;
  paid: boolean;
  in_trial: boolean;
}

/** A linked calendar (Google Calendar's private iCal address). Read-only. */
export interface CalendarFeed {
  id: string;
  name: string;
  url: string;
  space: Space;
  enabled: boolean;
  last_synced_at: string | null;
  last_error: string | null;
  event_count: number;
  created_at: string;
}

/** An event from a linked calendar. */
export interface CalEvent {
  id: string;
  calendar_id: string;
  title: string;
  location: string | null;
  all_day: boolean;
  starts_at: string;
  ends_at: string;
  start_date: string;
  end_date: string;
  calendar?: { name: string; space: Space } | null;
}
