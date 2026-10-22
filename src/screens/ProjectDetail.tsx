import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Screen } from '../components/Screen';
import { Icon } from '../components/Icon';
import { ItemRow } from '../components/ItemRow';
import { BackLink, EmptyLine, Section } from '../components/Bits';
import { CaptureBar, useCapture } from '../components/Capture';
import { ErrorNotice, Loading } from '../components/States';
import { useToast } from '../components/Toast';
import { RagPill } from './Projects';
import { deleteMilestone, getProject, listMilestones, listNotes, listProjectItems, saveMilestone, saveProject } from '../api';
import { useRefs, useWide } from '../lib/refs';
import { errorMessage, useBump, useQuery } from '../lib/useQuery';
import { longDate, relativeDay, shortDate, todayKL, relativeInline } from '../lib/dates';
import { sortItems } from '../lib/items';
import type { Link as ItemLink, Milestone, Rag } from '../types';

type Tab = 'tasks' | 'notes' | 'links';

export function ProjectDetail() {
  const { id = '' } = useParams();
  const wide = useWide();
  const capture = useCapture();
  const bump = useBump();
  const toast = useToast();
  const { personById } = useRefs();
  const project = useQuery(() => getProject(id), [id], `project-${id}`);
  const items = useQuery(() => listProjectItems(id), [id], `project-items-${id}`);
  const milestones = useQuery(() => listMilestones(id), [id]);
  const notes = useQuery(() => listNotes(id), [id]);
  const [tab, setTab] = useState<Tab>('tasks');
  const today = todayKL();

  const p = project.data;
  if (!p) {
    return (
      <Screen title="Project" compact left={<BackLink to="/projects" label="Projects" />}>
        <main className="page">{project.error ? <ErrorNotice message={project.error} /> : project.loading ? <Loading /> : <ErrorNotice message="Project not found." />}</main>
      </Screen>
    );
  }

  const all = items.data ?? [];
  const open = all.filter((i) => i.status === 'open');
  const waiting = open.filter((i) => i.kind === 'follow_up');
  const tasks = open.filter((i) => i.kind !== 'follow_up').sort(sortItems);
  const done = all.filter((i) => i.status === 'done').sort((a, b) => ((a.done_at ?? '') < (b.done_at ?? '') ? 1 : -1));

  async function setRag(rag: Rag | null) {
    try {
      await saveProject({ id: p!.id, name: p!.name, rag });
      project.reload();
      bump();
    } catch (e) {
      toast(errorMessage(e));
    }
  }

  return (
    <Screen
      title={p.name}
      left={<BackLink to="/projects" label="Projects" />}
      right={
        <Link to={`/projects/${p.id}/edit`} className="nav-button">
          Edit
        </Link>
      }
      sub={[p.space === 'work' ? 'Work' : 'Personal', p.phase, p.client, p.pic ? `PIC ${p.pic}` : null].filter(Boolean).join(' · ')}
    >
      <main className="page">
        <div className="project-head">
          <div className="rag-picker" role="radiogroup" aria-label="Status">
            {(['green', 'amber', 'red'] as Rag[]).map((r) => (
              <button
                key={r}
                role="radio"
                aria-checked={p.rag === r}
                className={`rag-choice rag-${r} ${p.rag === r ? 'on' : ''}`}
                onClick={() => void setRag(p.rag === r ? null : r)}
              >
                {{ green: 'On track', amber: 'At risk', red: 'Off track' }[r]}
              </button>
            ))}
          </div>
          {p.tag ? <span className="tag-chip">#{p.tag}</span> : null}
        </div>
        {p.summary ? <p className="project-summary">{p.summary}</p> : null}

        <div className="stack-tight">
          <Milestones projectId={p.id} list={milestones.data ?? []} reload={milestones.reload} />

          <div className="segmented tabs" role="tablist">
            {(
              [
                ['tasks', `Tasks · ${open.length}`],
                ['notes', `Notes · ${notes.data?.length ?? 0}`],
                ['links', `Links · ${p.links?.length ?? 0}`],
              ] as [Tab, string][]
            ).map(([t, label]) => (
              <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? 'on' : ''} onClick={() => setTab(t)}>
                {label}
              </button>
            ))}
          </div>

          {tab === 'tasks' ? (
            <>
              {wide ? (
                <CaptureBar projectId={p.id} placeholder={`Add to ${p.name}… e.g. send minutes fri !high, or fu @someone`} />
              ) : (
                <button className="button button-secondary button-block" onClick={() => capture({ projectId: p.id })}>
                  <Icon name="plus" size={18} /> Add to {p.name}
                </button>
              )}
              {waiting.length ? (
                <Section title="Waiting on" count={waiting.length}>
                  {waiting.map((i) => (
                    <ItemRow key={i.id} item={i} hideProject />
                  ))}
                </Section>
              ) : null}
              <Section title="Open" count={tasks.length}>
                {tasks.map((i) => (
                  <ItemRow key={i.id} item={i} hideProject />
                ))}
                {tasks.length === 0 ? <EmptyLine>No open tasks.</EmptyLine> : null}
              </Section>
              {done.length ? (
                <Section title="Done" count={done.length} collapsible defaultOpen={false}>
                  {done.slice(0, 50).map((i) => (
                    <ItemRow key={i.id} item={i} hideProject />
                  ))}
                </Section>
              ) : null}
            </>
          ) : null}

          {tab === 'notes' ? (
            <Section
              title="Meeting notes"
              action={
                <Link to={`/notes/new?project=${p.id}`} className="section-link">
                  New note
                </Link>
              }
            >
              {(notes.data ?? []).map((n) => {
                const actions = all.filter((i) => i.note_id === n.id);
                return (
                  <Link key={n.id} to={`/notes/${n.id}`} className="row">
                    <span className="row-label">
                      {n.title}
                      <span className="row-sub">
                        {longDate(n.met_on)}
                        {actions.length ? ` · ${actions.filter((a) => a.status === 'done').length}/${actions.length} actions done` : ''}
                      </span>
                    </span>
                    <Icon name="chevron-right" size={18} />
                  </Link>
                );
              })}
              {(notes.data ?? []).length === 0 ? <EmptyLine>No notes yet. Notes turn their action lines into tasks.</EmptyLine> : null}
            </Section>
          ) : null}

          {tab === 'links' ? <ProjectLinks projectId={p.id} name={p.name} links={p.links ?? []} onSaved={() => { project.reload(); bump(); }} /> : null}

          {waiting.length && tab === 'tasks' ? (
            <p className="footnote">
              Waiting on {[...new Set(waiting.map((w) => (w.person_id ? personById.get(w.person_id)?.name : null)).filter(Boolean))].join(', ') || 'others'}. Oldest since{' '}
              {relativeInline(waiting.map((w) => w.asked_on ?? w.created_at.slice(0, 10)).sort()[0], today)}.
            </p>
          ) : null}
        </div>
      </main>
    </Screen>
  );
}

