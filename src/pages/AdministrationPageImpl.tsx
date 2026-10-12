import { useCallback, useEffect, useMemo, useState } from 'react';
import { Icon } from '../components/Icon';
import { PageHeading } from '../components/PageHeading';
import { getCurrentOrganization, type WorkspaceOrganization } from '../data/workspace';
import { supabase } from '../supabase';

type AdminTab = 'overview' | 'users' | 'roles' | 'audit' | 'organization';
type Permission = { id: string; code: string; name: string; description: string | null; resource: string; action: string };
type Role = { id: string; code: string; name: string; description: string | null; precedence: number; is_system_role: boolean };
type UserProfile = { id: string; preferred_name: string | null; phone: string | null; status: 'active' | 'inactive' | 'suspended'; last_login_at: string | null; created_at: string };
type Assignment = { id: string; user_id: string; app_role_id: string; branch_id: string | null; assigned_at: string | null };
type AuditEntry = { id: string; user_id: string | null; action: string; resource: string; resource_id: string | null; entity_type: string; created_at: string };

const userStatuses: UserProfile['status'][] = ['active', 'inactive', 'suspended'];

function formatDate(value: string | null) {
  if (!value) return 'Never';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Unknown' : date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

export function AdministrationPageImpl({ onAction }: { onAction: (message: string) => void }) {
  const [organization, setOrganization] = useState<WorkspaceOrganization | null>(null);
  const [currentUserId, setCurrentUserId] = useState('');
  const [profiles, setProfiles] = useState<UserProfile[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [auditEntries, setAuditEntries] = useState<AuditEntry[]>([]);
  const [selectedRole, setSelectedRole] = useState('');
  const [selectedUser, setSelectedUser] = useState('');
  const [selectedAssignmentRole, setSelectedAssignmentRole] = useState('');
  const [selectedBranch, setSelectedBranch] = useState('');
  const [tab, setTab] = useState<AdminTab>('overview');
  const [canManageUsers, setCanManageUsers] = useState(false);
  const [canManageRoles, setCanManageRoles] = useState(false);
  const [canViewAudit, setCanViewAudit] = useState(false);
  const [isSuperAdministrator, setIsSuperAdministrator] = useState(false);
  const [loading, setLoading] = useState(Boolean(supabase));
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    const client = supabase;
    if (!client) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setLoadError('');
    try {
      const current = await getCurrentOrganization(client);
      setOrganization(current);
      const { data: authData, error: authError } = await client.auth.getUser();
      if (authError) throw new Error(`Could not identify the signed-in account: ${authError.message}`);
      if (!authData.user) throw new Error('Sign in to access administration.');
      setCurrentUserId(authData.user.id);

      const { data: roleRows, error: roleError } = await client.from('user_roles')
        .select('app_role_id,app_roles(code)')
        .eq('user_id', authData.user.id);
      if (roleError) throw new Error(`Could not verify administration access: ${roleError.message}`);
      const actorRoles = (roleRows ?? []) as unknown as { app_role_id: string; app_roles: { code: string } | null }[];
      const actorRoleIds = actorRoles.map((row) => row.app_role_id);
      const superAdministrator = actorRoles.some((row) => row.app_roles?.code === 'super_administrator');
      setIsSuperAdministrator(superAdministrator);

      let permissionCodes: string[] = [];
      if (actorRoleIds.length) {
        const { data: permissionRows, error: permissionError } = await client.from('role_permissions')
          .select('app_permissions(code)')
          .in('app_role_id', actorRoleIds);
        if (permissionError) throw new Error(`Could not load administration permissions: ${permissionError.message}`);
        permissionCodes = ((permissionRows ?? []) as unknown as { app_permissions: { code: string } | null }[])
          .flatMap((row) => row.app_permissions?.code ? [row.app_permissions.code] : []);
      }
      const userAccess = superAdministrator || permissionCodes.includes('administration.users');
      const roleAccess = superAdministrator || permissionCodes.includes('administration.roles');
      const auditAccess = superAdministrator || permissionCodes.includes('administration.audit');
      setCanManageUsers(userAccess);
      setCanManageRoles(roleAccess);
      setCanViewAudit(auditAccess);

      const [profileResult, roleListResult, permissionListResult, assignmentResult] = await Promise.all([
        userAccess
          ? client.from('users').select('id,preferred_name,phone,status,last_login_at,created_at')
            .eq('organization_id', current.id).order('preferred_name', { ascending: true })
          : Promise.resolve({ data: [], error: null }),
        roleAccess
          ? client.from('app_roles').select('id,code,name,description,precedence,is_system_role').order('precedence', { ascending: true })
          : Promise.resolve({ data: [], error: null }),
        roleAccess
          ? client.from('app_permissions').select('id,code,name,description,resource,action').order('resource', { ascending: true }).order('name', { ascending: true })
          : Promise.resolve({ data: [], error: null }),
        userAccess
          ? client.from('user_roles').select('id,user_id,app_role_id,branch_id,assigned_at')
          : Promise.resolve({ data: [], error: null }),
      ]);
      if (profileResult.error) throw new Error(`Could not load organization users: ${profileResult.error.message}`);
      if (roleListResult.error) throw new Error(`Could not load church roles: ${roleListResult.error.message}`);
      if (permissionListResult.error) throw new Error(`Could not load permissions: ${permissionListResult.error.message}`);
      if (assignmentResult.error) throw new Error(`Could not load role assignments: ${assignmentResult.error.message}`);
      const profileRows = (profileResult.data ?? []) as UserProfile[];
      const profileIds = profileRows.map((profile) => profile.id);
      setProfiles(profileRows);
      setRoles((roleListResult.data ?? []) as Role[]);
      setPermissions((permissionListResult.data ?? []) as Permission[]);
      setAssignments(((assignmentResult.data ?? []) as Assignment[]).filter((assignment) => profileIds.includes(assignment.user_id)));

      if (auditAccess) {
        const { data: auditRows, error: auditError } = await client.from('audit_logs')
          .select('id,user_id,action,resource,resource_id,entity_type,created_at')
          .eq('organization_id', current.id)
          .order('created_at', { ascending: false })
          .limit(100);
        if (auditError) throw new Error(`Could not load the audit trail: ${auditError.message}`);
        setAuditEntries((auditRows ?? []) as AuditEntry[]);
      } else {
        setAuditEntries([]);
      }
      setLoaded(true);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Could not load administration workspace.');
      setProfiles([]);
      setRoles([]);
      setPermissions([]);
      setAssignments([]);
      setAuditEntries([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const assignmentDetails = useMemo(() => assignments.map((assignment) => ({
    ...assignment,
    role: roles.find((role) => role.id === assignment.app_role_id),
    branch: assignment.branch_id ? organization?.branches.find((branch) => branch.id === assignment.branch_id)?.name ?? 'Branch' : 'All branches',
  })), [assignments, organization, roles]);
  const selectedRoleAssignments = assignmentDetails.filter((assignment) => assignment.app_role_id === selectedRole);
  const rolesByUser = (userId: string) => assignmentDetails.filter((assignment) => assignment.user_id === userId);
  const [rolePermissionIds, setRolePermissionIds] = useState<Map<string, Set<string>>>(new Map());

  useEffect(() => {
    if (!supabase || !selectedRole || !canManageRoles) {
      setRolePermissionIds(new Map());
      return;
    }
    let active = true;
    void supabase.from('role_permissions').select('app_permission_id').eq('app_role_id', selectedRole)
      .then(({ data, error }) => {
        if (!active) return;
        if (error) {
          setLoadError(`Could not load selected role permissions: ${error.message}`);
          return;
        }
        setRolePermissionIds(new Map([[selectedRole, new Set((data ?? []).map((row) => row.app_permission_id))]]));
      });
    return () => { active = false; };
  }, [canManageRoles, selectedRole]);

  const statusChange = async (profile: UserProfile, status: UserProfile['status']) => {
    if (!supabase || !canManageUsers) return;
    if (profile.id === currentUserId) {
      onAction('You cannot change your own account status from this screen.');
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase.from('users').update({ status }).eq('id', profile.id).eq('organization_id', organization?.id);
      if (error) throw error;
      onAction(`Account status updated to ${status}.`);
      await load();
    } catch (error) {
      onAction(`Could not update account status: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setSaving(false);
    }
  };

  const assignRole = async () => {
    if (!supabase || !organization || !canManageRoles || !selectedUser || !selectedAssignmentRole) return;
    const role = roles.find((item) => item.id === selectedAssignmentRole);
    if (!role) return;
    if (!isSuperAdministrator && ['administrator', 'super_administrator'].includes(role.code)) {
      onAction('Only a super administrator can assign administrator-level roles.');
      return;
    }
    const branchId = selectedBranch || null;
    if (assignments.some((item) => item.user_id === selectedUser && item.app_role_id === selectedAssignmentRole && item.branch_id === branchId)) {
      onAction('That role is already assigned for the selected scope.');
      return;
    }
    setSaving(true);
    try {
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError) throw authError;
      if (!authData.user) throw new Error('Your session expired. Sign in again.');
      const { error } = await supabase.from('user_roles').insert({
        user_id: selectedUser,
        app_role_id: selectedAssignmentRole,
        branch_id: branchId,
        assigned_by: authData.user.id,
      });
      if (error) throw error;
      onAction(`Assigned ${role.name} to the selected account.`);
      await load();
    } catch (error) {
      onAction(`Could not assign role: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setSaving(false);
    }
  };

  const removeAssignment = async (assignment: Assignment & { role?: Role }) => {
    if (!supabase || !canManageRoles || !assignment.role) return;
    if (!isSuperAdministrator && ['administrator', 'super_administrator'].includes(assignment.role.code)) {
      onAction('Only a super administrator can remove administrator-level roles.');
      return;
    }
    if (!window.confirm(`Remove the ${assignment.role.name} role from this account?`)) return;
    setSaving(true);
    try {
      const { error } = await supabase.from('user_roles').delete().eq('id', assignment.id);
      if (error) throw error;
      onAction(`${assignment.role.name} role removed.`);
      await load();
    } catch (error) {
      onAction(`Could not remove role: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setSaving(false);
    }
  };

  const togglePermission = async (permission: Permission, enabled: boolean) => {
    if (!supabase || !canManageRoles || !selectedRole) return;
    const role = roles.find((item) => item.id === selectedRole);
    if (!role || (!isSuperAdministrator && ['administrator', 'super_administrator'].includes(role.code))) {
      onAction('Only a super administrator can edit protected system roles.');
      return;
    }
    if (!isSuperAdministrator && ['administration.roles', 'administration.audit'].includes(permission.code)) {
      onAction('Only a super administrator can grant role-management or audit permissions.');
      return;
    }
    setSaving(true);
    try {
      const result = enabled
        ? await supabase.from('role_permissions').insert({ app_role_id: selectedRole, app_permission_id: permission.id })
        : await supabase.from('role_permissions').delete().eq('app_role_id', selectedRole).eq('app_permission_id', permission.id);
      if (result.error) throw result.error;
      setRolePermissionIds((current) => {
        const next = new Map(current);
        const values = new Set(next.get(selectedRole) ?? []);
        if (enabled) values.add(permission.id);
        else values.delete(permission.id);
        next.set(selectedRole, values);
        return next;
      });
      onAction(`Permission ${enabled ? 'granted' : 'removed'}: ${permission.name}.`);
    } catch (error) {
      onAction(`Could not update role permissions: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setSaving(false);
    }
  };

  const canOpen = canManageUsers || canManageRoles || canViewAudit;
  const systemRoles = roles.filter((role) => role.is_system_role);
  const enabledUsers = profiles.filter((profile) => profile.status === 'active').length;

  const tabs: [AdminTab, string, string][] = [
    ['overview', 'Overview', 'activity'],
    ['users', 'Users & access', 'users'],
    ['roles', 'Roles & permissions', 'lock'],
    ['audit', 'Audit trail', 'database'],
    ['organization', 'Organization', 'house'],
  ];

  return <>
    <PageHeading page="administration" />
    <div className="admin-workspace">
      {!supabase && <div className="preview-notice" role="status"><Icon name="database" size={17} /><span>Preview mode — connect Supabase to manage access or view audit history.</span></div>}
      {loadError && <div className="workspace-alert" role="alert">{loadError}</div>}

      {supabase && loaded && !canOpen ? (
        <section className="admin-denied glass-card" role="alert"><Icon name="lock" size={25} /><h2>Administration access required</h2><p>Your account does not have permissions to manage users, roles, or audit history.</p></section>
      ) : <>
        <nav className="admin-tabs" aria-label="Administration sections">
          {tabs.map(([id, label, icon]) => <button key={id} className={`admin-tab ${tab === id ? 'active' : ''}`} onClick={() => setTab(id)}><Icon name={icon} size={16} />{label}</button>)}
        </nav>

        {loading ? <div className="module-loading"><span className="loading-spinner" /><span>Loading administration</span></div> : <>
          {tab === 'overview' && <div className="admin-overview">
            <section className="admin-kpis">
              <article><span><Icon name="users" size={17} /> User accounts</span><strong>{profiles.length}</strong><small>{enabledUsers} active in this organization</small></article>
              <article><span><Icon name="lock" size={17} /> System roles</span><strong>{systemRoles.length}</strong><small>Configured church responsibilities</small></article>
              <article><span><Icon name="network" size={17} /> Branches</span><strong>{organization?.branches.length ?? 0}</strong><small>Active organization locations</small></article>
              <article><span><Icon name="database" size={17} /> Audit events</span><strong>{!supabase ? '—' : canViewAudit ? auditEntries.length : 'Restricted'}</strong><small>{!supabase ? 'Available when connected' : canViewAudit ? 'Most recent retained events' : 'Audit permission required'}</small></article>
            </section>
            <section className="admin-panels">
              <article className="admin-panel glass-card"><div className="report-panel-heading"><div><span className="eyebrow">Access control</span><h2>Manage responsibly</h2></div><Icon name="shield" size={19} /></div><p>Role assignments can be scoped to a branch. Administrator-level assignments and protected roles are reserved for super administrators.</p><button className="button button-ghost" onClick={() => setTab('users')}>Review users <Icon name="arrow" size={14} /></button></article>
              <article className="admin-panel glass-card"><div className="report-panel-heading"><div><span className="eyebrow">Workspace health</span><h2>Church configuration</h2></div><Icon name="house" size={19} /></div><p>{organization?.name ?? 'Preview organization'} has {organization?.branches.length ?? 0} active branches available for role scoping.</p><button className="button button-ghost" onClick={() => setTab('organization')}>View organization <Icon name="arrow" size={14} /></button></article>
            </section>
          </div>}

          {tab === 'users' && <section className="admin-section">
            <div className="section-header"><div><span className="eyebrow">Accounts & responsibilities</span><h2>Users and access</h2></div><span className="admin-section-count">{profiles.length} accounts</span></div>
            {!canManageUsers && supabase && <div className="admin-inline-notice"><Icon name="lock" size={16} /> User account management requires the administration.users permission.</div>}
            {canManageRoles && <div className="admin-assign-form glass-card">
              <h3>Assign a role</h3>
              <div className="admin-assign-fields">
                <label>User<select value={selectedUser} onChange={(event) => setSelectedUser(event.target.value)}><option value="">Select account</option>{profiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.preferred_name || `Account ${profile.id.slice(0, 8)}`} · {profile.status}</option>)}</select></label>
                <label>Role<select value={selectedAssignmentRole} onChange={(event) => setSelectedAssignmentRole(event.target.value)}><option value="">Select role</option>{roles.filter((role) => isSuperAdministrator || !['administrator', 'super_administrator'].includes(role.code)).map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}</select></label>
                <label>Branch scope<select value={selectedBranch} onChange={(event) => setSelectedBranch(event.target.value)}><option value="">All branches</option>{organization?.branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label>
                <button className="button button-primary" disabled={!supabase || saving || !selectedUser || !selectedAssignmentRole} onClick={() => void assignRole()}><Icon name="plus" size={15} /> Assign role</button>
              </div>
            </div>}
            <div className="admin-user-list">
              {profiles.length === 0 ? <div className="admin-empty glass-card"><Icon name="users" size={24} /><strong>{supabase ? 'No user profiles available' : 'Preview: user accounts'}</strong><span>{supabase ? 'No user profiles are visible to your account.' : 'User access and role assignments appear here after connecting Supabase.'}</span></div> :
                profiles.map((profile) => <article className="admin-user-card glass-card" key={profile.id}>
                  <div className="admin-user-main"><span className="admin-user-avatar">{(profile.preferred_name?.trim()[0] ?? profile.id[0]).toUpperCase()}</span><div><strong>{profile.preferred_name || `Account ${profile.id.slice(0, 8)}`}</strong><small>{profile.phone || `ID ${profile.id.slice(0, 12)}…`} · Last sign-in {formatDate(profile.last_login_at)}</small></div></div>
                  <div className="admin-role-list">{rolesByUser(profile.id).length ? rolesByUser(profile.id).map((assignment) => <span className="admin-role-chip" key={assignment.id}>{assignment.role?.name ?? 'Unknown role'} · {assignment.branch}</span>) : <span className="admin-role-chip empty">No roles assigned</span>}</div>
                  {canManageUsers && <label className="admin-status-field">Profile status<select value={profile.status} disabled={saving || profile.id === currentUserId} onChange={(event) => void statusChange(profile, event.target.value as UserProfile['status'])}>{userStatuses.map((status) => <option key={status} value={status}>{status}</option>)}</select><small>Profile status only; revoking Supabase sign-in requires a trusted server-side admin integration.</small></label>}
                  {canManageRoles && <div className="admin-assignment-list">{rolesByUser(profile.id).map((assignment) => <button key={assignment.id} className="admin-remove-role" disabled={saving} onClick={() => void removeAssignment(assignment)} aria-label={`Remove ${assignment.role?.name ?? 'role'}`}><Icon name="close" size={13} />{assignment.role?.code === 'administrator' || assignment.role?.code === 'super_administrator' ? 'Protected role' : 'Remove role'}</button>)}</div>}
                </article>)}
            </div>
          </section>}

          {tab === 'roles' && <section className="admin-section">
            <div className="section-header"><div><span className="eyebrow">Least privilege</span><h2>Roles and permissions</h2></div><span className="admin-section-count">{roles.length} roles · {permissions.length} permissions</span></div>
            {!canManageRoles && supabase && <div className="admin-inline-notice"><Icon name="lock" size={16} /> Role management requires the administration.roles permission.</div>}
            <div className="admin-role-layout">
              <div className="admin-role-selector glass-card">{roles.length === 0 ? <div className="admin-empty"><strong>{supabase ? 'Roles are not available' : 'Preview: church roles'}</strong><span>Configured roles and permissions are listed when connected.</span></div> : roles.map((role) => <button key={role.id} className={`admin-role-select ${selectedRole === role.id ? 'active' : ''}`} onClick={() => setSelectedRole(role.id)}><span><strong>{role.name}</strong><small>{role.description || role.code}</small></span>{role.is_system_role && <em>System</em>}</button>)}</div>
              <div className="admin-permission-panel glass-card">
                {selectedRole ? <>
                  <div className="report-panel-heading"><div><span className="eyebrow">Permission matrix</span><h2>{roles.find((role) => role.id === selectedRole)?.name}</h2></div><Icon name="lock" size={18} /></div>
                  {['administrator', 'super_administrator'].includes(roles.find((role) => role.id === selectedRole)?.code ?? '') && !isSuperAdministrator && <div className="admin-inline-notice">Administrator-level role permissions are protected; only a super administrator may edit them.</div>}
                  <div className="admin-permission-list">{permissions.map((permission) => {
                    const enabled = rolePermissionIds.get(selectedRole)?.has(permission.id) ?? false;
                    const role = roles.find((item) => item.id === selectedRole);
                    const protectedRole = ['administrator', 'super_administrator'].includes(role?.code ?? '') && !isSuperAdministrator;
                    const protectedPermission = !isSuperAdministrator && ['administration.roles', 'administration.audit'].includes(permission.code);
                    return <label key={permission.id} className="admin-permission-row"><span><strong>{permission.name}</strong><small>{permission.description || permission.code}</small></span><input type="checkbox" checked={enabled} disabled={!canManageRoles || saving || Boolean(protectedRole) || protectedPermission} onChange={(event) => void togglePermission(permission, event.target.checked)} /></label>;
                  })}</div>
                </> : <div className="admin-empty"><Icon name="lock" size={23} /><strong>Select a role</strong><span>Choose a role to review its permission set.</span></div>}
              </div>
            </div>
          </section>}

          {tab === 'audit' && <section className="admin-section">
            <div className="section-header"><div><span className="eyebrow">Accountability</span><h2>Audit trail</h2></div><span className="admin-section-count">{canViewAudit ? `${auditEntries.length} recent events` : 'Restricted'}</span></div>
            {!canViewAudit && supabase ? <div className="admin-denied glass-card"><Icon name="lock" size={23} /><h2>Audit access is restricted</h2><p>The administration.audit permission is required to view this organization’s audit history.</p></div> : <div className="admin-audit-list">{auditEntries.length === 0 ? <div className="admin-empty glass-card"><Icon name="database" size={23} /><strong>{supabase ? 'No audit events found' : 'Preview: audit history'}</strong><span>Role changes and other sensitive events will appear here.</span></div> : auditEntries.map((entry) => <article className="admin-audit-row glass-card" key={entry.id}><span className="admin-audit-icon"><Icon name="activity" size={16} /></span><div><strong>{entry.action.replace(/[._]/g, ' ')}</strong><small>{entry.entity_type} · {entry.resource}{entry.resource_id ? ` · ${entry.resource_id}` : ''}</small></div><time>{formatDate(entry.created_at)}</time></article>)}</div>}
          </section>}

          {tab === 'organization' && <section className="admin-section">
            <div className="section-header"><div><span className="eyebrow">Workspace configuration</span><h2>Organization and branches</h2></div><span className="admin-section-count">{organization?.branches.length ?? 0} branches</span></div>
            <article className="admin-org-card glass-card"><div className="admin-org-mark"><Icon name="house" size={20} /></div><div><span className="eyebrow">Organization</span><h3>{organization?.name ?? 'Grace Assembly preview'}</h3><p>Branch membership is used to scope role assignments and workspace reports.</p></div></article>
            <div className="admin-branch-list">{organization?.branches.map((branch) => <article className="admin-branch-row glass-card" key={branch.id}><span className="admin-branch-icon"><Icon name="network" size={16} /></span><div><strong>{branch.name}</strong><small>{assignmentDetails.filter((assignment) => assignment.branch_id === branch.id).length} branch-scoped role assignments</small></div><span className="admin-active-pill">Active</span></article>)}
              {(!organization || organization.branches.length === 0) && <div className="admin-empty glass-card"><strong>{supabase ? 'No active branches' : 'Preview: organization setup'}</strong><span>Active branches will be available here after connecting Supabase.</span></div>}</div>
          </section>}
        </>}
      </>}
    </div>
  </>;
}
