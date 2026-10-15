import { useEffect, useState } from 'react';
import { PageHeading } from '../components/PageHeading';
import { BrandMark, Icon } from '../components/Icon';
import { pageSections } from '../navigation';
import type { PageId } from '../types';
import { supabase } from '../supabase';

const monthLabels = ['May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct'];

const roleDashboards: Record<string, { label: string; title: string; description: string; pages: PageId[] }> = {
  member: {
    label: 'YOUR CHURCH FAMILY',
    title: 'Welcome to Grace Assembly.',
    description: 'Keep up with gatherings and find your place in the life of the church.',
    pages: ['events'],
  },
  presiding_elder: {
    label: 'CHURCH LEADERSHIP',
    title: 'Lead with care and clarity.',
    description: 'Keep a view of church life, people, ministry, and shared progress.',
    pages: ['people', 'visitors', 'attendance', 'events', 'reports'],
  },
  youth_executive: {
    label: 'YOUTH MINISTRY',
    title: 'Make room for the next generation.',
    description: 'Your Youth group workspace will be available when an Admin links your account to the Youth ministry.',
    pages: [],
  },
  media: {
    label: 'MEDIA & COMMUNICATIONS',
    title: 'Share the moments that bring us together.',
    description: 'Prepare church announcements and help everyone stay connected.',
    pages: ['events', 'communications'],
  },
};

type MemberProfile = {
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  membership_status: string;
  joined_at: string;
};

