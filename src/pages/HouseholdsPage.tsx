import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { Icon } from '../components/Icon';
import { PageHeading } from '../components/PageHeading';
import { getCurrentOrganization, type WorkspaceOrganization } from '../data/workspace';
import { supabase } from '../supabase';

type Household = {
  id: string;
  name: string;
  branch_id: string | null;
  status: 'active' | 'archived';
  created_at: string;
};
type HouseholdMember = { id: string; household_id: string; member_id: string; relationship: string; is_primary: boolean };
type Person = { id: string; first_name: string; last_name: string; phone: string | null; email: string | null };
type HouseholdView = Household & { people: (HouseholdMember & { person: Person })[] };
type HouseholdForm = { name: string; branch_id: string; member_id: string; relationship: string; is_primary: boolean };

const initialForm: HouseholdForm = { name: '', branch_id: '', member_id: '', relationship: 'head', is_primary: true };
const relationships = [
  ['head', 'Household head'], ['spouse', 'Spouse'], ['partner', 'Partner'], ['child', 'Child'],
  ['parent', 'Parent'], ['guardian', 'Guardian'], ['sibling', 'Sibling'], ['other', 'Other'],
];

export function HouseholdsPage({ onAction }: { onAction: (message: string) => void }) {
  const [organization, setOrganization] = useState<WorkspaceOrganization | null>(null);
  const [households, setHouseholds] = useState<HouseholdView[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [query, setQuery] = useState('');
  const [includeArchived, setIncludeArchived] = useState(false);
  const [loading, setLoading] = useState(Boolean(supabase));
  const [loadError, setLoadError] = useState('');
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState<'create' | 'add-person'>('create');
  const [form, setForm] = useState<HouseholdForm>(initialForm);

  const load = useCallback(async () => {
    if (!supabase) { setLoading(false); return; }
    setLoading(true);
    setLoadError('');
    try {
      const currentOrganization = await getCurrentOrganization(supabase);
      setOrganization(currentOrganization);
      const [householdResult, relationResult, peopleResult] = await Promise.all([
        supabase.from('households')
          .select('id,name,branch_id,status,created_at')
          .eq('organization_id', currentOrganization.id)
          .order('name'),
        supabase.from('household_members')
          .select('id,household_id,member_id,relationship,is_primary'),
        supabase.from('members')
          .select('id,first_name,last_name,phone,email')
          .neq('membership_status', 'inactive')
          .order('last_name'),
      ]);
      if (householdResult.error) throw new Error(`Could not load households: ${householdResult.error.message}`);
      if (relationResult.error) throw new Error(`Could not load household relationships: ${relationResult.error.message}`);
      if (peopleResult.error) throw new Error(`Could not load people for household links: ${peopleResult.error.message}`);

      const memberById = new Map((peopleResult.data ?? []).map((person) => [person.id, person as Person]));
      const relations = (relationResult.data ?? []) as HouseholdMember[];
      const nextHouseholds = ((householdResult.data ?? []) as Household[]).map((household) => ({
        ...household,
        people: relations.flatMap((relation) => {
          const person = memberById.get(relation.member_id);
          return relation.household_id === household.id && person ? [{ ...relation, person }] : [];
        }),
      }));
      setPeople((peopleResult.data ?? []) as Person[]);
      setHouseholds(nextHouseholds);
      setSelectedId((current) => nextHouseholds.some((household) => household.id === current) ? current : nextHouseholds[0]?.id ?? '');
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Could not load household records.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const selected = households.find((household) => household.id === selectedId);
  const visibleHouseholds = useMemo(() => {
    const search = query.trim().toLowerCase();
    return households.filter((household) => {
      if (!includeArchived && household.status === 'archived') return false;
      return !search || household.name.toLowerCase().includes(search)
        || household.people.some(({ person }) => `${person.first_name} ${person.last_name}`.toLowerCase().includes(search));
    });
  }, [households, includeArchived, query]);

  const openCreate = () => {
    setDialogMode('create');
    setForm(initialForm);
    setFormError('');
    setDialogOpen(true);
  };

  const openAddPerson = () => {
    if (!selected) return;
    setDialogMode('add-person');
    setForm({
      ...initialForm,
      name: selected.name,
      branch_id: selected.branch_id ?? '',
      is_primary: selected.people.length === 0,
    });
    setFormError('');
    setDialogOpen(true);
  };

  const updateHousehold = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!supabase || !organization) {
      setFormError('Connect your church workspace before saving household records.');
      return;
    }
    setSaving(true);
    setFormError('');
    if (dialogMode === 'add-person' && selected) {
      if (!form.member_id) {
        setFormError('Choose a person to add to this household.');
        setSaving(false);
        return;
      }
      const { error } = await supabase.from('household_members').insert({
        household_id: selected.id,
        member_id: form.member_id,
        relationship: form.relationship,
        is_primary: form.is_primary,
      });
      if (error) {
        setFormError(error.code === '23505' ? 'That person is already linked to this household.' : `Could not add the household relationship: ${error.message}`);
        setSaving(false);
        return;
      }
      setDialogOpen(false);
      setSaving(false);
      onAction('Person added to household.');
      await load();
      return;
    }
    const { data, error } = await supabase.from('households').insert({
      organization_id: organization.id,
      branch_id: form.branch_id || null,
      name: form.name.trim(),
    }).select('id').single();
    if (error || !data) {
      setFormError(`Could not create household: ${error?.message ?? 'No household was returned.'}`);
      setSaving(false);
      return;
    }
    setDialogOpen(false);
    setSaving(false);
    onAction(`${form.name.trim()} household created. Add people from the household details.`);
    setSelectedId(data.id);
    await load();
  };

  const removePerson = async (relation: HouseholdMember & { person: Person }) => {
    if (!supabase) return;
    const { error } = await supabase.from('household_members').delete().eq('id', relation.id);
    if (error) {
      onAction(`Could not remove ${relation.person.first_name} from household: ${error.message}`);
      return;
    }
    onAction(`${relation.person.first_name} removed from household.`);
    await load();
  };

  const archive = async (household: HouseholdView) => {
    if (!supabase) return;
    const status = household.status === 'active' ? 'archived' : 'active';
    const { error } = await supabase.from('households').update({ status }).eq('id', household.id);
    if (error) {
      onAction(`Could not update household status: ${error.message}`);
      return;
    }
    onAction(`${household.name} household ${status === 'archived' ? 'archived' : 'restored'}.`);
    await load();
  };

  return <>
    <PageHeading page="households" />
    <section className="household-workspace">
      <div className="people-stats" aria-label="Household totals">
        <article><span>Households</span><strong>{households.filter((item) => item.status === 'active').length}</strong></article>
        <article><span>People connected</span><strong>{new Set(households.flatMap((item) => item.people.map((link) => link.member_id))).size}</strong></article>
        <article><span>Family relationships</span><strong>{households.reduce((total, item) => total + item.people.length, 0)}</strong></article>
        <article><span>Branches</span><strong>{organization?.branches.length ?? 0}</strong></article>
      </div>
      <div className="household-layout">
        <section className="household-list glass-card" aria-label="Household directory">
          <div className="household-list-heading"><div><span className="eyebrow">Families & relationships</span><h2>Households</h2></div>
            <button className="icon-button" type="button" disabled={!supabase} aria-label="Create household" onClick={openCreate}><Icon name="plus" size={18} /></button></div>
          <label className="people-search household-search"><Icon name="search" size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find a household or person" aria-label="Search households" /></label>
          <label className="household-archived-toggle"><input type="checkbox" checked={includeArchived} onChange={(event) => setIncludeArchived(event.target.checked)} /> Include archived</label>
          {loading && <div className="household-empty"><span className="loading-spinner" /> Loading households…</div>}
          {!loading && visibleHouseholds.map((household) => <button key={household.id} type="button"
            className={`household-list-item ${selectedId === household.id ? 'selected' : ''}`} onClick={() => setSelectedId(household.id)}>
            <span className="household-icon"><Icon name="house" size={17} /></span>
            <span className="household-list-copy"><strong>{household.name}</strong><small>{household.people.length} {household.people.length === 1 ? 'person' : 'people'}{household.status === 'archived' ? ' · archived' : ''}</small></span>
            <Icon name="chevron-right" size={15} />
          </button>)}
          {!loading && !visibleHouseholds.length && <div className="household-empty">{query ? 'No households match that search.' : 'No households yet. Create one to connect a family.'}</div>}
          {loadError && <div className="people-error" role="alert">{loadError}<button className="text-button" onClick={() => void load()}>Retry</button></div>}
        </section>

        <section className="household-detail glass-card" aria-label="Household details">
          {selected ? <>
            <div className="household-detail-heading"><div><span className="eyebrow"><Icon name="heart" size={13} /> Household profile</span>
              <h2>{selected.name}</h2><p>{selected.people.length} connected {selected.people.length === 1 ? 'person' : 'people'}{selected.status === 'archived' ? ' · archived' : ''}</p></div>
              <div className="people-actions"><button className="button button-ghost" type="button" onClick={() => void archive(selected)}>
                {selected.status === 'active' ? 'Archive household' : 'Restore household'}</button>
                {selected.status === 'active' && <button className="button button-primary" type="button" disabled={!supabase} onClick={openAddPerson}><Icon name="plus" size={15} /> Add person</button>}</div></div>
            <div className="household-people-list">
              {selected.people.map((relation) => <article className="household-person" key={relation.id}>
                <span className="household-person-avatar">{relation.person.first_name.slice(0, 1)}{relation.person.last_name.slice(0, 1)}</span>
                <div className="household-person-copy"><strong>{relation.person.first_name} {relation.person.last_name}{relation.is_primary && <span className="primary-contact-label">Primary</span>}</strong>
                  <small>{relationships.find(([code]) => code === relation.relationship)?.[1] ?? relation.relationship}</small>
                  <small>{relation.person.phone || relation.person.email || 'No contact details added'}</small></div>
                <button className="icon-button household-remove" type="button" aria-label={`Remove ${relation.person.first_name} from household`} onClick={() => void removePerson(relation)}><Icon name="close" size={15} /></button>
              </article>)}
              {!selected.people.length && <div className="household-empty">No people linked yet. Add a person to start mapping this household.</div>}
            </div>
          </> : <div className="household-no-selection"><span className="household-icon"><Icon name="house" size={22} /></span><h2>Your household directory</h2>
            <p>Create a household, then connect people and describe how they are related.</p>
            <button className="button button-primary" type="button" disabled={!supabase} onClick={openCreate}><Icon name="plus" size={15} /> Create household</button></div>}
        </section>
      </div>
      {!supabase && <div className="people-notice" role="status"><Icon name="database" size={17} /><span>Preview only. Connect Supabase to create household records and relationships.</span></div>}
    </section>

    {dialogOpen && <div className="member-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) setDialogOpen(false); }}>
      <section className="member-modal household-modal glass-card" role="dialog" aria-modal="true" aria-labelledby="household-dialog-title">
        <div className="member-modal-heading"><div><span className="eyebrow">Family connections</span>        <h2 id="household-dialog-title">{dialogMode === 'add-person' ? `Add to ${selected?.name ?? 'household'}` : 'Create a household'}</h2></div>
          <button className="icon-button" type="button" aria-label="Close household form" onClick={() => setDialogOpen(false)}><Icon name="close" size={18} /></button></div>
        <form className="member-form" onSubmit={(event) => void updateHousehold(event)}>
          {dialogMode === 'create' && <><label>Household name<input required maxLength={120} autoFocus value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} placeholder="e.g. The Mensah family" /></label>
            <label>Branch<select value={form.branch_id} onChange={(event) => setForm((current) => ({ ...current, branch_id: event.target.value }))}><option value="">Organization-wide</option>{organization?.branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label></>}
          {dialogMode === 'add-person' && selected && <>
            <label>Person<select required value={form.member_id} onChange={(event) => setForm((current) => ({ ...current, member_id: event.target.value }))}>
              <option value="">Choose a person</option>{people.filter((person) => !selected.people.some((link) => link.member_id === person.id)).map((person) =>
                <option key={person.id} value={person.id}>{person.first_name} {person.last_name}</option>)}</select></label>
            <label>Relationship<select value={form.relationship} onChange={(event) => setForm((current) => ({ ...current, relationship: event.target.value }))}>{relationships.map(([code, label]) => <option key={code} value={code}>{label}</option>)}</select></label>
            {!selected.people.some((person) => person.is_primary) && <label className="household-primary-toggle"><input type="checkbox" checked={form.is_primary} onChange={(event) => setForm((current) => ({ ...current, is_primary: event.target.checked }))} /> Set as primary household contact</label>}
          </>}
          {formError && <div className="people-error" role="alert">{formError}</div>}
          <div className="member-form-actions"><button className="button button-ghost" type="button" disabled={saving} onClick={() => setDialogOpen(false)}>Cancel</button>
            <button className="button button-primary" disabled={saving}>{saving ? 'Saving…' : dialogMode === 'add-person' ? 'Add person' : 'Create household'}</button></div>
        </form>
      </section>
    </div>}
  </>;
}
