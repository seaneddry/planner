import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Screen } from '../components/Screen';
import { Icon } from '../components/Icon';
import { ItemRow } from '../components/ItemRow';
import { BackLink, EmptyLine, Section } from '../components/Bits';
import { Empty, ErrorNotice, Loading } from '../components/States';
import { ConfirmSheet } from '../components/ConfirmSheet';
import { useToast } from '../components/Toast';
import { deleteNote, getNote, listNoteItems, listNotes, newId, saveNote } from '../api';
import { useRefs } from '../lib/refs';
import { errorMessage, useBump, useQuery } from '../lib/useQuery';
import { longDate, relativeDay, timeLabel, todayKL } from '../lib/dates';
import { findActionLines, markActionLines, parseCapture } from '../lib/parse';
import { saveCapture } from '../lib/capture';

export function Notes() {
  const notes = useQuery(() => listNotes(), [], 'notes');
  const { projectById } = useRefs();
  const [q, setQ] = useState('');
  const list = (notes.data ?? []).filter((n) => {
    if (!q.trim()) return true;
    const t = q.toLowerCase();
    return n.title.toLowerCase().includes(t) || n.body.toLowerCase().includes(t) || (n.attendees ?? '').toLowerCase().includes(t);
  });

  return (
    <Screen
      title="Meeting notes"
      right={
        <Link to="/notes/new" className="nav-icon-button" aria-label="New note">
          <Icon name="plus" size={22} />
        </Link>
      }
    >
      <div className="search-bar">
        <label className="search-field">
          <Icon name="search" size={16} />
          <input type="search" placeholder="Search notes" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search notes" />
        </label>
      </div>
      <main className="page">
        {notes.error && !notes.data ? <ErrorNotice message={notes.error} onRetry={notes.reload} /> : null}
        {notes.data && notes.data.length === 0 ? (
          <Empty
            icon="note"
            title="No meeting notes yet"
            text='Write notes during a meeting. Lines starting with "[ ]", "AI:" or "->" become action items in one tap.'
            action={
              <Link to="/notes/new" className="button button-primary">
                New note
              </Link>
            }
          />
        ) : null}
        {list.length ? (
          <div className="group">
            <div className="group-body">
              {list.map((n) => (
                <Link key={n.id} to={`/notes/${n.id}`} className="row">
                  <span className="row-label">
                    {n.title}
                    <span className="row-sub">
                      {longDate(n.met_on)}
                      {n.project_id ? ` · ${projectById.get(n.project_id)?.name ?? ''}` : ''}
                      {n.attendees ? ` · ${n.attendees}` : ''}
                    </span>
                  </span>
                  <Icon name="chevron-right" size={18} />
                </Link>
              ))}
            </div>
          </div>
        ) : null}
      </main>
    </Screen>
  );
}

