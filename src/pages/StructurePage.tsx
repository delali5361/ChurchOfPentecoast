import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { Icon } from '../components/Icon';
import { PageHeading } from '../components/PageHeading';
import { getCurrentOrganization, type WorkspaceOrganization } from '../data/workspace';
import { createPreviewId, getPreviewOrganization, readPreviewRows, writePreviewRows } from '../data/previewStore';
import { supabase } from '../supabase';

type Branch = {
  id: string;
  name: string;
  code: string | null;
  description: string | null;
  location: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  is_headquarters: boolean;
  status: 'active' | 'inactive';
};
type UnitType = 'department' | 'ministry' | 'group';
type Unit = {
  id: string;
  name: string;
  description: string | null;
  unit_type: UnitType;
  branch_id: string | null;
  parent_id: string | null;
  status: 'active' | 'inactive';
};
type Person = { id: string; branch_id: string | null; first_name: string; last_name: string; membership_status: string };
type Assignment = { id: string; member_id: string; unit_id: string; role_title: string; status: 'active' | 'inactive' };
type UnitForm = { name: string; unit_type: UnitType; branch_id: string; parent_id: string; description: string };
type BranchForm = {
  name: string; code: string; description: string; location: string;
  contact_email: string; contact_phone: string; is_headquarters: boolean;
};

const unitLabels: Record<UnitType, string> = { department: 'Department', ministry: 'Ministry', group: 'Group / cell' };
const emptyBranch: BranchForm = {
  name: '', code: '', description: '', location: '', contact_email: '', contact_phone: '', is_headquarters: false,
};
const emptyUnit: UnitForm = { name: '', unit_type: 'department', branch_id: '', parent_id: '', description: '' };

