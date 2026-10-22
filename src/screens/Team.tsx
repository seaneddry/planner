import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Screen } from '../components/Screen';
import { Icon } from '../components/Icon';
import { EmptyLine, Section } from '../components/Bits';
import { Empty } from '../components/States';
import { useToast } from '../components/Toast';
import { deleteLeave, listHolidays, listLeave, saveLeave, savePerson } from '../api';
import { useRefs, useWide } from '../lib/refs';
import { errorMessage, useBump, useQuery } from '../lib/useQuery';
import { addDays, dateRange, isWeekend, shortDate, startOfWeek, todayKL, weekdayShort } from '../lib/dates';
import type { Leave } from '../types';

const KIND_LABEL: Record<Leave['kind'], string> = { annual: 'Annual', medical: 'Medical', training: 'Training', other: 'Other' };

export function Team() {
  const today = todayKL();
  const wide = useWide();
  const bump = useBump();
  const toast = useToast();
  const { people, settings } = useRefs();
  const [start, setStart] = useState(startOfWeek(today));
  const span = wide ? 28 : 14;
  const end = addDays(start, span - 1);
  const days = dateRange(start, end);
  const scopes = settings?.holiday_scopes ?? ['national', 'selangor'];
  const leave = useQuery(() => listLeave(start, addDays(today, 90) > end ? addDays(today, 90) : end), [start, end], 'team-leave');
  const holidays = useQuery(() => listHolidays(start, end, scopes), [start, end, scopes.join()]);
  const [sheet, setSheet] = useState<Partial<Leave> | null>(null);
  const [newName, setNewName] = useState('');

  const team = people.filter((p) => p.is_team);
  const holidayOn = new Map((holidays.data ?? []).map((h) => [h.holiday_on, h.name]));

  function leaveFor(personId: string, d: string): Leave | undefined {
    return (leave.data ?? []).find((l) => l.person_id === personId && l.starts_on <= d && l.ends_on >= d);
  }

  const outCount = (d: string) => team.filter((p) => leaveFor(p.id, d)).length;
  const upcoming = (leave.data ?? []).filter((l) => l.ends_on >= today).sort((a, b) => (a.starts_on < b.starts_on ? -1 : 1));

  async function addMember() {
    const name = newName.trim();
    if (!name) return;
    try {
      const handle = name.toLowerCase().split(/\s+/)[0].replace(/[^a-z0-9_.-]/g, '');
      const taken = people.some((p) => p.handle === handle);
      await savePerson({ name, handle: handle && !taken ? handle : null, is_team: true });
      setNewName('');
      bump();
    } catch (e) {
      toast(errorMessage(e));
    }
  }

  return (
    <Screen
      title="Team & leave"
      right={
        team.length ? (
          <button className="nav-icon-button" onClick={() => setSheet({ starts_on: today, ends_on: today, part: 'full', kind: 'annual' })} aria-label="Add leave">
            <Icon name="plus" size={22} />
          </button>
        ) : null
      }
    >
      <main className="page">
        {team.length === 0 ? (
          <Empty icon="users" title="Add your team" text="Add the people whose leave you track. They show in the availability grid, your morning brief and the calendar." />
        ) : null}

        <div className="inline-form team-add">
          <input className="input" placeholder="Add a team member" value={newName} onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void addMember()} aria-label="Team member name" />
          <button className="button button-secondary button-small" onClick={() => void addMember()} disabled={!newName.trim()}>
            Add
          </button>
        </div>

        {team.length ? (
          <>
            <div className="toolbar toolbar-split">
              <div className="month-switch">
                <button className="nav-icon-button" onClick={() => setStart(addDays(start, -7))} aria-label="Earlier">
                  <Icon name="chevron-left" size={20} />
                </button>
                <span className="month-title">
                  {shortDate(start)} – {shortDate(end)}
                </span>
                <button className="nav-icon-button" onClick={() => setStart(addDays(start, 7))} aria-label="Later">
                  <Icon name="chevron-right" size={20} />
                </button>
              </div>
              <div className="legend">
                <span><i className="lg lg-full" /> Leave</span>
                <span><i className="lg lg-half" /> Half day</span>
                <span><i className="lg lg-holiday" /> Holiday</span>
              </div>
            </div>

            <div className="avail-scroll">
              <table className="avail">
                <thead>
                  <tr>
                    <th scope="col" className="avail-name">Team</th>
                    {days.map((d) => (
                      <th
                        key={d}
                        scope="col"
                        className={`${isWeekend(d) ? 'is-weekend' : ''} ${holidayOn.has(d) ? 'is-holiday' : ''} ${d === today ? 'is-today' : ''}`}
                        title={holidayOn.get(d) ?? shortDate(d)}
                      >
                        <span className="avail-dow">{weekdayShort(d).charAt(0)}</span>
                        <span className="avail-num">{Number(d.slice(8))}</span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {team.map((p) => (
                    <tr key={p.id}>
                      <th scope="row" className="avail-name">
                        {p.name}
                      </th>
                      {days.map((d) => {
                        const l = leaveFor(p.id, d);
                        const off = isWeekend(d) || holidayOn.has(d);
                        return (
                          <td key={d} className={`${isWeekend(d) ? 'is-weekend' : ''} ${holidayOn.has(d) ? 'is-holiday' : ''} ${d === today ? 'is-today' : ''}`}>
                            <button
                              className={`avail-cell ${l && !off ? (l.part === 'full' ? 'is-leave' : 'is-half') : ''}`}
                              onClick={() => setSheet(l ? l : { person_id: p.id, starts_on: d, ends_on: d, part: 'full', kind: 'annual' })}
                              aria-label={`${p.name}, ${shortDate(d)}${l ? `, on ${KIND_LABEL[l.kind].toLowerCase()} leave${l.part !== 'full' ? ` (${l.part.toUpperCase()})` : ''}` : off ? ', not a working day' : ', available'}`}
                            >
                              {l && !off && l.part !== 'full' ? l.part.toUpperCase() : ''}
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                  <tr className="avail-total">
                    <th scope="row" className="avail-name">
                      Out
                    </th>
                    {days.map((d) => {
                      const n = isWeekend(d) ? 0 : outCount(d);
                      return (
                        <td key={d} className={`${isWeekend(d) ? 'is-weekend' : ''} ${holidayOn.has(d) ? 'is-holiday' : ''}`}>
                          {n ? <span className={`avail-out ${n >= Math.ceil(team.length / 2) ? 'is-hot' : ''}`}>{n}</span> : ''}
                        </td>
                      );
                    })}
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="footnote">Tap a cell to add or change leave.</p>
          </>
        ) : null}

        <div className="stack-tight" style={{ marginTop: 16 }}>
          <Section title="Upcoming leave" count={upcoming.length}>
            {upcoming.map((l) => (
              <button key={l.id} className="row" onClick={() => setSheet(l)}>
                <span className="row-label">
                  {l.person?.name ?? 'Someone'}
                  <span className="row-sub">
                    {l.starts_on === l.ends_on ? shortDate(l.starts_on) : `${shortDate(l.starts_on)} – ${shortDate(l.ends_on)}`}
                    {l.part !== 'full' ? ` (${l.part.toUpperCase()})` : ''} · {KIND_LABEL[l.kind]}
                    {l.note ? ` · ${l.note}` : ''}
                  </span>
                </span>
                <Icon name="chevron-right" size={18} />
              </button>
            ))}
            {upcoming.length === 0 ? <EmptyLine>No leave coming up.</EmptyLine> : null}
          </Section>

          <Section title="Public holidays">
            <Link to="/settings/holidays" className="row">
              <span className="row-label">
                Malaysia &amp; Selangor holidays
                <span className="row-sub">Shown on the grid, calendar and brief. Add your own or company days.</span>
              </span>
              <Icon name="chevron-right" size={18} />
            </Link>
          </Section>
        </div>
      </main>

      {sheet ? <LeaveSheet leave={sheet} onClose={() => setSheet(null)} onSaved={() => { setSheet(null); bump(); leave.reload(); }} /> : null}
    </Screen>
  );
}

function LeaveSheet({ leave, onClose, onSaved }: { leave: Partial<Leave>; onClose: () => void; onSaved: () => void }) {
  const { people } = useRefs();
  const toast = useToast();
  const team = people.filter((p) => p.is_team);
  const [personId, setPersonId] = useState(leave.person_id ?? team[0]?.id ?? '');
  const [from, setFrom] = useState(leave.starts_on ?? todayKL());
  const [to, setTo] = useState(leave.ends_on ?? leave.starts_on ?? todayKL());
  const [part, setPart] = useState<Leave['part']>(leave.part ?? 'full');
  const [kind, setKind] = useState<Leave['kind']>(leave.kind ?? 'annual');
  const [note, setNote] = useState(leave.note ?? '');
  const valid = personId && from && to && to >= from;

  async function save() {
    if (!valid) return;
    try {
      await saveLeave({ ...(leave.id ? { id: leave.id } : {}), person_id: personId, starts_on: from, ends_on: to, part: from === to ? part : 'full', kind, note: note.trim() || null });
      toast('Leave saved');
      onSaved();
    } catch (e) {
      toast(errorMessage(e));
    }
  }

  async function remove() {
    if (!leave.id) return;
    try {
      await deleteLeave(leave.id);
      toast('Leave removed');
      onSaved();
    } catch (e) {
      toast(errorMessage(e));
    }
  }

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label="Leave" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-grabber" aria-hidden="true" />
        <div className="sheet-head">
          <button className="nav-button" onClick={onClose}>
            Cancel
          </button>
          <h2>{leave.id ? 'Edit leave' : 'Add leave'}</h2>
          <button className="nav-button nav-button-strong" onClick={() => void save()} disabled={!valid}>
            Save
          </button>
        </div>
        <div className="sheet-body">
          <div className="group">
            <div className="group-body">
              <label className="row-input">
                <span className="row-label">Who</span>
                <select value={personId} onChange={(e) => setPersonId(e.target.value)}>
                  {team.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="row-input">
                <span className="row-label">From</span>
                <input
                  type="date"
                  value={from}
                  onChange={(e) => {
                    setFrom(e.target.value);
                    if (to < e.target.value) setTo(e.target.value);
                  }}
                />
              </label>
              <label className="row-input">
                <span className="row-label">To</span>
                <input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} />
              </label>
              {from === to ? (
                <label className="row-input">
                  <span className="row-label">Part</span>
                  <select value={part} onChange={(e) => setPart(e.target.value as Leave['part'])}>
                    <option value="full">Full day</option>
                    <option value="am">Morning (AM)</option>
                    <option value="pm">Afternoon (PM)</option>
                  </select>
                </label>
              ) : null}
              <label className="row-input">
                <span className="row-label">Type</span>
                <select value={kind} onChange={(e) => setKind(e.target.value as Leave['kind'])}>
                  {(Object.keys(KIND_LABEL) as Leave['kind'][]).map((k) => (
                    <option key={k} value={k}>
                      {KIND_LABEL[k]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="row-input">
                <span className="row-label">Note</span>
                <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional" />
              </label>
            </div>
          </div>
          {leave.id ? (
            <div className="group">
              <div className="group-body">
                <button className="row row-center row-danger" onClick={() => void remove()}>
                  Remove leave
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