export function NoteEditor() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const toast = useToast();
  const bump = useBump();
  const { projects, people, settings, projectById, personById } = useRefs();
  const existing = useQuery(() => (id ? getNote(id) : Promise.resolve(null)), [id]);
  const linked = useQuery(() => (id ? listNoteItems(id) : Promise.resolve([])), [id]);

  const [title, setTitle] = useState('');
  const [metOn, setMetOn] = useState(todayKL());
  const [projectId, setProjectId] = useState(params.get('project') ?? '');
  const [attendees, setAttendees] = useState('');
  const [body, setBody] = useState('');
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [skip, setSkip] = useState<Set<number>>(new Set());
  const loaded = useRef(false);

  useEffect(() => {
    const n = existing.data;
    if (!n || loaded.current) return;
    loaded.current = true;
    setTitle(n.title);
    setMetOn(n.met_on);
    setProjectId(n.project_id ?? '');
    setAttendees(n.attendees ?? '');
    setBody(n.body);
  }, [existing.data]);

  const actions = useMemo(() => findActionLines(body), [body]);
  const project = projectId ? projectById.get(projectId) : undefined;
  const preview = useMemo(
    () =>
      actions.map((a) => ({
        ...a,
        parsed: parseCapture(a.text, {
          today: todayKL(),
          projects,
          people,
          defaultSpace: project?.space ?? settings?.default_space ?? 'work',
          projectId: projectId || null,
        }),
      })),
    [actions, projects, people, project, projectId, settings],
  );
  const chosen = preview.filter((p) => !skip.has(p.index) && p.parsed.title);

  async function persist(nextBody = body): Promise<string | null> {
    if (!title.trim()) {
      toast('Give the note a title first');
      return null;
    }
    const nid = await saveNote({
      ...(id ? { id } : { id: newId() }),
      title: title.trim(),
      met_on: metOn,
      project_id: projectId || null,
      attendees: attendees.trim() || null,
      body: nextBody,
    });
    setDirty(false);
    return nid;
  }

  async function save() {
    setBusy(true);
    try {
      const nid = await persist();
      if (nid) {
        bump();
        toast('Saved');
        if (!id) navigate(`/notes/${nid}`, { replace: true });
      }
    } catch (e) {
      toast(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function createActions() {
    if (!chosen.length) return;
    setBusy(true);
    try {
      const nid = await persist();
      if (!nid) return;
      for (const c of chosen) await saveCapture(c.parsed, settings, { note_id: nid });
      const marked = markActionLines(body, chosen.map((c) => c.index));
      setBody(marked);
      await saveNote({ id: nid, title: title.trim(), body: marked });
      setSkip(new Set());
      bump();
      toast(`Created ${chosen.length} action item${chosen.length === 1 ? '' : 's'}`);
      if (!id) navigate(`/notes/${nid}`, { replace: true });
      else linked.reload();
    } catch (e) {
      toast(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!id) return;
    try {
      await deleteNote(id);
      bump();
      toast('Note deleted. Its action items were kept.');
      navigate('/notes', { replace: true });
    } catch (e) {
      toast(errorMessage(e));
    }
  }

  if (id && existing.loading && !existing.data) {
    return (
      <Screen title="Note" compact left={<BackLink to="/notes" label="Notes" />}>
        <main className="page">
          <Loading />
        </main>
      </Screen>
    );
  }

  const change = <T,>(fn: (v: T) => void) => (v: T) => {
    fn(v);
    setDirty(true);
  };

  return (
    <Screen
      title={id ? title || 'Note' : 'New note'}
      compact
      className="screen-form"
      left={<BackLink to={projectId ? `/projects/${projectId}` : '/notes'} label={projectId ? 'Project' : 'Notes'} />}
      right={
        <button className="nav-button nav-button-strong" onClick={() => void save()} disabled={busy || !title.trim() || (!dirty && Boolean(id))}>
          {dirty || !id ? 'Save' : 'Saved'}
        </button>
      }
    >
      <main className="page form-page note-page">
        <div className="group">
          <div className="group-body">
            <label className="row-input">
              <span className="row-label">Title</span>
              <input value={title} onChange={(e) => change(setTitle)(e.target.value)} placeholder="e.g. UAT walkthrough" autoFocus={!id} />
            </label>
            <label className="row-input">
              <span className="row-label">Date</span>
              <input type="date" value={metOn} onChange={(e) => change(setMetOn)(e.target.value)} />
            </label>
            <label className="row-input">
              <span className="row-label">Project</span>
              <select value={projectId} onChange={(e) => change(setProjectId)(e.target.value)}>
                <option value="">None</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="row-input">
              <span className="row-label">With</span>
              <input value={attendees} onChange={(e) => change(setAttendees)(e.target.value)} placeholder="Who was there" />
            </label>
          </div>
        </div>

        <div className="group">
          <div className="group-body">
            <label className="sr-only" htmlFor="note-body">
              Notes
            </label>
            <textarea
              id="note-body"
              className="note-body"
              rows={14}
              value={body}
              onChange={(e) => change(setBody)(e.target.value)}
              onBlur={() => {
                if (dirty && id && title.trim()) void persist().then(bump);
              }}
              placeholder={'Write freely. Action lines become tasks:\n[ ] send GA4 events list @client fri\nAI: update estimate !high\n-> book UAT room tmr'}
            />
          </div>
          <div className="group-footer">Start a line with “[ ]”, “AI:”, “TODO:” or “{'->'}” to make it an action item. Quick-capture tags work inside it.</div>
        </div>

        {preview.length ? (
          <Section
            title="Action items found"
            count={chosen.length}
            action={
              <button className="button button-primary button-small" onClick={() => void createActions()} disabled={busy || !chosen.length}>
                Create {chosen.length}
              </button>
            }
          >
            {preview.map((p) => (
              <label key={p.index} className="action-preview">
                <input
                  type="checkbox"
                  checked={!skip.has(p.index)}
                  onChange={() =>
                    setSkip((s) => {
                      const n = new Set(s);
                      if (n.has(p.index)) n.delete(p.index);
                      else n.add(p.index);
                      return n;
                    })
                  }
                />
                <span className="item-main">
                  <span className="item-title">{p.parsed.title || p.text}</span>
                  <span className="item-meta">
                    {[
                      p.parsed.kind === 'follow_up' ? 'Follow-up' : null,
                      p.parsed.personId ? personById.get(p.parsed.personId)?.name : p.parsed.newPersonHandle ? `new: @${p.parsed.newPersonHandle}` : null,
                      p.parsed.dueOn ? `${relativeDay(p.parsed.dueOn)}${p.parsed.dueTime ? ' ' + timeLabel(p.parsed.dueTime) : ''}` : 'No date',
                      p.parsed.priority === 3 ? 'High' : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                </span>
              </label>
            ))}
          </Section>
        ) : null}

        {id ? (
          <Section title="Items from this note" count={linked.data?.length ?? 0}>
            {(linked.data ?? []).map((i) => (
              <ItemRow key={i.id} item={i} hideProject />
            ))}
            {(linked.data ?? []).length === 0 ? <EmptyLine>None yet.</EmptyLine> : null}
          </Section>
        ) : null}

        {id ? (
          <div className="group">
            <div className="group-body">
              <button className="row row-center row-danger" onClick={() => setConfirm(true)}>
                Delete note
              </button>
            </div>
          </div>
        ) : null}
      </main>
      {confirm ? <ConfirmSheet title="Delete this note?" confirmLabel="Delete note" danger onConfirm={() => void remove()} onCancel={() => setConfirm(false)} /> : null}
    </Screen>
  );
}
