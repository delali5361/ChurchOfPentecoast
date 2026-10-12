import { useCallback, useEffect, useMemo, useState } from 'react';
import { Icon } from '../components/Icon';
import { PageHeading } from '../components/PageHeading';
import { getCurrentOrganization, type WorkspaceOrganization } from '../data/workspace';
import { supabase } from '../supabase';

type ReportTab = 'overview' | 'people' | 'attendance' | 'events' | 'finance';
type ReportMember = { id: string; branch_id: string | null; membership_status: string; joined_at: string };
type ReportAttendance = { id: string; branch_id: string | null; category: string; checked_in_at: string };
type ReportSession = { id: string; branch_id: string | null; session_date: string; status: string };
type ReportEvent = { id: string; branch_id: string | null; starts_at: string; status: string; attendee_count: number };
type ReportRegistration = { id: string; branch_id: string | null; status: string; registered_at: string };
type ReportGift = { id: string; branch_id: string | null; amount: number; category: string; status: string; given_at: string };
type ReportExpense = { id: string; branch_id: string | null; amount: number; status: string; incurred_at: string };
type ReportPledge = { id: string; branch_id: string | null; pledged_amount: number; status: string; due_date: string | null };

type PageResult<T> = { data: T[] | null; error: { message: string } | null };

async function loadAllPages<T>(fetchPage: (from: number, to: number) => Promise<PageResult<T>>): Promise<T[]> {
  const rows: T[] = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await fetchPage(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    const page = data ?? [];
    rows.push(...page);
    if (page.length < pageSize) return rows;
  }
}

