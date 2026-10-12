import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { Icon } from '../components/Icon';
import { PageHeading } from '../components/PageHeading';
import { supabase } from '../supabase';

type MembershipStatus = 'visitor' | 'newcomer' | 'member' | 'inactive';
type Member = {
  id: string;
  branch_id: string | null;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  membership_status: MembershipStatus;
  joined_at: string;
  membership_number: string | null;
  gender: string | null;
  date_of_birth: string | null;
  baptism_date: string | null;
  address: string | null;
  city: string | null;
  notes: string | null;
};

type MemberForm = Omit<Member, 'id' | 'branch_id' | 'email' | 'phone' | 'membership_number' | 'gender' | 'date_of_birth' | 'baptism_date' | 'address' | 'city' | 'notes'> & {
  branch_id: string;
  email: string;
  phone: string;
  membership_number: string;
  gender: string;
  date_of_birth: string;
  baptism_date: string;
  address: string;
  city: string;
  notes: string;
};
type FilterStatus = 'all' | MembershipStatus;

const memberColumns = 'id,branch_id,first_name,last_name,email,phone,membership_status,joined_at,membership_number,gender,date_of_birth,baptism_date,address,city,notes';
type Branch = { id: string; name: string };

const blankMember: MemberForm = {
  first_name: '',
  last_name: '',
  branch_id: '',
  email: '',
  phone: '',
  membership_status: 'member',
  joined_at: new Date().toISOString().slice(0, 10),
  membership_number: '',
  gender: '',
  date_of_birth: '',
  baptism_date: '',
  address: '',
  city: '',
  notes: '',
};

function csvCell(value: string | null | undefined) {
  const cell = value ?? '';
  return `"${cell.replace(/"/g, '""')}"`;
}

