import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { Icon } from './Icon';
import { useRefs } from '../lib/refs';
import { countBadges, useOpenItems } from '../lib/items';
import { KINDS } from '../lib/labels';
import type { ItemKind } from '../types';

export const PERSONAL_LISTS: { kind: ItemKind; path: string }[] = [
  { kind: 'errand', path: '/lists/errand' },
  { kind: 'shopping', path: '/lists/shopping' },
  { kind: 'renewal', path: '/lists/renewal' },
  { kind: 'maintenance', path: '/lists/maintenance' },
  { kind: 'occasion', path: '/lists/occasion' },
  { kind: 'appointment', path: '/lists/appointment' },
];

const cls = ({ isActive }: { isActive: boolean }) => `side-link ${isActive ? 'active' : ''}`;

/** The + button opens the full new-task screen, pre-filled from the current project or list. */
function newItemPath(pathname: string): string {
  const project = pathname.match(/^\/projects\/([^/]+)$/);
  if (project && project[1] !== 'new') return `/item/new?project=${project[1]}`;
  const list = pathname.match(/^\/lists\/([^/]+)$/);
  if (list) return `/item/new?kind=${list[1]}`;
  return '/item/new';
}

/** Floating glass capsule with the four main screens, plus a round glass + button (as in Garage). */
export function TabBar() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const items = useOpenItems();
  const { due } = countBadges(items.data);
  const tab = ({ isActive }: { isActive: boolean }) => `tab ${isActive ? 'active' : ''}`;
  return (
    <nav className="tabbar" aria-label="Main">
      <div className="tab-capsule">
        <NavLink to="/" end className={tab} aria-label={due ? `Today, ${due} due` : 'Today'}>
          <span className="tab-icon">
            <Icon name="circle-check" />
            {due > 0 ? <span className="tab-badge">{due}</span> : null}
          </span>
          <span>Today</span>
        </NavLink>
        <NavLink to="/upcoming" className={tab}>
          <Icon name="list" />
          <span>Upcoming</span>
        </NavLink>
        <NavLink to="/projects" className={tab}>
          <Icon name="folder" />
          <span>Projects</span>
        </NavLink>
        <NavLink to="/more" className={tab}>
          <Icon name="grid" />
          <span>More</span>
        </NavLink>
      </div>
      <button className="tab-fab" onClick={() => navigate(newItemPath(pathname))} aria-label="New task">
        <Icon name="plus" size={26} strokeWidth={2.4} />
      </button>
    </nav>
  );
}

/** Sidebar on laptop screens. */
export function Sidebar() {
  const { projects } = useRefs();
  const items = useOpenItems();
  const { due, waiting } = countBadges(items.data);
  const openByProject = new Map<string, number>();
  for (const i of items.data ?? []) if (i.project_id) openByProject.set(i.project_id, (openByProject.get(i.project_id) ?? 0) + 1);
  const active = projects.filter((p) => p.status !== 'done');

  return (
    <nav className="sidebar" aria-label="Main">
      <div className="side-brand">
        <img src={`${import.meta.env.BASE_URL}favicon-64.png`} alt="" width={22} height={22} />
        Planner
      </div>

      <div className="side-group">
        <NavLink to="/" end className={cls}>
          <Icon name="circle-check" size={18} />
          <span className="side-label">Today</span>
          {due ? <span className="side-count">{due}</span> : null}
        </NavLink>
        <NavLink to="/upcoming" className={cls}>
          <Icon name="list" size={18} />
          <span className="side-label">Upcoming</span>
        </NavLink>
        <NavLink to="/calendar" className={cls}>
          <Icon name="calendar" size={18} />
          <span className="side-label">Calendar</span>
        </NavLink>
        <NavLink to="/waiting" className={cls}>
          <Icon name="hourglass" size={18} />
          <span className="side-label">Waiting on</span>
          {waiting ? <span className="side-count">{waiting}</span> : null}
        </NavLink>
        <NavLink to="/review" className={cls}>
          <Icon name="review" size={18} />
          <span className="side-label">Weekly review</span>
        </NavLink>
        <NavLink to="/notes" className={cls}>
          <Icon name="note" size={18} />
          <span className="side-label">Meeting notes</span>
        </NavLink>
        <NavLink to="/team" className={cls}>
          <Icon name="users" size={18} />
          <span className="side-label">Team &amp; leave</span>
        </NavLink>
        <NavLink to="/search" className={cls}>
          <Icon name="search" size={18} />
          <span className="side-label">Search</span>
        </NavLink>
      </div>

      <div className="side-group">
        <NavLink to="/projects" end className={({ isActive }) => `side-heading ${isActive ? 'active' : ''}`}>
          Projects
        </NavLink>
        {active.length === 0 ? <div className="side-empty">No projects yet</div> : null}
        {active.map((p) => (
          <NavLink key={p.id} to={`/projects/${p.id}`} className={cls}>
            <span className={`rag-dot rag-${p.rag ?? 'none'}`} aria-hidden="true" />
            <span className="side-label">{p.name}</span>
            {openByProject.get(p.id) ? <span className="side-count">{openByProject.get(p.id)}</span> : null}
          </NavLink>
        ))}
      </div>

      <div className="side-group">
        <div className="side-heading">Personal</div>
        {PERSONAL_LISTS.map((l) => (
          <NavLink key={l.kind} to={l.path} className={cls}>
            <Icon name={KINDS[l.kind].icon} size={18} />
            <span className="side-label">{KINDS[l.kind].plural}</span>
          </NavLink>
        ))}
        <NavLink to="/packing" className={cls}>
          <Icon name="suitcase" size={18} />
          <span className="side-label">Packing lists</span>
        </NavLink>
      </div>

      <div className="side-group side-bottom">
        <NavLink to="/settings" className={cls}>
          <Icon name="gear" size={18} />
          <span className="side-label">Settings</span>
        </NavLink>
      </div>
    </nav>
  );
}
