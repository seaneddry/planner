import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { getSettings, listPeople, listProjects } from '../api';
import { useQuery } from './useQuery';
import type { Person, Project, Settings, SpaceFilter } from '../types';

/**
 * Data almost every screen needs: settings, projects and people, plus the Work/Personal filter.
 * Loaded once, cached for offline use, and refreshed after every save.
 */
interface Refs {
  settings: Settings | undefined;
  projects: Project[];
  people: Person[];
  projectById: Map<string, Project>;
  personById: Map<string, Person>;
  space: SpaceFilter;
  setSpace: (s: SpaceFilter) => void;
  ready: boolean;
}

const RefsContext = createContext<Refs | null>(null);

const SPACE_KEY = 'planner:space';

export function RefsProvider({ children }: { children: ReactNode }) {
  const settings = useQuery(getSettings, [], 'settings');
  const projects = useQuery(listProjects, [], 'projects');
  const people = useQuery(listPeople, [], 'people');

  const [space, setSpaceState] = useState<SpaceFilter>(() => {
    try {
      const v = localStorage.getItem(SPACE_KEY);
      return v === 'work' || v === 'personal' ? v : 'all';
    } catch {
      return 'all';
    }
  });

  const setSpace = useCallback((s: SpaceFilter) => {
    setSpaceState(s);
    try {
      localStorage.setItem(SPACE_KEY, s);
    } catch {
      /* ignore */
    }
  }, []);

  const value = useMemo<Refs>(() => {
    const p = projects.data ?? [];
    const pe = people.data ?? [];
    return {
      settings: settings.data,
      projects: p,
      people: pe,
      projectById: new Map(p.map((x) => [x.id, x])),
      personById: new Map(pe.map((x) => [x.id, x])),
      space,
      setSpace,
      ready: settings.data !== undefined,
    };
  }, [settings.data, projects.data, people.data, space, setSpace]);

  return <RefsContext.Provider value={value}>{children}</RefsContext.Provider>;
}

export function useRefs(): Refs {
  const ctx = useContext(RefsContext);
  if (!ctx) throw new Error('useRefs must be used inside RefsProvider');
  return ctx;
}

/** True on a laptop-sized screen. */
export function useWide(): boolean {
  const query = '(min-width: 900px)';
  const [wide, setWide] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setWide(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return wide;
}
