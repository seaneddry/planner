import { useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Screen } from '../components/Screen';
import { Icon } from '../components/Icon';
import { ItemRow } from '../components/ItemRow';
import { BackLink, EmptyLine, Section } from '../components/Bits';
import { CaptureBar, useCapture } from '../components/Capture';
import { ErrorNotice, Loading } from '../components/States';
import { useToast } from '../components/Toast';
import { RagPill } from './Projects';
import { deleteMilestone, getProject, listMilestones, listNotes, listProjectItems, saveMilestone, saveProject, newId } from '../api';
import { useRefs, useWide } from '../lib/refs';
import { errorMessage, useBump, useQuery } from '../lib/useQuery';
import { longDate, relativeDay, shortDate, todayKL, relativeInline } from '../lib/dates';
import { sortItems } from '../lib/items';
import type { Link as ItemLink, LinkGroup, Milestone, Rag } from '../types';

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

          {tab === 'links' ? <ProjectLinks projectId={p.id} name={p.name} links={p.links ?? []} groups={p.link_groups ?? []} onSaved={() => { project.reload(); bump(); }} /> : null}

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

interface LinksProps {
  projectId: string;
  name: string;
  links: ItemLink[];
  groups: LinkGroup[];
  onSaved: () => void;
}

/** Links tab: links sorted into named folders the user can add, rename and delete. */
function ProjectLinks({ projectId, name, links, groups, onSaved }: LinksProps) {
  const toast = useToast();
  const [label, setLabel] = useState('');
  const [url, setUrl] = useState('');
  const [target, setTarget] = useState('');
  const [newFolder, setNewFolder] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  const [deleting, setDeleting] = useState<LinkGroup | null>(null);
  const [moving, setMoving] = useState<number | null>(null);
  const [editing, setEditing] = useState<{ i: number; label: string; url: string } | null>(null);
  const urlRef = useRef<HTMLInputElement>(null);

  const known = new Set(groups.map((g) => g.id));
  const groupOf = (l: ItemLink) => (l.group && known.has(l.group) ? l.group : '');
  const loose = links.map((l, i) => ({ l, i })).filter(({ l }) => !groupOf(l));

  async function save(next: { links?: ItemLink[]; link_groups?: LinkGroup[] }) {
    try {
      await saveProject({ id: projectId, name, ...next });
      onSaved();
    } catch (e) {
      toast(errorMessage(e));
    }
  }

  function addLink() {
    const raw = url.trim();
    if (!raw) return;
    const u = /^https?:\/\//.test(raw) ? raw : `https://${raw}`;
    void save({ links: [...links, { label: label.trim(), url: u, ...(target ? { group: target } : {}) }] });
    setLabel('');
    setUrl('');
  }

  function addFolder() {
    const n = newFolder?.trim();
    if (!n) return;
    const g = { id: newId(), name: n };
    void save({ link_groups: [...groups, g] });
    setTarget(g.id);
    setNewFolder(null);
  }

  function renameFolder() {
    const n = renaming?.name.trim();
    if (!renaming || !n) return;
    void save({ link_groups: groups.map((g) => (g.id === renaming.id ? { ...g, name: n } : g)) });
    setRenaming(null);
  }

  function deleteFolder(g: LinkGroup, withLinks: boolean) {
    const next = withLinks
      ? links.filter((l) => l.group !== g.id)
      : links.map((l) => (l.group === g.id ? { label: l.label, url: l.url } : l));
    void save({ links: next, link_groups: groups.filter((x) => x.id !== g.id) });
    if (target === g.id) setTarget('');
    setDeleting(null);
  }

  function moveLink(i: number, group: string) {
    void save({ links: links.map((l, j) => (j === i ? (group ? { ...l, group } : { label: l.label, url: l.url }) : l)) });
    setMoving(null);
  }

  function saveEdit() {
    if (!editing) return;
    const raw = editing.url.trim();
    if (!raw) return;
    const u = /^https?:\/\//.test(raw) ? raw : `https://${raw}`;
    void save({ links: links.map((l, j) => (j === editing.i ? { ...l, label: editing.label.trim(), url: u } : l)) });
    setEditing(null);
  }

  function startAddIn(groupId: string) {
    setTarget(groupId);
    urlRef.current?.focus();
  }

  const editKeys = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') saveEdit();
    if (e.key === 'Escape') setEditing(null);
  };

  const row = ({ l, i }: { l: ItemLink; i: number }) =>
    editing?.i === i ? (
      <div key={`edit-${i}`} className="inline-form link-edit">
        <input className="input" placeholder="Label" value={editing.label} onChange={(e) => setEditing({ ...editing, label: e.target.value })} onKeyDown={editKeys} aria-label="Link label" autoFocus />
        <input className="input" placeholder="https://" inputMode="url" value={editing.url} onChange={(e) => setEditing({ ...editing, url: e.target.value })} onKeyDown={editKeys} aria-label="Link address" />
        <button className="button button-secondary button-small" onClick={() => setEditing(null)}>
          Cancel
        </button>
        <button className="button button-primary button-small" disabled={!editing.url.trim()} onClick={saveEdit}>
          Save
        </button>
      </div>
    ) : (
    <div key={`${l.url}-${i}`} className="item-row">
      <span className="row-glyph" aria-hidden="true">
        <Icon name="link" size={18} />
      </span>
      <a className="item-main" href={l.url} target="_blank" rel="noreferrer">
        <span className="item-title">{l.label || l.url}</span>
        <span className="item-meta">{l.url.replace(/^https?:\/\//, '').slice(0, 60)}</span>
      </a>
      <button className="icon-clear" aria-label={`Edit ${l.label || l.url}`} onClick={() => setEditing({ i, label: l.label, url: l.url })}>
        <Icon name="edit" size={15} />
      </button>
      {groups.length ? (
        <button className="icon-clear" aria-label={`Move ${l.label || l.url} to a folder`} onClick={() => setMoving(i)}>
          <Icon name="folder" size={15} />
        </button>
      ) : null}
      <button className="icon-clear" aria-label={`Remove ${l.label || l.url}`} onClick={() => void save({ links: links.filter((_, j) => j !== i) })}>
        <Icon name="x" size={14} />
      </button>
    </div>
    );

  const deletingCount = deleting ? links.filter((l) => l.group === deleting.id).length : 0;

  return (
    <>
      <div className="inline-form">
        <input className="input" placeholder="Label, e.g. Drive folder" value={label} onChange={(e) => setLabel(e.target.value)} aria-label="Link label" />
        <input
          ref={urlRef}
          className="input"
          placeholder="https://"
          inputMode="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && addLink()}
          aria-label="Link address"
        />
        {groups.length ? (
          <select className="input link-folder-select" value={target} onChange={(e) => setTarget(e.target.value)} aria-label="Folder">
            <option value="">No folder</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        ) : null}
        <button className="button button-primary button-small" disabled={!url.trim()} onClick={addLink}>
          Add
        </button>
      </div>

      {groups.map((g) => {
        const inGroup = links.map((l, i) => ({ l, i })).filter(({ l }) => groupOf(l) === g.id);
        if (renaming?.id === g.id) {
          return (
            <div key={g.id} className="inline-form">
              <input
                className="input"
                value={renaming.name}
                onChange={(e) => setRenaming({ id: g.id, name: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') renameFolder();
                  if (e.key === 'Escape') setRenaming(null);
                }}
                aria-label="Folder name"
                autoFocus
              />
              <button className="button button-secondary button-small" onClick={() => setRenaming(null)}>
                Cancel
              </button>
              <button className="button button-primary button-small" disabled={!renaming.name.trim()} onClick={renameFolder}>
                Save
              </button>
            </div>
          );
        }
        return (
          <Section
            key={g.id}
            title={
              <span className="link-folder-title">
                <Icon name="folder" size={15} /> {g.name}
              </span>
            }
            count={inGroup.length}
            collapsible
            action={
              <span className="link-folder-actions">
                <button className="icon-clear" aria-label={`Add a link to ${g.name}`} onClick={() => startAddIn(g.id)}>
                  <Icon name="plus" size={16} />
                </button>
                <button className="icon-clear" aria-label={`Rename ${g.name}`} onClick={() => setRenaming({ id: g.id, name: g.name })}>
                  <Icon name="edit" size={15} />
                </button>
                <button className="icon-clear" aria-label={`Delete ${g.name}`} onClick={() => setDeleting(g)}>
                  <Icon name="trash" size={15} />
                </button>
              </span>
            }
          >
            {inGroup.map(row)}
            {inGroup.length === 0 ? <EmptyLine>Empty folder. Pick it when adding a link, or move links here.</EmptyLine> : null}
          </Section>
        );
      })}

      <Section
        title={groups.length ? 'Other links' : 'Links'}
        count={groups.length ? loose.length : undefined}
        action={
          newFolder === null ? (
            <button className="section-link" onClick={() => setNewFolder('')}>
              <Icon name="folder" size={15} /> New folder
            </button>
          ) : null
        }
      >
        {newFolder !== null ? (
          <div className="inline-form">
            <input
              className="input"
              placeholder="Folder name, e.g. Design, UAT, Contracts"
              value={newFolder}
              onChange={(e) => setNewFolder(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') addFolder();
                if (e.key === 'Escape') setNewFolder(null);
              }}
              aria-label="New folder name"
              autoFocus
            />
            <button className="button button-secondary button-small" onClick={() => setNewFolder(null)}>
              Cancel
            </button>
            <button className="button button-primary button-small" disabled={!newFolder.trim()} onClick={addFolder}>
              Create
            </button>
          </div>
        ) : null}
        {loose.map(row)}
        {loose.length === 0 && newFolder === null ? (
          <EmptyLine>{links.length ? 'Every link is in a folder.' : 'No links yet. Add Drive folders, boards, staging sites…'}</EmptyLine>
        ) : null}
      </Section>

      {moving !== null ? (
        <div className="sheet-backdrop" onClick={() => setMoving(null)}>
          <div className="action-sheet" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <div className="action-group">
              <div className="action-title">Move “{links[moving]?.label || links[moving]?.url}” to</div>
              {groups.map((g) => (
                <button key={g.id} className="action" disabled={groupOf(links[moving]) === g.id} onClick={() => moveLink(moving, g.id)}>
                  {g.name}
                </button>
              ))}
              <button className="action" disabled={!groupOf(links[moving])} onClick={() => moveLink(moving, '')}>
                No folder
              </button>
            </div>
            <button className="action action-cancel" onClick={() => setMoving(null)}>
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      {deleting ? (
        <div className="sheet-backdrop" onClick={() => setDeleting(null)}>
          <div className="action-sheet" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <div className="action-group">
              <div className="action-title">
                Delete folder “{deleting.name}”?{deletingCount ? ` It has ${deletingCount} link${deletingCount === 1 ? '' : 's'}.` : ''}
              </div>
              {deletingCount ? (
                <>
                  <button className="action" onClick={() => deleteFolder(deleting, false)}>
                    Delete folder, keep links
                  </button>
                  <button className="action action-danger" onClick={() => deleteFolder(deleting, true)}>
                    Delete folder and its links
                  </button>
                </>
              ) : (
                <button className="action action-danger" onClick={() => deleteFolder(deleting, false)}>
                  Delete folder
                </button>
              )}
            </div>
            <button className="action action-cancel" onClick={() => setDeleting(null)}>
              Cancel
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
