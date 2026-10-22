import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Screen } from '../components/Screen';
import { Icon } from '../components/Icon';
import { ItemRow } from '../components/ItemRow';
import { EmptyLine, Section } from '../components/Bits';
import { ErrorNotice } from '../components/States';
import { listNotes, searchItems } from '../api';
import { useRefs } from '../lib/refs';
import { useOpenItems } from '../lib/items';
import { useQuery } from '../lib/useQuery';
import { shortDate } from '../lib/dates';
import type { Item } from '../types';

/** Searches items (open and done), projects, people and meeting notes. */
export function Search() {
  const [q, setQ] = useState('');
  const [term, setTerm] = useState('');
  const { projects, people } = useRefs();
  const open = useOpenItems();

  // Wait for a pause in typing before asking the server.
  useEffect(() => {
    const t = window.setTimeout(() => setTerm(q.trim()), 250);
    return () => window.clearTimeout(t);
  }, [q]);

  const remote = useQuery(() => (term.length >= 2 ? searchItems(term) : Promise.resolve([] as Item[])), [term]);
  const notes = useQuery(() => listNotes(), [], 'notes');

  const lower = term.toLowerCase();
  const matches = (s: string | null | undefined) => Boolean(s && s.toLowerCase().includes(lower));

  // Offline, fall back to searching the saved open items.
  const items = useMemo(() => {
    if (term.length < 2) return [];
    if (remote.data && !remote.error) return remote.data;
    return (open.data ?? []).filter((i) => matches(i.title) || matches(i.notes) || matches(i.place));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [term, remote.data, remote.error, open.data]);

  const openItems = items.filter((i) => i.status === 'open');
  const doneItems = items.filter((i) => i.status !== 'open');
  const proj = term.length >= 1 ? projects.filter((p) => matches(p.name) || matches(p.tag) || matches(p.client)) : [];
  const ppl = term.length >= 1 ? people.filter((p) => matches(p.name) || matches(p.handle) || matches(p.org)) : [];
  const nts = term.length >= 2 ? (notes.data ?? []).filter((n) => matches(n.title) || matches(n.body) || matches(n.attendees)).slice(0, 20) : [];
  const nothing = term.length >= 2 && !remote.loading && !items.length && !proj.length && !ppl.length && !nts.length;

  return (
    <Screen title="Search">
      <div className="search-bar">
        <label className="search-field">
          <Icon name="search" size={18} />
          <span className="sr-only">Search</span>
          <input type="search" autoFocus placeholder="Tasks, projects, people, notes" value={q} onChange={(e) => setQ(e.target.value)} />
          {q ? (
            <button className="search-clear" onClick={() => setQ('')} aria-label="Clear search">
              <Icon name="x" size={12} strokeWidth={3} />
            </button>
          ) : null}
        </label>
      </div>
      <main className="page">
        {remote.error && !remote.data ? <ErrorNotice message={remote.error} /> : null}
        <div className="stack-tight">
          {term.length < 2 ? <p className="footnote">Type at least two letters.</p> : null}
          {nothing ? <EmptyLine>No matches for “{term}”.</EmptyLine> : null}

          {proj.length ? (
            <Section title="Projects" count={proj.length}>
              {proj.map((p) => (
                <Link key={p.id} to={`/projects/${p.id}`} className="row">
                  <span className={`rag-dot rag-${p.rag ?? 'none'}`} aria-hidden="true" />
                  <span className="row-label">
                    {p.name}
                    <span className="row-sub">{[p.client, p.tag ? `#${p.tag}` : null].filter(Boolean).join(' · ') || (p.space === 'work' ? 'Work' : 'Personal')}</span>
                  </span>
                  <span className="row-chevron">
                    <Icon name="chevron-right" size={18} />
                  </span>
                </Link>
              ))}
            </Section>
          ) : null}

          {ppl.length ? (
            <Section title="People" count={ppl.length}>
              {ppl.map((p) => (
                <Link key={p.id} to="/team" className="row">
                  <span className="row-label">
                    {p.name}
                    <span className="row-sub">{[p.handle ? `@${p.handle}` : null, p.role, p.org].filter(Boolean).join(' · ') || (p.is_team ? 'Team' : 'Contact')}</span>
                  </span>
                </Link>
              ))}
            </Section>
          ) : null}

          {openItems.length ? (
            <Section title="Open" count={openItems.length}>
              {openItems.map((i) => (
                <ItemRow key={i.id} item={i} />
              ))}
            </Section>
          ) : null}

          {nts.length ? (
            <Section title="Meeting notes" count={nts.length}>
              {nts.map((n) => (
                <Link key={n.id} to={`/notes/${n.id}`} className="row">
                  <span className="row-label">
                    {n.title}
                    <span className="row-sub">{shortDate(n.met_on)}</span>
                  </span>
                  <span className="row-chevron">
                    <Icon name="chevron-right" size={18} />
                  </span>
                </Link>
              ))}
            </Section>
          ) : null}

          {doneItems.length ? (
            <Section title="Done" count={doneItems.length} collapsible defaultOpen={false}>
              {doneItems.map((i) => (
                <ItemRow key={i.id} item={i} />
              ))}
            </Section>
          ) : null}
        </div>
      </main>
    </Screen>
  );
}