export function OverviewPage({ onNavigate, roles = [] }: { onNavigate: (page: PageId) => void; roles?: string[] }) {
  const dashboardRole = roles.includes('administrator') || roles.includes('super_administrator')
    ? null
    : ['presiding_elder', 'youth_executive', 'media', 'member'].find((role) => roles.includes(role)) ?? null;
  const dashboard = dashboardRole ? roleDashboards[dashboardRole] : null;
  const dashboardPages = dashboard?.pages ?? pageSections.flatMap((section) => section.items)
    .filter(({ id }) => id !== 'overview').slice(0, 6).map(({ id }) => id);
  const navItems = pageSections.flatMap((section) => section.items);
  const [memberProfile, setMemberProfile] = useState<MemberProfile | null>(null);
  const [profileError, setProfileError] = useState('');

  useEffect(() => {
    const client = supabase;
    if (dashboardRole !== 'member' || !client) return;
    let active = true;
    const loadProfile = async () => {
      setProfileError('');
      try {
        const { data: userResult, error: userError } = await client.auth.getUser();
        if (userError) throw new Error(`Could not identify your account: ${userError.message}`);
        if (!userResult.user) throw new Error('Sign in to view your membership profile.');
        const { data, error } = await client.from('members')
          .select('first_name,last_name,email,phone,membership_status,joined_at')
          .eq('user_id', userResult.user.id)
          .maybeSingle();
        if (error) throw new Error(`Could not load your membership profile: ${error.message}`);
        if (active) setMemberProfile(data as MemberProfile | null);
      } catch (error) {
        if (active) setProfileError(error instanceof Error ? error.message : 'Could not load your membership profile.');
      }
    };
    void loadProfile();
    return () => { active = false; };
  }, [dashboardRole]);

  return <>
    <PageHeading page="overview" />
    <section className="welcome-banner glass-card">
      <div className="welcome-copy">
        <span className="welcome-label"><Icon name="sparkle" size={14} /> {dashboard?.label ?? 'ONE CHURCH. MANY WAYS TO CARE.'}</span>
        <h2>{dashboard ? <>{dashboard.title}</> : <>A little more connected.<br /><span>A lot more cared for.</span></>}</h2>
        <p>{dashboard?.description ?? 'A thoughtful workspace for the people, ministries, and moments that bring your church together.'}</p>
        <div className="welcome-actions">
          {dashboardPages.slice(0, 2).map((id, index) => {
            const item = navItems.find((candidate) => candidate.id === id);
            return item ? <button key={id} className={`welcome-action ${index === 0 ? 'welcome-action-primary' : 'welcome-action-secondary'}`} onClick={() => onNavigate(item.id)}>
              <Icon name={item.icon} size={16} /> {item.label} {index === 0 && <Icon name="arrow-up" size={14} />}
            </button> : null;
          })}
        </div>
      </div>
      <div className="welcome-art" aria-hidden="true">
        <div className="art-orbit art-orbit-back" /><div className="art-orbit art-orbit-front" /><div className="art-glow" />
        <svg className="church-art" viewBox="0 0 280 240" fill="none" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <linearGradient id="chapel-front" x1="91" y1="107" x2="202" y2="212" gradientUnits="userSpaceOnUse"><stop stopColor="#F4E8C9" /><stop offset="1" stopColor="#B8DABF" /></linearGradient>
            <linearGradient id="chapel-side" x1="194" y1="116" x2="246" y2="194" gradientUnits="userSpaceOnUse"><stop stopColor="#C9DCC6" /><stop offset="1" stopColor="#7CA995" /></linearGradient>
            <linearGradient id="chapel-roof" x1="110" y1="68" x2="221" y2="148" gradientUnits="userSpaceOnUse"><stop stopColor="#EAD6A8" /><stop offset="1" stopColor="#CBAC73" /></linearGradient>
            <filter id="chapel-shadow" x="35" y="23" width="245" height="221" colorInterpolationFilters="sRGB"><feGaussianBlur stdDeviation="10" /></filter>
          </defs>
          <ellipse cx="160" cy="199" rx="94" ry="18" fill="#04120E" fillOpacity=".28" filter="url(#chapel-shadow)" />
          <ellipse cx="160" cy="192" rx="91" ry="18" fill="#88C9AA" fillOpacity=".18" />
          <path d="M82 120 163 81l82 39v79l-82 27-81-27v-79Z" fill="url(#chapel-side)" />
          <path d="m82 120 81 33v73l-81-27v-79Z" fill="url(#chapel-front)" />
          <path d="m82 120 81 33 82-33-81-38-82 38Z" fill="#FBF2DB" />
          <path d="m163 78 24-17 72 36-16 28-80-38Z" fill="url(#chapel-roof)" />
          <path d="m187 61 13-37 56 35 3 38-72-36Z" fill="#D7BD89" />
          <path d="m74 119 12-23 78-39 12 24-82 39-20-1Z" fill="url(#chapel-roof)" />
          <path d="m145 78 18-62 18 61-18 14-18-13Z" fill="#F0DEB6" />
          <path d="M158 33h10v28h-10zM149 42h28v9h-28z" fill="#AD8958" />
          <path d="M114 145a19 19 0 0 1 38 0v68h-38v-68Z" fill="#557C69" />
          <path d="M124 145a9 9 0 0 1 18 0v21h-18v-21Z" fill="#F2E7CD" />
          <path d="M187 142a11 11 0 0 1 22 0v22h-22v-22Z" fill="#658F7A" />
          <path d="M89 137a10 10 0 0 1 20 0v19H89v-19Z" fill="#658F7A" />
          <circle cx="216" cy="71" r="3" fill="#F6D596" /><circle cx="232" cy="120" r="2" fill="#FFF" fillOpacity=".8" />
        </svg>
        <div className="art-caption"><span className="art-live-dot" /> GRACE ASSEMBLY <span>·</span> ONE FAMILY</div>
      </div>
    </section>
    {dashboardRole === 'member' && (
      <section className="member-portal-card glass-card" aria-label="My membership profile">
        <div><span className="eyebrow"><Icon name="contact" size={14} /> MY MEMBERSHIP</span><h2>Your profile</h2></div>
        {profileError && <p className="workspace-alert" role="alert">{profileError}</p>}
        {memberProfile
          ? <div className="member-portal-details">
            <strong>{memberProfile.first_name} {memberProfile.last_name}</strong>
            <span>{memberProfile.email ?? 'No email on file'}{memberProfile.phone ? ` · ${memberProfile.phone}` : ''}</span>
            <span className="member-status status-member">{memberProfile.membership_status}</span>
          </div>
          : !profileError && <p>Your membership profile will appear here once it is linked to your account.</p>}
      </section>
    )}
    <section className="overview-summary-grid" aria-label="Workspace status">
      <article className="overview-summary"><span className="summary-icon"><Icon name="users" size={18} /></span><span className="summary-label">People & belonging</span><strong>One connected directory</strong><span className="summary-description">Members, visitors, and households have their own workspace.</span></article>
      <article className="overview-summary"><span className="summary-icon"><Icon name="network" size={18} /></span><span className="summary-label">Church & ministry</span><strong>Every team in its place</strong><span className="summary-description">Campuses, departments, ministries, and groups.</span></article>
      <article className="overview-summary"><span className="summary-icon"><Icon name="clipboard" size={18} /></span><span className="summary-label">Services & events</span><strong>Gathering, made clear</strong><span className="summary-description">Bring attendance, events, and registration together.</span></article>
      <article className="overview-summary"><span className="summary-icon"><Icon name="lock" size={18} /></span><span className="summary-label">Stewardship & care</span><strong>Privacy comes first</strong><span className="summary-description">Sensitive ministry spaces belong behind clear permissions.</span></article>
    </section>
    <section className="overview-content-grid">
      <div className="overview-panel glass-card">
        <div className="section-heading"><div><span className="eyebrow">A growing community</span><h2>{dashboard ? 'Your role, your workspace' : 'Every ministry, a place to belong'}</h2></div><span className="phase-badge"><Icon name="sparkle" size={13} /> {dashboard ? 'Role-aware dashboard' : 'Workspaces are taking shape'}</span></div>
        <div className="overview-chart-summary"><strong>One shared workspace</strong><span><Icon name="shield" size={14} /> Role-aware foundations</span></div>
        <div className="overview-chart"><div className="chart-y"><span>Care</span><span>Serve</span><span>Grow</span><span>Gather</span></div><div className="overview-chart-area">
          <div className="overview-chart-lines"><i /><i /><i /><i /></div>
          <svg viewBox="0 0 700 230" preserveAspectRatio="none" role="img" aria-label="Illustrative view of church ministry coming together">
            <defs><linearGradient id="community-fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#8CCBA5" stopOpacity=".32" /><stop offset="100%" stopColor="#8CCBA5" stopOpacity="0" /></linearGradient></defs>
            <path d="M0 177 C50 149 76 160 112 139 S170 133 205 145 S260 94 308 109 S350 126 390 91 S448 77 490 96 S540 60 580 70 S635 32 700 42 L700 230 L0 230Z" fill="url(#community-fill)" />
            <path d="M0 177 C50 149 76 160 112 139 S170 133 205 145 S260 94 308 109 S350 126 390 91 S448 77 490 96 S540 60 580 70 S635 32 700 42" fill="none" stroke="#8CCBA5" strokeWidth="3" vectorEffect="non-scaling-stroke" strokeDasharray="5 8" strokeLinecap="round" />
          </svg><div className="chart-x">{monthLabels.map((label) => <span key={label}>{label}</span>)}</div>
        </div></div>
        <p className="chart-caption">A preview of the shared reporting workspace—live insights arrive as records are connected.</p>
      </div>
      <div className="overview-panel overview-next glass-card">
        <div className="section-heading"><div><span className="eyebrow">Your management system</span><h2>Find your workspace</h2></div><BrandMark /></div>
        <div className="overview-links">{dashboardPages.map((id) => navItems.find((candidate) => candidate.id === id)).filter((item) => item !== undefined).map((item) =>
          <button className="overview-link" key={item.id} onClick={() => onNavigate(item.id)}><span className="overview-link-icon"><Icon name={item.icon} size={16} /></span><span><strong>{item.label}</strong><small>{item.description}</small></span><Icon name="chevron-right" size={16} /></button>)}</div>
        <button className="text-button overview-all-link" onClick={() => onNavigate('administration')}>Explore the full system <Icon name="arrow-up" size={14} /></button>
      </div>
    </section>
    <section className="overview-footer-note"><Icon name="lock" size={16} /><span>Pastoral records and financial details are designed for role-appropriate access. Each module will connect to live data in its implementation phase.</span></section>
  </>;
}