function downloadMembers(members: Member[]) {
  const headers: (keyof Member)[] = [
    'first_name', 'last_name', 'email', 'phone', 'membership_status', 'joined_at',
    'membership_number', 'gender', 'date_of_birth', 'baptism_date', 'address', 'city', 'notes',
  ];
  const csv = [headers.join(','), ...members.map((member) => headers.map((key) => csvCell(member[key])).join(','))].join('\r\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `church-members-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function PeoplePage({ onAction }: { onAction: (message: string) => void }) {
  const [members, setMembers] = useState<Member[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(Boolean(supabase));
  const [loadError, setLoadError] = useState('');
  const [saveError, setSaveError] = useState('');
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<FilterStatus>('all');
  const [editing, setEditing] = useState<Member | null>(null);
  const [form, setForm] = useState<MemberForm>(blankMember);
  const [dialogOpen, setDialogOpen] = useState(false);

  const loadMembers = useCallback(async () => {
    if (!supabase) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setLoadError('');
    const { data, error } = await supabase
      .from('members')
      .select(memberColumns)
      .order('last_name', { ascending: true })
      .order('first_name', { ascending: true });
    if (error) {
      setLoadError(`Could not load the member directory: ${error.message}`);
      setLoading(false);
      return;
    }
    setMembers((data ?? []) as Member[]);

    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user) {
      setLoadError(`Could not identify your workspace: ${userError?.message ?? 'No signed-in user.'}`);
      setLoading(false);
      return;
    }
    const { data: profile, error: profileError } = await supabase
      .from('users')
      .select('organization_id')
      .eq('id', userData.user.id)
      .maybeSingle();
    if (profileError) {
      setLoadError(`Could not load your organization profile: ${profileError.message}`);
      setLoading(false);
      return;
    }
    if (!profile?.organization_id) {
      setLoadError('Your account is not linked to an organization. Ask an administrator to complete setup.');
      setLoading(false);
      return;
    }
    const { data: branchData, error: branchError } = await supabase
      .from('branches')
      .select('id,name')
      .eq('organization_id', profile.organization_id)
      .eq('status', 'active')
      .order('name');
    if (branchError) setLoadError(`Could not load your branches: ${branchError.message}`);
    else setBranches((branchData ?? []) as Branch[]);
    setLoading(false);
  }, []);

  useEffect(() => { void loadMembers(); }, [loadMembers]);

  const visibleMembers = useMemo(() => {
    const query = search.trim().toLowerCase();
    return members.filter((member) => {
      const matchesStatus = filter === 'all' || member.membership_status === filter;
      const matchesSearch = !query || [
        member.first_name, member.last_name, member.email, member.phone, member.membership_number,
      ].some((value) => value?.toLowerCase().includes(query));
      return matchesStatus && matchesSearch;
    });
  }, [filter, members, search]);

  const openCreate = () => {
    setEditing(null);
    setForm(blankMember);
    setSaveError('');
    setDialogOpen(true);
  };

  const openEdit = (member: Member) => {
    setEditing(member);
    setForm({
      ...blankMember,
      first_name: member.first_name,
      last_name: member.last_name,
      branch_id: member.branch_id ?? '',
      membership_status: member.membership_status,
      joined_at: member.joined_at,
      email: member.email ?? '',
      phone: member.phone ?? '',
      membership_number: member.membership_number ?? '',
      gender: member.gender ?? '',
      date_of_birth: member.date_of_birth ?? '',
      baptism_date: member.baptism_date ?? '',
      address: member.address ?? '',
      city: member.city ?? '',
      notes: member.notes ?? '',
    });
    setSaveError('');
    setDialogOpen(true);
  };

  const closeDialog = () => {
    if (saving) return;
    setDialogOpen(false);
    setSaveError('');
  };

  const updateField = (field: keyof MemberForm, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const submitMember = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!supabase) {
      setSaveError('Connect Supabase to save member records.');
      return;
    }
    setSaving(true);
    setSaveError('');
    const payload = {
      ...form,
      branch_id: form.branch_id || null,
      email: form.email.trim() || null,
      phone: form.phone.trim() || null,
      membership_number: form.membership_number.trim() || null,
      gender: form.gender || null,
      date_of_birth: form.date_of_birth || null,
      baptism_date: form.baptism_date || null,
      address: form.address.trim() || null,
      city: form.city.trim() || null,
      notes: form.notes.trim() || null,
    };
    const result = editing
      ? await supabase.from('members').update(payload).eq('id', editing.id).select(memberColumns).single()
      : await supabase.from('members').insert(payload).select(memberColumns).single();
    if (result.error) {
      setSaveError(`Could not ${editing ? 'update' : 'add'} member: ${result.error.message}`);
      setSaving(false);
      return;
    }
    setDialogOpen(false);
    setSaving(false);
    onAction(`${payload.first_name} ${payload.last_name} ${editing ? 'updated' : 'added'} successfully.`);
    await loadMembers();
  };

  const archiveMember = async (member: Member) => {
    if (!supabase) return;
    const { error } = await supabase.from('members')
      .update({ membership_status: 'inactive' })
      .eq('id', member.id);
    if (error) {
      onAction(`Could not archive ${member.first_name} ${member.last_name}: ${error.message}`);
      return;
    }
    onAction(`${member.first_name} ${member.last_name} archived.`);
    await loadMembers();
  };

  const counts = useMemo(() => ({
    all: members.length,
    member: members.filter((member) => member.membership_status === 'member').length,
    newcomer: members.filter((member) => member.membership_status === 'newcomer').length,
    visitor: members.filter((member) => member.membership_status === 'visitor').length,
  }), [members]);

  return <>
    <PageHeading page="people" />
    <section className="people-workspace">
      <div className="people-stats" aria-label="Member totals">
        <article><span>People records</span><strong>{counts.all}</strong></article>
        <article><span>Members</span><strong>{counts.member}</strong></article>
        <article><span>Newcomers</span><strong>{counts.newcomer}</strong></article>
        <article><span>Visitors</span><strong>{counts.visitor}</strong></article>
      </div>

      <section className="people-directory glass-card" aria-labelledby="directory-title">
        <div className="people-directory-heading">
          <div><span className="eyebrow">People & membership</span><h2 id="directory-title">Member directory</h2>
            <p>Keep each person's contact details and membership journey together.</p></div>
          <div className="people-actions">
            <button className="button button-ghost" type="button" disabled={!supabase || !visibleMembers.length}
              onClick={() => downloadMembers(visibleMembers)}><Icon name="download" size={15} /> Export CSV</button>
            <button className="button button-primary" type="button" disabled={!supabase} onClick={openCreate}>
              <Icon name="plus" size={15} /> Add person</button>
          </div>
        </div>

        {!supabase && <div className="people-notice" role="status"><Icon name="database" size={17} />
          <span>Preview only. Add your Supabase URL and anon key to connect member records.</span></div>}
        {loadError && <div className="people-error" role="alert">{loadError}<button className="text-button" onClick={() => void loadMembers()}>Try again</button></div>}

        <div className="people-toolbar">
          <label className="people-search"><Icon name="search" size={17} />
            <input type="search" value={search} onChange={(event) => setSearch(event.target.value)}
              placeholder="Search name, email, phone, or member number" aria-label="Search people" />
          </label>
          <label className="people-filter"><span>Journey</span>
            <select value={filter} onChange={(event) => setFilter(event.target.value as FilterStatus)} aria-label="Filter by membership status">
              <option value="all">Everyone</option><option value="member">Members</option>
              <option value="newcomer">Newcomers</option><option value="visitor">Visitors</option>
              <option value="inactive">Archived</option>
            </select>
          </label>
        </div>

        <div className="people-table-wrap">
          <table className="people-table">
            <thead><tr><th scope="col">Person</th><th scope="col">Contact</th><th scope="col">Member no.</th><th scope="col">Journey</th><th scope="col">Joined</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead>
            <tbody>
              {loading && <tr><td colSpan={6} className="people-empty"><span className="loading-spinner" /> Loading directory…</td></tr>}
              {!loading && visibleMembers.map((member) => <tr key={member.id}>
                <td><strong>{member.first_name} {member.last_name}</strong><small>{member.city || 'No location added'}</small></td>
                <td><span>{member.email || '—'}</span><small>{member.phone || 'No phone added'}</small></td>
                <td>{member.membership_number || '—'}</td>
                <td><span className={`member-status status-${member.membership_status}`}>{member.membership_status}</span></td>
                <td>{member.joined_at ? new Date(`${member.joined_at}T00:00:00`).toLocaleDateString() : '—'}</td>
                <td><div className="member-row-actions">
                  <button type="button" className="icon-button" aria-label={`Edit ${member.first_name} ${member.last_name}`} onClick={() => openEdit(member)}><Icon name="settings" size={15} /></button>
                  {member.membership_status !== 'inactive' && <button type="button" className="icon-button archive-person"
                    aria-label={`Archive ${member.first_name} ${member.last_name}`}
                    onClick={() => void archiveMember(member)}><Icon name="close" size={15} /></button>}
                </div></td>
              </tr>)}
              {!loading && !visibleMembers.length && <tr><td colSpan={6} className="people-empty">
                {search || filter !== 'all' ? 'No people match these filters.' : 'No people records yet. Add the first person to begin your directory.'}
              </td></tr>}
            </tbody>
          </table>
        </div>
        <div className="people-table-footer"><span>Showing {visibleMembers.length} of {members.length} people</span>
          <span>Records are protected by your church workspace access policies.</span></div>
      </section>
    </section>

    {dialogOpen && <div className="member-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) closeDialog(); }}>
      <section className="member-modal glass-card" role="dialog" aria-modal="true" aria-labelledby="member-modal-title">
        <div className="member-modal-heading"><div><span className="eyebrow">People directory</span>
          <h2 id="member-modal-title">{editing ? 'Update person' : 'Add a person'}</h2></div>
          <button className="icon-button" type="button" aria-label="Close form" onClick={closeDialog}><Icon name="close" size={18} /></button></div>
        <form className="member-form" onSubmit={(event) => void submitMember(event)}>
          <div className="member-form-grid">
            <label>First name<input autoFocus required maxLength={100} value={form.first_name} onChange={(event) => updateField('first_name', event.target.value)} /></label>
            <label>Last name<input required maxLength={100} value={form.last_name} onChange={(event) => updateField('last_name', event.target.value)} /></label>
            <label>Email<input type="email" maxLength={254} value={form.email ?? ''} onChange={(event) => updateField('email', event.target.value)} /></label>
            <label>Phone<input type="tel" maxLength={40} value={form.phone ?? ''} onChange={(event) => updateField('phone', event.target.value)} /></label>
            <label>Branch<select value={form.branch_id} onChange={(event) => updateField('branch_id', event.target.value)}>
              <option value="">Organization-wide / not assigned</option>
              {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
            </select></label>
            <label>Membership number<input maxLength={40} value={form.membership_number ?? ''} onChange={(event) => updateField('membership_number', event.target.value)} /></label>
            <label>Journey status<select value={form.membership_status} onChange={(event) => updateField('membership_status', event.target.value)}>
              <option value="visitor">Visitor</option><option value="newcomer">Newcomer</option><option value="member">Member</option><option value="inactive">Inactive</option>
            </select></label>
            <label>Date joined<input type="date" value={form.joined_at} onChange={(event) => updateField('joined_at', event.target.value)} /></label>
            <label>Gender<input maxLength={40} value={form.gender ?? ''} onChange={(event) => updateField('gender', event.target.value)} /></label>
            <label>Date of birth<input type="date" value={form.date_of_birth ?? ''} onChange={(event) => updateField('date_of_birth', event.target.value)} /></label>
            <label>Baptism date<input type="date" value={form.baptism_date ?? ''} onChange={(event) => updateField('baptism_date', event.target.value)} /></label>
            <label>Address<input maxLength={200} value={form.address ?? ''} onChange={(event) => updateField('address', event.target.value)} /></label>
            <label>City<input maxLength={100} value={form.city ?? ''} onChange={(event) => updateField('city', event.target.value)} /></label>
            <label className="member-notes-field">Notes<textarea rows={3} maxLength={2000} value={form.notes ?? ''} onChange={(event) => updateField('notes', event.target.value)} /></label>
          </div>
          {saveError && <div className="people-error" role="alert">{saveError}</div>}
          <div className="member-form-actions"><button className="button button-ghost" type="button" disabled={saving} onClick={closeDialog}>Cancel</button>
            <button className="button button-primary" type="submit" disabled={saving}>{saving ? 'Saving…' : editing ? 'Save changes' : 'Add person'}</button></div>
        </form>
      </section>
    </div>}
  </>;
}