function Milestones({ projectId, list, reload }: { projectId: string; list: Milestone[]; reload: () => void }) {
  const toast = useToast();
  const bump = useBump();
  const [name, setName] = useState('');
  const [date, setDate] = useState('');
  const [adding, setAdding] = useState(false);
  const today = todayKL();
  const doneCount = list.filter((m) => m.done).length;

  async function add() {
    if (!name.trim()) return;
    try {
      await saveMilestone({ project_id: projectId, name: name.trim(), due_on: date || null, sort: list.length });
      setName('');
      setDate('');
      setAdding(false);
      reload();
      bump();
    } catch (e) {
      toast(errorMessage(e));
    }
  }

  async function toggle(m: Milestone) {
    await saveMilestone({ ...m, done: !m.done });
    reload();
    bump();
  }

  return (
    <Section
      title="Milestones"
      count={list.length ? undefined : 0}
      action={
        <button className="section-link" onClick={() => setAdding((a) => !a)}>
          {adding ? 'Cancel' : 'Add'}
        </button>
      }
    >
      {list.length ? (
        <div className="ms-track" aria-label={`${doneCount} of ${list.length} milestones done`}>
          {list.map((m) => (
            <span key={m.id} className={`ms-seg ${m.done ? 'is-done' : m.due_on && m.due_on < today ? 'is-late' : ''}`} />
          ))}
        </div>
      ) : null}
      {list.map((m) => (
        <div key={m.id} className="item-row">
          <button className={`check ${m.done ? '' : m.due_on && m.due_on < today ? 'check-overdue' : ''}`} onClick={() => void toggle(m)} aria-pressed={m.done} aria-label={m.done ? `Mark ${m.name} not done` : `Mark ${m.name} done`}>
            <span className="check-ring">{m.done ? <Icon name="check" size={14} strokeWidth={3} /> : null}</span>
          </button>
          <span className="item-main">
            <span className={`item-title ${m.done ? 'is-struck' : ''}`}>{m.name}</span>
            {m.due_on ? <span className={`item-meta ${!m.done && m.due_on < today ? 'is-overdue' : ''}`}>{relativeDay(m.due_on, today) === shortDate(m.due_on) ? shortDate(m.due_on) : `${shortDate(m.due_on)} · ${relativeDay(m.due_on, today)}`}</span> : null}
          </span>
          <button
            className="icon-clear"
            aria-label={`Delete ${m.name}`}
            onClick={async () => {
              await deleteMilestone(m.id);
              reload();
              bump();
            }}
          >
            <Icon name="x" size={14} />
          </button>
        </div>
      ))}
      {list.length === 0 && !adding ? <EmptyLine>Add milestones such as UAT, sign-off or handover.</EmptyLine> : null}
      {adding ? (
        <div className="inline-form">
          <input className="input" placeholder="Milestone, e.g. UAT sign-off" value={name} onChange={(e) => setName(e.target.value)} aria-label="Milestone name" autoFocus onKeyDown={(e) => e.key === 'Enter' && void add()} />
          <input className="input input-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label="Milestone date" />
          <button className="button button-primary button-small" onClick={() => void add()} disabled={!name.trim()}>
            Add
          </button>
        </div>
      ) : null}
    </Section>
  );
}

