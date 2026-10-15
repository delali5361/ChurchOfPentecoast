import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Icon } from '../components/Icon';
import { readPreviewRows } from '../data/previewStore';
import { supabase } from '../supabase';
import type { PageId } from '../types';

type MemberProfile = {
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  membership_status: string;
};
type ChurchEvent = {
  id: string;
  title: string;
  event_type: string;
  starts_at: string;
  location: string | null;
  status: string;
};
type AttendanceSession = { id: string; title: string; event_id: string | null; session_date: string };
type AttendanceRecord = { session_id: string; member_id: string | null; checked_in_at: string };
type PreviewAnnouncement = {
  id: string;
  name: string;
  audience: string;
  message: string;
  status: string;
  created_at: string;
};
type MemberGroup = { id: string; name: string; description: string | null; unit_type: string; status: string };
type Household = { id: string; name: string; status: string };
type HouseholdLink = { household_id: string; member_id: string; relationship: string; is_primary: boolean };
type GivingPreference = { category: 'tithe' | 'offering' | 'designated'; designation: string; amount: string; recurring: string };
type NoticePreferences = {
  communicationConsent: boolean;
  announcements: boolean;
  serviceReminders: boolean;
  eventReminders: boolean;
  email: boolean;
  sms: boolean;
};

const preferenceKey = 'church-cms.member.notification-preferences';
const profileKey = 'church-cms.member.profile';
const givingDefaults: GivingPreference = { category: 'offering', designation: '', amount: '', recurring: 'once' };
const noticeDefaults: NoticePreferences = {
  communicationConsent: false,
  announcements: true,
  serviceReminders: true,
  eventReminders: true,
  email: true,
  sms: false,
};
const memberIdKey = 'church-cms.preview.member-id';
const availabilityKey = 'church-cms.member.volunteer-availability';

const pageContent: Record<string, { title: string; description: string; icon: string }> = {
  'member-giving': { title: 'Giving & generosity', description: 'A secure place for your tithes, offerings, and designated gifts.', icon: 'giving' },
  'member-updates': { title: 'Church updates', description: 'Announcements shared with you and your ministry community.', icon: 'messages' },
  'member-profile': { title: 'My profile & household', description: 'Keep your contact details current and review your household connection.', icon: 'user' },
  'member-attendance': { title: 'My attendance', description: 'Review service attendance and set reminders for upcoming gatherings.', icon: 'clipboard' },
  'member-ministries': { title: 'Ministries & serving', description: 'Discover church groups and let a ministry know you are interested.', icon: 'network' },
  'member-care': { title: 'Prayer & pastoral care', description: 'Prepare a private request for the pastoral care team.', icon: 'heart' },
  'member-notifications': { title: 'Notification preferences', description: 'Choose how you would like to hear from Grace Assembly.', icon: 'bell' },
};

