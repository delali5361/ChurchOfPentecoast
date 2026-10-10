import type { ReactNode } from 'react';
import type { PageId } from '../types';
import { pageSections } from '../navigation';
import { Icon } from './Icon';
import { Sidebar } from './Sidebar';

export function AppShell({ activePage, onNavigate, children, menuOpen, onMenuOpen, onMenuClose, administratorName, canSeePastoral, onSignOut, onSearch }: {
  activePage: PageId;
  onNavigate: (page: PageId) => void;
  children: ReactNode;
  menuOpen: boolean;
  onMenuOpen: () => void;
  onMenuClose: () => void;
  administratorName: string;
  canSeePastoral: boolean;
  onSignOut: () => void;
  onSearch: () => void;
}) {
  const currentPage = pageSections.flatMap((section) => section.items).find((item) => item.id === activePage);
  return <div className="app-shell">
    <div className="ambient ambient-one" /><div className="ambient ambient-two" />
    <Sidebar activePage={activePage} onNavigate={onNavigate} open={menuOpen} onClose={onMenuClose}
      administratorName={administratorName} canSeePastoral={canSeePastoral} onSignOut={onSignOut} />
    <main className="main-content">
      <header className="topbar">
        <button className="icon-button menu-button" onClick={onMenuOpen} aria-label="Open navigation"><Icon name="menu" size={21} /></button>
        <div className="breadcrumb"><span>Grace Assembly</span><span aria-hidden="true">/</span><strong>{currentPage?.label ?? 'Overview'}</strong></div>
        <div className="topbar-actions">
          <button className="search-trigger" onClick={onSearch}><Icon name="search" size={16} /><span>Search anything</span><kbd><Icon name="command" size={11} /> K</kbd></button>
          <span className="workspace-indicator"><span className="live-dot" /> <span>Workspace</span></span>
          <div className="avatar avatar-light" title={administratorName}>{administratorName.split(/[\s@]/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || 'GA'}</div>
        </div>
      </header>
      <div className="page-wrap">{children}</div>
      <footer className="workspace-footer"><span>Grace Assembly</span><span>People first. Ministry together.</span></footer>
    </main>
  </div>;
}
