import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { Icon } from '../components/Icon';
import { PageHeading } from '../components/PageHeading';
import { createPreviewId, getPreviewOrganization, readPreviewRows, writePreviewRows } from '../data/previewStore';
import { getCurrentOrganization, type WorkspaceOrganization } from '../data/workspace';
import { supabase } from '../supabase';

type EventStatus = 'scheduled' | 'completed' | 'cancelled';
type ChurchEvent = {
  id: string;
  branch_id: string | null;
  title: string;
  description: string | null;
  event_type: string;
  starts_at: string;
  ends_at: string | null;
  location: string | null;
  capacity: number | null;
  registration_required: boolean;
  attendee_count: number;
  status: EventStatus;
};
type Registration = {
  id: string;
  event_id: string;
  member_id: string | null;
  attendee_name: string;
  email: string | null;
  phone: string | null;
  status: 'registered' | 'attended' | 'cancelled';
  registered_at: string;
};
type Person = { id: string; first_name: string; last_name: string; email: string | null; phone: string | null; membership_status: string; branch_id: string | null };
type EventForm = {
  title: string; description: string; event_type: string; starts_at: string;
  ends_at: string; branch_id: string; location: string; capacity: string; registration_required: boolean;
};
type RegistrationForm = { member_id: string; attendee_name: string; email: string; phone: string };

const eventColumns = 'id,branch_id,title,description,event_type,starts_at,ends_at,location,capacity,registration_required,attendee_count,status';
const emptyEvent: EventForm = {
  title: '', description: '', event_type: 'service',
  starts_at: new Date(Date.now() + 60 * 60 * 1000).toISOString().slice(0, 16),
  ends_at: '', branch_id: '', location: '', capacity: '', registration_required: false,
};
const emptyRegistration: RegistrationForm = { member_id: '', attendee_name: '', email: '', phone: '' };

function formatDateTime(value: string) {
  return new Date(value).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}