function readLocalValue<T>(key: string, fallback: T): T {
  const raw = window.localStorage.getItem(key);
  return raw ? { ...fallback, ...JSON.parse(raw) } : fallback;
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

export function MemberPortalPage({ page, onAction, onNavigate }: {
  page: PageId;
  onAction: (message: string) => void;
  onNavigate: (page: PageId) => void;
  roles?: string[];
}) {
  const content = pageContent[page] ?? pageContent['member-profile'];
  const [profile, setProfile] = useState<MemberProfile>({ first_name: '', last_name: '', email: '', phone: '', membership_status: 'member' });
  const [profileReady, setProfileReady] = useState(false);
  const [profileMessage, setProfileMessage] = useState('');
  const [householdName, setHouseholdName] = useState('');
  const [events, setEvents] = useState<ChurchEvent[]>([]);
  const [attendance, setAttendance] = useState<{ title: string; date: string }[]>([]);
  const [announcements, setAnnouncements] = useState<PreviewAnnouncement[]>([]);
  const [groups, setGroups] = useState<MemberGroup[]>([]);
  const [preferences, setPreferences] = useState<NoticePreferences>(noticeDefaults);
  const [giving, setGiving] = useState<GivingPreference>(givingDefaults);
  const [interestedGroups, setInterestedGroups] = useState<string[]>([]);
  const [volunteerAvailability, setVolunteerAvailability] = useState<Record<string, string>>({});
  const [careSent, setCareSent] = useState(false);
  const [careError, setCareError] = useState('');
  const [careForm, setCareForm] = useState({ topic: '', preferredContact: 'email', details: '' });
  const [loadError, setLoadError] = useState('');
  const [eventReminderIds, setEventReminderIds] = useState<string[]>([]);

  useEffect(() => {
    let active = true;
    const loadMemberContent = async () => {
      setLoadError('');
      try {
        if (!supabase) {
          const storedProfile = readLocalValue<MemberProfile>(profileKey, profile);
          const localEvents = readPreviewRows<ChurchEvent>('events')
            .filter((event) => event.status === 'scheduled')
            .sort((left, right) => left.starts_at.localeCompare(right.starts_at));
          const memberId = window.localStorage.getItem(memberIdKey);
          const sessions = readPreviewRows<AttendanceSession>('attendance_sessions');
          const records = readPreviewRows<AttendanceRecord>('attendance_records');
          const checkins = readPreviewRows<{ member_id: string; event_id: string; checked_in_at: string }>('member_checkins');
          const history = [
            ...records.filter((record) => memberId && record.member_id === memberId).flatMap((record) => {
              const session = sessions.find((item) => item.id === record.session_id);
              return session ? [{ title: session.title, date: record.checked_in_at }] : [];
            }),
            ...checkins.filter((record) => memberId && record.member_id === memberId).map((record) => ({
              title: localEvents.find((event) => event.id === record.event_id)?.title ?? 'Church service',
              date: record.checked_in_at,
            })),
          ].sort((left, right) => right.date.localeCompare(left.date));
          const households = readPreviewRows<Household>('households');
          const householdLinks = readPreviewRows<HouseholdLink>('household_members');
          const link = memberId ? householdLinks.find((item) => item.member_id === memberId) : undefined;
          const groupRows = readPreviewRows<MemberGroup>('organization_units').filter((item) => item.status === 'active');
          const localAnnouncements = readPreviewRows<PreviewAnnouncement>('communication_campaigns')
            .filter((item) => item.status === 'sent' && item.audience === 'all-members')
            .sort((left, right) => right.created_at.localeCompare(left.created_at));
          const rawReminders = window.localStorage.getItem('church-cms.member.event-reminders');
          if (active) {
            setProfile(storedProfile);
            setProfileReady(true);
            setEvents(localEvents);
            setAttendance(history);
            setHouseholdName(link ? households.find((item) => item.id === link.household_id)?.name ?? '' : '');
            setGroups(groupRows);
            setAnnouncements(localAnnouncements);
            setPreferences(readLocalValue(preferenceKey, noticeDefaults));
            setInterestedGroups(JSON.parse(window.localStorage.getItem('church-cms.member.volunteer-interests') ?? '[]') as string[]);
            setVolunteerAvailability(JSON.parse(window.localStorage.getItem(availabilityKey) ?? '{}') as Record<string, string>);
            setEventReminderIds(rawReminders ? JSON.parse(rawReminders) as string[] : []);
          }
          return;
        }
        const { data: userResult, error: userError } = await supabase.auth.getUser();
        if (userError) throw new Error(`Could not identify your member account: ${userError.message}`);
        if (!userResult.user) throw new Error('Sign in to view your member information.');
        const { data, error } = await supabase.from('members')
          .select('first_name,last_name,email,phone,membership_status')
          .eq('user_id', userResult.user.id)
          .maybeSingle();
        if (error) throw new Error(`Could not load your member profile: ${error.message}`);
        if (active) {
          if (data) setProfile({
            first_name: data.first_name ?? '',
            last_name: data.last_name ?? '',
            email: data.email ?? userResult.user.email ?? '',
            phone: data.phone ?? '',
            membership_status: data.membership_status ?? 'member',
          });
          setProfileReady(true);
          setPreferences(readLocalValue(preferenceKey, noticeDefaults));
          setEventReminderIds(JSON.parse(window.localStorage.getItem('church-cms.member.event-reminders') ?? '[]') as string[]);
        }
      } catch (error) {
        if (active) {
          setLoadError(error instanceof Error ? error.message : 'Could not load this member workspace.');
          setProfileReady(true);
        }
      }
    };
    void loadMemberContent();
    return () => { active = false; };
  }, []);

  const upcomingEvents = useMemo(() => events.filter((event) => new Date(event.starts_at) >= new Date()), [events]);
  const saveProfile = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (supabase) {
      setProfileMessage('Your profile is ready to edit. Saving changes will be connected with the member account backend.');
      return;
    }
    window.localStorage.setItem(profileKey, JSON.stringify(profile));
    setProfileMessage('Profile updated in this browser’s preview.');
  };
  const savePreferences = () => {
    window.localStorage.setItem(preferenceKey, JSON.stringify(preferences));
    onAction('Notification preferences saved on this device. Church delivery and account sync will be connected in the backend phase.');
  };
  const submitGiving = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onAction('Giving checkout is not connected yet. No payment was collected or processed.');
  };
  const submitCareRequest = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setCareError('');
    if (!careForm.topic.trim()) {
      setCareError('Choose a topic so the care team can route your request.');
      return;
    }
    setCareSent(true);
    setCareForm({ topic: '', preferredContact: 'email', details: '' });
  };
  const toggleInterest = (groupId: string) => {
    const next = interestedGroups.includes(groupId)
      ? interestedGroups.filter((id) => id !== groupId)
      : [...interestedGroups, groupId];
    setInterestedGroups(next);
    if (!supabase) window.localStorage.setItem('church-cms.member.volunteer-interests', JSON.stringify(next));
  };
  const updateAvailability = (groupId: string, availability: string) => {
    const next = { ...volunteerAvailability, [groupId]: availability };
    setVolunteerAvailability(next);
    if (!supabase) window.localStorage.setItem(availabilityKey, JSON.stringify(next));
  };
  const toggleReminder = (eventId: string) => {
    const next = eventReminderIds.includes(eventId)
      ? eventReminderIds.filter((id) => id !== eventId)
      : [...eventReminderIds, eventId];
    setEventReminderIds(next);
    if (!supabase) window.localStorage.setItem('church-cms.member.event-reminders', JSON.stringify(next));
  };

  return <div className="member-portal-page">
    <header className="member-portal-heading">
      <span className="eyebrow"><Icon name={content.icon} size={14} /> MEMBER PORTAL</span>
      <h1>{content.title}</h1>
      <p>{content.description}</p>
    </header>
    {loadError && <div className="workspace-alert" role="alert"><Icon name="shield" size={16} />{loadError}</div>}

    {page === 'member-giving' && <section className="member-portal-panel glass-card">
      <div className="section-heading"><div><span className="eyebrow">GIVE WITH PURPOSE</span><h2>Prepare a gift</h2></div><span className="phase-badge"><Icon name="lock" size={13} /> Secure checkout planned</span></div>
      <p className="member-portal-intro">Choose a giving type and amount. Card and bank details are not requested on this preview page.</p>
      <form className="member-portal-form" onSubmit={submitGiving}>
        <label>Gift type<select value={giving.category} onChange={(event) => setGiving({ ...giving, category: event.target.value as GivingPreference['category'] })}>
          <option value="tithe">Tithe</option><option value="offering">Offering</option><option value="designated">Designated gift</option>
        </select></label>
        {giving.category === 'designated' && <label>Designation<select value={giving.designation} onChange={(event) => setGiving({ ...giving, designation: event.target.value })}>
          <option value="">Choose a fund</option><option value="missions">Missions</option><option value="building">Building fund</option><option value="benevolence">Community care</option>
        </select></label>}
        <label>Amount<input type="number" min="1" step="0.01" inputMode="decimal" required value={giving.amount} onChange={(event) => setGiving({ ...giving, amount: event.target.value })} placeholder="0.00" /></label>
        <label>Frequency<select value={giving.recurring} onChange={(event) => setGiving({ ...giving, recurring: event.target.value })}>
          <option value="once">One-time</option><option value="weekly">Weekly recurring</option><option value="monthly">Monthly recurring</option>
        </select></label>
        <div className="member-portal-callout"><Icon name="shield" size={16} /><span>Payment processing, recurring billing, receipts, and giving history will be enabled only after a secure payment provider and member-only finance policies are configured.</span></div>
        <button className="button button-primary" disabled={giving.category === 'designated' && !giving.designation}><Icon name="lock" size={15} /> Continue to secure giving</button>
      </form>
        <div className="member-giving-history">
          <div className="section-heading"><div><span className="eyebrow">YOUR RECORDS</span><h2>Giving history & receipts</h2></div><Icon name="receipt" size={18} /></div>
          <div className="member-empty-state"><Icon name="receipt" size={18} /><span>Your gifts, downloadable receipts, and recurring-gift status will appear here after secure giving is connected.</span></div>
        </div>
    </section>}

    {page === 'member-updates' && <section className="member-portal-panel glass-card">
      <div className="section-heading"><div><span className="eyebrow">FOR YOUR CHURCH FAMILY</span><h2>Announcements</h2></div><button className="text-button" onClick={() => onNavigate('member-notifications')}>Notification settings <Icon name="arrow-up" size={13} /></button></div>
      {!supabase && announcements.length > 0
        ? announcements.map((announcement) => <article className="member-announcement" key={announcement.id}>
          <span className="member-feature-icon"><Icon name="messages" size={17} /></span>
          <div>          <span className="eyebrow">{formatDate(announcement.created_at)} · {announcement.audience.replace(/-/g, ' ')}</span><h3>{announcement.name}</h3><p>{announcement.message}</p></div>
        </article>)
        : <div className="member-empty-state"><Icon name="messages" size={18} /><span>Targeted church announcements will appear here when member delivery and audience preferences are connected.</span></div>}
      <button className="button button-ghost" onClick={() => onNavigate('member-notifications')}><Icon name="bell" size={15} /> Choose announcement preferences</button>
    </section>}

    {page === 'member-profile' && <div className="member-portal-columns">
      <section className="member-portal-panel glass-card">
        <div className="section-heading"><div><span className="eyebrow">YOUR DETAILS</span><h2>Contact information</h2></div></div>
        {profileReady && <form className="member-portal-form" onSubmit={saveProfile}>
          <div className="member-form-grid">
            <label>First name<input required maxLength={80} value={profile.first_name} onChange={(event) => setProfile({ ...profile, first_name: event.target.value })} /></label>
            <label>Last name<input required maxLength={80} value={profile.last_name} onChange={(event) => setProfile({ ...profile, last_name: event.target.value })} /></label>
            <label>Email<input type="email" required maxLength={254} value={profile.email} onChange={(event) => setProfile({ ...profile, email: event.target.value })} /></label>
            <label>Phone<input type="tel" maxLength={40} value={profile.phone} onChange={(event) => setProfile({ ...profile, phone: event.target.value })} /></label>
          </div>
          {profileMessage && <p className="member-portal-status" role="status">{profileMessage}</p>}
          <button className="button button-primary"><Icon name="check" size={15} /> Save contact details</button>
        </form>}
        {supabase && <div className="member-portal-callout"><Icon name="info" size={16} /><span>Your contact details are loaded from your member record. Saving profile changes will be enabled with member self-service policies.</span></div>}
      </section>
      <section className="member-portal-panel glass-card">
        <div className="section-heading"><div><span className="eyebrow">CONNECTED AT HOME</span><h2>Household</h2></div><Icon name="house" size={19} /></div>
        {householdName
          ? <p className="member-household-name">{householdName}</p>
          : <div className="member-empty-state"><Icon name="house" size={18} /><span>No household is linked to this member account yet.</span></div>}
        <p className="member-portal-intro">Household membership and relationship changes should be confirmed by the church office before being saved.</p>
        <button className="button button-ghost" onClick={() => onAction('Household update requests will be sent securely once member services are connected.')}>Request a household update</button>
      </section>
    </div>}

    {page === 'member-attendance' && <section className="member-portal-panel glass-card">
      <div className="section-heading"><div><span className="eyebrow">GATHERING TOGETHER</span><h2>Attendance history</h2></div><Icon name="clipboard" size={19} /></div>
      {attendance.length
        ? attendance.map((record, index) => <article className="member-history-row" key={`${record.date}-${index}`}><span className="member-history-icon"><Icon name="check" size={15} /></span><span><strong>{record.title}</strong><small>{formatDate(record.date)}</small></span><span>Checked in</span></article>)
        : <div className="member-empty-state"><Icon name="clipboard" size={18} /><span>Your service attendance will appear after your first verified check-in.</span></div>}
      <div className="section-heading member-subheading"><div><span className="eyebrow">PLAN AHEAD</span><h2>Upcoming services & reminders</h2></div></div>
      {upcomingEvents.length ? upcomingEvents.map((event) => <article className="member-history-row" key={event.id}>
        <span className="member-history-icon"><Icon name="calendar" size={15} /></span>
        <span><strong>{event.title}</strong><small>{formatDate(event.starts_at)}{event.location ? ` · ${event.location}` : ''}</small></span>
        <button className={`member-reminder-button ${eventReminderIds.includes(event.id) ? 'selected' : ''}`} onClick={() => toggleReminder(event.id)}>{eventReminderIds.includes(event.id) ? 'Reminder on' : 'Remind me'}</button>
      </article>) : <div className="member-empty-state"><Icon name="calendar" size={18} /><span>Upcoming services and event reminders will appear here.</span></div>}
      <p className="member-preview-caption">Preview attendance is saved on this device. Verified attendance history and actual reminders require the secure member check-in and messaging services.</p>
    </section>}

    {page === 'member-ministries' && <section className="member-portal-panel glass-card">
      <div className="section-heading"><div><span className="eyebrow">FIND YOUR PLACE</span><h2>Ministries & groups</h2></div><Icon name="network" size={19} /></div>
      {groups.length ? <div className="member-groups-grid">{groups.map((group) => <article className="member-group-card" key={group.id}>
        <span className="member-feature-icon"><Icon name={group.unit_type === 'group' ? 'users' : 'network'} size={17} /></span>
        <strong>{group.name}</strong><small>{group.unit_type}</small><p>{group.description || 'Connect with this ministry and learn more about serving together.'}</p>
        <label className="member-availability">Serving availability<select value={volunteerAvailability[group.id] ?? ''} onChange={(event) => updateAvailability(group.id, event.target.value)}>
          <option value="">Choose availability</option><option value="sunday">Sundays</option><option value="weekdays">Weekdays</option><option value="weekends">Weekends</option><option value="flexible">Flexible</option>
        </select></label>
        <button className={`button ${interestedGroups.includes(group.id) ? 'button-ghost' : 'button-primary'}`} onClick={() => toggleInterest(group.id)}>{interestedGroups.includes(group.id) ? 'Interest noted' : 'I’m interested'}</button>
      </article>)}</div>
        : <div className="member-empty-state"><Icon name="network" size={18} /><span>Active ministries and groups will appear here when the church directory is connected.</span></div>}
      <p className="member-preview-caption">Preview interest stays on this device. The church team is not notified until member messaging is connected.</p>
    </section>}

    {page === 'member-care' && <section className="member-portal-panel glass-card member-care-panel">
      <div className="section-heading"><div><span className="eyebrow">PRIVATE SUPPORT</span><h2>Request prayer or pastoral care</h2></div><Icon name="heart" size={19} /></div>
      <div className="member-portal-callout"><Icon name="lock" size={16} /><span>This form is not connected to the pastoral care team yet. Do not enter urgent, highly sensitive, or confidential details here.</span></div>
      {careSent && <p className="member-portal-status" role="status">Preview only: your request was not sent or saved. It will be routed securely when the care-request service is connected.</p>}
      <form className="member-portal-form" onSubmit={submitCareRequest}>
        <label>How can we support you?<select required value={careForm.topic} onChange={(event) => { setCareSent(false); setCareForm({ ...careForm, topic: event.target.value }); }}>
          <option value="">Choose a request type</option><option value="prayer">Prayer request</option><option value="pastoral-conversation">Request a pastoral conversation</option><option value="practical-support">Practical support</option>
        </select></label>
        <label>Preferred way to be contacted<select value={careForm.preferredContact} onChange={(event) => setCareForm({ ...careForm, preferredContact: event.target.value })}><option value="email">Email</option><option value="phone">Phone</option><option value="either">Either</option></select></label>
        <label>Brief note (optional)<textarea maxLength={500} value={careForm.details} onChange={(event) => { setCareSent(false); setCareForm({ ...careForm, details: event.target.value }); }} placeholder="Keep this general in preview; do not include confidential details." /></label>
        {careError && <p className="people-error" role="alert">{careError}</p>}
        <button className="button button-primary"><Icon name="send" size={15} /> Preview request</button>
      </form>
    </section>}

    {page === 'member-notifications' && <section className="member-portal-panel glass-card">
      <div className="section-heading"><div><span className="eyebrow">YOUR COMMUNICATION CHOICES</span><h2>Notification preferences</h2></div><Icon name="bell" size={19} /></div>
      <p className="member-portal-intro">Choose which updates you want and the channels you prefer. Preferences are saved to this browser while account sync is pending.</p>
      <div className="member-preference-list">
        <label className="member-consent-row">
          <input type="checkbox" checked={preferences.communicationConsent} onChange={(event) => setPreferences({ ...preferences, communicationConsent: event.target.checked })} />
          <span><strong>I consent to receive non-urgent church communications</strong><small>You can change this choice at any time. Urgent pastoral care is handled separately.</small></span>
        </label>
        {([
          ['announcements', 'Church announcements', 'News and updates targeted to the whole church or your ministries.'],
          ['serviceReminders', 'Service reminders', 'A helpful reminder before regular worship services.'],
          ['eventReminders', 'Event reminders', 'Updates for events you register for or choose to follow.'],
          ['email', 'Email', 'Receive selected updates by email.'],
          ['sms', 'Text message', 'Receive selected updates by SMS when available.'],
        ] as const).map(([key, label, detail]) => <label className="member-preference-row" key={key}>
          <span><strong>{label}</strong><small>{detail}</small></span>
          <input type="checkbox" checked={preferences[key]} disabled={!preferences.communicationConsent} onChange={(event) => setPreferences({ ...preferences, [key]: event.target.checked })} />
        </label>)}
      </div>
      <button className="button button-primary" onClick={savePreferences}><Icon name="check" size={15} /> Save preferences</button>
      <p className="member-preview-caption">Your choices are saved on this device only. They do not change church messages or delivery until member preferences are connected.</p>
    </section>}
  </div>;
}
