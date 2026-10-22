import { useEffect, useMemo, useRef, useState } from 'react';
import { Screen } from '../components/Screen';
import { Icon } from '../components/Icon';
import { ItemRow } from '../components/ItemRow';
import { EmptyLine, Section, SpaceSwitch } from '../components/Bits';
import { useToast } from '../components/Toast';
import { getReview, listDoneBetween, listMilestones, saveReview } from '../api';
import { inSpace, sortItems, useOpenItems, waitingDays } from '../lib/items';
import { useRefs, useWide } from '../lib/refs';
import { errorMessage, useQuery } from '../lib/useQuery';
import { addDays, relativeDay, shortDate, startOfWeek, todayKL } from '../lib/dates';
import { RAG_LABEL } from './Projects';
import type { Item } from '../types';

export function Review() {
  const today = todayKL();
  const wide = useWide();
  const toast = useToast();
  const { space, projectById, personById, projects } = useRefs();
  const [weekStart, setWeekStart] = useState(startOfWeek(today));
  const weekEnd = addDays(weekStart, 6);
  const nextStart = addDays(weekStart, 7);
  const nextEnd = addDays(weekStart, 13);
  const isCurrent = weekStart === startOfWeek(today);

  const open = useOpenItems();
  const done = useQuery(() => listDoneBetween(weekStart, weekEnd), [weekStart], `done-week-${weekStart}`);
  const milestones = useQuery(() => listMilestones(), [], 'milestones');
  const review = useQuery(() => getReview(weekStart), [weekStart]);

  const doneList = (done.data ?? []).filter((i) => inSpace(i, space));
  const openList = (open.data ?? []).filter((i) => inSpace(i, space));
  // This week, only days already gone count as slipped; today's items still have time.
  const cutoff = isCurrent ? addDays(today, -1) : weekEnd;
  const slipped = openList.filter((i) => i.kind !== 'follow_up' && i.due_on && i.due_on <= cutoff && i.due_on >= weekStart).sort(sortItems);
  const olderOverdue = openList.filter((i) => i.kind !== 'follow_up' && i.due_on && i.due_on < weekStart).sort(sortItems);
  const waiting = openList.filter((i) => i.kind === 'follow_up').sort((a, b) => waitingDays(b) - waitingDays(a));
  const nextWeek = openList.filter((i) => i.due_on && i.due_on >= nextStart && i.due_on <= nextEnd).sort(sortItems);
  const ms = (milestones.data ?? []).filter((m) => !m.done && m.due_on && m.due_on >= weekStart && m.due_on <= nextEnd);

  const byProject = useMemo(() => {
    const m = new Map<string, Item[]>();
    for (const i of doneList) {
      const k = i.project_id ? (projectById.get(i.project_id)?.name ?? 'Project') : i.space === 'work' ? 'Other work' : 'Personal';
      m.set(k, [...(m.get(k) ?? []), i]);
    }
    return [...m.entries()].sort((a, b) => b[1].length - a[1].length);
  }, [doneList, projectById]);

  // Reflection fields, saved when you leave each box.
  const [wins, setWins] = useState('');
  const [lessons, setLessons] = useState('');
  const [focus, setFocus] = useState('');
  const loadedFor = useRef<string | null>(null);
  useEffect(() => {
    if (review.loading || loadedFor.current === weekStart) return;
    loadedFor.current = weekStart;
    setWins(review.data?.wins ?? '');
    setLessons(review.data?.lessons ?? '');
    setFocus(review.data?.focus ?? '');
  }, [review.loading, review.data, weekStart]);

  async function persist() {
    try {
      await saveReview(weekStart, { wins: wins.trim() || null, lessons: lessons.trim() || null, focus: focus.trim() || null });
    } catch (e) {
      toast(errorMessage(e));
    }
  }

  function statusUpdate(): string {
    const lines: string[] = [`Weekly update, ${shortDate(weekStart)} – ${shortDate(weekEnd)}`, ''];
    const work = projects.filter((p) => p.space === 'work' && p.status !== 'done');
    for (const p of work) {
      const d = (done.data ?? []).filter((i) => i.project_id === p.id);
      const n = (open.data ?? []).filter((i) => i.project_id === p.id && i.kind !== 'follow_up' && i.due_on && i.due_on >= nextStart && i.due_on <= nextEnd);
      const w = (open.data ?? []).filter((i) => i.project_id === p.id && i.kind === 'follow_up');
      const pm = (milestones.data ?? []).filter((m) => m.project_id === p.id && !m.done && m.due_on && m.due_on <= addDays(nextEnd, 14));
      if (!d.length && !n.length && !w.length && !pm.length) continue;
      lines.push(`${p.name}${p.rag ? ` (${RAG_LABEL[p.rag]})` : ''}`);
      if (d.length) lines.push(`  Done: ${d.map((i) => i.title).join('; ')}`);
      if (n.length) lines.push(`  Next: ${n.map((i) => i.title).join('; ')}`);
      if (w.length) lines.push(`  Waiting on: ${w.map((i) => `${i.title}${i.person_id ? ` (${personById.get(i.person_id)?.name})` : ''}`).join('; ')}`);
      if (pm.length) lines.push(`  Milestones: ${pm.map((m) => `${m.name} ${shortDate(m.due_on!)}`).join('; ')}`);
      lines.push('');
    }
    if (focus.trim()) lines.push(`Focus next week: ${focus.trim()}`);
    return lines.join('\n').trim();
  }

  async function copyUpdate() {
    const text = statusUpdate();
    try {
      if (!wide && navigator.share) await navigator.share({ text });
      else {
        await navigator.clipboard.writeText(text);
        toast('Status update copied');
      }
    } catch {
      /* cancelled */
    }
  }

  const tiles = [
    { label: 'Done', value: doneList.length },
    { label: 'Slipped', value: slipped.length, tone: slipped.length ? 'danger' : '' },
    { label: 'Waiting', value: waiting.length },
    { label: 'Due next week', value: nextWeek.length },
  ];

  return (
    <Screen
      title="Weekly review"
      sub={`${shortDate(weekStart)} – ${shortDate(weekEnd)}`}
      right={
        <button className="nav-button" onClick={() => void copyUpdate()}>
          <Icon name="copy" size={18} /> {wide ? 'Copy status update' : 'Share'}
        </button>
      }
    >
      <main className="page">
        <div className="toolbar toolbar-split">
          <div className="month-switch">
            <button className="nav-icon-button" onClick={() => setWeekStart(addDays(weekStart, -7))} aria-label="Previous week">
              <Icon name="chevron-left" size={20} />
            </button>
            <span className="month-title">{isCurrent ? 'This week' : `Week of ${shortDate(weekStart)}`}</span>
            <button className="nav-icon-button" onClick={() => setWeekStart(addDays(weekStart, 7))} aria-label="Next week">
              <Icon name="chevron-right" size={20} />
            </button>
          </div>
          <SpaceSwitch />
        </div>

        <div className="kpi-grid review-tiles">
          {tiles.map((t) => (
            <div key={t.label} className="kpi">
              <span className="kpi-label">{t.label}</span>
              <span className={`kpi-value ${t.tone === 'danger' ? 'is-danger' : ''}`}>{t.value}</span>
            </div>
          ))}
        </div>

        <div className={wide ? 'two-col' : 'stack-tight'}>
          <div className="col-main stack-tight">
            <Section title="Done this week" count={doneList.length}>
              {byProject.length === 0 ? <EmptyLine>Nothing ticked off yet.</EmptyLine> : null}
              {byProject.map(([name, list]) => (
                <div key={name}>
                  <div className="sub-head">
                    {name} · {list.length}
                  </div>
                  {list.map((i) => (
                    <ItemRow key={i.id} item={i} hideProject />
                  ))}
                </div>
              ))}
            </Section>

            {slipped.length || olderOverdue.length ? (
              <Section title="Slipped" count={slipped.length + olderOverdue.length} tone="danger" footer="Snooze what can wait, drop what no longer matters.">
                {[...slipped, ...olderOverdue].map((i) => (
                  <ItemRow key={i.id} item={i} showSnooze />
                ))}
              </Section>
            ) : null}

            <Section title="Coming up next week" count={nextWeek.length}>
              {nextWeek.map((i) => (
                <ItemRow key={i.id} item={i} />
              ))}
              {ms.map((m) => (
                <div key={m.id} className="info-row info-milestone">
                  <span className="diamond" aria-hidden="true" /> {projectById.get(m.project_id)?.name}: {m.name} · {relativeDay(m.due_on!)}
                </div>
              ))}
              {nextWeek.length + ms.length === 0 ? <EmptyLine>Nothing dated for next week yet.</EmptyLine> : null}
            </Section>
          </div>

          <div className="col-side stack-tight">
            {waiting.length ? (
              <Section title="Still waiting on" count={waiting.length}>
                {waiting.slice(0, 10).map((i) => (
                  <ItemRow key={i.id} item={i} />
                ))}
              </Section>
            ) : null}

            <Section title="Reflection">
              <label className="reflect">
                <span>What went well</span>
                <textarea rows={3} value={wins} onChange={(e) => setWins(e.target.value)} onBlur={() => void persist()} />
              </label>
              <label className="reflect">
                <span>What to do differently</span>
                <textarea rows={3} value={lessons} onChange={(e) => setLessons(e.target.value)} onBlur={() => void persist()} />
              </label>
              <label className="reflect">
                <span>Focus for next week</span>
                <textarea rows={2} value={focus} onChange={(e) => setFocus(e.target.value)} onBlur={() => void persist()} />
              </label>
            </Section>
          </div>
        </div>
      </main>
    </Screen>
  );
}
