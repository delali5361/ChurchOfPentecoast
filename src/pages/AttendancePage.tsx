import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { Icon } from '../components/Icon';
import { PageHeading } from '../components/PageHeading';
import { getCurrentOrganization, type WorkspaceOrganization } from '../data/workspace';
import { supabase } from '../supabase';

type AttendanceSession = {
  id: string;
  title: string;
  session_type: string;
  session_date: string;
  branch_id: string | null;
  event_id: string | null;
  status: 'open' | 'closed';
};
type AttendanceRecord = {
  id: string;
  session_id: string;
  member_id: string | null;
  person_name: string;
  category: string;
  checked_in_at: string;
};
type Person = { id: string; first_name: string; last_name: string; membership_status: string; branch_id: string | null };
type ChurchEvent = { id: string; title: string; branch_id: string | null; starts_at: string };
type SessionForm = { title: string; session_type: string; session_date: string; branch_id: string; event_id: string };
type CheckInForm = { member_id: string; guest_name: string; category: string };

const emptySession: SessionForm = {
  title: '', session_type: 'service', session_date: new Date().toISOString().slice(0, 10), branch_id: '', event_id: '',
};
const emptyCheckIn: CheckInForm = { member_id: '', guest_name: '', category: 'member' };

function shortDate(date: string) {
  return new Date(`${date}T00:00:00`).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

export function AttendancePage({ onAction }: { onAction: (message: string) => void }) {
  const [organization, setOrganization] = useState<WorkspaceOrganization | null>(null);
  const [sessions, setSessions] = useState<AttendanceSession[]>([]);
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [events, setEvents] = useState<ChurchEvent[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState('');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(Boolean(supabase));
  const [loadError, setLoadError] = useState('');
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [dialog, setDialog] = useState<'session' | 'check-in' | null>(null);
  const [sessionForm, setSessionForm] = useState<SessionForm>(emptySession);
  const [checkInForm, setCheckInForm] = useState<CheckInForm>(emptyCheckIn);

  const load = useCallback(async () => {
    if (!supabase) { setLoading(false); return; }
    setLoading(true);
    setLoadError('');
    try {
      const current = await getCurrentOrganization(supabase);
      setOrganization(current);
      const [sessionResult, peopleResult, eventResult] = await Promise.all([
        supabase.from('attendance_sessions')
          .select('id,title,session_type,session_date,branch_id,event_id,status')
          .eq('organization_id', current.id)
          .order('session_date', { ascending: false })
          .order('created_at', { ascending: false }),
        supabase.from('members')
          .select('id,first_name,last_name,membership_status,branch_id')
          .neq('membership_status', 'inactive')
          .order('last_name'),
        supabase.from('events')
          .select('id,title,branch_id,starts_at')
          .eq('organization_id', current.id)
          .eq('status', 'scheduled')
          .order('starts_at'),
      ]);
      if (sessionResult.error) throw new Error(`Could not load attendance sessions: ${sessionResult.error.message}`);
      if (peopleResult.error) throw new Error(`Could not load attendee names: ${peopleResult.error.message}`);
      if (eventResult.error) throw new Error(`Could not load events: ${eventResult.error.message}`);

      const nextSessions = (sessionResult.data ?? []) as AttendanceSession[];
      setSessions(nextSessions);
      setPeople((peopleResult.data ?? []) as Person[]);
      setEvents((eventResult.data ?? []) as ChurchEvent[]);
      setSelectedSessionId((currentSession) => nextSessions.some((session) => session.id === currentSession)
        ? currentSession : nextSessions[0]?.id ?? '');

      if (nextSessions.length) {
        const { data, error } = await supabase.from('attendance_records')
          .select('id,session_id,member_id,person_name,category,checked_in_at')
          .eq('organization_id', current.id)
          .order('checked_in_at', { ascending: false });
        if (error) throw new Error(`Could not load check-in records: ${error.message}`);
        setRecords((data ?? []) as AttendanceRecord[]);
      } else {
        setRecords([]);
      }
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Could not load attendance workspace.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const selectedSession = sessions.find((session) => session.id === selectedSessionId);
  const sessionRecords = useMemo(() => records.filter((record) => record.session_id === selectedSessionId), [records, selectedSessionId]);
  const checkedInIds = new Set(sessionRecords.flatMap((record) => record.member_id ? [record.member_id] : []));
  const branchName = (branchId: string | null) => organization?.branches.find((branch) => branch.id === branchId)?.name ?? 'All branches';
  const eventName = (eventId: string | null) => events.find((event) => event.id === eventId)?.title;
  const filteredRecords = sessionRecords.filter((record) => record.person_name.toLowerCase().includes(query.trim().toLowerCase()));
  const openSessions = sessions.filter((session) => session.status === 'open').length;
  const attendeesThisMonth = records.filter((record) => record.checked_in_at.slice(0, 7) === new Date().toISOString().slice(0, 7)).length;

  const openCreateSession = () => {
    setSessionForm(emptySession);
    setFormError('');
    setDialog('session');
  };
  const openCheckIn = () => {
    setCheckInForm(emptyCheckIn);
    setFormError('');
    setDialog('check-in');
  };

  const submitSession = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!supabase || !organization) return;
    setSaving(true);
    setFormError('');
    const { data, error } = await supabase.from('attendance_sessions').insert({
      organization_id: organization.id,
      branch_id: sessionForm.branch_id || null,
      event_id: sessionForm.event_id || null,
      title: sessionForm.title.trim(),
      session_type: sessionForm.session_type,
      session_date: sessionForm.session_date,
      expected_count: 0,
      status: 'open',
    }).select('id').single();
    if (error || !data) {
      setFormError(`Could not create attendance session: ${error?.message ?? 'No session returned.'}`);
      setSaving(false);
      return;
    }
    setDialog(null);
    setSaving(false);
    setSelectedSessionId(data.id);
    onAction(`${sessionForm.title.trim()} attendance is open.`);
    await load();
  };

  const submitCheckIn = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!supabase || !selectedSession) return;
    setSaving(true);
    setFormError('');
    const person = people.find((item) => item.id === checkInForm.member_id);
    if (checkInForm.member_id && !person) {
      setFormError('Select a person from the directory or choose guest check-in.');
      setSaving(false);
      return;
    }
    if (!checkInForm.member_id && !checkInForm.guest_name.trim()) {
      setFormError('Enter a guest name.');
      setSaving(false);
      return;
    }
    const attendeeName = person ? `${person.first_name} ${person.last_name}` : checkInForm.guest_name.trim();
    const { error } = await supabase.from('attendance_records').insert({
      session_id: selectedSession.id,
      organization_id: organization?.id,
      branch_id: selectedSession.branch_id,
      member_id: person?.id ?? null,
      person_name: attendeeName,
      category: person?.membership_status ?? checkInForm.category,
    });
    if (error) {
      setFormError(error.code === '23505' ? `${attendeeName} is already checked in.` : `Could not check in attendee: ${error.message}`);
      setSaving(false);
      return;
    }
    setDialog(null);
    setSaving(false);
    onAction(`${attendeeName} checked in.`);
    await load();
  };

  const closeSession = async (session: AttendanceSession) => {
    if (!supabase) return;
    const status = session.status === 'open' ? 'closed' : 'open';
    const { error } = await supabase.from('attendance_sessions').update({ status }).eq('id', session.id);
    if (error) {
      onAction(`Could not update attendance session: ${error.message}`);
      return;
    }
    onAction(`${session.title} attendance ${status === 'closed' ? 'closed' : 'reopened'}.`);
    await load();
  };

  const removeCheckIn = async (record: AttendanceRecord) => {
    if (!supabase || !selectedSession) return;
    const { error } = await supabase.from('attendance_records').delete().eq('id', record.id);
    if (error) {
      onAction(`Could not remove check-in: ${error.message}`);
      return;
    }
    onAction(`${record.person_name} removed from attendance.`);
    await load();
  };

  return <>
    <PageHeading page="attendance" />
    <section className="attendance-workspace">
      <div className="people-stats" aria-label="Attendance totals">
        <article><span>Sessions</span><strong>{sessions.length}</strong></article>
        <article><span>Open check-ins</span><strong>{openSessions}</strong></article>
        <article><span>Checked in today</span><strong>{records.filter((record) => record.checked_in_at.slice(0, 10) === new Date().toISOString().slice(0, 10)).length}</strong></article>
        <article><span>This month</span><strong>{attendeesThisMonth}</strong></article>
      </div>
      {!supabase && <div className="people-notice" role="status"><Icon name="database" size={17} /><span>Preview only. Connect Supabase to record services and attendance.</span></div>}
      {loadError && <div className="people-error" role="alert">{loadError}<button className="text-button" onClick={() => void load()}>Retry</button></div>}
      <div className="attendance-layout">
        <section className="attendance-sessions glass-card" aria-label="Attendance sessions">
          <div className="attendance-panel-heading"><div><span className="eyebrow">Worship & gatherings</span><h2>Sessions</h2></div>
            <button className="icon-button" type="button" disabled={!supabase} aria-label="Create session" onClick={openCreateSession}><Icon name="plus" size={18} /></button></div>
          {loading && <div className="household-empty"><span className="loading-spinner" /> Loading sessions…</div>}
          {!loading && sessions.map((session) => <button className={`attendance-session-item ${selectedSessionId === session.id ? 'selected' : ''}`} type="button" key={session.id} onClick={() => { setSelectedSessionId(session.id); setQuery(''); }}>
            <span className="attendance-session-icon"><Icon name={session.event_id ? 'calendar' : 'clipboard'} size={16} /></span>
            <span className="attendance-session-copy"><strong>{session.title}</strong><small>{shortDate(session.session_date)} · {branchName(session.branch_id)}</small></span>
            <span className={`session-status ${session.status}`}>{session.status}</span>
          </button>)}
          {!loading && !sessions.length && <div className="household-empty">No sessions yet. Create a service or gathering to start attendance.</div>}
        </section>

        <section className="attendance-detail glass-card" aria-label="Session attendance">
          {selectedSession ? <>
            <div className="attendance-detail-heading"><div><span className="eyebrow">{selectedSession.session_type} · {branchName(selectedSession.branch_id)}</span>
              <h2>{selectedSession.title}</h2><p>{shortDate(selectedSession.session_date)}{eventName(selectedSession.event_id) ? ` · Event: ${eventName(selectedSession.event_id)}` : ''}</p></div>
              <div className="people-actions"><span className="attendance-count"><strong>{sessionRecords.length}</strong> checked in</span>
                {selectedSession.status === 'open' && <button className="button button-primary" type="button" disabled={!supabase} onClick={openCheckIn}><Icon name="user-plus" size={15} /> Check in</button>}
                <button className="button button-ghost" type="button" disabled={!supabase} onClick={() => void closeSession(selectedSession)}>{selectedSession.status === 'open' ? 'Close session' : 'Reopen'}</button></div></div>
            <label className="people-search attendance-search"><Icon name="search" size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find an attendee" aria-label="Search check-ins" /></label>
            <div className="attendance-record-list">
              {filteredRecords.map((record) => <article className="attendance-record" key={record.id}><span className="household-person-avatar">{record.person_name.split(/\s+/).slice(0, 2).map((part) => part.slice(0, 1)).join('').toUpperCase()}</span>
                <div className="household-person-copy"><strong>{record.person_name}</strong><small>{record.category} · {new Date(record.checked_in_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</small></div>
                {selectedSession.status === 'open' && <button className="icon-button attendance-remove" type="button" aria-label={`Remove ${record.person_name} check-in`} onClick={() => void removeCheckIn(record)}><Icon name="close" size={15} /></button>}</article>)}
              {!filteredRecords.length && <div className="household-empty">{query ? 'No attendees match that search.' : 'No one checked in yet. Use Check in to record attendance.'}</div>}
            </div>
          </> : <div className="household-no-selection"><span className="household-icon"><Icon name="clipboard" size={22} /></span>
            <h2>Attendance workspace</h2><p>Create a session for a church service or gathering, then check people in as they arrive.</p>
            <button className="button button-primary" type="button" disabled={!supabase} onClick={openCreateSession}><Icon name="plus" size={15} /> Create session</button></div>}
        </section>
      </div>
    </section>

    {dialog && <div className="member-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) setDialog(null); }}>
      <section className="member-modal phase5-modal glass-card" role="dialog" aria-modal="true" aria-labelledby="attendance-dialog-title">
        <div className="member-modal-heading"><div><span className="eyebrow">Attendance</span><h2 id="attendance-dialog-title">{dialog === 'session' ? 'Create a session' : 'Check in attendee'}</h2></div>
          <button className="icon-button" type="button" aria-label="Close attendance form" onClick={() => setDialog(null)}><Icon name="close" size={18} /></button></div>
        {dialog === 'session' ? <form className="member-form" onSubmit={(event) => void submitSession(event)}>
          <div className="member-form-grid">
            <label>Session name<input required autoFocus maxLength={120} value={sessionForm.title} onChange={(event) => setSessionForm((current) => ({ ...current, title: event.target.value }))} placeholder="e.g. Sunday morning service" /></label>
            <label>Gathering type<select value={sessionForm.session_type} onChange={(event) => setSessionForm((current) => ({ ...current, session_type: event.target.value }))}><option value="service">Church service</option><option value="prayer">Prayer meeting</option><option value="group">Small group</option><option value="meeting">Meeting</option><option value="event">Special event</option></select></label>
            <label>Date<input type="date" required value={sessionForm.session_date} onChange={(event) => setSessionForm((current) => ({ ...current, session_date: event.target.value }))} /></label>
            <label>Branch<select value={sessionForm.branch_id} onChange={(event) => setSessionForm((current) => ({ ...current, branch_id: event.target.value, event_id: '' }))}><option value="">Organization-wide</option>{organization?.branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label>
            <label className="member-notes-field">Link scheduled event<select value={sessionForm.event_id} onChange={(event) => {
              const selectedEvent = events.find((item) => item.id === event.target.value);
              setSessionForm((current) => ({ ...current, event_id: event.target.value, branch_id: selectedEvent?.branch_id ?? current.branch_id }));
            }}><option value="">No event linked</option>{events.filter((event) => !sessionForm.branch_id || event.branch_id === sessionForm.branch_id || event.branch_id === null).map((event) => <option key={event.id} value={event.id}>{event.title} · {new Date(event.starts_at).toLocaleDateString()}</option>)}</select></label>
          </div>
          {formError && <div className="people-error" role="alert">{formError}</div>}
          <div className="member-form-actions"><button type="button" className="button button-ghost" disabled={saving} onClick={() => setDialog(null)}>Cancel</button><button className="button button-primary" disabled={saving}>{saving ? 'Saving…' : 'Open session'}</button></div>
        </form> : selectedSession ? <form className="member-form" onSubmit={(event) => void submitCheckIn(event)}>
          <div className="member-form-grid">
            <label>Church member / visitor<select value={checkInForm.member_id} onChange={(event) => setCheckInForm((current) => ({ ...current, member_id: event.target.value }))}><option value="">Guest (enter name below)</option>
              {people.filter((person) => !checkedInIds.has(person.id) && (!selectedSession.branch_id || !person.branch_id || person.branch_id === selectedSession.branch_id)).map((person) =>
                <option key={person.id} value={person.id}>{person.first_name} {person.last_name} · {person.membership_status}</option>)}</select></label>
            {!checkInForm.member_id && <label>Guest name<input autoFocus required maxLength={160} value={checkInForm.guest_name} onChange={(event) => setCheckInForm((current) => ({ ...current, guest_name: event.target.value }))} /></label>}
            {!checkInForm.member_id && <label>Attendee category<select value={checkInForm.category} onChange={(event) => setCheckInForm((current) => ({ ...current, category: event.target.value }))}><option value="visitor">Visitor</option><option value="child">Child</option><option value="worker">Worker</option><option value="guest">Guest</option></select></label>}
          </div>
          {formError && <div className="people-error" role="alert">{formError}</div>}
          <div className="member-form-actions"><button type="button" className="button button-ghost" disabled={saving} onClick={() => setDialog(null)}>Cancel</button><button className="button button-primary" disabled={saving}>{saving ? 'Checking in…' : 'Check in attendee'}</button></div>
        </form> : null}
      </section>
    </div>}
  </>;
}