function ProjectLinks({ projectId, name, links, onSaved }: { projectId: string; name: string; links: ItemLink[]; onSaved: () => void }) {
  const toast = useToast();
  const [label, setLabel] = useState('');
  const [url, setUrl] = useState('');

  async function save(next: ItemLink[]) {
    try {
      await saveProject({ id: projectId, name, links: next });
      onSaved();
    } catch (e) {
      toast(errorMessage(e));
    }
  }

  return (
    <Section title="Links">
      {links.map((l, i) => (
        <div key={`${l.url}-${i}`} className="item-row">
          <span className="row-glyph" aria-hidden="true">
            <Icon name="link" size={18} />
          </span>
          <a className="item-main" href={l.url} target="_blank" rel="noreferrer">
            <span className="item-title">{l.label || l.url}</span>
            <span className="item-meta">{l.url.replace(/^https?:\/\//, '').slice(0, 60)}</span>
          </a>
          <button className="icon-clear" aria-label={`Remove ${l.label || l.url}`} onClick={() => void save(links.filter((_, j) => j !== i))}>
            <Icon name="x" size={14} />
          </button>
        </div>
      ))}
      <div className="inline-form">
        <input className="input" placeholder="Label, e.g. Drive folder" value={label} onChange={(e) => setLabel(e.target.value)} aria-label="Link label" />
        <input className="input" placeholder="https://" inputMode="url" value={url} onChange={(e) => setUrl(e.target.value)} aria-label="Link address" />
        <button
          className="button button-primary button-small"
          disabled={!url.trim()}
          onClick={() => {
            const u = url.trim().match(/^https?:\/\//) ? url.trim() : `https://${url.trim()}`;
            void save([...links, { label: label.trim(), url: u }]);
            setLabel('');
            setUrl('');
          }}
        >
          Add
        </button>
      </div>
    </Section>
  );
}
