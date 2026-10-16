import { useEffect, useMemo, useRef, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
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
import { LandingPage } from './pages/LandingPage';
import { MemberHomePage } from './pages/MemberHomePage';
import { MemberPortalPage } from './pages/MemberPortalPage';
import { MediaWorkspacePage } from './pages/MediaWorkspacePage';
import { PastoralCarePage } from './pages/PastoralCarePage';
import { PeoplePage } from './pages/PeoplePage';
import { ReportsPage } from './pages/ReportsPage';
import { SignInPage } from './pages/SignInPage';
import { StructurePage } from './pages/StructurePage';
import { VisitorsPage } from './pages/VisitorsPage';
import type { PageId } from './types';
import { getCurrentUserRoles, getRoleAccessiblePages } from './auth';
import { supabase } from './supabase';
import { readPreviewRows, writePreviewRows, type PreviewAccount } from './data/previewStore';

const pageComponents: Partial<Record<PageId, (props: { onAction: (message: string) => void; roles?: string[] }) => JSX.Element | null>> = {
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
  const [publicView, setPublicView] = useState<'landing' | 'sign-in' | 'sign-up'>('landing');
  const [previewEntered, setPreviewEntered] = useState(false);
  const [activePage, setActivePage] = useState<PageId>('overview');
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [roles, setRoles] = useState<string[]>([]);
  const [previewDisplayName, setPreviewDisplayName] = useState('');
  const [roleReady, setRoleReady] = useState(!supabase);
  const [workspaceError, setWorkspaceError] = useState('');
  const [toast, setToast] = useState('');
  const [showPasswordDialog, setShowPasswordDialog] = useState(false);
  const [pendingPasswordChange, setPendingPasswordChange] = useState<PreviewAccount | null>(null);
  const [passwordChangeError, setPasswordChangeError] = useState('');
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
    if (!supabase || !session) {
      setRoles([]);
      setRoleReady(true);
      return;
    }
    let mounted = true;
    setRoleReady(false);
    void getCurrentUserRoles(supabase)
      .then((nextRoles) => { if (mounted) setRoles(nextRoles); })
      .catch((error: unknown) => {
        if (mounted) {
          setRoles([]);
          setWorkspaceError(`Could not verify your workspace role: ${error instanceof Error ? error.message : 'Unknown role lookup error.'}`);
        }
      })
      .finally(() => { if (mounted) setRoleReady(true); });
    return () => { mounted = false; };
  }, [session]);

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

  const accessiblePages = useMemo(() => roles.length
    ? getRoleAccessiblePages(roles)
    : !supabase ? null : session ? ['overview'] as PageId[] : null, [roles, session]);
  const navigationItems = useMemo(() => pageSections.flatMap((section) => section.items)
    .filter((item) => {
      return (!item.id.startsWith('member-') || roles.includes('member'))
        && (!accessiblePages || accessiblePages.includes(item.id))
        && `${item.label} ${item.description}`.toLowerCase().includes(searchQuery.trim().toLowerCase());
    }), [accessiblePages, roles, searchQuery]);

  const notify = (message: string) => {
    setToast(message);
    if (toastTimer.current !== undefined) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(''), 3800);
  };
  const loginToPreviewAccount = (username: string, password: string) => {
    const accounts = readPreviewRows<PreviewAccount>('preview_accounts');
    const account = accounts.find((entry) => entry.username.toLowerCase() === username.toLowerCase() && entry.password === password);
    if (!account) {
      notify('Preview credentials not found.');
      return false;
    }
    const profile = readPreviewRows<{ id: string; preferred_name: string | null }>('admin_staff_profiles')
      .find((entry) => entry.id === account.id);
    setPreviewDisplayName(profile?.preferred_name || account.username);
    if (account.mustChangePassword) {
      setPendingPasswordChange(account);
      setPasswordChangeError('');
      setShowPasswordDialog(true);
      return true;
    }
    setRoles([account.role]);
    setPreviewEntered(true);
    setPublicView('landing');
    if (account.role === 'administrator') setActivePage('administration');
    else setActivePage('overview');
    return true;
  };
  const signOut = async () => {
    if (!supabase) {
      setRoles([]);
      setPreviewDisplayName('');
      setActivePage('overview');
      setPreviewEntered(false);
      setPublicView('landing');
      return;
    }
    try {
      const { error } = await supabase.auth.signOut();
      if (error) notify(`Could not sign out: ${error.message}`);
    } catch (error) {
      notify(`Could not sign out: ${error instanceof Error ? error.message : 'Unknown authentication error.'}`);
    }
  };
  const canSeePastoral = !supabase || roles.includes('administrator') || roles.includes('pastor') || roles.includes('pastoral_care_officer');
  const roleDisplayName = roles.includes('administrator') || roles.includes('super_administrator')
    ? 'Grace Assembly Admin'
    : roles.includes('presiding_elder') ? 'Presiding Elder'
      : roles.includes('media') ? 'Media Team'
        : roles.includes('youth_executive') ? 'Youth Executive'
          : roles.includes('member') ? 'Grace Assembly Member' : 'Church workspace';
  const administratorName = session?.user.email
    ?? (roles.includes('administrator') || roles.includes('super_administrator')
      ? 'Grace Assembly Admin'
      : previewDisplayName || roleDisplayName);
  const navigateToPage = (page: PageId) => {
    if (!accessiblePages || accessiblePages.includes(page)) setActivePage(page);
  };

  useEffect(() => {
    if (accessiblePages && !accessiblePages.includes(activePage)) setActivePage('overview');
  }, [activePage, accessiblePages]);

  if (!authReady) return <div className="auth-loading"><span className="loading-spinner" /><span>Preparing your workspace</span></div>;
  if (showPasswordDialog && pendingPasswordChange) return <main className="auth-screen">
    <section className="auth-card password-change-card" role="dialog" aria-modal="true" aria-labelledby="password-change-title">
      <div className="auth-card-heading"><Icon name="shield" size={22} /><span>First sign-in security</span><h2 id="password-change-title">Change your password</h2><p>Welcome, {pendingPasswordChange.username}. Set a new password before continuing to your assigned workspace.</p></div>
      <form onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const newPassword = String(form.get('newPassword') ?? '');
        const confirmPassword = String(form.get('confirmPassword') ?? '');
        if (newPassword.length < 8) {
          setPasswordChangeError('Use at least 8 characters for your new password.');
          return;
        }
        if (newPassword !== confirmPassword) {
          setPasswordChangeError('The passwords do not match.');
          return;
        }
        try {
          const accounts = readPreviewRows<PreviewAccount>('preview_accounts');
          const nextAccounts = accounts.map((account) => account.id === pendingPasswordChange.id
            ? { ...account, password: newPassword, mustChangePassword: false }
            : account);
          writePreviewRows('preview_accounts', nextAccounts);
          const profiles = readPreviewRows<{ id: string; preferred_name: string | null; status: string; last_login_at: string | null }>('admin_staff_profiles');
          writePreviewRows('admin_staff_profiles', profiles.map((profile) => profile.id === pendingPasswordChange.id
            ? { ...profile, status: 'active', last_login_at: new Date().toISOString() }
            : profile));
          setRoles([pendingPasswordChange.role]);
          const profile = profiles.find((entry) => entry.id === pendingPasswordChange.id);
          setPreviewDisplayName(profile?.preferred_name || pendingPasswordChange.username);
          setPreviewEntered(true);
          setPublicView('landing');
          setActivePage(pendingPasswordChange.role === 'administrator' || pendingPasswordChange.role === 'super_administrator'
            ? 'administration'
            : 'overview');
          setPendingPasswordChange(null);
          setShowPasswordDialog(false);
        } catch (error) {
          setPasswordChangeError(error instanceof Error ? error.message : 'Could not save your new password.');
        }
      }}>
        <label>New password<input type="password" name="newPassword" required minLength={8} autoComplete="new-password" /></label>
        <label>Confirm new password<input type="password" name="confirmPassword" required minLength={8} autoComplete="new-password" /></label>
        {passwordChangeError && <div className="form-message" role="alert">{passwordChangeError}</div>}
        <button className="button button-primary auth-submit" type="submit">Update password and continue</button>
      </form>
    </section>
  </main>;
  if (supabase && !session) {
    if (publicView === 'landing') return <LandingPage onSignIn={() => setPublicView('sign-in')} onSignUp={() => setPublicView('sign-up')} />;
    return <SignInPage client={supabase} initialMode={publicView} onBack={() => setPublicView('landing')} />;
  }
  if (!supabase && !previewEntered) {
    if (publicView !== 'landing') {
      return <SignInPage
        client={null}
        initialMode={publicView}
        onBack={() => setPublicView('landing')}
        onPreviewAccess={() => {
          setPublicView('landing');
          setRoles(['member']);
          setPreviewEntered(true);
        }}
        onPreviewLogin={loginToPreviewAccount}
      />;
    }
    return <LandingPage
      previewMode
      onSignIn={() => setPublicView('sign-in')}
      onSignUp={() => setPublicView('sign-up')}
      onEnterPreview={() => {
        setRoles(['member']);
        setPreviewEntered(true);
      }}
      onEnterAdminPreview={() => {
        setRoles(['administrator']);
        setActivePage('administration');
        setPreviewEntered(true);
      }}
    />;
  }
  if (supabase && !roleReady) return <div className="auth-loading"><span className="loading-spinner" /><span>Checking your workspace access</span></div>;

  const PageComponent = pageComponents[activePage];
  return <>
    <AppShell activePage={activePage} onNavigate={navigateToPage} menuOpen={menuOpen} onMenuOpen={() => setMenuOpen(true)}
      onMenuClose={() => setMenuOpen(false)} administratorName={administratorName} canSeePastoral={canSeePastoral}
      onSignOut={() => { void signOut(); }} onSearch={() => { setSearchQuery(''); setSearchOpen(true); }}
      roles={roles} accessiblePages={accessiblePages}>
      {workspaceError && <div className="workspace-alert" role="alert"><Icon name="shield" size={17} /><span>{workspaceError}</span><button className="icon-button" onClick={() => setWorkspaceError('')} aria-label="Dismiss message"><Icon name="close" size={16} /></button></div>}
      {activePage === 'overview'
        ? roles.includes('member') && !roles.includes('administrator') && !roles.includes('super_administrator')
          ? <MemberHomePage onNavigate={navigateToPage} />
          : <OverviewPage onNavigate={navigateToPage} roles={roles} />
        : activePage.startsWith('member-')
          ? <MemberPortalPage page={activePage} onAction={notify} onNavigate={navigateToPage} />
        : activePage.startsWith('media-')
          ? <MediaWorkspacePage page={activePage} onAction={notify} />
        : PageComponent
          ? <PageComponent onAction={notify} roles={roles} />
          : <OverviewPage onNavigate={navigateToPage} roles={roles} />}
    </AppShell>
    {searchOpen && <div className="search-layer" onMouseDown={(event) => { if (event.target === event.currentTarget) setSearchOpen(false); }}>
      <section className="search-dialog" role="dialog" aria-modal="true" aria-label="Search church workspaces">
        <label className="global-search-field"><Icon name="search" size={19} /><input autoFocus value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Search church workspaces..." aria-label="Search church workspaces" /><kbd>ESC</kbd></label>
        <span className="search-section-label">{searchQuery ? 'Matching workspaces' : 'Navigate to a workspace'}</span>
        <div className="search-results">{navigationItems.map((item) => <button key={item.id} className="search-result" onClick={() => { navigateToPage(item.id); setSearchOpen(false); }}>
          <span className="search-result-icon"><Icon name={item.icon} size={17} /></span><span><strong>{item.label}</strong><small>{item.description}</small></span><Icon name="chevron-right" size={16} />
        </button>)}{!navigationItems.length && <div className="search-empty">No workspaces match that search. Try a different term.</div>}</div>
        <div className="search-dialog-footer"><Icon name="sparkle" size={13} /> Search across church workspaces</div>
      </section>
    </div>}
    {toast && <div className="toast" role="status"><Icon name="check" size={16} />{toast}</div>}
  </>;
}

export default App;
