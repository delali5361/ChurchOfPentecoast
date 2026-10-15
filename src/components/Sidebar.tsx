import { pageSections } from '../navigation';
import type { PageId } from '../types';
import { BrandMark, Icon } from './Icon';

export function Sidebar({ activePage, onNavigate, open, onClose, administratorName, canSeePastoral, onSignOut, roles, accessiblePages }: {
  activePage: PageId;
  onNavigate: (page: PageId) => void;
  open: boolean;
  onClose: () => void;
  administratorName: string;
  canSeePastoral: boolean;
  onSignOut: () => void;
  roles: string[];
  accessiblePages: PageId[] | null;
}) {
  const roleName = roles.includes('administrator') || roles.includes('super_administrator')
    ? 'Administrator'
    : roles.includes('presiding_elder')
      ? 'Presiding Elder'
      : roles.includes('youth_executive')
        ? 'Youth Executive'
        : roles.includes('media')
          ? 'Media'
          : roles.includes('member') ? 'Member' : 'Church workspace';
  const memberPortal = roles.includes('member') && !roles.includes('administrator') && !roles.includes('super_administrator');
  const memberNavPages: PageId[] = [
    'overview', 'events', 'member-giving', 'member-updates', 'member-profile',
    'member-attendance', 'member-ministries', 'member-care', 'member-notifications',
  ];
  return <>
    {open && <button className="sidebar-backdrop" onClick={onClose} aria-label="Close navigation overlay" />}
    <aside className={`sidebar ${open ? 'sidebar-open' : ''}`}>
      <div className="brand-block">
        <BrandMark />
        <div className="brand-copy"><strong>Grace Assembly</strong><span>Church workspace</span></div>
        <button className="icon-button close-menu" onClick={onClose} aria-label="Close navigation"><Icon name="close" /></button>
      </div>
      <div className="branch-switcher">
        <span className="branch-dot" />
        <div><small>Organization</small><strong>Grace Assembly</strong></div>
        <Icon name="chevron" size={15} />
      </div>
      <nav className="main-nav" aria-label="Main navigation">
        {(memberPortal
          ? [{ label: 'Member navigation', items: pageSections.flatMap((section) => section.items).filter((item) => memberNavPages.includes(item.id)) }]
          : pageSections.filter((section) => section.label !== 'Member portal')).map((section) => {
          const items = section.items.filter(({ id }) => id !== 'pastoral-care' || canSeePastoral)
            .filter((item) => !accessiblePages || accessiblePages.includes(item.id));
          return items.length ? <div className="nav-section" key={section.label}>
            <p className="nav-label">{section.label}</p>
            {items.map((item) => <button type="button" key={item.id} className={`nav-item ${activePage === item.id ? 'active' : ''}`}
              aria-current={activePage === item.id ? 'page' : undefined}
              onClick={() => { onNavigate(item.id); onClose(); }}>
              <Icon name={item.icon} size={18} /><span>{memberPortal && item.id === 'overview' ? 'My Church' : item.label}</span>
            </button>)}
          </div> : null;
        })}
      </nav>
      <div className="sidebar-bottom">
        <div className="tip-card"><Icon name="sparkle" size={16} /><strong>Care starts with connection.</strong><span>Keep people, ministry, and follow-up close at hand.</span></div>
        <button className="nav-item sidebar-signout" onClick={onSignOut}><Icon name="logout" size={17} /><span>Sign out</span></button>
        <div className="profile-mini"><div className="avatar avatar-dark">{administratorName.split(/[\s@]/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || 'GA'}</div><div><strong>{administratorName}</strong><span>{roleName}</span></div></div>
      </div>
    </aside>
  </>;
}
