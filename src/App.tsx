import { useEffect, useMemo, useRef, useState } from 'react';
import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js';
import { AppShell } from './components/AppShell';
import { Icon } from './components/Icon';
import { pageSections } from './navigation';
import { AdministrationPage } from './pages/AdministrationPage';
import { AttendancePage } from './pages/AttendancePage';
import { CommunicationsPage } from './pages/CommunicationsPage';
import { EventsPage } from './pages/EventsPage';
import { FinancePage } from './pages/FinancePage';
import { HouseholdsPage } from './pages/HouseholdsPage';
import { OverviewPage } from './pages/OverviewPage';
import { OnboardingPage } from './pages/OnboardingPage';
import { PastoralCarePage } from './pages/PastoralCarePage';
import { PeoplePage } from './pages/PeoplePage';
import { ReportsPage } from './pages/ReportsPage';
import { SignInPage } from './pages/SignInPage';
import { StructurePage } from './pages/StructurePage';
import { VisitorsPage } from './pages/VisitorsPage';
import type { PageId } from './types';
import { getCurrentUserRoles } from './auth';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabase: SupabaseClient | null = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

const pageComponents: Partial<Record<PageId, (props: { onAction: (message: string) => void }) => JSX.Element | null>> = {
  people: PeoplePage,
  visitors: VisitorsPage,
  households: HouseholdsPage,
  structure: StructurePage,
  attendance: AttendancePage,
  events: EventsPage,
  finance: FinancePage,
  communications: CommunicationsPage,
  'pastoral-care': PastoralCarePage,
  reports: ReportsPage,
  administration: AdministrationPage,
};

function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(!supabase);
  const [activePage, setActivePage] = useState<PageId>('overview');
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [roles, setRoles] = useState<string[]>([]);
  const [roleReady, setRoleReady] = useState(!supabase);
  const [workspaceError, setWorkspaceError] = useState('');
  const [toast, setToast] = useState('');
  const [showOnboarding, setShowOnboarding] = useState(false);
  const toastTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (!supabase) return;
    let mounted = true;
    void supabase.auth.getSession().then(({ data, error }) => {
      if (!mounted) return;
      if (error) setWorkspaceError(`Could not restore your sign-in session: ${error.message}`);
      setSession(data.session);
      setAuthReady(true);
    }).catch((error: unknown) => {
      if (!mounted) return;
      setWorkspaceError(`Could not restore your sign-in session: ${error instanceof Error ? error.message : 'Unknown authentication error.'}`);
      setAuthReady(true);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setAuthReady(true);
      setRoles([]);
      setRoleReady(!nextSession);
    });
    return () => { mounted = false; listener.subscription.unsubscribe(); };
  }, []);

  useEffect(() => {
    if (!searchOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSearchOpen(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [searchOpen]);

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setSearchQuery('');
        setSearchOpen(true);
      }
    };
    window.addEventListener('keydown', handleShortcut);
    return () => window.removeEventListener('keydown', handleShortcut);
  }, []);

  useEffect(() => () => {
    if (toastTimer.current !== undefined) window.clearTimeout(toastTimer.current);
  }, []);

  const navigationItems = useMemo(() => pageSections.flatMap((section) => section.items)
    .filter((item) => `${item.label} ${item.description}`.toLowerCase().includes(searchQuery.trim().toLowerCase())), [searchQuery]);

  const notify = (message: string) => {
    setToast(message);
    if (toastTimer.current !== undefined) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(''), 3800);
  };
  const signOut = async () => {
    if (!supabase) return;
    try {
      const { error } = await supabase.auth.signOut();
      if (error) notify(`Could not sign out: ${error.message}`);
    } catch (error) {
      notify(`Could not sign out: ${error instanceof Error ? error.message : 'Unknown authentication error.'}`);
    }
  };
  const canSeePastoral = !supabase || roles.includes('administrator') || roles.includes('pastoral_care');
  const administratorName = session?.user.email ?? 'Church administrator';

  if (!authReady) return <div className="auth-loading"><span className="loading-spinner" /><span>Preparing your workspace</span></div>;
  if (supabase && !session) return <SignInPage client={supabase} onStartOnboarding={() => setShowOnboarding(true)} />;
  if (showOnboarding) return <OnboardingPage />;
  if (supabase && !roleReady) return <div className="auth-loading"><span className="loading-spinner" /><span>Checking your workspace access</span></div>;

  const PageComponent = pageComponents[activePage];
  return <>
    <AppShell activePage={activePage} onNavigate={setActivePage} menuOpen={menuOpen} onMenuOpen={() => setMenuOpen(true)}
      onMenuClose={() => setMenuOpen(false)} administratorName={administratorName} canSeePastoral={canSeePastoral}
      onSignOut={() => { void signOut(); }} onSearch={() => { setSearchQuery(''); setSearchOpen(true); }}>
      {workspaceError && <div className="workspace-alert" role="alert"><Icon name="shield" size={17} /><span>{workspaceError}</span><button className="icon-button" onClick={() => setWorkspaceError('')} aria-label="Dismiss message"><Icon name="close" size={16} /></button></div>}
      {!supabase && <div className="demo-mode-banner"><Icon name="sparkle" size={14} /> Preview mode <span>Connect Supabase to enable authentication and live records.</span></div>}
      {activePage === 'overview'
        ? <OverviewPage onNavigate={setActivePage} />
        : PageComponent
          ? <PageComponent onAction={notify} />
          : <OverviewPage onNavigate={setActivePage} />}
    </AppShell>
    {searchOpen && <div className="search-layer" onMouseDown={(event) => { if (event.target === event.currentTarget) setSearchOpen(false); }}>
      <section className="search-dialog" role="dialog" aria-modal="true" aria-label="Search church workspaces">
        <label className="global-search-field"><Icon name="search" size={19} /><input autoFocus value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Search church workspaces..." aria-label="Search church workspaces" /><kbd>ESC</kbd></label>
        <span className="search-section-label">{searchQuery ? 'Matching workspaces' : 'Navigate to a workspace'}</span>
        <div className="search-results">{navigationItems.map((item) => <button key={item.id} className="search-result" onClick={() => { setActivePage(item.id); setSearchOpen(false); }}>
          <span className="search-result-icon"><Icon name={item.icon} size={17} /></span><span><strong>{item.label}</strong><small>{item.description}</small></span><Icon name="chevron-right" size={16} />
        </button>)}{!navigationItems.length && <div className="search-empty">No workspaces match that search. Try a different term.</div>}</div>
        <div className="search-dialog-footer"><Icon name="sparkle" size={13} /> Search across church workspaces</div>
      </section>
    </div>}
    {toast && <div className="toast" role="status"><Icon name="check" size={16} />{toast}</div>}
  </>;
}

export default App;