const today = new Date().toISOString().slice(0, 10);
const monthAgo = new Date(Date.now() - 29 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

function formatAmount(value: number) {
  return new Intl.NumberFormat(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(value);
}

function downloadReportCsv(filename: string, rows: string[][]) {
  const csv = rows.map((row) => row.map((value) => `"${value.replace(/"/g, '""')}"`).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function dateLabel(value: string) {
  return new Date(`${value}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export function ReportsPageImpl({ onAction }: { onAction: (message: string) => void }) {
  const [organization, setOrganization] = useState<WorkspaceOrganization | null>(null);
  const [members, setMembers] = useState<ReportMember[]>([]);
  const [attendance, setAttendance] = useState<ReportAttendance[]>([]);
  const [sessions, setSessions] = useState<ReportSession[]>([]);
  const [events, setEvents] = useState<ReportEvent[]>([]);
  const [registrations, setRegistrations] = useState<ReportRegistration[]>([]);
  const [gifts, setGifts] = useState<ReportGift[]>([]);
  const [expenses, setExpenses] = useState<ReportExpense[]>([]);
  const [pledges, setPledges] = useState<ReportPledge[]>([]);
  const [canViewFinance, setCanViewFinance] = useState(false);
  const [tab, setTab] = useState<ReportTab>('overview');
  const [fromDate, setFromDate] = useState(monthAgo);
  const [toDate, setToDate] = useState(today);
  const [branchId, setBranchId] = useState('');
  const [loading, setLoading] = useState(Boolean(supabase));
  const [loadError, setLoadError] = useState('');
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    const client = supabase;
    if (!client) {
      setLoading(false);
      return;
    }
    if (!fromDate || !toDate || fromDate > toDate) {
      setLoaded(false);
      setLoadError('Choose a valid date range with a start date on or before the end date.');
      return;
    }
    setLoading(true);
    setLoadError('');
    setLoaded(false);
    try {
      const current = await getCurrentOrganization(client);
      setOrganization(current);

      const { data: userData, error: userError } = await client.auth.getUser();
      if (userError) throw new Error(`Could not identify the signed-in user: ${userError.message}`);
      if (!userData.user) throw new Error('Sign in to view church reports.');

      const { data: rolesData, error: rolesError } = await client.from('user_roles')
        .select('app_role_id,app_roles(code)')
        .eq('user_id', userData.user.id);
      if (rolesError) throw new Error(`Could not verify report permissions: ${rolesError.message}`);
      const roleRows = (rolesData ?? []) as unknown as { app_role_id: string; app_roles: { code: string } | null }[];
      const roleIds = roleRows.map((role) => role.app_role_id);
      const privilegedRole = roleRows.some((role) => ['super_administrator', 'administrator'].includes(role.app_roles?.code ?? ''));
      let financePermission = privilegedRole;
      if (roleIds.length) {
        const { data: permissionData, error: permissionError } = await client.from('role_permissions')
          .select('app_permissions(code)')
          .in('app_role_id', roleIds);
        if (permissionError) throw new Error(`Could not verify financial report permissions: ${permissionError.message}`);
        const permissionRows = (permissionData ?? []) as unknown as { app_permissions: { code: string } | null }[];
        financePermission = financePermission || permissionRows.some((row) => row.app_permissions?.code === 'finance.view');
      }
      setCanViewFinance(financePermission);

      const [memberRows, attendanceRows, sessionRows, eventRows, registrationRows] = await Promise.all([
        loadAllPages<ReportMember>((start, end) => {
          let request = client.from('members').select('id,branch_id,membership_status,joined_at')
            .eq('organization_id', current.id).order('id');
          if (branchId) request = request.eq('branch_id', branchId);
          return request.range(start, end) as unknown as Promise<PageResult<ReportMember>>;
        }),
        loadAllPages<ReportAttendance>((start, end) => {
          let request = client.from('attendance_records').select('id,branch_id,category,checked_in_at')
            .eq('organization_id', current.id).gte('checked_in_at', `${fromDate}T00:00:00`).lte('checked_in_at', `${toDate}T23:59:59`);
          if (branchId) request = request.eq('branch_id', branchId);
          return request.order('checked_in_at', { ascending: false }).range(start, end) as unknown as Promise<PageResult<ReportAttendance>>;
        }),
        loadAllPages<ReportSession>((start, end) => {
          let request = client.from('attendance_sessions').select('id,branch_id,session_date,status')
            .eq('organization_id', current.id).gte('session_date', fromDate).lte('session_date', toDate);
          if (branchId) request = request.eq('branch_id', branchId);
          return request.order('session_date', { ascending: false }).range(start, end) as unknown as Promise<PageResult<ReportSession>>;
        }),
        loadAllPages<ReportEvent>((start, end) => {
          let request = client.from('events').select('id,branch_id,starts_at,status,attendee_count')
            .eq('organization_id', current.id).gte('starts_at', `${fromDate}T00:00:00`).lte('starts_at', `${toDate}T23:59:59`);
          if (branchId) request = request.eq('branch_id', branchId);
          return request.order('starts_at', { ascending: false }).range(start, end) as unknown as Promise<PageResult<ReportEvent>>;
        }),
        loadAllPages<ReportRegistration>((start, end) => {
          let request = client.from('event_registrations').select('id,branch_id,status,registered_at')
            .eq('organization_id', current.id).gte('registered_at', `${fromDate}T00:00:00`).lte('registered_at', `${toDate}T23:59:59`);
          if (branchId) request = request.eq('branch_id', branchId);
          return request.order('registered_at', { ascending: false }).range(start, end) as unknown as Promise<PageResult<ReportRegistration>>;
        }),
      ]);
      setMembers(memberRows);
      setAttendance(attendanceRows);
      setSessions(sessionRows);
      setEvents(eventRows);
      setRegistrations(registrationRows);

      if (financePermission) {
        const [giftRows, expenseRows, pledgeRows] = await Promise.all([
          loadAllPages<ReportGift>((start, end) => {
            let request = client.from('giving_transactions').select('id,branch_id,amount,category,status,given_at')
              .eq('organization_id', current.id).gte('given_at', fromDate).lte('given_at', toDate);
            if (branchId) request = request.eq('branch_id', branchId);
            return request.order('given_at', { ascending: false }).range(start, end) as unknown as Promise<PageResult<ReportGift>>;
          }),
          loadAllPages<ReportExpense>((start, end) => {
            let request = client.from('financial_expenses').select('id,branch_id,amount,status,incurred_at')
              .eq('organization_id', current.id).gte('incurred_at', fromDate).lte('incurred_at', toDate);
            if (branchId) request = request.eq('branch_id', branchId);
            return request.order('incurred_at', { ascending: false }).range(start, end) as unknown as Promise<PageResult<ReportExpense>>;
          }),
          loadAllPages<ReportPledge>((start, end) => {
            let request = client.from('financial_pledges').select('id,branch_id,pledged_amount,status,due_date')
              .eq('organization_id', current.id).order('id');
            if (branchId) request = request.eq('branch_id', branchId);
            return request.range(start, end) as unknown as Promise<PageResult<ReportPledge>>;
          }),
        ]);
        setGifts(giftRows);
        setExpenses(expenseRows);
        setPledges(pledgeRows);
      } else {
        setGifts([]);
        setExpenses([]);
        setPledges([]);
      }
      setLoaded(true);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Could not load reports.');
      setMembers([]);
      setAttendance([]);
      setSessions([]);
      setEvents([]);
      setRegistrations([]);
      setGifts([]);
      setExpenses([]);
      setPledges([]);
    } finally {
      setLoading(false);
    }
  }, [branchId, fromDate, toDate]);

  useEffect(() => { void load(); }, [load]);

  const memberCounts = useMemo(() => members.reduce<Record<string, number>>((counts, member) => {
    counts[member.membership_status] = (counts[member.membership_status] ?? 0) + 1;
    return counts;
  }, {}), [members]);
  const newMembers = members.filter((member) => member.joined_at >= fromDate && member.joined_at <= toDate);
  const visitors = (memberCounts.visitor ?? 0) + (memberCounts.newcomer ?? 0);
  const verifiedGifts = gifts.filter((gift) => gift.status === 'verified');
  const totalGiving = verifiedGifts.reduce((sum, gift) => sum + Number(gift.amount), 0);
  const totalExpenses = expenses.filter((expense) => ['approved', 'paid'].includes(expense.status))
    .reduce((sum, expense) => sum + Number(expense.amount), 0);
  const activePledges = pledges.filter((pledge) => pledge.status === 'active');
  const pledgedTotal = activePledges.reduce((sum, pledge) => sum + Number(pledge.pledged_amount), 0);
  const attended = attendance.length;
  const attendedMembers = attendance.filter((record) => record.category === 'member').length;
  const attendedGuests = attended - attendedMembers;
  const completedEvents = events.filter((event) => event.status === 'completed').length;
  const futureEvents = events.filter((event) => event.status === 'scheduled' && event.starts_at.slice(0, 10) >= today).length;
  const registeredCount = registrations.filter((registration) => registration.status !== 'cancelled').length;
  const branchLabel = branchId ? organization?.branches.find((branch) => branch.id === branchId)?.name ?? 'Selected branch' : 'All branches';

  const exportReport = () => {
    const rows = [
      ['Report', 'Value', 'Period', 'Branch'],
      ['Active members', String(members.filter((member) => member.membership_status === 'member').length), `${fromDate} to ${toDate}`, branchLabel],
      ['Visitors and newcomers', String(visitors), `${fromDate} to ${toDate}`, branchLabel],
      ['New member records', String(newMembers.length), `${fromDate} to ${toDate}`, branchLabel],
      ['Attendance check-ins', String(attended), `${fromDate} to ${toDate}`, branchLabel],
      ['Attendance sessions', String(sessions.length), `${fromDate} to ${toDate}`, branchLabel],
      ['Events', String(events.length), `${fromDate} to ${toDate}`, branchLabel],
      ['Event registrations', String(registeredCount), `${fromDate} to ${toDate}`, branchLabel],
      ...(canViewFinance ? [
        ['Verified giving', totalGiving.toFixed(2), `${fromDate} to ${toDate}`, branchLabel],
        ['Approved and paid expenses', totalExpenses.toFixed(2), `${fromDate} to ${toDate}`, branchLabel],
        ['Active pledges', pledgedTotal.toFixed(2), `${fromDate} to ${toDate}`, branchLabel],
      ] : []),
    ];
    downloadReportCsv(`church-report-${fromDate}-to-${toDate}.csv`, rows);
    onAction('Report summary exported.');
  };

  const kpis = [
    { label: 'Active members', value: String(members.filter((member) => member.membership_status === 'member').length), detail: `${newMembers.length} joined in period`, icon: 'users', tone: 'mint' },
    { label: 'Attendance', value: attended.toLocaleString(), detail: `${attendedMembers} members · ${attendedGuests} guests and others`, icon: 'clipboard', tone: 'blue' },
    { label: 'Events', value: String(events.length), detail: `${futureEvents} upcoming · ${completedEvents} completed`, icon: 'calendar', tone: 'sand' },
    { label: 'Verified giving', value: canViewFinance ? formatAmount(totalGiving) : 'Restricted', detail: canViewFinance ? `${verifiedGifts.length} verified gifts · currency not configured` : 'Requires finance.view access', icon: canViewFinance ? 'wallet' : 'lock', tone: 'rose' },
  ];

  return <>
    <PageHeading page="reports" />
    <div className="reports-workspace">
      {!supabase && (
        <div className="preview-notice" role="status">
          <Icon name="database" size={17} />
          <span>Preview mode — connect Supabase to load live reports. Financial summaries are only shown to authorized roles.</span>
        </div>
      )}
      {loadError && <div className="workspace-alert" role="alert">{loadError}</div>}

      <section className="report-filters glass-card" aria-label="Report filters">
        <div className="report-date-fields">
          <label>From<input type="date" value={fromDate} max={toDate} onChange={(event) => setFromDate(event.target.value)} /></label>
          <label>To<input type="date" value={toDate} min={fromDate} onChange={(event) => setToDate(event.target.value)} /></label>
          <label>Branch<select value={branchId} onChange={(event) => setBranchId(event.target.value)}>
            <option value="">All branches</option>
            {organization?.branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
          </select></label>
        </div>
        <div className="report-filter-actions">
          <button className="button button-ghost" disabled={loading || !supabase} onClick={() => void load()}>
            <Icon name="activity" size={15} /> Refresh
          </button>
          <button className="button button-primary" disabled={!loaded || loading || !supabase} onClick={exportReport}>
            <Icon name="download" size={15} /> Export CSV
          </button>
        </div>
      </section>

      <nav className="report-tabs" aria-label="Report categories">
        {([
          ['overview', 'Overview', 'activity'],
          ['people', 'People', 'users'],
          ['attendance', 'Attendance', 'clipboard'],
          ['events', 'Events', 'calendar'],
          ['finance', 'Finance', canViewFinance ? 'wallet' : 'lock'],
        ] as const).map(([id, label, icon]) => (
          <button key={id} className={`report-tab ${tab === id ? 'active' : ''}`} onClick={() => setTab(id)}>
            <Icon name={icon} size={15} /> {label}
          </button>
        ))}
      </nav>

      {loading ? <div className="module-loading"><span className="loading-spinner" /><span>Loading reports</span></div> : <>
        <div className="report-period-label">{dateLabel(fromDate)} – {dateLabel(toDate)} <span>·</span> {branchLabel}</div>
        {tab === 'overview' && <>
          <section className="report-kpis" aria-label="Report summary">
            {kpis.map((item) => <article key={item.label} className={`report-kpi tone-${item.tone}`}>
              <div className="report-kpi-heading"><span className="summary-icon"><Icon name={item.icon} size={18} /></span><span>{item.label}</span></div>
              <strong>{item.value}</strong><small>{item.detail}</small>
            </article>)}
          </section>
          <section className="report-panels">
            <article className="report-panel glass-card">
              <div className="report-panel-heading"><div><span className="eyebrow">People & belonging</span><h2>Membership snapshot</h2></div><Icon name="users" size={19} /></div>
              <div className="report-breakdown">
                {['member', 'newcomer', 'visitor', 'inactive'].map((status) => (
                  <div key={status}><span>{status.replace('_', ' ')}</span><strong>{memberCounts[status] ?? 0}</strong></div>
                ))}
              </div>
            </article>
            <article className="report-panel glass-card">
              <div className="report-panel-heading"><div><span className="eyebrow">Gathering together</span><h2>Attendance overview</h2></div><Icon name="clipboard" size={19} /></div>
              <div className="report-stat-line"><span>Sessions held</span><strong>{sessions.length}</strong></div>
              <div className="report-stat-line"><span>Member check-ins</span><strong>{attendedMembers}</strong></div>
              <div className="report-stat-line"><span>Guest and other check-ins</span><strong>{attendedGuests}</strong></div>
            </article>
          </section>
        </>}
        {tab === 'people' && <section className="report-panel glass-card">
          <div className="report-panel-heading"><div><span className="eyebrow">Membership & visitor journey</span><h2>People report</h2></div><Icon name="users" size={19} /></div>
          <div className="report-breakdown">{['member', 'newcomer', 'visitor', 'inactive'].map((status) =>
            <div key={status}><span>{status.replace('_', ' ')}</span><strong>{memberCounts[status] ?? 0}</strong></div>)}</div>
          <div className="report-callout"><strong>{newMembers.length}</strong><span>member records joined during the selected period</span></div>
        </section>}
        {tab === 'attendance' && <section className="report-panel glass-card">
          <div className="report-panel-heading"><div><span className="eyebrow">Participation</span><h2>Attendance report</h2></div><Icon name="clipboard" size={19} /></div>
          <div className="report-stat-line"><span>Total check-ins</span><strong>{attended}</strong></div>
          <div className="report-stat-line"><span>Member check-ins</span><strong>{attendedMembers}</strong></div>
          <div className="report-stat-line"><span>Guest and other check-ins</span><strong>{attendedGuests}</strong></div>
          <div className="report-stat-line"><span>Sessions in period</span><strong>{sessions.length}</strong></div>
        </section>}
        {tab === 'events' && <section className="report-panel glass-card">
          <div className="report-panel-heading"><div><span className="eyebrow">Gatherings & registration</span><h2>Events report</h2></div><Icon name="calendar" size={19} /></div>
          <div className="report-stat-line"><span>Total events</span><strong>{events.length}</strong></div>
          <div className="report-stat-line"><span>Upcoming scheduled</span><strong>{futureEvents}</strong></div>
          <div className="report-stat-line"><span>Completed</span><strong>{completedEvents}</strong></div>
          <div className="report-stat-line"><span>Non-cancelled registrations</span><strong>{registeredCount}</strong></div>
        </section>}
        {tab === 'finance' && (canViewFinance ? <section className="report-panel glass-card">
          <div className="report-panel-heading"><div><span className="eyebrow">Permission-aware stewardship</span><h2>Financial summary</h2></div><Icon name="wallet" size={19} /></div>
          <div className="report-stat-line"><span>Verified giving</span><strong>{formatAmount(totalGiving)}</strong></div>
          <div className="report-stat-line"><span>Approved and paid expenses</span><strong>{formatAmount(totalExpenses)}</strong></div>
          <div className="report-stat-line"><span>Active pledges</span><strong>{formatAmount(pledgedTotal)}</strong></div>
          <div className="report-stat-line"><span>Verified gifts recorded</span><strong>{verifiedGifts.length}</strong></div>
        </section> : <section className="report-panel glass-card report-access-denied">
          <Icon name="lock" size={24} /><h2>Financial reports are restricted</h2>
          <p>Your account needs the <code>finance.view</code> permission to access giving, expenses, or pledge totals.</p>
        </section>)}
        {!loaded && !loadError && <div className="report-empty-hint">No live data loaded yet. Configure Supabase to view reports for your church.</div>}
      </>}
    </div>
  </>;
}