function dateTimeInput(value: string) {
  const date = new Date(value);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

export function EventsPage({ onAction }: { onAction: (message: string) => void }) {
  const [organization, setOrganization] = useState<WorkspaceOrganization | null>(null);
  const [events, setEvents] = useState<ChurchEvent[]>([]);
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [selectedEventId, setSelectedEventId] = useState('');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'all' | EventStatus>('all');
  const [loading, setLoading] = useState(Boolean(supabase));
  const [loadError, setLoadError] = useState('');
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [dialog, setDialog] = useState<'event' | 'registration' | null>(null);
  const [editingEvent, setEditingEvent] = useState<ChurchEvent | null>(null);
  const [eventForm, setEventForm] = useState<EventForm>(emptyEvent);
  const [registrationForm, setRegistrationForm] = useState<RegistrationForm>(emptyRegistration);

  const load = useCallback(async () => {
    if (!supabase) {
      setLoadError('');
      try {
        const nextEvents = readPreviewRows<ChurchEvent>('events').sort((left, right) => left.starts_at.localeCompare(right.starts_at));
        const nextRegistrations = readPreviewRows<Registration>('event_registrations');
        const nextPeople = readPreviewRows<Person>('members').filter((person) => person.membership_status !== 'inactive');
        const branches = readPreviewRows<WorkspaceOrganization['branches'][number]>('branches');
        setOrganization(getPreviewOrganization(branches));
        setEvents(nextEvents);
        setRegistrations(nextRegistrations);
        setPeople(nextPeople);
        setSelectedEventId((currentId) => nextEvents.some((event) => event.id === currentId) ? currentId : nextEvents[0]?.id ?? '');
      } catch (error) {
        setLoadError(error instanceof Error ? error.message : 'Could not load preview events.');
      }
      setLoading(false);
      return;
    }
    setLoading(true);
    setLoadError('');
    try {
      const current = await getCurrentOrganization(supabase);
      setOrganization(current);
      const [eventResult, registrationResult, peopleResult] = await Promise.all([
        supabase.from('events')
          .select(eventColumns)
          .eq('organization_id', current.id)
          .order('starts_at', { ascending: true }),
        supabase.from('event_registrations')
          .select('id,event_id,member_id,attendee_name,email,phone,status,registered_at')
          .eq('organization_id', current.id)
          .order('registered_at', { ascending: false }),
        supabase.from('members')
          .select('id,first_name,last_name,email,phone,membership_status,branch_id')
          .neq('membership_status', 'inactive')
          .order('last_name'),
      ]);
      if (eventResult.error) throw new Error(`Could not load events: ${eventResult.error.message}`);
      if (registrationResult.error) throw new Error(`Could not load event registrations: ${registrationResult.error.message}`);
      if (peopleResult.error) throw new Error(`Could not load registrants: ${peopleResult.error.message}`);
      const nextEvents = (eventResult.data ?? []) as ChurchEvent[];
      setEvents(nextEvents);
      setRegistrations((registrationResult.data ?? []) as Registration[]);
      setPeople((peopleResult.data ?? []) as Person[]);
      setSelectedEventId((currentId) => nextEvents.some((event) => event.id === currentId) ? currentId : nextEvents[0]?.id ?? '');
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Could not load events workspace.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const selectedEvent = events.find((event) => event.id === selectedEventId);
  const visibleEvents = useMemo(() => events.filter((event) => {
    const matchesQuery = !query.trim() || `${event.title} ${event.event_type} ${event.location ?? ''}`.toLowerCase().includes(query.trim().toLowerCase());
    return matchesQuery && (filter === 'all' || event.status === filter);
  }), [events, filter, query]);
  const eventRegistrations = registrations.filter((registration) => registration.event_id === selectedEventId);
  const registered = eventRegistrations.filter((registration) => registration.status !== 'cancelled');
  const upcomingCount = events.filter((event) => event.status === 'scheduled' && new Date(event.starts_at) >= new Date()).length;
  const totalRegistered = registrations.filter((registration) => registration.status !== 'cancelled').length;
  const branchName = (branchId: string | null) => organization?.branches.find((branch) => branch.id === branchId)?.name ?? 'All branches';
  const eventCounts = new Map(events.map((event) => [event.id, registrations.filter((registration) => registration.event_id === event.id && registration.status !== 'cancelled').length]));

  const openCreate = () => {
    setEditingEvent(null);
    setEventForm(emptyEvent);
    setFormError('');
    setDialog('event');
  };
  const openEdit = (event: ChurchEvent) => {
    setEditingEvent(event);
    setEventForm({
      title: event.title,
      description: event.description ?? '',
      event_type: event.event_type,
      starts_at: dateTimeInput(event.starts_at),
      ends_at: event.ends_at ? dateTimeInput(event.ends_at) : '',
      branch_id: event.branch_id ?? '',
      location: event.location ?? '',
      capacity: event.capacity === null ? '' : String(event.capacity),
      registration_required: event.registration_required,
    });
    setFormError('');
    setDialog('event');
  };
  const openRegistration = () => {
    setRegistrationForm(emptyRegistration);
    setFormError('');
    setDialog('registration');
  };

  const submitEvent = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!organization) {
      setFormError('The church workspace is not available yet.');
      return;
    }
    setSaving(true);
    setFormError('');
    const startsAt = new Date(eventForm.starts_at);
    const endsAt = eventForm.ends_at ? new Date(eventForm.ends_at) : null;
    if (endsAt && endsAt <= startsAt) {
      setFormError('Event end time must be after its start time.');
      setSaving(false);
      return;
    }
    const capacity = eventForm.capacity.trim() ? Number(eventForm.capacity) : null;
    if (capacity !== null && (!Number.isInteger(capacity) || capacity < 0)) {
      setFormError('Capacity must be a whole number of zero or more.');
      setSaving(false);
      return;
    }
    const payload = {
      branch_id: eventForm.branch_id || null,
      title: eventForm.title.trim(),
      description: eventForm.description.trim() || null,
      event_type: eventForm.event_type,
      starts_at: startsAt.toISOString(),
      ends_at: endsAt?.toISOString() ?? null,
      location: eventForm.location.trim() || null,
      capacity,
      registration_required: eventForm.registration_required,
    };
    let eventId = editingEvent?.id ?? createPreviewId();
    try {
      if (supabase) {
        const result = editingEvent
          ? await supabase.from('events').update(payload).eq('id', editingEvent.id).select('id').single()
          : await supabase.from('events').insert({ organization_id: organization.id, ...payload, status: 'scheduled', attendee_count: 0 }).select('id').single();
        if (result.error || !result.data) {
          setFormError(`Could not ${editingEvent ? 'update' : 'create'} event: ${result.error?.message ?? 'No event returned.'}`);
          setSaving(false);
          return;
        }
        eventId = result.data.id;
      } else {
        const rows = readPreviewRows<ChurchEvent>('events');
        const nextEvent: ChurchEvent = {
          ...payload,
          id: eventId,
          attendee_count: editingEvent?.attendee_count ?? 0,
          status: editingEvent?.status ?? 'scheduled',
        };
        writePreviewRows('events', editingEvent
          ? rows.map((row) => row.id === eventId ? nextEvent : row)
          : [...rows, nextEvent]);
      }
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Could not save event.');
      setSaving(false);
      return;
    }
    setDialog(null);
    setSaving(false);
    setSelectedEventId(eventId);
    onAction(`${payload.title} ${editingEvent ? 'updated' : 'created'}.`);
    await load();
  };

  const submitRegistration = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!organization || !selectedEvent) return;
    setSaving(true);
    setFormError('');
    const person = people.find((item) => item.id === registrationForm.member_id);
    if (registrationForm.member_id && !person) {
      setFormError('Select a person from the directory or enter guest details instead.');
      setSaving(false);
      return;
    }
    if (!person && !registrationForm.attendee_name.trim()) {
      setFormError('Enter the guest attendee name.');
      setSaving(false);
      return;
    }
    if (selectedEvent.capacity !== null && registered.length >= selectedEvent.capacity) {
      setFormError('This event has reached its registration capacity.');
      setSaving(false);
      return;
    }
    const name = person ? `${person.first_name} ${person.last_name}` : registrationForm.attendee_name.trim();
    const payload = {
      event_id: selectedEvent.id,
      member_id: person?.id ?? null,
      attendee_name: name,
      email: person?.email ?? (registrationForm.email.trim() || null),
      phone: person?.phone ?? (registrationForm.phone.trim() || null),
    };
    try {
      if (supabase) {
        const { error } = await supabase.from('event_registrations').insert({
          organization_id: organization.id,
          branch_id: selectedEvent.branch_id,
          ...payload,
        });
        if (error) {
          setFormError(error.code === '23505' ? `${name} is already registered.` : `Could not register attendee: ${error.message}`);
          setSaving(false);
          return;
        }
      } else {
        const rows = readPreviewRows<Registration>('event_registrations');
        if (person && rows.some((row) => row.event_id === selectedEvent.id && row.member_id === person.id && row.status !== 'cancelled')) {
          setFormError(`${name} is already registered.`);
          setSaving(false);
          return;
        }
        writePreviewRows('event_registrations', [...rows, {
          ...payload,
          id: createPreviewId(),
          status: 'registered',
          registered_at: new Date().toISOString(),
        }]);
      }
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Could not register attendee.');
      setSaving(false);
      return;
    }
    setDialog(null);
    setSaving(false);
    onAction(`${name} registered for ${selectedEvent.title}.`);
    await load();
  };

  const updateRegistration = async (registration: Registration, status: Registration['status']) => {
    if (supabase) {
      const { error } = await supabase.from('event_registrations').update({ status }).eq('id', registration.id);
      if (error) {
        onAction(`Could not update registration: ${error.message}`);
        return;
      }
    } else {
      try {
        writePreviewRows('event_registrations', readPreviewRows<Registration>('event_registrations')
          .map((row) => row.id === registration.id ? { ...row, status } : row));
      } catch (error) {
        onAction(`Could not update registration: ${error instanceof Error ? error.message : 'Unknown error'}`);
        return;
      }
    }
    onAction(`${registration.attendee_name} marked ${status}.`);
    await load();
  };

  const updateEventStatus = async (event: ChurchEvent, status: EventStatus) => {
    if (supabase) {
      const { error } = await supabase.from('events').update({ status }).eq('id', event.id);
      if (error) {
        onAction(`Could not update event status: ${error.message}`);
        return;
      }
    } else {
      try {
        writePreviewRows('events', readPreviewRows<ChurchEvent>('events')
          .map((row) => row.id === event.id ? { ...row, status } : row));
      } catch (error) {
        onAction(`Could not update event status: ${error instanceof Error ? error.message : 'Unknown error'}`);
        return;
      }
    }
    onAction(`${event.title} marked ${status}.`);
    await load();
  };

  return <>
    <PageHeading page="events" />
    <section className="events-workspace">
      <div className="people-stats" aria-label="Event totals">
        <article><span>Upcoming events</span><strong>{upcomingCount}</strong></article>
        <article><span>Scheduled total</span><strong>{events.filter((event) => event.status === 'scheduled').length}</strong></article>
        <article><span>People registered</span><strong>{totalRegistered}</strong></article>
        <article><span>Completed events</span><strong>{events.filter((event) => event.status === 'completed').length}</strong></article>
      </div>
      {!supabase && <div className="people-notice" role="status"><Icon name="database" size={17} /><span>Preview only. Events and registrations are saved in this browser and are not shared or synced.</span></div>}
      {loadError && <div className="people-error" role="alert">{loadError}<button className="text-button" onClick={() => void load()}>Retry</button></div>}
      <section className="events-panel glass-card">
        <div className="events-heading"><div><span className="eyebrow">Services & gatherings</span><h2>Church events</h2><p>Coordinate church-wide gatherings and keep registrations connected to attendance.</p></div>
          <button className="button button-primary" type="button" onClick={openCreate}><Icon name="plus" size={15} /> Create event</button></div>
        <div className="people-toolbar">
          <label className="people-search"><Icon name="search" size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search events" aria-label="Search events" /></label>
          <label className="people-filter"><span>Status</span><select value={filter} onChange={(event) => setFilter(event.target.value as typeof filter)} aria-label="Filter events">
            <option value="all">All events</option><option value="scheduled">Scheduled</option><option value="completed">Completed</option><option value="cancelled">Cancelled</option>
          </select></label>
        </div>
        <div className="events-layout">
          <div className="events-list" aria-label="Event list">
            {loading && <div className="household-empty"><span className="loading-spinner" /> Loading events…</div>}
            {!loading && visibleEvents.map((event) => <button className={`event-list-card ${selectedEventId === event.id ? 'selected' : ''}`} type="button" key={event.id} onClick={() => setSelectedEventId(event.id)}>
              <span className="event-date-tile"><strong>{new Date(event.starts_at).toLocaleDateString(undefined, { day: '2-digit' })}</strong><small>{new Date(event.starts_at).toLocaleDateString(undefined, { month: 'short' })}</small></span>
              <span className="event-list-copy"><strong>{event.title}</strong><small>{event.event_type} · {branchName(event.branch_id)}</small><small>{formatDateTime(event.starts_at)}</small></span>
              <span className={`member-status status-${event.status === 'scheduled' ? 'member' : event.status === 'cancelled' ? 'inactive' : 'newcomer'}`}>{event.status}</span>
              <span className="event-attendee-count"><Icon name="users" size={13} /> {eventCounts.get(event.id) ?? event.attendee_count}</span>
            </button>)}
            {!loading && !visibleEvents.length && <div className="household-empty">{query || filter !== 'all' ? 'No events match these filters.' : 'No events scheduled yet. Create an event to begin.'}</div>}
          </div>
          <section className="event-detail" aria-label="Event details">
            {selectedEvent ? <>
              <div className="event-detail-heading"><div><span className="eyebrow">{selectedEvent.event_type} · {branchName(selectedEvent.branch_id)}</span>
                <h3>{selectedEvent.title}</h3><p>{formatDateTime(selectedEvent.starts_at)}{selectedEvent.ends_at ? ` – ${new Date(selectedEvent.ends_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : ''}</p>
                {selectedEvent.location && <p><Icon name="church" size={13} /> {selectedEvent.location}</p>}
                {selectedEvent.description && <p className="event-description">{selectedEvent.description}</p>}</div>
                <button className="icon-button" type="button" aria-label="Edit event" onClick={() => openEdit(selectedEvent)}><Icon name="settings" size={16} /></button></div>
              <div className="event-capacity-row"><span><strong>{registered.length}</strong> registered{selectedEvent.capacity !== null ? ` of ${selectedEvent.capacity}` : ''}</span>
                <span>{selectedEvent.registration_required ? 'Registration required' : 'Walk-ins welcome'}</span></div>
              <div className="event-detail-actions">
                {selectedEvent.status === 'scheduled' && <><button className="button button-primary" type="button" disabled={selectedEvent.capacity !== null && registered.length >= selectedEvent.capacity} onClick={openRegistration}><Icon name="user-plus" size={14} /> Register attendee</button>
                  <button className="button button-ghost" type="button" onClick={() => void updateEventStatus(selectedEvent, 'completed')}>Mark completed</button>
                  <button className="text-button cancel-event-button" type="button" onClick={() => void updateEventStatus(selectedEvent, 'cancelled')}>Cancel event</button></>}
                {selectedEvent.status === 'cancelled' && <button className="button button-ghost" type="button" onClick={() => void updateEventStatus(selectedEvent, 'scheduled')}>Restore event</button>}
              </div>
              <div className="event-registrations-heading"><h4>Registrations</h4><span>{eventRegistrations.length}</span></div>
              <div className="event-registrations">
                {eventRegistrations.map((registration) => <article className={`event-registration ${registration.status}`} key={registration.id}>
                  <span className="household-person-avatar">{registration.attendee_name.split(/\s+/).slice(0, 2).map((part) => part.slice(0, 1)).join('').toUpperCase()}</span>
                  <div className="household-person-copy"><strong>{registration.attendee_name}</strong><small>{registration.email || registration.phone || 'No contact details'}</small></div>
                  <span className={`member-status status-${registration.status === 'cancelled' ? 'inactive' : registration.status === 'attended' ? 'member' : 'newcomer'}`}>{registration.status}</span>
                  {selectedEvent.status === 'scheduled' && registration.status !== 'cancelled' && <button className="text-button" type="button" onClick={() => void updateRegistration(registration, registration.status === 'attended' ? 'registered' : 'attended')}>{registration.status === 'attended' ? 'Undo attendance' : 'Mark attended'}</button>}
                  {selectedEvent.status === 'scheduled' && registration.status === 'registered' && <button className="icon-button attendance-remove" type="button" aria-label={`Cancel ${registration.attendee_name} registration`} onClick={() => void updateRegistration(registration, 'cancelled')}><Icon name="close" size={15} /></button>}
                </article>)}
                {!eventRegistrations.length && <div className="household-empty">No registrations yet.</div>}
              </div>
            </> : <div className="household-no-selection"><span className="household-icon"><Icon name="calendar" size={22} /></span><h2>Events calendar</h2>
              <p>Create an event, manage registrations, and connect its attendance session.</p><button className="button button-primary" type="button" onClick={openCreate}><Icon name="plus" size={15} /> Create event</button></div>}
          </section>
        </div>
      </section>
    </section>

    {dialog && <div className="member-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) setDialog(null); }}>
      <section className="member-modal phase5-modal glass-card" role="dialog" aria-modal="true" aria-labelledby="event-dialog-title">
        <div className="member-modal-heading"><div><span className="eyebrow">Events & gatherings</span><h2 id="event-dialog-title">{dialog === 'event' ? editingEvent ? 'Edit event' : 'Create event' : `Register for ${selectedEvent?.title ?? 'event'}`}</h2></div>
          <button className="icon-button" type="button" aria-label="Close event form" onClick={() => setDialog(null)}><Icon name="close" size={18} /></button></div>
        {dialog === 'event' ? <form className="member-form" onSubmit={(event) => void submitEvent(event)}>
          <div className="member-form-grid">
            <label>Event title<input required autoFocus maxLength={160} value={eventForm.title} onChange={(event) => setEventForm((current) => ({ ...current, title: event.target.value }))} /></label>
            <label>Event type<select value={eventForm.event_type} onChange={(event) => setEventForm((current) => ({ ...current, event_type: event.target.value }))}><option value="service">Service</option><option value="conference">Conference</option><option value="fellowship">Fellowship</option><option value="meeting">Meeting</option><option value="outreach">Outreach</option><option value="other">Other</option></select></label>
            <label>Starts<input type="datetime-local" required value={eventForm.starts_at} onChange={(event) => setEventForm((current) => ({ ...current, starts_at: event.target.value }))} /></label>
            <label>Ends (optional)<input type="datetime-local" value={eventForm.ends_at} onChange={(event) => setEventForm((current) => ({ ...current, ends_at: event.target.value }))} /></label>
            <label>Branch<select value={eventForm.branch_id} onChange={(event) => setEventForm((current) => ({ ...current, branch_id: event.target.value }))}><option value="">Organization-wide</option>{organization?.branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label>
            <label>Location<input maxLength={180} value={eventForm.location} onChange={(event) => setEventForm((current) => ({ ...current, location: event.target.value }))} /></label>
            <label>Capacity (optional)<input type="number" min="0" step="1" value={eventForm.capacity} onChange={(event) => setEventForm((current) => ({ ...current, capacity: event.target.value }))} /></label>
            <label className="event-registration-required"><input type="checkbox" checked={eventForm.registration_required} onChange={(event) => setEventForm((current) => ({ ...current, registration_required: event.target.checked }))} /> Registration required</label>
            <label className="member-notes-field">Description<textarea rows={3} maxLength={1200} value={eventForm.description} onChange={(event) => setEventForm((current) => ({ ...current, description: event.target.value }))} /></label>
          </div>
          {formError && <div className="people-error" role="alert">{formError}</div>}
          <div className="member-form-actions"><button className="button button-ghost" type="button" disabled={saving} onClick={() => setDialog(null)}>Cancel</button><button className="button button-primary" disabled={saving}>{saving ? 'Saving…' : editingEvent ? 'Save changes' : 'Create event'}</button></div>
        </form> : <form className="member-form" onSubmit={(event) => void submitRegistration(event)}>
          <div className="member-form-grid">
            <label>Church member / visitor<select value={registrationForm.member_id} onChange={(event) => setRegistrationForm((current) => ({ ...current, member_id: event.target.value }))}><option value="">Guest (enter details below)</option>
              {people.filter((person) => !eventRegistrations.some((registration) => registration.member_id === person.id && registration.status !== 'cancelled')
                && (!selectedEvent?.branch_id || !person.branch_id || person.branch_id === selectedEvent.branch_id)).map((person) =>
                <option key={person.id} value={person.id}>{person.first_name} {person.last_name} · {person.membership_status}</option>)}</select></label>
            {!registrationForm.member_id && <>
              <label>Guest name<input required autoFocus maxLength={160} value={registrationForm.attendee_name} onChange={(event) => setRegistrationForm((current) => ({ ...current, attendee_name: event.target.value }))} /></label>
              <label>Email<input type="email" maxLength={254} value={registrationForm.email} onChange={(event) => setRegistrationForm((current) => ({ ...current, email: event.target.value }))} /></label>
              <label>Phone<input type="tel" maxLength={40} value={registrationForm.phone} onChange={(event) => setRegistrationForm((current) => ({ ...current, phone: event.target.value }))} /></label>
            </>}
          </div>
          {formError && <div className="people-error" role="alert">{formError}</div>}
          <div className="member-form-actions"><button className="button button-ghost" type="button" disabled={saving} onClick={() => setDialog(null)}>Cancel</button><button className="button button-primary" disabled={saving}>{saving ? 'Registering…' : 'Register attendee'}</button></div>
        </form>}
      </section>
    </div>}
  </>;
}
