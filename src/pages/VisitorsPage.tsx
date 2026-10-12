import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { Icon } from '../components/Icon';
import { PageHeading } from '../components/PageHeading';
import { getCurrentOrganization, type WorkspaceOrganization } from '../data/workspace';
import { createPreviewId, getPreviewOrganization, readPreviewRows, writePreviewRows } from '../data/previewStore';
import { supabase } from '../supabase';

type ContactMethod = 'in_person' | 'phone' | 'email' | 'whatsapp' | 'none';
type Visitor = {
  id: string;
  organization_id?: string;
  branch_id: string | null;
  first_name: string;
  last_name: string;
  phone: string | null;
  email: string | null;
  membership_status: 'visitor' | 'newcomer';
  first_visit_date: string;
  visit_source: string | null;
  contact_preference: ContactMethod;
  contact_consent: boolean;
};
type FollowUp = {
  id: string;
  organization_id?: string;
  member_id: string;
  title: string;
  due_date: string;
  contact_method: Exclude<ContactMethod, 'none'>;
  status: 'pending' | 'in_progress' | 'completed';
  notes: string | null;
  assigned_to: string | null;
};
type VisitorView = Visitor & { followUps: FollowUp[] };
type VisitorForm = {
  first_name: string;
  last_name: string;
  phone: string;
  email: string;
  branch_id: string;
  first_visit_date: string;
  visit_source: string;
  contact_preference: ContactMethod;
  contact_consent: boolean;
};
type FollowUpForm = { title: string; due_date: string; contact_method: Exclude<ContactMethod, 'none'>; notes: string };

const visitorColumns = 'id,branch_id,first_name,last_name,phone,email,membership_status,first_visit_date,visit_source,contact_preference,contact_consent';
const blankVisitor: VisitorForm = {
  first_name: '', last_name: '', phone: '', email: '', branch_id: '',
  first_visit_date: new Date().toISOString().slice(0, 10), visit_source: '',
  contact_preference: 'in_person', contact_consent: false,
};
const blankFollowUp: FollowUpForm = {
  title: 'Welcome follow-up', due_date: new Date().toISOString().slice(0, 10),
  contact_method: 'in_person', notes: '',
};

