import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Screen } from '../components/Screen';
import { ErrorNotice } from '../components/States';
import { ConfirmSheet } from '../components/ConfirmSheet';
import { useToast } from '../components/Toast';
import { deleteProject, getProject, saveProject } from '../api';
import { useRefs } from '../lib/refs';
import { errorMessage, useBump, useQuery } from '../lib/useQuery';
import type { Project, Rag, Space } from '../types';

function slug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .split('-')[0]
    .slice(0, 20);
}

export function ProjectForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const bump = useBump();
  const { projects } = useRefs();
  const existing = useQuery(() => (id ? getProject(id) : Promise.resolve(null)), [id]);
  const [name, setName] = useState('');
  const [tag, setTag] = useState('');
  const [tagTouched, setTagTouched] = useState(false);
  const [space, setSpace] = useState<Space>('work');
  const [status, setStatus] = useState<Project['status']>('active');
  const [rag, setRag] = useState<Rag | ''>('');
  const [client, setClient] = useState('');
  const [pic, setPic] = useState('');
  const [phase, setPhase] = useState('');
  const [summary, setSummary] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const loaded = useRef(false);

  useEffect(() => {
    const p = existing.data;
    if (!p || loaded.current) return;
    loaded.current = true;
    setName(p.name);
    setTag(p.tag ?? '');
    setTagTouched(true);
    setSpace(p.space);
    setStatus(p.status);
    setRag(p.rag ?? '');
    setClient(p.client ?? '');
    setPic(p.pic ?? '');
    setPhase(p.phase ?? '');
    setSummary(p.summary ?? '');
  }, [existing.data]);

  useEffect(() => {
    if (!tagTouched) setTag(slug(name));
  }, [name, tagTouched]);

  const cleanTag = tag.trim().toLowerCase().replace(/^#/, '');
  const tagTaken = cleanTag !== '' && projects.some((p) => p.tag === cleanTag && p.id !== id);
  const tagBad = cleanTag !== '' && !/^[a-z0-9][a-z0-9_-]*$/.test(cleanTag);
  const valid = name.trim() !== '' && !tagTaken && !tagBad;

  async function save() {
    if (!valid) return;
    setBusy(true);
    setError(null);
    try {
      const pid = await saveProject({
        ...(id ? { id } : {}),
        name: name.trim(),
        tag: cleanTag || null,
        space,
        status,
        rag: rag || null,
        client: client.trim() || null,
        pic: pic.trim() || null,
        phase: phase.trim() || null,
        summary: summary.trim() || null,
      });
      bump();
      toast(id ? 'Saved' : `Added ${name.trim()}`);
      navigate(`/projects/${pid}`, { replace: true });
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  }

  async function remove() {
    if (!id) return;
    try {
      await deleteProject(id);
      bump();
      toast('Project deleted. Its items were kept.');
      navigate('/projects', { replace: true });
    } catch (e) {
      toast(errorMessage(e));
    }
  }

  return (
    <Screen
      title={id ? 'Edit project' : 'New project'}
      compact
      className="screen-form"
      left={
        <button className="nav-button" onClick={() => navigate(-1)}>
          Cancel
        </button>
      }
      right={
        <button className="nav-button nav-button-strong" disabled={!valid || busy} onClick={() => void save()}>
          Save
        </button>
      }
    >
      <main className="page form-page">
        {error ? <ErrorNotice message={error} /> : null}
        <div className="group">
          <div className="group-body">
            <label className="row-input">
              <span className="row-label">Name</span>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Porsche BEV" autoFocus={!id} />
            </label>
            <label className="row-input">
              <span className="row-label">Tag</span>
              <input
                value={tag}
                onChange={(e) => {
                  setTag(e.target.value);
                  setTagTouched(true);
                }}
                placeholder="porsche"
                autoCapitalize="none"
                autoCorrect="off"
              />
            </label>
          </div>
          <div className="group-footer">
            {tagTaken ? 'Another project already uses this tag.' : tagBad ? 'Use letters, numbers and dashes only.' : `Type #${cleanTag || 'tag'} in quick capture to file things here.`}
          </div>
        </div>

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
              <span className="row-label">Status</span>
              <select value={status} onChange={(e) => setStatus(e.target.value as Project['status'])}>
                <option value="active">Active</option>
                <option value="on_hold">On hold</option>
                <option value="done">Done</option>
              </select>
            </label>
            <label className="row-input">
              <span className="row-label">Health</span>
              <select value={rag} onChange={(e) => setRag(e.target.value as Rag | '')}>
                <option value="">Not set</option>
                <option value="green">Green, on track</option>
                <option value="amber">Amber, at risk</option>
                <option value="red">Red, off track</option>
              </select>
            </label>
            <label className="row-input">
              <span className="row-label">Phase</span>
              <input value={phase} onChange={(e) => setPhase(e.target.value)} placeholder="e.g. UAT, change request" />
            </label>
            <label className="row-input">
              <span className="row-label">Client</span>
              <input value={client} onChange={(e) => setClient(e.target.value)} />
            </label>
            <label className="row-input">
              <span className="row-label">Client PIC</span>
              <input value={pic} onChange={(e) => setPic(e.target.value)} />
            </label>
          </div>
        </div>

        <div className="group">
          <div className="group-header">Summary</div>
          <div className="group-body">
            <textarea className="notes-input" rows={3} value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="Scope, context, anything worth remembering" aria-label="Summary" />
          </div>
        </div>

        {id ? (
          <div className="group">
            <div className="group-body">
              <button className="row row-center row-danger" onClick={() => setConfirm(true)}>
                Delete project
              </button>
            </div>
            <div className="group-footer">Its tasks and notes stay, just without a project.</div>
          </div>
        ) : null}

        <button className="button button-primary button-block form-save" onClick={() => void save()} disabled={!valid || busy}>
          {busy ? 'Saving…' : id ? 'Save changes' : 'Create project'}
        </button>
      </main>
      {confirm ? <ConfirmSheet title="Delete this project?" confirmLabel="Delete project" danger onConfirm={() => void remove()} onCancel={() => setConfirm(false)} /> : null}
    </Screen>
  );
}
