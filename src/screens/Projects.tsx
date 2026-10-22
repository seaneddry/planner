import { Link } from 'react-router-dom';
import { Screen } from '../components/Screen';
import { Icon } from '../components/Icon';
import { Section } from '../components/Bits';
import { Empty } from '../components/States';
import { listMilestones } from '../api';
import { useRefs } from '../lib/refs';
import { useOpenItems } from '../lib/items';
import { useQuery } from '../lib/useQuery';
import { relativeDay, todayKL } from '../lib/dates';
import type { Project } from '../types';

export const RAG_LABEL = { green: 'On track', amber: 'At risk', red: 'Off track' } as const;

export function RagPill({ rag }: { rag: Project['rag'] }) {
  if (!rag) return null;
  return <span className={`rag-pill rag-pill-${rag}`}>{RAG_LABEL[rag]}</span>;
}

export function Projects() {
  const { projects } = useRefs();
  const items = useOpenItems();
  const milestones = useQuery(() => listMilestones(), [], 'milestones');
  const today = todayKL();

  const counts = new Map<string, { open: number; waiting: number; overdue: number }>();
  for (const i of items.data ?? []) {
    if (!i.project_id) continue;
    const c = counts.get(i.project_id) ?? { open: 0, waiting: 0, overdue: 0 };
    if (i.kind === 'follow_up') c.waiting++;
    else c.open++;
    if (i.due_on && i.due_on < today) c.overdue++;
    counts.set(i.project_id, c);
  }
  const nextMs = new Map<string, { name: string; due_on: string }>();
  for (const m of milestones.data ?? []) {
    if (m.done || !m.due_on || m.due_on < today || nextMs.has(m.project_id)) continue;
    nextMs.set(m.project_id, { name: m.name, due_on: m.due_on });
  }

  const groups: { title: string; list: Project[]; open: boolean }[] = [
    { title: 'Work', list: projects.filter((p) => p.status === 'active' && p.space === 'work'), open: true },
    { title: 'Personal', list: projects.filter((p) => p.status === 'active' && p.space === 'personal'), open: true },
    { title: 'On hold', list: projects.filter((p) => p.status === 'on_hold'), open: true },
    { title: 'Done', list: projects.filter((p) => p.status === 'done'), open: false },
  ];

  return (
    <Screen
      title="Projects"
      right={
        <Link to="/projects/new" className="nav-icon-button" aria-label="New project">
          <Icon name="plus" size={22} />
        </Link>
      }
    >
      <main className="page">
        {projects.length === 0 ? (
          <Empty
            icon="folder"
            title="No projects yet"
            text="Add the projects you run. Then type #tag in quick capture to file things under them."
            action={
              <Link to="/projects/new" className="button button-primary">
                New project
              </Link>
            }
          />
        ) : null}
        <div className="stack-tight">
          {groups
            .filter((g) => g.list.length)
            .map((g) => (
              <Section key={g.title} title={g.title} count={g.list.length} collapsible={g.title === 'Done'} defaultOpen={g.open} plain>
                <div className="project-grid">
                  {g.list.map((p) => {
                    const c = counts.get(p.id);
                    const m = nextMs.get(p.id);
                    return (
                      <Link key={p.id} to={`/projects/${p.id}`} className="project-card">
                        <span className="project-card-top">
                          <span className={`rag-dot rag-${p.rag ?? 'none'}`} aria-hidden="true" />
                          <span className="project-name">{p.name}</span>
                          <RagPill rag={p.rag} />
                        </span>
                        <span className="project-meta">
                          {[p.phase, p.client, p.pic ? `PIC ${p.pic}` : null, p.tag ? `#${p.tag}` : null].filter(Boolean).join(' · ') || ' '}
                        </span>
                        <span className="project-stats">
                          <span>{c?.open ?? 0} open</span>
                          {c?.waiting ? <span>{c.waiting} waiting</span> : null}
                          {c?.overdue ? <span className="is-danger">{c.overdue} overdue</span> : null}
                          {m ? (
                            <span className="project-next">
                              <span className="diamond" aria-hidden="true" /> {m.name} · {relativeDay(m.due_on, today)}
                            </span>
                          ) : null}
                        </span>
                      </Link>
                    );
                  })}
                </div>
              </Section>
            ))}
        </div>
      </main>
    </Screen>
  );
}
