import { useEffect } from 'react';
import { Navigate, Outlet, RouterProvider, createBrowserRouter, useMatches, useParams } from 'react-router-dom';
import { useAuth } from './auth';
import { Sidebar, TabBar } from './components/Nav';
import { CaptureProvider } from './components/Capture';
import { RefsProvider } from './lib/refs';
import { startOutbox } from './lib/outbox';
import { useBump } from './lib/useQuery';
import { Today } from './screens/Today';
import { Upcoming } from './screens/Upcoming';
import { Calendar } from './screens/Calendar';
import { Waiting } from './screens/Waiting';
import { Projects } from './screens/Projects';
import { ProjectDetail } from './screens/ProjectDetail';
import { ProjectForm } from './screens/ProjectForm';
import { ItemForm } from './screens/ItemForm';
import { Notes, NoteEditor } from './screens/Notes';
import { Team } from './screens/Team';
import { Review } from './screens/Review';
import { KindList } from './screens/KindList';
import { PackingLists, PackingList } from './screens/Packing';
import { Search } from './screens/Search';
import { BriefPage } from './screens/BriefPage';
import { More } from './screens/More';
import { Settings, Holidays } from './screens/Settings';
import { Calendars } from './screens/Calendars';
import { Login } from './screens/Login';

function RequireAuth() {
  const { session, loading } = useAuth();
  if (loading) {
    return (
      <div className="splash">
        <div className="spinner" />
      </div>
    );
  }
  if (!session) return <Navigate to="/login" replace />;
  return (
    <RefsProvider>
      <CaptureProvider>
        <Outlet />
      </CaptureProvider>
    </RefsProvider>
  );
}

/** Sidebar on a laptop, tab bar on a phone. Form screens hide the tab bar. */
function Shell() {
  const bump = useBump();
  const matches = useMatches();
  const hideTabs = matches.some((m) => (m.handle as { form?: boolean } | undefined)?.form);

  useEffect(() => startOutbox(bump), [bump]);

  return (
    <div className={`app-shell ${hideTabs ? 'is-form' : ''}`}>
      <Sidebar />
      <div className="app-content">
        <Outlet />
      </div>
      {hideTabs ? null : <TabBar />}
    </div>
  );
}

/** Remounts the list when the kind changes, so a half-typed entry does not carry over. */
function KindListRoute() {
  const { kind } = useParams();
  return <KindList key={kind} />;
}

const form = { form: true };

const router = createBrowserRouter(
  [
    { path: '/login', element: <Login /> },
    {
      element: <RequireAuth />,
      children: [
        {
          element: <Shell />,
          children: [
            { path: '/', element: <Today /> },
            { path: '/upcoming', element: <Upcoming /> },
            { path: '/calendar', element: <Calendar /> },
            { path: '/waiting', element: <Waiting /> },
            { path: '/projects', element: <Projects /> },
            { path: '/projects/new', element: <ProjectForm />, handle: form },
            { path: '/projects/:id', element: <ProjectDetail /> },
            { path: '/projects/:id/edit', element: <ProjectForm />, handle: form },
            { path: '/item/new', element: <ItemForm />, handle: form },
            { path: '/item/:id', element: <ItemForm />, handle: form },
            { path: '/notes', element: <Notes /> },
            { path: '/notes/new', element: <NoteEditor />, handle: form },
            { path: '/notes/:id', element: <NoteEditor />, handle: form },
            { path: '/team', element: <Team /> },
            { path: '/review', element: <Review /> },
            { path: '/lists/:kind', element: <KindListRoute /> },
            { path: '/packing', element: <PackingLists /> },
            { path: '/packing/:id', element: <PackingList /> },
            { path: '/search', element: <Search /> },
            { path: '/brief', element: <BriefPage /> },
            { path: '/more', element: <More /> },
            { path: '/settings', element: <Settings /> },
            { path: '/settings/holidays', element: <Holidays /> },
            { path: '/settings/calendars', element: <Calendars /> },
          ],
        },
        { path: '*', element: <Navigate to="/" replace /> },
      ],
    },
  ],
  { basename: import.meta.env.BASE_URL.replace(/\/$/, '') },
);

export function App() {
  return <RouterProvider router={router} />;
}
