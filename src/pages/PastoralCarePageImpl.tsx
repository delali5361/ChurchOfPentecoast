import { useCallback, useEffect, useMemo, useState } from 'react';
import { Icon } from '../components/Icon';
import { getCurrentUserRoles } from '../auth';
import { createPreviewId, getPreviewOrganization, readPreviewRows, writePreviewRows } from '../data/previewStore';
import { getCurrentOrganization, type WorkspaceOrganization } from '../data/workspace';
import { supabase } from '../supabase';

type PastoralRecord = {
  id: string;
  member_id: string | null;
  branch_id: string | null;
  title: string;
  record_type: 'visit' | 'counselling' | 'prayer' | 'care';
  notes: string;
  record_date: string;
  privacy_level: 'restricted' | 'confidential' | 'private';
  status: 'open' | 'in_progress' | 'closed';
  created_at: string;
};

type FollowUp = {
  id: string;
  member_id: string | null;
  branch_id: string | null;
  title: string;
  category: 'care' | 'prayer' | 'visit' | 'follow_up';
  due_date: string;
  assigned_to: string | null;
  status: 'pending' | 'in_progress' | 'completed';
  notes: string | null;
  created_at: string;
};

type Member = {
  id: string;
  first_name: string;
  last_name: string;
  branch_id: string | null;
};

type PastoralForm = {
  member_id: string;
  title: string;
  record_type: PastoralRecord['record_type'];
  notes: string;
  privacy_level: PastoralRecord['privacy_level'];
  status: PastoralRecord['status'];
  record_date: string;
};

type FollowUpForm = {
  member_id: string;
  title: string;
  category: FollowUp['category'];
  due_date: string;
  assigned_to: string;
  status: FollowUp['status'];
  notes: string;
};

const defaultRecordForm: PastoralForm = {
  member_id: '',
  title: '',
  record_type: 'visit',
  notes: '',
  privacy_level: 'restricted',
  status: 'open',
  record_date: new Date().toISOString().slice(0, 10),
};

const defaultFollowUpForm: FollowUpForm = {
  member_id: '',
  title: '',
  category: 'care',
  due_date: new Date().toISOString().slice(0, 10),
  assigned_to: '',
  status: 'pending',
  notes: '',
};