function dateLabel(date: string) {
  return new Date(`${date}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export function VisitorsPage({ onAction }: { onAction: (message: string) => void }) {
  const [organization, setOrganization] = useState<WorkspaceOrganization | null>(null);
  const [visitors, setVisitors] = useState<VisitorView[]>([]);
  const [people, setPeople] = useState<{ id: string; first_name: string; last_name: string }[]>([]);
  const [branches, setBranches] = useState<{ id: string; name: string; status?: string }[]>([]);
  const [loading, setLoading] = useState(Boolean(supabase));
  const [loadError, setLoadError] = useState('');
  const [dialogMode, setDialogMode] = useState<'intake' | 'follow-up' | 'consent' | null>(null);
  const [activeVisitor, setActiveVisitor] = useState<VisitorView | null>(null);
  const [visitorForm, setVisitorForm] = useState<VisitorForm>(blankVisitor);
  const [followUpForm, setFollowUpForm] = useState<FollowUpForm>(blankFollowUp);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState<'all' | 'visitor' | 'newcomer' | 'needs-follow-up'>('all');
  const [query, setQuery] = useState('');

  const load = useCallback(async () => {
    if (!supabase) {
      try {
        const rows = readPreviewRows<Visitor>('members').filter((row) => row.membership_status === 'visitor' || row.membership_status === 'newcomer');
        const followUps = readPreviewRows<FollowUp>('visitor_follow_ups');
        const localPeople = readPreviewRows<{ id: string; first_name: string; last_name: string }>('members');
        setOrganization(getPreviewOrganization());
        setPeople(localPeople);
        setBranches(readPreviewRows<{ id: string; name: string; status?: string }>('branches').filter((branch) => branch.status !== 'inactive'));
        setVisitors(rows.map((visitor) => ({
          ...visitor,
          followUps: followUps.filter((task) => task.member_id === visitor.id),
        })).sort((a, b) => b.first_visit_date.localeCompare(a.first_visit_date)));
      } catch (error) {
        setLoadError(error instanceof Error ? error.message : 'Could not load preview visitor records.');
      }
      setLoading(false);
      return;
    }
    setLoading(true);
    setLoadError('');
    try {
      const currentOrganization = await getCurrentOrganization(supabase);
      setOrganization(currentOrganization);
      const [visitorsResult, followUpsResult] = await Promise.all([
        supabase.from('members')
          .select(visitorColumns)
          .in('membership_status', ['visitor', 'newcomer'])
          .order('first_visit_date', { ascending: false }),
        supabase.from('visitor_follow_ups')
          .select('id,member_id,title,due_date,contact_method,status,notes,assigned_to')
          .order('due_date'),
      ]);
      if (visitorsResult.error) throw new Error(`Could not load visitors: ${visitorsResult.error.message}`);
      if (followUpsResult.error) throw new Error(`Could not load follow-up tasks: ${followUpsResult.error.message}`);
      const tasksByPerson = new Map<string, FollowUp[]>();
      for (const task of (followUpsResult.data ?? []) as FollowUp[]) {
        const existing = tasksByPerson.get(task.member_id) ?? [];
        existing.push(task);
        tasksByPerson.set(task.member_id, existing);
      }
      setVisitors(((visitorsResult.data ?? []) as Visitor[]).map((visitor) => ({
        ...visitor,
        followUps: tasksByPerson.get(visitor.id) ?? [],
      })));
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Could not load visitor records.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const overdueCount = visitors.reduce((count, visitor) => count + visitor.followUps.filter((task) =>
    task.status !== 'completed' && task.due_date < new Date().toISOString().slice(0, 10)).length, 0);
  const openFollowUps = visitors.reduce((count, visitor) => count + visitor.followUps.filter((task) => task.status !== 'completed').length, 0);
  const visibleVisitors = useMemo(() => {
    const search = query.trim().toLowerCase();
    return visitors.filter((visitor) => {
      const matchesSearch = !search || `${visitor.first_name} ${visitor.last_name} ${visitor.email ?? ''} ${visitor.phone ?? ''}`.toLowerCase().includes(search);
      const hasOpenTask = visitor.followUps.some((task) => task.status !== 'completed');
      const matchesFilter = filter === 'all' || visitor.membership_status === filter || (filter === 'needs-follow-up' && !hasOpenTask);
      return matchesSearch && matchesFilter;
    });
  }, [filter, query, visitors]);

  const openIntake = () => {
    setVisitorForm(blankVisitor);
    setFormError('');
    setDialogMode('intake');
  };
  const openFollowUp = (visitor: VisitorView) => {
    setActiveVisitor(visitor);
    setFollowUpForm({
      ...blankFollowUp,
      due_date: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
      contact_method: visitor.contact_consent && visitor.contact_preference !== 'none' ? visitor.contact_preference : 'in_person',
    });
    setFormError('');
    setDialogMode('follow-up');
  };
  const openConsent = (visitor: VisitorView) => {
    setActiveVisitor(visitor);
    setVisitorForm({
      ...blankVisitor,
      branch_id: visitor.branch_id ?? '',
      first_name: visitor.first_name,
      last_name: visitor.last_name,
      phone: visitor.phone ?? '',
      email: visitor.email ?? '',
      first_visit_date: visitor.first_visit_date,
      visit_source: visitor.visit_source ?? '',
      contact_preference: visitor.contact_preference,
      contact_consent: visitor.contact_consent,
    });
    setFormError('');
    setDialogMode('consent');
  };

  const submitIntake = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!organization) { setFormError('The church workspace is not available yet.'); return; }
    setSaving(true);
    setFormError('');
    const payload = {
      organization_id: organization.id,
      branch_id: visitorForm.branch_id || null,
      first_name: visitorForm.first_name.trim(),
      last_name: visitorForm.last_name.trim(),
      phone: visitorForm.phone.trim() || null,
      email: visitorForm.email.trim() || null,
      membership_status: 'visitor',
      joined_at: visitorForm.first_visit_date,
      first_visit_date: visitorForm.first_visit_date,
      visit_source: visitorForm.visit_source.trim() || null,
      contact_preference: visitorForm.contact_preference,
      contact_consent: visitorForm.contact_consent,
    };
    if (supabase) {
      const { error } = await supabase.from('members').insert(payload).select('id').single();
      if (error) {
        setFormError(`Could not save visitor: ${error.message}`);
        setSaving(false);
        return;
      }
    } else {
      try {
        writePreviewRows('members', [...readPreviewRows<Record<string, unknown> & Visitor>('members'), {
          ...payload, id: createPreviewId(), joined_at: visitorForm.first_visit_date, membership_number: null,
          gender: null, date_of_birth: null, baptism_date: null, address: null, city: null, notes: null,
        }]);
      } catch (error) {
        setFormError(error instanceof Error ? error.message : 'Could not save preview visitor.');
        setSaving(false);
        return;
      }
    }
    setDialogMode(null);
    setSaving(false);
    onAction(`${visitorForm.first_name} ${visitorForm.last_name} added to the visitor list.`);
    await load();
  };

  const updateContactConsent = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!activeVisitor) return;
    setSaving(true);
    setFormError('');
    if (supabase) {
      const { error } = await supabase.from('members').update({
        contact_preference: visitorForm.contact_preference,
        contact_consent: visitorForm.contact_consent,
      }).eq('id', activeVisitor.id);
      if (error) {
        setFormError(`Could not update contact preferences: ${error.message}`);
        setSaving(false);
        return;
      }
    } else {
      writePreviewRows('members', readPreviewRows<Visitor>('members').map((row) => row.id === activeVisitor.id
        ? { ...row, contact_preference: visitorForm.contact_preference, contact_consent: visitorForm.contact_consent }
        : row));
    }
    setDialogMode(null);
    setSaving(false);
    onAction(`Contact preferences updated for ${activeVisitor.first_name} ${activeVisitor.last_name}.`);
    await load();
  };

  const submitFollowUp = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!organization || !activeVisitor) return;
    if (followUpForm.contact_method !== 'in_person' && !activeVisitor.contact_consent) {
      setFormError('This visitor has not consented to external contact. Choose an in-person follow-up.');
      return;
    }
    setSaving(true);
    setFormError('');
    const payload = {
      organization_id: organization.id,
      branch_id: activeVisitor.branch_id,
      member_id: activeVisitor.id,
      title: followUpForm.title.trim(),
      due_date: followUpForm.due_date,
      contact_method: followUpForm.contact_method,
      notes: followUpForm.notes.trim() || null,
      assigned_to: null,
    };
    if (supabase) {
      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError || !userData.user) {
        setFormError(`Could not identify the assigned team member: ${userError?.message ?? 'No signed-in user.'}`);
        setSaving(false);
        return;
      }
      const { error } = await supabase.from('visitor_follow_ups').insert({ ...payload, assigned_to: userData.user.id });
      if (error) {
        setFormError(`Could not create follow-up: ${error.message}`);
        setSaving(false);
        return;
      }
    } else {
      writePreviewRows('visitor_follow_ups', [...readPreviewRows<FollowUp>('visitor_follow_ups'), {
        ...payload, id: createPreviewId(), status: 'pending', created_at: new Date().toISOString(),
      }]);
    }
    setDialogMode(null);
    setSaving(false);
    onAction(`Follow-up added for ${activeVisitor.first_name} ${activeVisitor.last_name}.`);
    await load();
  };

  const setFollowUpStatus = async (task: FollowUp, status: FollowUp['status']) => {
    if (!supabase) {
      writePreviewRows('visitor_follow_ups', readPreviewRows<FollowUp>('visitor_follow_ups').map((row) => row.id === task.id ? { ...row, status } : row));
      await load();
      return;
    }
    const { error } = await supabase.from('visitor_follow_ups')
      .update({ status, completed_at: status === 'completed' ? new Date().toISOString() : null })
      .eq('id', task.id);
    if (error) {
      onAction(`Could not update follow-up: ${error.message}`);
      return;
    }
    onAction(status === 'completed' ? 'Visitor follow-up completed.' : 'Follow-up moved back to the open queue.');
    await load();
  };

  const promoteToNewcomer = async (visitor: VisitorView) => {
    if (!supabase) {
      writePreviewRows('members', readPreviewRows<Visitor>('members').map((row) => row.id === visitor.id ? { ...row, membership_status: 'newcomer' } : row));
      onAction(`${visitor.first_name} ${visitor.last_name} moved to newcomer.`);
      await load();
      return;
    }
    const { error } = await supabase.from('members').update({ membership_status: 'newcomer' }).eq('id', visitor.id);
    if (error) {
      onAction(`Could not update visitor journey: ${error.message}`);
      return;
    }
    onAction(`${visitor.first_name} ${visitor.last_name} moved to newcomer.`);
    await load();
  };

  return <>
    <PageHeading page="visitors" />
    <section className="visitor-workspace">
      <div className="people-stats" aria-label="Visitor follow-up totals">
        <article><span>Visitor journeys</span><strong>{visitors.length}</strong></article>
        <article><span>First-time visitors</span><strong>{visitors.filter((visitor) => visitor.membership_status === 'visitor').length}</strong></article>
        <article><span>Open follow-ups</span><strong>{openFollowUps}</strong></article>
        <article><span>Overdue follow-ups</span><strong>{overdueCount}</strong></article>
      </div>
      <section className="visitor-panel glass-card">
        <div className="people-directory-heading"><div><span className="eyebrow">First impressions & belonging</span>
          <h2>Welcome journeys</h2><p>Record visits, respect contact preferences, and make the next personal welcome visible.</p></div>
          <button className="button button-primary" type="button" onClick={openIntake}><Icon name="user-plus" size={15} /> Record visitor</button></div>
        {!supabase && <div className="people-notice" role="status"><Icon name="database" size={17} /><span>Preview only. Connect Supabase to manage visitor records and follow-up tasks.</span></div>}
        {loadError && <div className="people-error" role="alert">{loadError}<button className="text-button" onClick={() => void load()}>Retry</button></div>}
        <div className="people-toolbar">
          <label className="people-search"><Icon name="search" size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search visitors by name or contact" aria-label="Search visitors" /></label>
          <label className="people-filter"><span>Journey</span><select value={filter} onChange={(event) => setFilter(event.target.value as typeof filter)} aria-label="Filter visitor journeys">
            <option value="all">All journeys</option><option value="visitor">First-time visitors</option><option value="newcomer">Newcomers</option><option value="needs-follow-up">Needs follow-up</option>
          </select></label>
        </div>
        <div className="visitor-list">
          {loading && <div className="household-empty"><span className="loading-spinner" /> Loading visitor journeys…</div>}
          {!loading && visibleVisitors.map((visitor) => <article className="visitor-card" key={visitor.id}>
            <div className="visitor-card-main">
              <span className="visitor-avatar">{visitor.first_name.slice(0, 1)}{visitor.last_name.slice(0, 1)}</span>
              <div className="visitor-card-copy"><div className="visitor-name-line"><h3>{visitor.first_name} {visitor.last_name}</h3>
                <span className={`member-status status-${visitor.membership_status}`}>{visitor.membership_status}</span></div>
                <p>{visitor.phone || visitor.email || 'No contact details shared'}{visitor.visit_source ? ` · ${visitor.visit_source}` : ''}</p>
                <small>First visit {visitor.first_visit_date ? dateLabel(visitor.first_visit_date) : 'date not recorded'} · {visitor.contact_consent ? `Consent: ${visitor.contact_preference}` : 'In-person contact only'}</small>
              </div>
              <div className="visitor-card-actions">
                {visitor.membership_status === 'visitor' && <button className="button button-ghost" type="button" onClick={() => void promoteToNewcomer(visitor)}>Mark newcomer</button>}
                <button className="button button-ghost" type="button" onClick={() => openConsent(visitor)}>Contact consent</button>
                <button className="button button-primary" type="button" onClick={() => openFollowUp(visitor)}><Icon name="plus" size={14} /> Add follow-up</button>
              </div>
            </div>
            <div className="visitor-followups">
              {visitor.followUps.map((task) => <div className={`visitor-task ${task.status === 'completed' ? 'completed' : ''} ${task.status !== 'completed' && task.due_date < new Date().toISOString().slice(0, 10) ? 'overdue' : ''}`} key={task.id}>
                <span className="visitor-task-icon"><Icon name={task.status === 'completed' ? 'check' : 'heart-handshake'} size={15} /></span>
                <div className="visitor-task-copy"><strong>{task.title}</strong><small>{task.contact_method.replace('_', ' ')} · Due {dateLabel(task.due_date)}{task.notes ? ` · ${task.notes}` : ''}</small></div>
                <span className="visitor-task-status">{task.status.replace('_', ' ')}</span>
                <button className="button button-ghost visitor-task-button" type="button" onClick={() => void setFollowUpStatus(task, task.status === 'completed' ? 'pending' : 'completed')}>
                  {task.status === 'completed' ? 'Reopen' : 'Complete'}</button>
              </div>)}
              {!visitor.followUps.length && <div className="visitor-no-tasks"><Icon name="clock" size={14} /> No follow-up recorded yet.</div>}
            </div>
          </article>)}
          {!loading && !visibleVisitors.length && <div className="household-empty">{query || filter !== 'all' ? 'No visitor journeys match these filters.' : 'No visitors yet. Record a first visit to begin a welcome journey.'}</div>}
        </div>
        <div className="people-table-footer"><span>Showing {visibleVisitors.length} of {visitors.length} guest journeys</span><span>Contact consent is recorded before non-in-person outreach.</span></div>
      </section>
    </section>

    {dialogMode && <div className="member-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) setDialogMode(null); }}>
      <section className="member-modal visitor-modal glass-card" role="dialog" aria-modal="true" aria-labelledby="visitor-dialog-title">
        <div className="member-modal-heading"><div><span className="eyebrow">Visitor care</span>
          <h2 id="visitor-dialog-title">{dialogMode === 'intake' ? 'Record a first visit' : dialogMode === 'consent' ? `Contact preferences for ${activeVisitor?.first_name ?? 'visitor'}` : `Plan a welcome for ${activeVisitor?.first_name ?? 'visitor'}`}</h2></div>
          <button className="icon-button" type="button" aria-label="Close visitor form" onClick={() => setDialogMode(null)}><Icon name="close" size={18} /></button></div>
        {dialogMode !== 'follow-up' ? <form className="member-form" onSubmit={(event) => void (dialogMode === 'consent' ? updateContactConsent(event) : submitIntake(event))}>
          <div className="member-form-grid">
            {dialogMode === 'intake' && <>
              <label>First name<input required maxLength={100} autoFocus value={visitorForm.first_name} onChange={(event) => setVisitorForm((current) => ({ ...current, first_name: event.target.value }))} /></label>
              <label>Last name<input required maxLength={100} value={visitorForm.last_name} onChange={(event) => setVisitorForm((current) => ({ ...current, last_name: event.target.value }))} /></label>
              <label>Phone<input type="tel" maxLength={40} value={visitorForm.phone} onChange={(event) => setVisitorForm((current) => ({ ...current, phone: event.target.value }))} /></label>
              <label>Email<input type="email" maxLength={254} value={visitorForm.email} onChange={(event) => setVisitorForm((current) => ({ ...current, email: event.target.value }))} /></label>
              <label>Branch<select value={visitorForm.branch_id} onChange={(event) => setVisitorForm((current) => ({ ...current, branch_id: event.target.value }))}><option value="">Organization-wide</option>{organization?.branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label>
              <label>First visit date<input type="date" required value={visitorForm.first_visit_date} onChange={(event) => setVisitorForm((current) => ({ ...current, first_visit_date: event.target.value }))} /></label>
              <label>How did they find us?<input maxLength={100} value={visitorForm.visit_source} onChange={(event) => setVisitorForm((current) => ({ ...current, visit_source: event.target.value }))} placeholder="Friend, community event…" /></label>
            </>}
            <label>Preferred contact<select value={visitorForm.contact_preference} onChange={(event) => setVisitorForm((current) => ({ ...current, contact_preference: event.target.value as ContactMethod }))}>
              <option value="in_person">In person</option><option value="phone">Phone</option><option value="email">Email</option><option value="whatsapp">WhatsApp</option><option value="none">No contact requested</option>
            </select></label>
            <label className="visitor-consent-toggle"><input type="checkbox" checked={visitorForm.contact_consent} onChange={(event) => setVisitorForm((current) => ({ ...current, contact_consent: event.target.checked }))} />
              The visitor agreed to contact using their selected method</label>
          </div>
          <p className="visitor-privacy-note"><Icon name="shield" size={14} /> Only record details the visitor chooses to share. Contact consent is optional.</p>
          {formError && <div className="people-error" role="alert">{formError}</div>}
          <div className="member-form-actions"><button className="button button-ghost" type="button" disabled={saving} onClick={() => setDialogMode(null)}>Cancel</button>
            <button className="button button-primary" disabled={saving}>{saving ? 'Saving…' : dialogMode === 'intake' ? 'Save visitor' : 'Save preferences'}</button></div>
        </form> : <form className="member-form" onSubmit={(event) => void submitFollowUp(event)}>
          <div className="member-form-grid">
            <label>Follow-up step<input required maxLength={140} autoFocus value={followUpForm.title} onChange={(event) => setFollowUpForm((current) => ({ ...current, title: event.target.value }))} /></label>
            <label>Due date<input type="date" required value={followUpForm.due_date} onChange={(event) => setFollowUpForm((current) => ({ ...current, due_date: event.target.value }))} /></label>
            <label>Contact method<select value={followUpForm.contact_method} onChange={(event) => setFollowUpForm((current) => ({ ...current, contact_method: event.target.value as FollowUpForm['contact_method'] }))}>
              <option value="in_person">In person</option>{activeVisitor?.contact_consent && <><option value="phone">Phone</option><option value="email">Email</option><option value="whatsapp">WhatsApp</option></>}
            </select></label>
            <label>Care note<input maxLength={500} value={followUpForm.notes} onChange={(event) => setFollowUpForm((current) => ({ ...current, notes: event.target.value }))} placeholder="Brief, non-sensitive reminder" /></label>
          </div>
          {!activeVisitor?.contact_consent && <p className="visitor-privacy-note"><Icon name="shield" size={14} /> No external contact consent is recorded. Only in-person follow-up is available.</p>}
          {formError && <div className="people-error" role="alert">{formError}</div>}
          <div className="member-form-actions"><button className="button button-ghost" type="button" disabled={saving} onClick={() => setDialogMode(null)}>Cancel</button>
            <button className="button button-primary" disabled={saving}>{saving ? 'Saving…' : 'Schedule follow-up'}</button></div>
        </form>}
      </section>
    </div>}
  </>;
}
