import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Screen } from '../components/Screen';
import { Icon } from '../components/Icon';
import { BackLink, EmptyLine, Section } from '../components/Bits';
import { ConfirmSheet } from '../components/ConfirmSheet';
import { Empty, ErrorNotice, Loading } from '../components/States';
import { useToast } from '../components/Toast';
import {
  addEntry,
  deleteEntry,
  deleteList,
  getList,
  listEntries,
  listLists,
  newId,
  saveList,
  setEntry,
  startFromTemplate,
} from '../api';
import { supabase } from '../supabase';
import { errorMessage, useBump, useQuery } from '../lib/useQuery';
import { daysBetween, relativeDay, shortDate, todayKL } from '../lib/dates';
import type { ListEntry, PlannerList } from '../types';

/** Trips and their packing lists, plus reusable templates. */
export function PackingLists() {
  const lists = useQuery(listLists, [], 'lists');
  const navigate = useNavigate();
  const toast = useToast();
  const bump = useBump();
  const [name, setName] = useState('');
  const [date, setDate] = useState('');
  const [template, setTemplate] = useState('');
  const [busy, setBusy] = useState(false);
  const today = todayKL();

  const all = lists.data ?? [];
  const templates = all.filter((l) => l.is_template && !l.archived);
  const trips = all.filter((l) => !l.is_template && !l.archived).sort((a, b) => (a.starts_on ?? '9999') < (b.starts_on ?? '9999') ? -1 : 1);
  const archived = all.filter((l) => l.archived);

  async function create(asTemplate: boolean) {
    if (!name.trim()) return;
    setBusy(true);
    try {
      const id =
        template && !asTemplate
          ? await startFromTemplate(template, name.trim(), date || null)
          : await saveList({ name: name.trim(), kind: 'packing', is_template: asTemplate, starts_on: asTemplate ? null : date || null });
      bump();
      navigate(`/packing/${id}`);
    } catch (e) {
      toast(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen title="Packing lists" sub="Personal">
      <main className="page">
        <div className="stack-tight">
          <div className="group">
            <div className="group-header">New trip</div>
            <div className="group-body">
              <label className="row-input">
                <span className="row-label">Name</span>
                <input placeholder="e.g. Penang, Dec" value={name} onChange={(e) => setName(e.target.value)} />
              </label>
              <label className="row-input">
                <span className="row-label">Leaving</span>
                <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </label>
              <label className="row-input">
                <span className="row-label">Start from</span>
                <select value={template} onChange={(e) => setTemplate(e.target.value)}>
                  <option value="">Empty list</option>
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="button-row">
              <button className="button button-primary button-small" disabled={busy || !name.trim()} onClick={() => void create(false)}>
                Create trip list
              </button>
              <button className="button button-secondary button-small" disabled={busy || !name.trim()} onClick={() => void create(true)}>
                Save as template
              </button>
            </div>
          </div>

          {lists.error && !lists.data ? <ErrorNotice message={lists.error} onRetry={lists.reload} /> : null}
          {lists.loading && !lists.data ? <Loading /> : null}

          {lists.data && !all.length ? (
            <Empty icon="suitcase" title="No lists yet" text="Make a template once (say, “Weekend trip”), then start each trip from it. Everything comes back unticked." />
          ) : null}

          {trips.length ? (
            <Section title="Trips" count={trips.length}>
              {trips.map((l) => (
                <ListRow key={l.id} list={l} today={today} />
              ))}
            </Section>
          ) : null}
          {templates.length ? (
            <Section title="Templates" count={templates.length}>
              {templates.map((l) => (
                <ListRow key={l.id} list={l} today={today} />
              ))}
            </Section>
          ) : null}
          {archived.length ? (
            <Section title="Archived" count={archived.length} collapsible defaultOpen={false}>
              {archived.map((l) => (
                <ListRow key={l.id} list={l} today={today} />
              ))}
            </Section>
          ) : null}
        </div>
      </main>
    </Screen>
  );
}

function ListRow({ list, today }: { list: PlannerList; today: string }) {
  const days = list.starts_on ? daysBetween(today, list.starts_on) : null;
  return (
    <Link to={`/packing/${list.id}`} className="row">
      <span className="row-icon">
        <Icon name={list.is_template ? 'copy' : 'suitcase'} size={18} />
      </span>
      <span className="row-label">
        {list.name}
        <span className="row-sub">
          {list.is_template
            ? 'Template'
            : list.starts_on
              ? `${shortDate(list.starts_on)}${days !== null && days >= 0 ? ` · ${days === 0 ? 'today' : `in ${days}d`}` : ''}`
              : 'No date'}
        </span>
      </span>
      <span className="row-chevron">
        <Icon name="chevron-right" size={18} />
      </span>
    </Link>
  );
}

/** One list: tick items off, add more, group them by section. */
export function PackingList() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const bump = useBump();
  const list = useQuery(() => getList(id), [id], `list-${id}`);
  const entries = useQuery(() => listEntries(id), [id], `entries-${id}`);
  const [rows, setRows] = useState<ListEntry[]>([]);
  const [text, setText] = useState('');
  const [confirm, setConfirm] = useState(false);

  useEffect(() => {
    if (entries.data) setRows(entries.data);
  }, [entries.data]);

  if (!list.data) {
    return (
      <Screen title="List" left={<BackLink to="/packing" label="Lists" />}>
        <main className="page">{list.loading ? <Loading /> : <ErrorNotice message={list.error ?? 'This list no longer exists.'} />}</main>
      </Screen>
    );
  }
  const l = list.data;
  const done = rows.filter((r) => r.done).length;

  // "Clothes: 3 shirts" files the entry under a Clothes section.
  async function add() {
    const raw = text.trim();
    if (!raw) return;
    const m = raw.match(/^([^:]{1,30}):\s*(.+)$/);
    const section = m ? m[1].trim() : null;
    const parts = (m ? m[2] : raw).split(/\s*,\s*/).filter(Boolean);
    setText('');
    try {
      let sort = rows.length;
      for (const p of parts) {
        const entry: ListEntry = { id: newId(), list_id: id, text: p, section, done: false, sort: sort++ };
        setRows((r) => [...r, entry]);
        await addEntry(id, p, section, entry.sort);
      }
      bump();
    } catch (e) {
      toast(errorMessage(e));
    }
  }

  async function toggle(e: ListEntry) {
    setRows((r) => r.map((x) => (x.id === e.id ? { ...x, done: !x.done } : x)));
    try {
      await setEntry(e.id, { done: !e.done });
    } catch (err) {
      toast(errorMessage(err));
    }
  }

  async function remove(e: ListEntry) {
    setRows((r) => r.filter((x) => x.id !== e.id));
    try {
      await deleteEntry(e.id);
    } catch (err) {
      toast(errorMessage(err));
    }
  }

  async function untickAll() {
    setRows((r) => r.map((x) => ({ ...x, done: false })));
    const { error } = await supabase.from('planner_list_entries').update({ done: false }).eq('list_id', id);
    if (error) toast(error.message);
    else toast('All unticked');
  }

  async function saveAsTemplate() {
    try {
      const tid = await saveList({ name: `${l.name} (template)`, kind: l.kind, is_template: true, starts_on: null });
      if (rows.length) {
        const { error } = await supabase
          .from('planner_list_entries')
          .insert(rows.map((r) => ({ id: newId(), list_id: tid, text: r.text, section: r.section, sort: r.sort, done: false })));
        if (error) throw new Error(error.message);
      }
      bump();
      toast('Saved as a template');
    } catch (e) {
      toast(errorMessage(e));
    }
  }

  async function archive() {
    try {
      await saveList({ id, name: l.name, archived: !l.archived });
      bump();
      toast(l.archived ? 'Restored' : 'Archived');
    } catch (e) {
      toast(errorMessage(e));
    }
  }

  async function removeList() {
    try {
      await deleteList(id);
      bump();
      navigate('/packing', { replace: true });
    } catch (e) {
      toast(errorMessage(e));
    }
  }

  const sections = new Map<string, ListEntry[]>();
  for (const r of rows) {
    const key = r.section ?? '';
    sections.set(key, [...(sections.get(key) ?? []), r]);
  }

  return (
    <Screen title={l.name} sub={l.is_template ? 'Template' : l.starts_on ? `Leaving ${relativeDay(l.starts_on)}` : 'Packing list'} left={<BackLink to="/packing" label="Lists" />}>
      <main className="page">
        <div className="stack-tight">
          {rows.length ? (
            <div className="progress" aria-label={`${done} of ${rows.length} packed`}>
              <div className="progress-fill" style={{ width: `${Math.round((done / rows.length) * 100)}%` }} />
              <span className="progress-label">
                {done} of {rows.length} packed
              </span>
            </div>
          ) : null}

          <div className="inline-form">
            <input
              className="input"
              placeholder="Add items, e.g. Clothes: shirts, socks"
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && void add()}
              aria-label="Add to the list"
            />
            <button className="button button-primary button-small" onClick={() => void add()} disabled={!text.trim()}>
              Add
            </button>
          </div>

          {entries.loading && !entries.data ? <Loading /> : null}
          {entries.data && !rows.length ? (
            <Section title="Items">
              <EmptyLine>Nothing here yet. Use “Section: a, b, c” to add several at once.</EmptyLine>
            </Section>
          ) : null}

          {[...sections.entries()].map(([section, list]) => (
            <Section key={section || 'none'} title={section || 'Items'} count={list.length}>
              {list.map((e) => (
                <div key={e.id} className={`item-row ${e.done ? 'is-done' : ''}`}>
                  <button className="check" onClick={() => void toggle(e)} aria-pressed={e.done} aria-label={e.done ? `Unpack ${e.text}` : `Pack ${e.text}`}>
                    <span className="check-ring">{e.done ? <Icon name="check" size={14} strokeWidth={3} /> : null}</span>
                  </button>
                  <span className="item-main">
                    <span className="item-title">{e.text}</span>
                  </span>
                  <button className="icon-clear" onClick={() => void remove(e)} aria-label={`Remove ${e.text}`}>
                    <Icon name="x" size={14} />
                  </button>
                </div>
              ))}
            </Section>
          ))}

          <div className="group">
            <div className="group-body">
              {done ? (
                <button className="row" onClick={() => void untickAll()}>
                  <span className="row-label">Untick everything</span>
                </button>
              ) : null}
              {!l.is_template ? (
                <button className="row" onClick={() => void saveAsTemplate()}>
                  <span className="row-label">Save as a template</span>
                </button>
              ) : null}
              <button className="row" onClick={() => void archive()}>
                <span className="row-label">{l.archived ? 'Restore' : 'Archive'}</span>
              </button>
              <button className="row row-danger" onClick={() => setConfirm(true)}>
                <span className="row-label">Delete list</span>
              </button>
            </div>
          </div>
        </div>
      </main>
      {confirm ? (
        <ConfirmSheet title={`Delete “${l.name}”?`} confirmLabel="Delete list" danger onConfirm={() => void removeList()} onCancel={() => setConfirm(false)} />
      ) : null}
    </Screen>
  );
}