function formatDate(value: string | null) {
  if (!value) return 'No date';
  const date = new Date(`${value.slice(0, 10)}T00:00:00`);
  return Number.isNaN(date.getTime()) ? 'No date' : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export function PastoralCarePageImpl({ onAction }: { onAction: (message: string) => void }) {
  const [organization, setOrganization] = useState<WorkspaceOrganization | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [records, setRecords] = useState<PastoralRecord[]>([]);
  const [followUps, setFollowUps] = useState<FollowUp[]>([]);
  const [loading, setLoading] = useState(Boolean(supabase));
  const [accessAllowed, setAccessAllowed] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [activeTab, setActiveTab] = useState<'overview' | 'records' | 'follow-ups'>('overview');
  const [recordForm, setRecordForm] = useState<PastoralForm>(defaultRecordForm);
  const [followUpForm, setFollowUpForm] = useState<FollowUpForm>(defaultFollowUpForm);
  const [recordError, setRecordError] = useState('');
  const [followUpError, setFollowUpError] = useState('');
  const [showRecordForm, setShowRecordForm] = useState(false);
  const [showFollowUpForm, setShowFollowUpForm] = useState(false);

  const loadData = useCallback(async () => {
    if (!supabase) {
      setLoadError('');
      try {
        const branchRows = readPreviewRows<WorkspaceOrganization['branches'][number]>('branches');
        setOrganization(getPreviewOrganization(branchRows));
        setMembers(readPreviewRows<Member>('members').filter((member) => member.id));
        setRecords(readPreviewRows<PastoralRecord>('pastoral_records')
          .sort((left, right) => right.record_date.localeCompare(left.record_date)));
        setFollowUps(readPreviewRows<FollowUp>('pastoral_follow_ups')
          .sort((left, right) => left.due_date.localeCompare(right.due_date)));
        setAccessAllowed(true);
      } catch (error) {
        setLoadError(error instanceof Error ? error.message : 'Could not load preview pastoral care data.');
      }
      setLoading(false);
      return;
    }
    setLoading(true);
    setLoadError('');

    try {
      const org = await getCurrentOrganization(supabase);
      setOrganization(org);

      const roles = await getCurrentUserRoles(supabase);
      const allowed = roles.includes('administrator') || roles.includes('pastor') || roles.includes('pastoral_care_officer');
      setAccessAllowed(allowed);

      if (!allowed) {
        setMembers([]);
        setRecords([]);
        setFollowUps([]);
        setLoading(false);
        return;
      }

      const [{ data: membersData, error: membersError }, { data: recordsData, error: recordsError }, { data: followUpsData, error: followUpsError }] = await Promise.all([
        supabase.from('members').select('id,first_name,last_name,branch_id').eq('organization_id', org.id).order('last_name', { ascending: true }),
        supabase.from('pastoral_records').select('*').eq('organization_id', org.id).order('record_date', { ascending: false }),
        supabase.from('follow_ups').select('*').eq('organization_id', org.id).order('due_date', { ascending: true }),
      ]);

      if (membersError) throw membersError;
      if (recordsError) throw recordsError;
      if (followUpsError) throw followUpsError;

      setMembers((membersData ?? []) as Member[]);
      setRecords((recordsData ?? []) as PastoralRecord[]);
      setFollowUps((followUpsData ?? []) as FollowUp[]);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Could not load pastoral care data.');
      setMembers([]);
      setRecords([]);
      setFollowUps([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const memberLookup = useMemo(() => {
    return new Map(members.map((member) => [member.id, `${member.first_name} ${member.last_name}`]));
  }, [members]);

  const summaryStats = useMemo(() => {
    const openFollowUps = followUps.filter((entry) => entry.status !== 'completed').length;
    const restrictedRecords = records.filter((entry) => entry.privacy_level === 'restricted').length;
    const activeRecords = records.filter((entry) => entry.status !== 'closed').length;
    return { openFollowUps, restrictedRecords, activeRecords };
  }, [records, followUps]);

  const saveRecord = async () => {
    if (!organization) return;
    setRecordError('');

    if (!recordForm.member_id) {
      setRecordError('Select a member to record the pastoral care note.');
      return;
    }
    if (!recordForm.title.trim()) {
      setRecordError('Add a short title for the care note.');
      return;
    }
    if (!recordForm.notes.trim()) {
      setRecordError('Please add a note about the pastoral care visit or conversation.');
      return;
    }

    try {
      const member = members.find((entry) => entry.id === recordForm.member_id);
      const record = {
        member_id: recordForm.member_id,
        branch_id: member?.branch_id ?? null,
        title: recordForm.title.trim(),
        record_type: recordForm.record_type,
        notes: recordForm.notes.trim(),
        privacy_level: recordForm.privacy_level,
        status: recordForm.status,
        record_date: recordForm.record_date,
      };
      if (supabase) {
        const { error } = await supabase.from('pastoral_records').insert({
        organization_id: organization.id,
          ...record,
        });
        if (error) throw error;
      } else {
        writePreviewRows('pastoral_records', [...readPreviewRows<PastoralRecord>('pastoral_records'), {
          ...record,
          id: createPreviewId(),
          created_at: new Date().toISOString(),
        }]);
      }

      onAction(supabase ? 'Pastoral care note saved.' : 'Care note saved in this browser preview only.');
      setShowRecordForm(false);
      setRecordForm(defaultRecordForm);
      await loadData();
    } catch (error) {
      setRecordError(error instanceof Error ? error.message : 'Could not save pastoral note.');
    }
  };

  const saveFollowUp = async () => {
    if (!organization) return;
    setFollowUpError('');

    if (!followUpForm.member_id) {
      setFollowUpError('Choose the member that needs follow-up.');
      return;
    }
    if (!followUpForm.title.trim()) {
      setFollowUpError('Give the follow-up a clear title.');
      return;
    }

    try {
      const member = members.find((entry) => entry.id === followUpForm.member_id);
      const followUp = {
        member_id: followUpForm.member_id,
        branch_id: member?.branch_id ?? null,
        title: followUpForm.title.trim(),
        category: followUpForm.category,
        due_date: followUpForm.due_date,
        assigned_to: followUpForm.assigned_to.trim() || null,
        status: followUpForm.status,
        notes: followUpForm.notes.trim() || null,
      };
      if (supabase) {
        const { error } = await supabase.from('follow_ups').insert({
        organization_id: organization.id,
          ...followUp,
        });
        if (error) throw error;
      } else {
        writePreviewRows('pastoral_follow_ups', [...readPreviewRows<FollowUp>('pastoral_follow_ups'), {
          ...followUp,
          id: createPreviewId(),
          created_at: new Date().toISOString(),
        }]);
      }

      onAction(supabase ? 'Follow-up task created.' : 'Follow-up saved in this browser preview only.');
      setShowFollowUpForm(false);
      setFollowUpForm(defaultFollowUpForm);
      await loadData();
    } catch (error) {
      setFollowUpError(error instanceof Error ? error.message : 'Could not save follow-up task.');
    }
  };

  const deleteRecord = async (id: string) => {
    if (!window.confirm('Delete this pastoral record?')) return;

    try {
      if (supabase) {
        const { error } = await supabase.from('pastoral_records').delete().eq('id', id);
        if (error) throw error;
      } else {
        writePreviewRows('pastoral_records', readPreviewRows<PastoralRecord>('pastoral_records')
          .filter((record) => record.id !== id));
      }
      onAction('Pastoral record deleted.');
      await loadData();
    } catch (error) {
      onAction(`Delete failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const deleteFollowUp = async (id: string) => {
    if (!window.confirm('Delete this follow-up?')) return;

    try {
      if (supabase) {
        const { error } = await supabase.from('follow_ups').delete().eq('id', id);
        if (error) throw error;
      } else {
        writePreviewRows('pastoral_follow_ups', readPreviewRows<FollowUp>('pastoral_follow_ups')
          .filter((followUp) => followUp.id !== id));
      }
      onAction('Follow-up removed.');
      await loadData();
    } catch (error) {
      onAction(`Delete failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const updateFollowUpStatus = async (id: string, nextStatus: FollowUp['status']) => {
    try {
      if (supabase) {
        const { error } = await supabase.from('follow_ups').update({ status: nextStatus }).eq('id', id);
        if (error) throw error;
      } else {
        writePreviewRows('pastoral_follow_ups', readPreviewRows<FollowUp>('pastoral_follow_ups')
          .map((followUp) => followUp.id === id ? { ...followUp, status: nextStatus } : followUp));
      }
      onAction(`Follow-up marked as ${nextStatus}.`);
      await loadData();
    } catch (error) {
      onAction(`Could not update follow-up: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  if (loading) {
    return <div className="module-loading"><span className="loading-spinner" /><span>Loading pastoral care</span></div>;
  }

  if (supabase && !organization) {
    return <div className="module-error" role="alert">{loadError || 'Could not load your church organization.'}</div>;
  }

  if (!accessAllowed) {
    return (
      <div className="pastoral-toolbar panel">
        <div className="access-restricted">
          <Icon name="lock" size={28} />
          <div>
            <h3>Pastoral care access is restricted</h3>
            <p>You need a pastoral care officer or administrator role to view sensitive church care records.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="pastoral-workspace">
      {!supabase && (
        <div className="preview-notice" role="status">
          <Icon name="database" size={17} />
          <span>Local preview only: care notes stay in this browser and are not encrypted or shared. Do not enter real confidential or sensitive information.</span>
        </div>
      )}
      {loadError && <div className="workspace-alert" role="alert">{loadError}</div>}
      <div className="module-tabs">
        <button className={`module-tab ${activeTab === 'overview' ? 'active' : ''}`} onClick={() => setActiveTab('overview')}>
          <Icon name="dashboard" size={16} /> Overview
        </button>
        <button className={`module-tab ${activeTab === 'records' ? 'active' : ''}`} onClick={() => setActiveTab('records')}>
          <Icon name="heart" size={16} /> Care records
        </button>
        <button className={`module-tab ${activeTab === 'follow-ups' ? 'active' : ''}`} onClick={() => setActiveTab('follow-ups')}>
          <Icon name="check" size={16} /> Follow-ups
        </button>
      </div>

      {activeTab === 'overview' && (
        <div className="pastoral-overview">
          <div className="overview-grid">
            <div className="overview-card">
              <div className="overview-card-header">
                <span className="overview-card-icon"><Icon name="heart" size={20} /></span>
                <span className="overview-card-label">Open care</span>
              </div>
              <div className="overview-card-value">{summaryStats.activeRecords}</div>
              <div className="overview-card-description">Active care notes</div>
            </div>
            <div className="overview-card">
              <div className="overview-card-header">
                <span className="overview-card-icon"><Icon name="check" size={20} /></span>
                <span className="overview-card-label">Follow-ups</span>
              </div>
              <div className="overview-card-value">{summaryStats.openFollowUps}</div>
              <div className="overview-card-description">Open next-step tasks</div>
            </div>
            <div className="overview-card">
              <div className="overview-card-header">
                <span className="overview-card-icon"><Icon name="lock" size={20} /></span>
                <span className="overview-card-label">Restricted</span>
              </div>
              <div className="overview-card-value">{summaryStats.restrictedRecords}</div>
              <div className="overview-card-description">Sensitive notes</div>
            </div>
            <div className="overview-card">
              <div className="overview-card-header">
                <span className="overview-card-icon"><Icon name="users" size={20} /></span>
                <span className="overview-card-label">People</span>
              </div>
              <div className="overview-card-value">{members.length}</div>
              <div className="overview-card-description">Members in care network</div>
            </div>
          </div>

          <div className="overview-actions">
            <button className="action-button primary" onClick={() => { setActiveTab('records'); setRecordError(''); setShowRecordForm(true); setShowFollowUpForm(false); }}>
              <Icon name="plus" size={16} /> New care note
            </button>
            <button className="action-button primary" onClick={() => { setActiveTab('follow-ups'); setFollowUpError(''); setShowFollowUpForm(true); setShowRecordForm(false); }}>
              <Icon name="plus" size={16} /> New follow-up
            </button>
          </div>
        </div>
      )}

      {activeTab === 'records' && (
        <div className="pastoral-section">
          <div className="section-header">
            <h3>Care records</h3>
            <button className="action-button primary" onClick={() => { setRecordError(''); setShowRecordForm(true); setShowFollowUpForm(false); }}>
              <Icon name="plus" size={16} /> Add record
            </button>
          </div>

          {showRecordForm && (
            <div className="form-card">
              <h4>Create care record</h4>
              {!members.length && <div className="workspace-alert">Add a person in the People directory before creating a care note.</div>}
              {recordError && <div className="form-error">{recordError}</div>}
              <div className="form-grid">
                <div className="form-group">
                  <label>Member</label>
                  <select value={recordForm.member_id} onChange={(event) => setRecordForm({ ...recordForm, member_id: event.target.value })}>
                    <option value="">Select a member</option>
                    {members.map((member) => (
                      <option key={member.id} value={member.id}>{member.first_name} {member.last_name}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>Type</label>
                  <select value={recordForm.record_type} onChange={(event) => setRecordForm({ ...recordForm, record_type: event.target.value as PastoralRecord['record_type'] })}>
                    <option value="visit">Visit</option>
                    <option value="counselling">Counselling</option>
                    <option value="prayer">Prayer</option>
                    <option value="care">Care</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Title</label>
                  <input value={recordForm.title} onChange={(event) => setRecordForm({ ...recordForm, title: event.target.value })} placeholder="Prayer support and encouragement" />
                </div>
                <div className="form-group">
                  <label>Privacy</label>
                  <select value={recordForm.privacy_level} onChange={(event) => setRecordForm({ ...recordForm, privacy_level: event.target.value as PastoralRecord['privacy_level'] })}>
                    <option value="restricted">Restricted</option>
                    <option value="confidential">Confidential</option>
                    <option value="private">Private</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Status</label>
                  <select value={recordForm.status} onChange={(event) => setRecordForm({ ...recordForm, status: event.target.value as PastoralRecord['status'] })}>
                    <option value="open">Open</option>
                    <option value="in_progress">In progress</option>
                    <option value="closed">Closed</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Date</label>
                  <input type="date" value={recordForm.record_date} onChange={(event) => setRecordForm({ ...recordForm, record_date: event.target.value })} />
                </div>
              </div>
              <div className="form-group">
                <label>Notes</label>
                <textarea rows={6} value={recordForm.notes} onChange={(event) => setRecordForm({ ...recordForm, notes: event.target.value })} placeholder="Document the pastoral context, prayer needs, and care plan." />
              </div>
              <div className="form-actions">
                <button className="action-button secondary" onClick={() => setShowRecordForm(false)}>Cancel</button>
                <button className="action-button primary" onClick={saveRecord}>Save care record</button>
              </div>
            </div>
          )}

          <div className="list-grid">
            {records.length === 0 ? (
              <div className="empty-state">
                <Icon name="heart" size={32} />
                <p>No care notes yet</p>
                <small>Create a pastoral care record to start tracking support</small>
              </div>
            ) : (
              records.map((record) => (
                <div key={record.id} className="pastoral-card">
                  <div className="pastoral-card-header">
                    <div>
                      <h4>{record.title}</h4>
                      <div className="meta-row">
                        <span className="badge">{record.record_type}</span>
                        <span className={`status-badge status-${record.status}`}>{record.status}</span>
                        <span className="privacy-chip">{record.privacy_level}</span>
                      </div>
                    </div>
                    <button className="icon-button danger" onClick={() => deleteRecord(record.id)} aria-label="Delete record">
                      <Icon name="trash" size={16} />
                    </button>
                  </div>
                  <div className="person-line">
                    <Icon name="users" size={15} />
                    <span>{record.member_id ? memberLookup.get(record.member_id) ?? 'Unknown member' : 'Unassigned member'}</span>
                  </div>
                  <div className="notes-block">{record.notes}</div>
                  <div className="card-footer">
                    <span>{formatDate(record.record_date)}</span>
                    <span>{new Date(record.created_at).toLocaleDateString()}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {activeTab === 'follow-ups' && (
        <div className="pastoral-section">
          <div className="section-header">
            <h3>Follow-up tasks</h3>
            <button className="action-button primary" onClick={() => { setFollowUpError(''); setShowFollowUpForm(true); setShowRecordForm(false); }}>
              <Icon name="plus" size={16} /> Add follow-up
            </button>
          </div>

          {showFollowUpForm && (
            <div className="form-card">
              <h4>Create follow-up</h4>
              {!members.length && <div className="workspace-alert">Add a person in the People directory before creating a follow-up.</div>}
              {followUpError && <div className="form-error">{followUpError}</div>}
              <div className="form-grid">
                <div className="form-group">
                  <label>Member</label>
                  <select value={followUpForm.member_id} onChange={(event) => setFollowUpForm({ ...followUpForm, member_id: event.target.value })}>
                    <option value="">Select a member</option>
                    {members.map((member) => (
                      <option key={member.id} value={member.id}>{member.first_name} {member.last_name}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>Category</label>
                  <select value={followUpForm.category} onChange={(event) => setFollowUpForm({ ...followUpForm, category: event.target.value as FollowUp['category'] })}>
                    <option value="care">Care</option>
                    <option value="prayer">Prayer</option>
                    <option value="visit">Visit</option>
                    <option value="follow_up">Follow-up</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Title</label>
                  <input value={followUpForm.title} onChange={(event) => setFollowUpForm({ ...followUpForm, title: event.target.value })} placeholder="Check in after hospital visit" />
                </div>
                <div className="form-group">
                  <label>Due date</label>
                  <input type="date" value={followUpForm.due_date} onChange={(event) => setFollowUpForm({ ...followUpForm, due_date: event.target.value })} />
                </div>
                <div className="form-group">
                  <label>Assigned to</label>
                  <input value={followUpForm.assigned_to} onChange={(event) => setFollowUpForm({ ...followUpForm, assigned_to: event.target.value })} placeholder="Pastor or team member" />
                </div>
                <div className="form-group">
                  <label>Status</label>
                  <select value={followUpForm.status} onChange={(event) => setFollowUpForm({ ...followUpForm, status: event.target.value as FollowUp['status'] })}>
                    <option value="pending">Pending</option>
                    <option value="in_progress">In progress</option>
                    <option value="completed">Completed</option>
                  </select>
                </div>
              </div>
              <div className="form-group">
                <label>Notes</label>
                <textarea rows={5} value={followUpForm.notes} onChange={(event) => setFollowUpForm({ ...followUpForm, notes: event.target.value })} placeholder="Add response plan, prayer points, or practical actions." />
              </div>
              <div className="form-actions">
                <button className="action-button secondary" onClick={() => setShowFollowUpForm(false)}>Cancel</button>
                <button className="action-button primary" onClick={saveFollowUp}>Save follow-up</button>
              </div>
            </div>
          )}

          <div className="list-grid">
            {followUps.length === 0 ? (
              <div className="empty-state">
                <Icon name="check" size={32} />
                <p>No follow-ups yet</p>
                <small>Track each next step and keep pastoral support accountable</small>
              </div>
            ) : (
              followUps.map((followUp) => (
                <div key={followUp.id} className="pastoral-card">
                  <div className="pastoral-card-header">
                    <div>
                      <h4>{followUp.title}</h4>
                      <div className="meta-row">
                        <span className="badge">{followUp.category}</span>
                        <span className={`status-badge status-${followUp.status}`}>{followUp.status}</span>
                      </div>
                    </div>
                    <button className="icon-button danger" onClick={() => deleteFollowUp(followUp.id)} aria-label="Delete follow-up">
                      <Icon name="trash" size={16} />
                    </button>
                  </div>
                  <div className="person-line">
                    <Icon name="users" size={15} />
                    <span>{followUp.member_id ? memberLookup.get(followUp.member_id) ?? 'Unknown member' : 'Unassigned member'}</span>
                  </div>
                  <div className="notes-block">{followUp.notes ?? 'No additional notes provided.'}</div>
                  <div className="card-footer">
                    <span>Due {formatDate(followUp.due_date)}</span>
                    <span>{followUp.assigned_to || 'Unassigned'}</span>
                  </div>
                  <div className="followup-actions">
                    <button className="mini-button" onClick={() => updateFollowUpStatus(followUp.id, 'pending')}>Pending</button>
                    <button className="mini-button" onClick={() => updateFollowUpStatus(followUp.id, 'in_progress')}>In progress</button>
                    <button className="mini-button" onClick={() => updateFollowUpStatus(followUp.id, 'completed')}>Completed</button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
