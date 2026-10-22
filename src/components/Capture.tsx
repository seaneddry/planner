import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent, ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Icon } from './Icon';
import { useToast } from './Toast';
import { useRefs } from '../lib/refs';
import { parseCapture } from '../lib/parse';
import type { Parsed } from '../lib/parse';
import { saveCapture } from '../lib/capture';
import { errorMessage, useBump } from '../lib/useQuery';
import { relativeDay, timeLabel, todayKL } from '../lib/dates';
import { effortLabel, KINDS, PRIORITY_LABEL, REMIND_LABEL, repeatText } from '../lib/labels';
import type { ItemKind } from '../types';

interface CaptureOptions {
  projectId?: string | null;
  kind?: ItemKind;
  prefill?: string;
}

const CaptureContext = createContext<(opts?: CaptureOptions) => void>(() => {});

export function useCapture() {
  return useContext(CaptureContext);
}

/** Hosts the quick-capture sheet and the "n" keyboard shortcut. */
export function CaptureProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState<CaptureOptions | null>(null);
  const location = useLocation();
  const navigate = useNavigate();

  const show = useCallback((opts?: CaptureOptions) => setOpen(opts ?? {}), []);

  useEffect(() => {
    function onKey(e: globalThis.KeyboardEvent) {
      const t = e.target as HTMLElement | null;
      const typing = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
      if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === 'n' || e.key === 'N') {
        e.preventDefault();
        const bar = document.getElementById('capture-bar-input');
        if (bar) bar.focus();
        else setOpen({});
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Home-screen shortcut: /?capture=1
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get('capture') === '1') {
      setOpen({});
      navigate(location.pathname, { replace: true });
    }
  }, [location.search, location.pathname, navigate]);

  return (
    <CaptureContext.Provider value={show}>
      {children}
      {open ? <CaptureSheet options={open} onClose={() => setOpen(null)} /> : null}
    </CaptureContext.Provider>
  );
}

/** The parsed result of what is typed, recomputed on every keystroke. */
function useParsed(text: string, options: CaptureOptions): Parsed | null {
  const { projects, people, settings, space } = useRefs();
  return useMemo(() => {
    const line = text.trim();
    if (!line) return null;
    return parseCapture(line, {
      today: todayKL(),
      projects,
      people,
      defaultSpace: space === 'all' ? (settings?.default_space ?? 'work') : space,
      projectId: options.projectId ?? null,
      kind: options.kind,
    });
  }, [text, projects, people, settings, space, options.projectId, options.kind]);
}

function useSaver(options: CaptureOptions) {
  const { projects, people, settings, space } = useRefs();
  const bump = useBump();
  const toast = useToast();
  return useCallback(
    async (text: string): Promise<boolean> => {
      // Several lines pasted at once become several items.
      const lines = text
        .split('\n')
        .map((l) => l.replace(/^\s*(?:[-*•]|\d+[.)]|\[\s?\])\s*/, '').trim())
        .filter(Boolean);
      if (!lines.length) return false;
      try {
        let offline = false;
        for (const line of lines) {
          const parsed = parseCapture(line, {
            today: todayKL(),
            projects,
            people,
            defaultSpace: space === 'all' ? (settings?.default_space ?? 'work') : space,
            projectId: options.projectId ?? null,
            kind: options.kind,
          });
          if (!parsed.title) continue;
          await saveCapture(parsed, settings);
          if (!navigator.onLine) offline = true;
        }
        bump();
        toast(lines.length > 1 ? `Added ${lines.length} items` : offline ? 'Saved offline, will sync' : 'Added');
        return true;
      } catch (e) {
        toast(errorMessage(e));
        return false;
      }
    },
    [projects, people, settings, space, options.projectId, options.kind, bump, toast],
  );
}

export function ParsedPreview({ parsed }: { parsed: Parsed | null }) {
  const { projectById, personById } = useRefs();
  if (!parsed) return null;
  const chips: { label: string; value: string; tone?: 'new' | 'high' }[] = [];
  chips.push({ label: 'Type', value: KINDS[parsed.kind].label });
  chips.push({ label: 'Space', value: parsed.space === 'work' ? 'Work' : 'Personal' });
  if (parsed.projectId) chips.push({ label: 'Project', value: projectById.get(parsed.projectId)?.name ?? '' });
  if (parsed.newProjectTag) chips.push({ label: 'New project', value: `#${parsed.newProjectTag}`, tone: 'new' });
  if (parsed.personId) chips.push({ label: parsed.kind === 'follow_up' ? 'Waiting on' : 'Person', value: personById.get(parsed.personId)?.name ?? '' });
  if (parsed.newPersonHandle) chips.push({ label: 'New person', value: `@${parsed.newPersonHandle}`, tone: 'new' });
  if (parsed.dueOn) chips.push({ label: 'Due', value: `${relativeDay(parsed.dueOn)}${parsed.dueTime ? ' ' + timeLabel(parsed.dueTime) : ''}` });
  else if (parsed.dueTime) chips.push({ label: 'Time', value: timeLabel(parsed.dueTime) });
  if (parsed.priority) chips.push({ label: 'Priority', value: PRIORITY_LABEL[parsed.priority], tone: parsed.priority === 3 ? 'high' : undefined });
  if (parsed.effortMin) chips.push({ label: 'Effort', value: effortLabel(parsed.effortMin) });
  if (parsed.place) chips.push({ label: 'Where', value: parsed.place });
  if (parsed.repeat) chips.push({ label: 'Repeats', value: repeatText(parsed.repeat, parsed.repeatEvery) });
  if (parsed.remind) chips.push({ label: 'Remind', value: parsed.remind === 'custom' && parsed.remindTime ? timeLabel(parsed.remindTime) : REMIND_LABEL[parsed.remind] });

  return (
    <div className="parsed" aria-live="polite">
      <div className="parsed-title">{parsed.title || <span className="muted">Add a title</span>}</div>
      <div className="parsed-chips">
        {chips.map((c) => (
          <span key={c.label + c.value} className={`parsed-chip ${c.tone ? `parsed-chip-${c.tone}` : ''}`}>
            <span className="parsed-chip-label">{c.label}</span> {c.value}
          </span>
        ))}
      </div>
    </div>
  );
}