export function StructurePage({ onAction }: { onAction: (message: string) => void }) {
  const [organization, setOrganization] = useState<WorkspaceOrganization | null>(null);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [activeTab, setActiveTab] = useState<'branches' | 'teams' | 'workers'>('branches');
  const [selectedBranch, setSelectedBranch] = useState('all');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(Boolean(supabase));
  const [loadError, setLoadError] = useState('');
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [dialog, setDialog] = useState<'branch' | 'unit' | 'assignment' | null>(null);
  const [editingBranch, setEditingBranch] = useState<Branch | null>(null);
  const [editingUnit, setEditingUnit] = useState<Unit | null>(null);
  const [branchForm, setBranchForm] = useState<BranchForm>(emptyBranch);
  const [unitForm, setUnitForm] = useState<UnitForm>(emptyUnit);
  const [assignmentForm, setAssignmentForm] = useState({ member_id: '', unit_id: '', role_title: '' });

  const load = useCallback(async () => {
    if (!supabase) {
      try {
        const localBranches = readPreviewRows<Branch>('branches');
        setOrganization(getPreviewOrganization(localBranches));
        setBranches(localBranches);
        setUnits(readPreviewRows<Unit>('organization_units'));
        setPeople(readPreviewRows<Person>('members').filter((person) => person.membership_status === 'member'));
        setAssignments(readPreviewRows<Assignment>('worker_assignments'));
      } catch (error) {
        setLoadError(error instanceof Error ? error.message : 'Could not load preview church structure.');
      }
      setLoading(false);
      return;
    }
    setLoading(true);
    setLoadError('');
    try {
      const current = await getCurrentOrganization(supabase);
      setOrganization(current);
      const [branchResult, unitResult, peopleResult, assignmentResult] = await Promise.all([
        supabase.from('branches')
          .select('id,name,code,description,location,contact_email,contact_phone,is_headquarters,status')
          .eq('organization_id', current.id)
          .order('is_headquarters', { ascending: false })
          .order('name'),
        supabase.from('organization_units')
          .select('id,name,description,unit_type,branch_id,parent_id,status')
          .eq('organization_id', current.id)
          .order('name'),
        supabase.from('members')
          .select('id,branch_id,first_name,last_name,membership_status')
          .eq('membership_status', 'member')
          .order('last_name'),
        supabase.from('worker_assignments')
          .select('id,member_id,unit_id,role_title,status')
          .eq('organization_id', current.id)
          .order('created_at', { ascending: false }),
      ]);
      if (branchResult.error) throw new Error(`Could not load branches: ${branchResult.error.message}`);
      if (unitResult.error) throw new Error(`Could not load departments and ministries: ${unitResult.error.message}`);
      if (peopleResult.error) throw new Error(`Could not load eligible workers: ${peopleResult.error.message}`);
      if (assignmentResult.error) throw new Error(`Could not load worker assignments: ${assignmentResult.error.message}`);
      setBranches((branchResult.data ?? []) as Branch[]);
      setUnits((unitResult.data ?? []) as Unit[]);
      setPeople((peopleResult.data ?? []) as Person[]);
      setAssignments((assignmentResult.data ?? []) as Assignment[]);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Could not load your church structure.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const membersById = useMemo(() => new Map(people.map((person) => [person.id, person])), [people]);
  const unitsById = useMemo(() => new Map(units.map((unit) => [unit.id, unit])), [units]);
  const filteredBranches = branches.filter((branch) => selectedBranch === 'all' || branch.id === selectedBranch);
  const visibleUnits = units.filter((unit) => (selectedBranch === 'all' || unit.branch_id === selectedBranch)
    && `${unit.name} ${unit.description ?? ''} ${unitLabels[unit.unit_type]}`.toLowerCase().includes(query.trim().toLowerCase()));
  const activeAssignments = assignments.filter((assignment) => assignment.status === 'active');

  const unitParents = (type: UnitType, branchId: string) => units.filter((unit) => unit.status === 'active'
    && (branchId === '' || unit.branch_id === branchId || unit.branch_id === null)
    && (type === 'ministry' ? unit.unit_type === 'department' : type === 'group' && unit.unit_type === 'ministry'));

  const openBranch = () => {
    setEditingBranch(null);
    setBranchForm(emptyBranch);
    setFormError('');
    setDialog('branch');
  };
  const editBranch = (branch: Branch) => {
    setEditingBranch(branch);
    setBranchForm({
      name: branch.name,
      code: branch.code ?? '',
      description: branch.description ?? '',
      location: branch.location ?? '',
      contact_email: branch.contact_email ?? '',
      contact_phone: branch.contact_phone ?? '',
      is_headquarters: branch.is_headquarters,
    });
    setFormError('');
    setDialog('branch');
  };
  const openUnit = () => {
    setEditingUnit(null);
    setUnitForm({ ...emptyUnit, branch_id: selectedBranch === 'all' ? '' : selectedBranch });
    setFormError('');
    setDialog('unit');
  };
  const editUnit = (unit: Unit) => {
    setEditingUnit(unit);
    setUnitForm({
      name: unit.name,
      unit_type: unit.unit_type,
      branch_id: unit.branch_id ?? '',
      parent_id: unit.parent_id ?? '',
      description: unit.description ?? '',
    });
    setFormError('');
    setDialog('unit');
  };
  const openAssignment = (unitId = '') => {
    setAssignmentForm({ member_id: '', unit_id: unitId, role_title: '' });
    setFormError('');
    setDialog('assignment');
  };

  const submitBranch = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!organization) { setFormError('The church workspace is not available yet.'); return; }
    setSaving(true);
    setFormError('');
    const branchPayload = {
      name: branchForm.name.trim(),
      code: branchForm.code.trim().toUpperCase(),
      description: branchForm.description.trim() || null,
      location: branchForm.location.trim() || null,
      contact_email: branchForm.contact_email.trim() || null,
      contact_phone: branchForm.contact_phone.trim() || null,
      is_headquarters: branchForm.is_headquarters,
    };
    if (supabase) {
      const { error } = editingBranch
        ? await supabase.from('branches').update(branchPayload).eq('id', editingBranch.id)
        : await supabase.from('branches').insert({ organization_id: organization.id, ...branchPayload, status: 'active' });
      if (error) {
        setFormError(`Could not create branch: ${error.message}`);
        setSaving(false);
        return;
      }
    } else {
      const rows = readPreviewRows<Branch>('branches');
      const branch: Branch = { ...branchPayload, id: editingBranch?.id ?? createPreviewId(), status: editingBranch?.status ?? 'active' };
      writePreviewRows('branches', editingBranch ? rows.map((item) => item.id === branch.id ? branch : item) : [...rows, branch]);
    }
    setDialog(null);
    setSaving(false);
    onAction(`${branchForm.name.trim()} branch ${editingBranch ? 'updated' : 'created'}.`);
    await load();
  };

  const updateBranchStatus = async (branch: Branch) => {
    const nextStatus = branch.status === 'active' ? 'inactive' : 'active';
    if (supabase) {
      const { error } = await supabase.from('branches').update({ status: nextStatus }).eq('id', branch.id);
      if (error) {
        onAction(`Could not update ${branch.name}: ${error.message}`);
        return;
      }
    } else {
      writePreviewRows('branches', readPreviewRows<Branch>('branches').map((item) => item.id === branch.id ? { ...item, status: nextStatus } : item));
    }
    onAction(`${branch.name} branch marked ${nextStatus}.`);
    await load();
  };

  const submitUnit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!organization) { setFormError('The church workspace is not available yet.'); return; }
    setSaving(true);
    setFormError('');
    const unitPayload = {
      branch_id: unitForm.branch_id || null,
      parent_id: unitForm.parent_id || null,
      name: unitForm.name.trim(),
      unit_type: unitForm.unit_type,
      description: unitForm.description.trim() || null,
    };
    if (supabase) {
      const { error } = editingUnit
        ? await supabase.from('organization_units').update(unitPayload).eq('id', editingUnit.id)
        : await supabase.from('organization_units').insert({ organization_id: organization.id, ...unitPayload });
      if (error) {
        setFormError(`Could not create ${unitLabels[unitForm.unit_type].toLowerCase()}: ${error.message}`);
        setSaving(false);
        return;
      }
    } else {
      const rows = readPreviewRows<Unit>('organization_units');
      const unit: Unit = { ...unitPayload, id: editingUnit?.id ?? createPreviewId(), status: editingUnit?.status ?? 'active' };
      writePreviewRows('organization_units', editingUnit ? rows.map((item) => item.id === unit.id ? unit : item) : [...rows, unit]);
    }
    setDialog(null);
    setSaving(false);
    onAction(`${unitLabels[unitForm.unit_type]} ${editingUnit ? 'updated' : 'created'}.`);
    await load();
  };

  const updateUnitStatus = async (unit: Unit) => {
    const status = unit.status === 'active' ? 'inactive' : 'active';
    if (supabase) {
      const { error } = await supabase.from('organization_units').update({ status }).eq('id', unit.id);
      if (error) {
        onAction(`Could not update ${unit.name}: ${error.message}`);
        return;
      }
    } else {
      writePreviewRows('organization_units', readPreviewRows<Unit>('organization_units').map((item) => item.id === unit.id ? { ...item, status } : item));
    }
    onAction(`${unit.name} marked ${status}.`);
    await load();
  };

  const submitAssignment = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!organization) { setFormError('The church workspace is not available yet.'); return; }
    setSaving(true);
    setFormError('');
    const unit = unitsById.get(assignmentForm.unit_id);
    const person = membersById.get(assignmentForm.member_id);
    if (!unit) {
      setFormError('Select an active department, ministry, or group.');
      setSaving(false);
      return;
    }
    if (!person) {
      setFormError('Select an active person from the directory.');
      setSaving(false);
      return;
    }
    const payload = {
      organization_id: organization.id,
      branch_id: unit.branch_id ?? person.branch_id,
      unit_id: assignmentForm.unit_id,
      member_id: assignmentForm.member_id,
      role_title: assignmentForm.role_title.trim() || 'Volunteer',
    };
    if (supabase) {
      const { error } = await supabase.from('worker_assignments').insert(payload);
      if (error) {
        setFormError(`Could not assign this worker: ${error.message}`);
        setSaving(false);
        return;
      }
    } else {
      writePreviewRows('worker_assignments', [...readPreviewRows<Assignment>('worker_assignments'), {
        ...payload, id: createPreviewId(), status: 'active',
      }]);
    }
    setDialog(null);
    setSaving(false);
    onAction(`${person?.first_name ?? 'Worker'} assigned to ${unit.name}.`);
    await load();
  };

  const endAssignment = async (assignment: Assignment) => {
    if (supabase) {
      const { error } = await supabase.from('worker_assignments').update({ status: 'inactive' }).eq('id', assignment.id);
      if (error) {
        onAction(`Could not end worker assignment: ${error.message}`);
        return;
      }
    } else {
      writePreviewRows('worker_assignments', readPreviewRows<Assignment>('worker_assignments').map((item) => item.id === assignment.id ? { ...item, status: 'inactive' } : item));
    }
    onAction('Worker assignment ended.');
    await load();
  };

  const matchingAssignments = (unitId: string) => activeAssignments.filter((assignment) => assignment.unit_id === unitId);

  return <>
    <PageHeading page="structure" />
    <section className="structure-workspace">
      <div className="people-stats" aria-label="Church structure totals">
        <article><span>Active branches</span><strong>{branches.filter((branch) => branch.status === 'active').length}</strong></article>
        <article><span>Departments</span><strong>{units.filter((unit) => unit.unit_type === 'department' && unit.status === 'active').length}</strong></article>
        <article><span>Ministries & groups</span><strong>{units.filter((unit) => unit.unit_type !== 'department' && unit.status === 'active').length}</strong></article>
        <article><span>Active workers</span><strong>{new Set(activeAssignments.map((assignment) => assignment.member_id)).size}</strong></article>
      </div>
      <section className="structure-panel glass-card">
        <div className="structure-heading"><div><span className="eyebrow">Branches & ministry teams</span><h2>{organization?.name ?? 'Church structure'}</h2>
          <p>Connect campuses, ministry teams, and the people who serve in them.</p></div>
          <div className="people-actions"><button className="button button-ghost" type="button" onClick={() => openAssignment()}><Icon name="user-plus" size={15} /> Assign worker</button>
            <button className="button button-primary" type="button" onClick={openBranch}><Icon name="plus" size={15} /> Add branch</button></div></div>
        {!supabase && <div className="people-notice" role="status"><Icon name="database" size={17} /><span>Preview only. Connect Supabase to manage branches, ministry teams, and workers.</span></div>}
        {loadError && <div className="people-error" role="alert">{loadError}<button className="text-button" onClick={() => void load()}>Retry</button></div>}
        <div className="structure-tabs" role="tablist" aria-label="Church structure sections">
          <button type="button" role="tab" aria-selected={activeTab === 'branches'} className={activeTab === 'branches' ? 'active' : ''} onClick={() => setActiveTab('branches')}><Icon name="church" size={15} /> Branches</button>
          <button type="button" role="tab" aria-selected={activeTab === 'teams'} className={activeTab === 'teams' ? 'active' : ''} onClick={() => setActiveTab('teams')}><Icon name="network" size={15} /> Departments & teams</button>
          <button type="button" role="tab" aria-selected={activeTab === 'workers'} className={activeTab === 'workers' ? 'active' : ''} onClick={() => setActiveTab('workers')}><Icon name="users" size={15} /> Workers</button>
        </div>
        <div className="structure-toolbar">
          <label className="people-search"><Icon name="search" size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search church structure" aria-label="Search church structure" /></label>
          <label className="people-filter"><span>Branch</span><select value={selectedBranch} onChange={(event) => setSelectedBranch(event.target.value)} aria-label="Filter by branch">
            <option value="all">All branches</option>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label>
          {activeTab !== 'branches' && <button className="button button-primary structure-add-button" type="button" onClick={openUnit}><Icon name="plus" size={15} /> Add team</button>}
        </div>

        {activeTab === 'branches' && <div className="branch-grid">
          {loading && <div className="household-empty"><span className="loading-spinner" /> Loading branches…</div>}
          {!loading && filteredBranches.filter((branch) => `${branch.name} ${branch.code ?? ''} ${branch.location ?? ''}`.toLowerCase().includes(query.trim().toLowerCase())).map((branch) => <article className="branch-card" key={branch.id}>
            <div className="branch-card-top"><span className="household-icon"><Icon name="church" size={18} /></span><span className={`member-status ${branch.status === 'active' ? 'status-member' : 'status-inactive'}`}>{branch.status}</span></div>
            <div className="branch-card-title"><h3>{branch.name}</h3>{branch.is_headquarters && <span className="headquarters-label">Headquarters</span>}</div>
            <p>{branch.code || 'No branch code'}{branch.location ? ` · ${branch.location}` : ''}</p>
            {branch.description && <small>{branch.description}</small>}
            <div className="branch-card-footer"><span>{units.filter((unit) => unit.branch_id === branch.id && unit.status === 'active').length} teams · {new Set(assignments.filter((assignment) => assignment.status === 'active' && unitsById.get(assignment.unit_id)?.branch_id === branch.id).map((assignment) => assignment.member_id)).size} workers</span>
              <button className="text-button" type="button" onClick={() => editBranch(branch)}>Edit</button>
              <button className="text-button" type="button" onClick={() => void updateBranchStatus(branch)}>{branch.status === 'active' ? 'Deactivate' : 'Reactivate'}</button></div>
          </article>)}
          {!loading && !filteredBranches.length && <div className="household-empty">No branches yet. Add your first branch to build the church structure.</div>}
        </div>}

        {activeTab === 'teams' && <div className="structure-units">
          {loading && <div className="household-empty"><span className="loading-spinner" /> Loading teams…</div>}
          {!loading && visibleUnits.map((unit) => {
            const parent = unit.parent_id ? unitsById.get(unit.parent_id) : null;
            const branch = branches.find((item) => item.id === unit.branch_id);
            return <article className={`structure-unit-card unit-${unit.unit_type}`} key={unit.id}>
              <span className="structure-unit-icon"><Icon name={unit.unit_type === 'department' ? 'network' : unit.unit_type === 'ministry' ? 'heart' : 'users'} size={18} /></span>
              <div className="structure-unit-copy"><div className="structure-unit-title"><h3>{unit.name}</h3><span className="unit-type-badge">{unitLabels[unit.unit_type]}</span></div>
                <small>{parent ? `${parent.name} · ` : ''}{branch?.name ?? 'Organization-wide'} · {matchingAssignments(unit.id).length} workers</small>
                {unit.description && <p>{unit.description}</p>}</div>
              <span className={`member-status ${unit.status === 'active' ? 'status-member' : 'status-inactive'}`}>{unit.status}</span>
              <button className="button button-ghost" type="button" disabled={unit.status !== 'active'} onClick={() => openAssignment(unit.id)}>Add worker</button>
              <button className="text-button" type="button" onClick={() => editUnit(unit)}>Edit</button>
              <button className="text-button" type="button" onClick={() => void updateUnitStatus(unit)}>{unit.status === 'active' ? 'Deactivate' : 'Reactivate'}</button>
            </article>;
          })}
          {!loading && !visibleUnits.length && <div className="household-empty">{query ? 'No teams match this search.' : 'No departments or teams yet. Add a department, ministry, or group.'}</div>}
        </div>}

        {activeTab === 'workers' && <div className="structure-workers">
          {loading && <div className="household-empty"><span className="loading-spinner" /> Loading worker assignments…</div>}
          {!loading && activeAssignments.filter((assignment) => {
            const person = membersById.get(assignment.member_id);
            const unit = unitsById.get(assignment.unit_id);
            return person && unit && (selectedBranch === 'all' || unit.branch_id === selectedBranch)
              && `${person.first_name} ${person.last_name} ${unit.name} ${assignment.role_title}`.toLowerCase().includes(query.trim().toLowerCase());
          }).map((assignment) => {
            const person = membersById.get(assignment.member_id);
            const unit = unitsById.get(assignment.unit_id);
            if (!person || !unit) return null;
            return <article className="worker-row" key={assignment.id}>
              <span className="household-person-avatar">{person.first_name.slice(0, 1)}{person.last_name.slice(0, 1)}</span>
              <div className="household-person-copy"><strong>{person.first_name} {person.last_name}</strong><small>{assignment.role_title}</small></div>
              <span className="worker-unit"><Icon name="network" size={14} /> {unit.name}</span>
              <span className="unit-type-badge">{unitLabels[unit.unit_type]}</span>
              <button className="text-button" type="button" onClick={() => void endAssignment(assignment)}>End assignment</button>
            </article>;
          })}
          {!loading && !activeAssignments.length && <div className="household-empty">No workers assigned yet. Assign a person to a ministry team or group.</div>}
        </div>}
      </section>
    </section>

    {dialog && <div className="member-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) setDialog(null); }}>
      <section className="member-modal structure-modal glass-card" role="dialog" aria-modal="true" aria-labelledby="structure-dialog-title">
        <div className="member-modal-heading"><div><span className="eyebrow">Church structure</span><h2 id="structure-dialog-title">
          {dialog === 'branch' ? editingBranch ? 'Edit branch' : 'Add a branch' : dialog === 'unit' ? editingUnit ? 'Edit department or team' : 'Add a department or team' : 'Assign a worker'}</h2></div>
          <button className="icon-button" type="button" aria-label="Close form" onClick={() => setDialog(null)}><Icon name="close" size={18} /></button></div>
        {dialog === 'branch' && <form className="member-form" onSubmit={(event) => void submitBranch(event)}>
          <div className="member-form-grid">
            <label>Branch name<input required autoFocus maxLength={120} value={branchForm.name} onChange={(event) => setBranchForm((current) => ({ ...current, name: event.target.value }))} /></label>
            <label>Branch code<input required maxLength={24} value={branchForm.code} onChange={(event) => setBranchForm((current) => ({ ...current, code: event.target.value }))} placeholder="e.g. ACC-CENTRAL" /></label>
            <label>Location<input maxLength={200} value={branchForm.location} onChange={(event) => setBranchForm((current) => ({ ...current, location: event.target.value }))} /></label>
            <label>Contact email<input type="email" maxLength={254} value={branchForm.contact_email} onChange={(event) => setBranchForm((current) => ({ ...current, contact_email: event.target.value }))} /></label>
            <label>Contact phone<input type="tel" maxLength={40} value={branchForm.contact_phone} onChange={(event) => setBranchForm((current) => ({ ...current, contact_phone: event.target.value }))} /></label>
            <label>Description<input maxLength={300} value={branchForm.description} onChange={(event) => setBranchForm((current) => ({ ...current, description: event.target.value }))} /></label>
            <label className="household-primary-toggle"><input type="checkbox" checked={branchForm.is_headquarters} onChange={(event) => setBranchForm((current) => ({ ...current, is_headquarters: event.target.checked }))} /> Mark as headquarters</label>
          </div>
          {formError && <div className="people-error" role="alert">{formError}</div>}
          <div className="member-form-actions"><button type="button" className="button button-ghost" disabled={saving} onClick={() => setDialog(null)}>Cancel</button><button className="button button-primary" disabled={saving}>{saving ? 'Saving…' : editingBranch ? 'Save branch' : 'Create branch'}</button></div>
        </form>}
        {dialog === 'unit' && <form className="member-form" onSubmit={(event) => void submitUnit(event)}>
          <div className="member-form-grid">
            <label>Name<input required autoFocus maxLength={120} value={unitForm.name} onChange={(event) => setUnitForm((current) => ({ ...current, name: event.target.value }))} /></label>
            <label>Type<select value={unitForm.unit_type} onChange={(event) => setUnitForm((current) => ({ ...current, unit_type: event.target.value as UnitType, parent_id: '' }))}>
              {Object.entries(unitLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            <label>Branch<select value={unitForm.branch_id} onChange={(event) => setUnitForm((current) => ({ ...current, branch_id: event.target.value, parent_id: '' }))}><option value="">Organization-wide</option>{branches.filter((branch) => branch.status === 'active').map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label>
            {unitForm.unit_type !== 'department' && <label>Parent {unitForm.unit_type === 'ministry' ? 'department' : 'ministry'}<select value={unitForm.parent_id} onChange={(event) => setUnitForm((current) => ({ ...current, parent_id: event.target.value }))}>
              <option value="">No parent</option>{unitParents(unitForm.unit_type, unitForm.branch_id).map((unit) => <option key={unit.id} value={unit.id}>{unit.name}</option>)}</select></label>}
            <label className="member-notes-field">Description<textarea rows={3} maxLength={500} value={unitForm.description} onChange={(event) => setUnitForm((current) => ({ ...current, description: event.target.value }))} /></label>
          </div>
          {formError && <div className="people-error" role="alert">{formError}</div>}
          <div className="member-form-actions"><button type="button" className="button button-ghost" disabled={saving} onClick={() => setDialog(null)}>Cancel</button><button className="button button-primary" disabled={saving}>{saving ? 'Saving…' : editingUnit ? 'Save team' : 'Create team'}</button></div>
        </form>}
        {dialog === 'assignment' && <form className="member-form" onSubmit={(event) => void submitAssignment(event)}>
          {(!people.length || !units.some((unit) => unit.status === 'active')) && <div className="workspace-alert">
            Add at least one active person and one active team before assigning a worker.
          </div>}
          <div className="member-form-grid">
            <label>Person<select required autoFocus value={assignmentForm.member_id} onChange={(event) => setAssignmentForm((current) => ({ ...current, member_id: event.target.value }))}><option value="">Select a person</option>
              {people.map((person) => <option key={person.id} value={person.id}>{person.first_name} {person.last_name}</option>)}</select></label>
            <label>Team<select required value={assignmentForm.unit_id} onChange={(event) => setAssignmentForm((current) => ({ ...current, unit_id: event.target.value }))}><option value="">Select a team</option>
              {units.filter((unit) => unit.status === 'active').map((unit) => <option key={unit.id} value={unit.id}>{unit.name} · {unitLabels[unit.unit_type]}</option>)}</select></label>
            <label className="member-notes-field">Serving role<input maxLength={100} value={assignmentForm.role_title} onChange={(event) => setAssignmentForm((current) => ({ ...current, role_title: event.target.value }))} placeholder="e.g. Coordinator, volunteer" /></label>
          </div>
          {formError && <div className="people-error" role="alert">{formError}</div>}
          <div className="member-form-actions"><button type="button" className="button button-ghost" disabled={saving} onClick={() => setDialog(null)}>Cancel</button><button className="button button-primary" disabled={saving}>{saving ? 'Saving…' : 'Assign worker'}</button></div>
        </form>}
      </section>
    </div>}
  </>;
}
