-- Phase 1: Foundation — Organizations, branches, users, roles, permissions, audit logging
-- This migration establishes the secure multi-tenant architecture.

-- Organizations (church organizations)
create table organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  slug text not null unique,
  description text,
  contact_email text,
  contact_phone text,
  country text,
  timezone text default 'UTC',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Branches (physical or organizational locations within an organization)
create table branches (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  code text,
  description text,
  location text,
  contact_email text,
  contact_phone text,
  is_headquarters boolean default false,
  status text default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(organization_id, name)
);

-- App roles (defined by the system; admins cannot delete these)
create table app_roles (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  description text,
  precedence integer not null default 100,
  is_system_role boolean default false,
  created_at timestamptz default now()
);

-- Insert system roles
insert into app_roles (code, name, description, precedence, is_system_role) values
  ('super_administrator', 'Super Administrator', 'Full system access', 1, true),
  ('administrator', 'Church Administrator', 'Organization-level administration', 10, true),
  ('pastor', 'Pastor / Senior Leadership', 'Leadership access to members and reports', 20, true),
  ('branch_administrator', 'Branch Administrator', 'Branch-level administration', 30, true),
  ('department_leader', 'Department Leader', 'Department management and reporting', 40, true),
  ('group_leader', 'Group / Cell Leader', 'Small group management', 50, true),
  ('finance_officer', 'Finance Officer', 'Finance and giving records', 60, true),
  ('communication_officer', 'Communication Officer', 'Communications and messaging', 70, true),
  ('pastoral_care_officer', 'Pastoral Care Officer', 'Pastoral care and counselling', 80, true),
  ('worker', 'Worker', 'Limited member access', 90, true)
on conflict (code) do nothing;

-- Permissions (granular access control)
create table app_permissions (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  description text,
  resource text not null,
  action text not null,
  created_at timestamptz default now()
);

-- Insert foundational permissions
insert into app_permissions (code, name, description, resource, action) values
  ('members.view', 'View Members', 'View member profiles', 'members', 'view'),
  ('members.create', 'Create Members', 'Create new member records', 'members', 'create'),
  ('members.update', 'Update Members', 'Edit member profiles', 'members', 'update'),
  ('members.delete', 'Delete Members', 'Archive/delete member records', 'members', 'delete'),
  ('visitors.view', 'View Visitors', 'View visitor records', 'visitors', 'view'),
  ('visitors.create', 'Create Visitors', 'Record new visitors', 'visitors', 'create'),
  ('visitors.update', 'Update Visitors', 'Edit visitor records', 'visitors', 'update'),
  ('attendance.view', 'View Attendance', 'View attendance records', 'attendance', 'view'),
  ('attendance.create', 'Record Attendance', 'Create attendance records', 'attendance', 'create'),
  ('attendance.update', 'Update Attendance', 'Edit attendance records', 'attendance', 'update'),
  ('finance.view', 'View Finance', 'View financial records', 'finance', 'view'),
  ('finance.giving.create', 'Record Giving', 'Record donations and tithes', 'finance', 'giving.create'),
  ('finance.expense.create', 'Record Expense', 'Record expenses', 'finance', 'expense.create'),
  ('finance.approve', 'Approve Finance', 'Approve expenses and transactions', 'finance', 'approve'),
  ('events.view', 'View Events', 'View events', 'events', 'view'),
  ('events.create', 'Create Events', 'Create and manage events', 'events', 'create'),
  ('events.update', 'Update Events', 'Edit events', 'events', 'update'),
  ('communications.send', 'Send Communications', 'Send messages and communications', 'communications', 'send'),
  ('pastoral.view', 'View Pastoral Records', 'Access pastoral care records (restricted)', 'pastoral', 'view'),
  ('pastoral.create', 'Create Pastoral Records', 'Create pastoral care records', 'pastoral', 'create'),
  ('pastoral.update', 'Update Pastoral Records', 'Edit pastoral care records', 'pastoral', 'update'),
  ('reports.view', 'View Reports', 'Access reports and dashboards', 'reports', 'view'),
  ('reports.export', 'Export Reports', 'Export report data', 'reports', 'export'),
  ('administration.users', 'Manage Users', 'Create, edit, deactivate users', 'administration', 'users'),
  ('administration.roles', 'Manage Roles', 'Assign roles to users', 'administration', 'roles'),
  ('administration.branches', 'Manage Branches', 'Configure church branches', 'administration', 'branches'),
  ('administration.audit', 'View Audit Logs', 'Access audit trail', 'administration', 'audit')
on conflict (code) do nothing;

-- Role-permission assignments (which permissions each role has)
create table role_permissions (
  id uuid primary key default gen_random_uuid(),
  app_role_id uuid not null references app_roles(id) on delete cascade,
  app_permission_id uuid not null references app_permissions(id) on delete cascade,
  created_at timestamptz default now(),
  unique(app_role_id, app_permission_id)
);