const HINTS: { token: string; label: string }[] = [
  { token: '#', label: 'project' },
  { token: '@', label: 'person' },
  { token: '!high', label: 'priority' },
  { token: '~30m', label: 'effort' },
  { token: '+', label: 'place' },
  { token: '^1d', label: 'remind' },
  { token: '/p', label: 'personal' },
  { token: '/w', label: 'work' },
];

function CaptureSheet({ options, onClose }: { options: CaptureOptions; onClose: () => void }) {
  const [text, setText] = useState(options.prefill ?? '');
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLTextAreaElement>(null);
  const parsed = useParsed(text.split('\n')[0], options);
  const save = useSaver(options);
  const multi = text.trim().includes('\n');

  useEffect(() => {
    input.current?.focus();
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function submit() {
    if (busy || !text.trim()) return;
    setBusy(true);
    const ok = await save(text);
    setBusy(false);
    if (ok) onClose();
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void submit();
    }
  }

  function insert(token: string) {
    setText((t) => (t && !t.endsWith(' ') ? `${t} ${token}` : `${t}${token}`));
    input.current?.focus();
  }

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet capture-sheet" role="dialog" aria-modal="true" aria-label="Quick capture" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-grabber" aria-hidden="true" />
        <div className="sheet-head">
          <button className="nav-button" onClick={onClose}>
            Cancel
          </button>
          <h2>Quick capture</h2>
          <button className="nav-button nav-button-strong" onClick={() => void submit()} disabled={busy || !text.trim()}>
            {busy ? 'Adding…' : 'Add'}
          </button>
        </div>
        <div className="sheet-body">
          <label className="sr-only" htmlFor="capture-input">
            What needs doing
          </label>
          <textarea
            id="capture-input"
            ref={input}
            className="capture-input"
            rows={2}
            placeholder="e.g. nudge @client on UAT feedback fri #porsche !high"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={onKeyDown}
            enterKeyHint="done"
            autoCapitalize="sentences"
          />
          {multi ? (
            <p className="footnote">Each line will be added as its own item.</p>
          ) : (
            <ParsedPreview parsed={parsed} />
          )}
          <div className="hint-chips">
            {HINTS.map((h) => (
              <button key={h.token} type="button" className="hint-chip" onClick={() => insert(h.token)}>
                <b>{h.token}</b> {h.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Inline capture bar for laptop screens. Press N anywhere to jump into it. */
export function CaptureBar({ projectId, kind, placeholder }: { projectId?: string | null; kind?: ItemKind; placeholder?: string }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const options = useMemo(() => ({ projectId, kind }), [projectId, kind]);
  const parsed = useParsed(text, options);
  const save = useSaver(options);

  async function submit() {
    if (busy || !text.trim()) return;
    setBusy(true);
    const ok = await save(text);
    setBusy(false);
    if (ok) setText('');
  }

  return (
    <div className={`capture-bar ${text ? 'is-active' : ''}`}>
      <div className="capture-bar-row">
        <Icon name="plus" size={18} />
        <label className="sr-only" htmlFor={projectId || kind ? undefined : 'capture-bar-input'}>
          Quick capture
        </label>
        <input
          id={projectId || kind ? undefined : 'capture-bar-input'}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              void submit();
            }
            if (e.key === 'Escape') {
              setText('');
              (e.target as HTMLInputElement).blur();
            }
          }}
          onPaste={(e) => {
            const pasted = e.clipboardData.getData('text');
            if (pasted.includes('\n')) {
              e.preventDefault();
              void save(pasted);
            }
          }}
          placeholder={placeholder ?? 'Add anything… e.g. nudge @client on UAT fri #porsche !high'}
          autoComplete="off"
        />
        {!projectId && !kind ? <kbd className="kbd">N</kbd> : null}
      </div>
      {text ? <ParsedPreview parsed={parsed} /> : null}
    </div>
  );
}
