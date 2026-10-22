import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Screen } from '../components/Screen';
import { Icon } from '../components/Icon';
import { ErrorNotice, Loading } from '../components/States';
import { ConfirmSheet } from '../components/ConfirmSheet';
import { SnoozeSheet } from '../components/SnoozeSheet';
import { useToast } from '../components/Toast';
import {
  addSubtask,
  completeItem,
  createItem,
  deleteItem,
  deleteSubtask,
  getItem,
  listSubtasks,
  newId,
  reopenItem,
  savePerson,
  setSubtask,
  updateItem,
} from '../api';
import { useRefs } from '../lib/refs';
import { errorMessage, useBump, useQuery } from '../lib/useQuery';
import { addDays, klParts, klTimestamp, longDate, relativeDay, todayKL, relativeInline } from '../lib/dates';
import {
  computeRemind,
  defaultRemindOption,
  detectRemind,
  EFFORT_OPTIONS,
  effortLabel,
  KIND_ORDER,
  KINDS,
  PRIORITY_LABEL,
  REMIND_LABEL,
  remindOptions,
  REPEAT_LABEL,
} from '../lib/labels';
import type { RemindOption } from '../lib/labels';
import type { ItemKind, Link as ItemLink, Repeat, Space, Subtask } from '../types';

/** One screen for viewing, adding (/item/new) and editing (/item/:id) an item. */
export function ItemForm() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const editing = Boolean(id);
  const navigate = useNavigate();
  const toast = useToast();
  const bump = useBump();
  const { projects, people, settings, space: filterSpace } = useRefs();
  const morning = settings?.default_remind_time ?? '09:00';

  const existing = useQuery(() => (id ? getItem(id) : Promise.resolve(null)), [id]);
  const subs = useQuery(() => (id ? listSubtasks(id) : Promise.resolve([] as Subtask[])), [id]);

  const initialKind = (params.get('kind') as ItemKind | null) ?? 'task';
  const [title, setTitle] = useState(params.get('title') ?? '');
  const [kind, setKind] = useState<ItemKind>(KINDS[initialKind] ? initialKind : 'task');
  const [space, setSpace] = useState<Space>(
    KINDS[initialKind]?.space ?? (filterSpace === 'all' ? (settings?.default_space ?? 'work') : filterSpace),
  );
  const [projectId, setProjectId] = useState<string>(params.get('project') ?? '');
  const [personId, setPersonId] = useState<string>('');
  const [newPerson, setNewPerson] = useState('');
  const [dueOn, setDueOn] = useState<string>(params.get('date') ?? '');
  const [dueTime, setDueTime] = useState<string>('');
  const [remind, setRemind] = useState<RemindOption>('none');
  const [remindTouched, setRemindTouched] = useState(false);
  const [customRemind, setCustomRemind] = useState('');
  const [repeat, setRepeat] = useState<Repeat | ''>(KINDS[initialKind]?.repeat ?? '');
  const [repeatEvery, setRepeatEvery] = useState(1);
  const [priority, setPriority] = useState(0);
  const [effort, setEffort] = useState<number | null>(null);
  const [place, setPlace] = useState('');
  const [askedOn, setAskedOn] = useState(todayKL());
  const [notes, setNotes] = useState('');
  const [links, setLinks] = useState<ItemLink[]>([]);
  const [draftSubs, setDraftSubs] = useState<string[]>([]);
  const [newSub, setNewSub] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [snooze, setSnooze] = useState(false);
  const loaded = useRef(false);

  // A project picked in the URL decides the space for a new item.
  useEffect(() => {
    if (editing || !projectId) return;
    const p = projects.find((x) => x.id === projectId);
    if (p) setSpace(p.space);
  }, [editing, projectId, projects]);

  useEffect(() => {
    const e = existing.data;
    if (!e || loaded.current) return;
    loaded.current = true;
    setTitle(e.title);
    setKind(e.kind);
    setSpace(e.space);
    setProjectId(e.project_id ?? '');
    setPersonId(e.person_id ?? '');
    setDueOn(e.due_on ?? '');
    setDueTime(e.due_time ? e.due_time.slice(0, 5) : '');
    const r = detectRemind(e.remind_at, e.due_on, e.due_time, morning);
    setRemind(r);
    setRemindTouched(true);
    if (r === 'custom' && e.remind_at) {
      const parts = klParts(e.remind_at);
      setCustomRemind(`${parts.date}T${parts.time}`);
    }
    setRepeat(e.repeat ?? '');
    setRepeatEvery(e.repeat_every);
    setPriority(e.priority);
    setEffort(e.effort_min);
    setPlace(e.place ?? '');
    setAskedOn(e.asked_on ?? e.created_at.slice(0, 10));
    setNotes(e.notes ?? '');
    setLinks(e.links ?? []);
  }, [existing.data, morning]);

  // Until the reminder is chosen by hand, it follows the type and date.
  useEffect(() => {
    if (remindTouched) return;
    setRemind(dueOn ? defaultRemindOption(kind, Boolean(dueTime)) : 'none');
  }, [kind, dueOn, dueTime, remindTouched]);

  const remindChoices = useMemo(() => remindOptions(Boolean(dueTime)), [dueTime]);
  const remindPreview = useMemo(() => {
    if (remind === 'custom') return customRemind ? klTimestamp(customRemind.slice(0, 10), customRemind.slice(11, 16)) : null;
    return computeRemind(remind, dueOn || null, dueTime || null, morning);
  }, [remind, customRemind, dueOn, dueTime, morning]);

  const isFollow = kind === 'follow_up';
  const showPlace = kind === 'errand' || kind === 'shopping' || place !== '';
  const item = existing.data;
  const isDone = item?.status === 'done';
  const valid = title.trim() !== '' && (remind !== 'custom' || customRemind !== '');

  function leave() {
    if (window.history.length > 1) navigate(-1);
    else navigate('/', { replace: true });
  }

  function pickKind(k: ItemKind) {
    setKind(k);
    if (KINDS[k].space) setSpace(KINDS[k].space!);
    if (!editing && !repeat && KINDS[k].repeat) setRepeat(KINDS[k].repeat!);
    if (k === 'follow_up' && !dueOn) setDueOn(addDays(todayKL(), 3));
  }

  async function save() {
    if (!valid || busy) return;
    setBusy(true);
    setError(null);
    try {
      let pid = personId || null;
      if (personId === '__new' && newPerson.trim()) {
        const handle = newPerson.trim().toLowerCase().split(/\s+/)[0].replace(/[^a-z0-9_.-]/g, '') || null;
        const taken = handle && people.some((p) => p.handle === handle);
        pid = await savePerson({ name: newPerson.trim(), handle: taken ? null : handle });
      } else if (personId === '__new') {
        pid = null;
      }
      let remindAt = remindPreview;
      if (remindAt && new Date(remindAt).getTime() < Date.now() - 60000 && remind !== 'custom') remindAt = null;
      const input = {
        title: title.trim(),
        kind,
        space,
        project_id: projectId || null,
        person_id: pid,
        due_on: dueOn || null,
        due_time: dueTime || null,
        remind_at: remindAt,
        repeat: repeat || null,
        repeat_every: repeat ? Math.max(1, repeatEvery) : 1,
        priority,
        effort_min: effort,
        place: place.trim() || null,
        asked_on: isFollow ? askedOn || todayKL() : null,
        notes: notes.trim() || null,
        links: links.filter((l) => l.url.trim()),
      };
      if (id) {
        await updateItem(id, input);
        toast('Saved');
      } else {
        const newItemId = await createItem({ ...input, id: newId() });
        for (const [i, t] of draftSubs.entries()) await addSubtask(newItemId, t, i);
        toast('Added');
      }
      bump();
      leave();
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  }

  async function toggleDone() {
    if (!id) return;
    try {
      if (isDone) await reopenItem(id);
      else await completeItem(id);
      bump();
      toast(isDone ? 'Reopened' : item?.repeat ? 'Done. Next one scheduled' : 'Done');
      if (!isDone) leave();
    } catch (e) {
      toast(errorMessage(e));
    }
  }

  async function nudged() {
    if (!id) return;
    const next = addDays(todayKL(), 3);
    const stamp = `Nudged on ${longDate(todayKL())}`;
    const newNotes = notes.trim() ? `${notes.trim()}\n${stamp}` : stamp;
    try {
      await updateItem(id, {
        due_on: next,
        notes: newNotes,
        remind_at: computeRemind('morning', next, null, morning),
      });
      bump();
      toast('Logged the nudge. Next check in 3 days');
      leave();
    } catch (e) {
      toast(errorMessage(e));
    }
  }

  async function remove() {
    if (!id) return;
    try {
      await deleteItem(id);
      bump();
      toast('Deleted');
      navigate('/', { replace: true });
    } catch (e) {
      toast(errorMessage(e));
    }
  }

  async function addSub() {
    const t = newSub.trim();
    if (!t) return;
    setNewSub('');
    if (id) {
      await addSubtask(id, t, (subs.data?.length ?? 0) + 1);
      subs.reload();
      bump();
    } else {
      setDraftSubs((d) => [...d, t]);
    }
  }

  const waiting = editing && !existing.data && !existing.error;
  if (waiting) {
    return (
      <Screen title="Item" compact className="screen-form" left={<button className="nav-button" onClick={leave}>Back</button>}>
        <main className="page">
          <Loading />
        </main>
      </Screen>
    );
  }
  if (editing && existing.data === null) {
    return (
      <Screen title="Item" compact className="screen-form" left={<button className="nav-button" onClick={leave}>Back</button>}>
        <main className="page">
          <ErrorNotice message="This item no longer exists. It may have been deleted on another device." />
        </main>
      </Screen>
    );
  }

  return (
    <Screen
      title={editing ? KINDS[kind].label : `New ${KINDS[kind].label.toLowerCase()}`}
      compact
      className="screen-form"
      left={
        <button className="nav-button" onClick={leave}>
          Cancel
        </button>
      }
      right={
        <button className="nav-button nav-button-strong" onClick={() => void save()} disabled={!valid || busy}>
          {busy ? 'Saving…' : 'Save'}
        </button>
      }
    >
      <main className="page form-page">
        {error ? <ErrorNotice message={error} /> : null}
        {existing.error ? <ErrorNotice message={existing.error} onRetry={existing.reload} /> : null}

        <div className="group">
          <div className="group-body">
            <label className="sr-only" htmlFor="item-title">
              Title
            </label>
            <textarea
              id="item-title"
              className="title-input"
              rows={2}
              placeholder="What needs doing?"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              autoFocus={!editing}
            />
          </div>
        </div>

        {editing ? (
          <div className="action-bar">
            <button className={`chip ${isDone ? 'chip-on' : ''}`} onClick={() => void toggleDone()}>
              <Icon name="check" size={16} /> {isDone ? 'Done' : 'Mark done'}
            </button>
            {!isDone ? (
              <button className="chip" onClick={() => setSnooze(true)}>
                <Icon name="moon" size={16} /> Snooze
              </button>
            ) : null}
            {isFollow && !isDone ? (
              <button className="chip" onClick={() => void nudged()}>
                <Icon name="hourglass" size={16} /> I nudged them
              </button>
            ) : null}
          </div>
        ) : null}

        <div className="group">
          <div className="group-body">
            <div className="row-input">
              <span className="row-label">Space</span>
              <div className="segmented segmented-inline" role="radiogroup" aria-label="Space">
                {(['work', 'personal'] as Space[]).map((s) => (
                  <button key={s} role="radio" aria-checked={space === s} className={space === s ? 'on' : ''} onClick={() => setSpace(s)}>
                    {s === 'work' ? 'Work' : 'Personal'}
                  </button>
                ))}
              </div>
            </div>
            <label className="row-input">
              <span className="row-label">Type</span>
              <select value={kind} onChange={(e) => pickKind(e.target.value as ItemKind)}>
                {KIND_ORDER.map((k) => (
                  <option key={k} value={k}>
                    {KINDS[k].label}
                  </option>
                ))}
              </select>
            </label>
            <label className="row-input">
              <span className="row-label">Project</span>
              <select value={projectId} onChange={(e) => setProjectId(e.target.value)}>
                <option value="">None</option>
                {projects
                  .filter((p) => p.status !== 'done' || p.id === projectId)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
              </select>
            </label>
            <label className="row-input">
              <span className="row-label">{isFollow ? 'Waiting on' : 'Person'}</span>
              <select value={personId} onChange={(e) => setPersonId(e.target.value)}>
                <option value="">None</option>
                {people.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
                <option value="__new">Add someone new…</option>
              </select>
            </label>
            {personId === '__new' ? (
              <label className="row-input">
                <span className="row-label">Name</span>
                <input value={newPerson} onChange={(e) => setNewPerson(e.target.value)} placeholder="Their name" autoFocus />
              </label>
            ) : null}
            {isFollow ? (
              <label className="row-input">
                <span className="row-label">Asked on</span>
                <input type="date" value={askedOn} onChange={(e) => setAskedOn(e.target.value)} />
              </label>
            ) : null}
            {showPlace ? (
              <label className="row-input">
                <span className="row-label">Where</span>
                <input value={place} onChange={(e) => setPlace(e.target.value)} placeholder="Shop, bank, pharmacy…" />
              </label>
            ) : null}
          </div>
        </div>

        <div className="group">
          <div className="group-body">
            <label className="row-input">
              <span className="row-label">{isFollow ? 'Nudge on' : 'Due'}</span>
              <input type="date" value={dueOn} onChange={(e) => setDueOn(e.target.value)} />
              {dueOn ? (
                <button className="icon-clear" onClick={() => { setDueOn(''); setDueTime(''); }} aria-label="Clear date">
                  <Icon name="x" size={14} />
                </button>
              ) : null}
            </label>
            {dueOn ? (
              <label className="row-input">
                <span className="row-label">Time</span>
                <input type="time" value={dueTime} onChange={(e) => setDueTime(e.target.value)} />
                {dueTime ? (
                  <button className="icon-clear" onClick={() => setDueTime('')} aria-label="Clear time">
                    <Icon name="x" size={14} />
                  </button>
                ) : null}
              </label>
            ) : null}
            {!dueOn ? (
              <div className="row-input quick-dates">
                <span className="row-label" />
                <div className="chips">
                  {[
                    { l: 'Today', d: todayKL() },
                    { l: 'Tomorrow', d: addDays(todayKL(), 1) },
                    { l: 'In 3 days', d: addDays(todayKL(), 3) },
                    { l: 'Next week', d: addDays(todayKL(), 7) },
                  ].map((o) => (
                    <button key={o.l} className="chip chip-small" onClick={() => setDueOn(o.d)}>
                      {o.l}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
            <label className="row-input">
              <span className="row-label">Remind</span>
              <select
                value={remind}
                onChange={(e) => {
                  setRemind(e.target.value as RemindOption);
                  setRemindTouched(true);
                }}
              >
                {(dueOn ? remindChoices : (['none', 'custom'] as RemindOption[])).map((o) => (
                  <option key={o} value={o}>
                    {REMIND_LABEL[o]}
                  </option>
                ))}
              </select>
            </label>
            {remind === 'custom' ? (
              <label className="row-input">
                <span className="row-label">At</span>
                <input type="datetime-local" value={customRemind} onChange={(e) => setCustomRemind(e.target.value)} />
              </label>
            ) : null}
            <label className="row-input">
              <span className="row-label">Repeat</span>
              <select value={repeat} onChange={(e) => setRepeat(e.target.value as Repeat | '')}>
                <option value="">Never</option>
                {(Object.keys(REPEAT_LABEL) as Repeat[]).map((r) => (
                  <option key={r} value={r}>
                    {REPEAT_LABEL[r]}
                  </option>
                ))}
              </select>
            </label>
            {repeat && repeat !== 'weekdays' ? (
              <label className="row-input">
                <span className="row-label">Every</span>
                <input
                  type="number"
                  min={1}
                  max={365}
                  inputMode="numeric"
                  value={repeatEvery}
                  onChange={(e) => setRepeatEvery(Math.max(1, Number(e.target.value) || 1))}
                />
                <span className="row-value">
                  {{ daily: 'day', weekly: 'week', monthly: 'month', yearly: 'year' }[repeat]}
                  {repeatEvery > 1 ? 's' : ''}
                </span>
              </label>
            ) : null}
          </div>
          {remindPreview ? (
            <div className="group-footer">
              Reminder {relativeInline(klParts(remindPreview).date)} at {klParts(remindPreview).time}.
              {repeat && !dueOn ? ' A repeating item needs a due date.' : ''}
            </div>
          ) : repeat && !dueOn ? (
            <div className="group-footer">A repeating item needs a due date.</div>
          ) : null}
        </div>

        <div className="group">
          <div className="group-header">Priority</div>
          <div className="segmented segmented-4" role="radiogroup" aria-label="Priority">
            {PRIORITY_LABEL.map((p, i) => (
              <button key={p} role="radio" aria-checked={priority === i} className={priority === i ? 'on' : ''} onClick={() => setPriority(i)}>
                {p}
              </button>
            ))}
          </div>
        </div>

        <div className="group">
          <div className="group-header">Effort</div>
          <div className="chips">
            {EFFORT_OPTIONS.map((m) => (
              <button key={m} className={`chip chip-small ${effort === m ? 'chip-on' : ''}`} onClick={() => setEffort(effort === m ? null : m)}>
                {effortLabel(m)}
              </button>
            ))}
          </div>
        </div>

        <div className="group">
          <div className="group-header">Subtasks</div>
          <div className="group-body">
            {(subs.data ?? []).map((s) => (
              <div key={s.id} className="sub-row">
                <button
                  className={`check check-small ${s.done ? 'is-on' : ''}`}
                  aria-label={s.done ? `Untick ${s.title}` : `Tick ${s.title}`}
                  aria-pressed={s.done}
                  onClick={async () => {
                    await setSubtask(s.id, { done: !s.done });
                    subs.reload();
                    bump();
                  }}
                >
                  <span className="check-ring">{s.done ? <Icon name="check" size={12} strokeWidth={3} /> : null}</span>
                </button>
                <span className={`sub-title ${s.done ? 'is-done' : ''}`}>{s.title}</span>
                <button
                  className="icon-clear"
                  aria-label={`Remove ${s.title}`}
                  onClick={async () => {
                    await deleteSubtask(s.id);
                    subs.reload();
                    bump();
                  }}
                >
                  <Icon name="x" size={14} />
                </button>
              </div>
            ))}
            {draftSubs.map((t, i) => (
              <div key={`${t}-${i}`} className="sub-row">
                <span className="check check-small">
                  <span className="check-ring" />
                </span>
                <span className="sub-title">{t}</span>
                <button className="icon-clear" aria-label={`Remove ${t}`} onClick={() => setDraftSubs((d) => d.filter((_, j) => j !== i))}>
                  <Icon name="x" size={14} />
                </button>
              </div>
            ))}
            <label className="row-input">
              <span className="sr-only">New subtask</span>
              <input
                value={newSub}
                onChange={(e) => setNewSub(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    void addSub();
                  }
                }}
                placeholder="Add a subtask"
              />
              {newSub ? (
                <button className="mini-button" onClick={() => void addSub()}>
                  Add
                </button>
              ) : null}
            </label>
          </div>
        </div>

        <div className="group">
          <div className="group-header">Links</div>
          <div className="group-body">
            {links.map((l, i) => (
              <div key={i} className="link-edit">
                <input
                  className="link-label"
                  value={l.label}
                  placeholder="Label"
                  aria-label="Link label"
                  onChange={(e) => setLinks((ls) => ls.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))}
                />
                <input
                  className="link-url"
                  value={l.url}
                  placeholder="https://"
                  aria-label="Link address"
                  inputMode="url"
                  onChange={(e) => setLinks((ls) => ls.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)))}
                />
                {l.url ? (
                  <a className="icon-clear" href={l.url} target="_blank" rel="noreferrer" aria-label="Open link">
                    <Icon name="external" size={14} />
                  </a>
                ) : null}
                <button className="icon-clear" aria-label="Remove link" onClick={() => setLinks((ls) => ls.filter((_, j) => j !== i))}>
                  <Icon name="x" size={14} />
                </button>
              </div>
            ))}
            <button className="row row-add" onClick={() => setLinks((ls) => [...ls, { label: '', url: '' }])}>
              <Icon name="link" size={18} /> Add a link (email thread, Drive doc, board)
            </button>
          </div>
        </div>

        <div className="group">
          <div className="group-header">Notes</div>
          <div className="group-body">
            <label className="sr-only" htmlFor="item-notes">
              Notes
            </label>
            <textarea id="item-notes" className="notes-input" rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Details, context, next steps" />
          </div>
        </div>

        {editing ? (
          <div className="group">
            <div className="group-body">
              <button className="row row-center row-danger" onClick={() => setConfirmDelete(true)}>
                Delete
              </button>
            </div>
          </div>
        ) : null}

        <button className="button button-primary button-block form-save" onClick={() => void save()} disabled={!valid || busy}>
          {busy ? 'Saving…' : editing ? 'Save changes' : 'Add'}
        </button>
      </main>

      {confirmDelete ? (
        <ConfirmSheet title="Delete this item? This cannot be undone." confirmLabel="Delete" danger onConfirm={() => void remove()} onCancel={() => setConfirmDelete(false)} />
      ) : null}
      {snooze && item ? (
        <SnoozeSheet
          item={item}
          onClose={() => {
            setSnooze(false);
            loaded.current = false;
            existing.reload();
          }}
        />
      ) : null}
    </Screen>
  );
}