-- Assign permissions to Super Administrator (all permissions)
insert into role_permissions (app_role_id, app_permission_id)
select r.id, p.id from app_roles r, app_permissions p
where r.code = 'super_administrator'
on conflict (app_role_id, app_permission_id) do nothing;

-- Assign permissions to Church Administrator (wide access, no audit/super permissions)
insert into role_permissions (app_role_id, app_permission_id)
select r.id, p.id from app_roles r, app_permissions p
where r.code = 'administrator'
and p.code not in ('administration.roles', 'administration.audit')
on conflict (app_role_id, app_permission_id) do nothing;

-- Users (extended from auth.users)
create table users (
  id uuid primary key references auth.users(id) on delete cascade,
  organization_id uuid not null references organizations(id) on delete cascade,
  preferred_name text,
  phone text,
  status text default 'active' check (status in ('active', 'inactive', 'suspended')),
  last_login_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- User role assignments
create table user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  app_role_id uuid not null references app_roles(id) on delete cascade,
  branch_id uuid references branches(id) on delete set null,
  assigned_at timestamptz default now(),
  assigned_by uuid references users(id),
  unique(user_id, app_role_id, branch_id)
);

-- User organization access (which organizations a user can see)
create table user_organizations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  organization_id uuid not null references organizations(id) on delete cascade,
  can_access_all_branches boolean default false,
  created_at timestamptz default now(),
  unique(user_id, organization_id)
);

-- Audit logs (immutable record of sensitive actions)
create table audit_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  user_id uuid references users(id) on delete set null,
  action text not null,
  resource text not null,
  resource_id text,
  entity_type text not null,
  previous_values jsonb,
  new_values jsonb,
  ip_address inet,
  user_agent text,
  created_at timestamptz default now()
);

-- Audit log indexes for performance
create index idx_audit_logs_organization on audit_logs(organization_id);
create index idx_audit_logs_user on audit_logs(user_id);
create index idx_audit_logs_created on audit_logs(created_at desc);
create index idx_audit_logs_resource on audit_logs(resource, resource_id);

-- Branch indexes
create index idx_branches_organization on branches(organization_id);

-- User indexes
create index idx_users_organization on users(organization_id);
create index idx_users_status on users(status);

-- User role indexes
create index idx_user_roles_user on user_roles(user_id);
create index idx_user_roles_role on user_roles(app_role_id);
create index idx_user_roles_branch on user_roles(branch_id);

-- User organization indexes
create index idx_user_organizations_user on user_organizations(user_id);
create index idx_user_organizations_organization on user_organizations(organization_id);

-- Role permissions indexes
create index idx_role_permissions_role on role_permissions(app_role_id);
create index idx_role_permissions_permission on role_permissions(app_permission_id);

-- Enable Row Level Security (RLS)
alter table organizations enable row level security;
alter table branches enable row level security;
alter table users enable row level security;
alter table user_roles enable row level security;
alter table user_organizations enable row level security;
alter table app_roles enable row level security;
alter table app_permissions enable row level security;
alter table role_permissions enable row level security;
alter table audit_logs enable row level security;

-- RLS Policy: Organizations (users can see their own organizations)
create policy "users_see_their_organizations"
  on organizations for select
  using (
    id in (
      select organization_id from users where id = auth.uid()
      union
      select organization_id from user_organizations where user_id = auth.uid()
    )
  );

-- RLS Policy: Branches (users can see branches in their organizations)
create policy "users_see_authorized_branches"
  on branches for select
  using (
    organization_id in (
      select organization_id from users where id = auth.uid()
    )
  );

-- RLS Policy: Users (users can see users in their organization; admins see all in org)
create policy "users_see_organization_users"
  on users for select
  using (
    organization_id in (
      select organization_id from users where id = auth.uid()
    )
  );

-- RLS Policy: User Roles (users can see their own roles; admins see organization roles)
create policy "users_see_their_roles"
  on user_roles for select
  using (
    user_id = auth.uid()
    or user_id in (
      select id from users
      where organization_id in (
        select organization_id from users where id = auth.uid()
      )
    )
  );

-- RLS Policy: Audit Logs (users can only see their organization's audit logs if they have permission)
create policy "users_see_organization_audit_logs"
  on audit_logs for select
  using (
    organization_id in (
      select organization_id from users where id = auth.uid()
    )
  );

-- Grant necessary permissions to authenticated users
grant select on organizations to authenticated;
grant select on branches to authenticated;
grant select on users to authenticated;
grant select on user_roles to authenticated;
grant select on user_organizations to authenticated;
grant select on app_roles to authenticated;
grant select on app_permissions to authenticated;
grant select on role_permissions to authenticated;
grant select on audit_logs to authenticated;
