/*
# Add operations modules and authenticated access

1. New Tables
- `attendance_sessions` stores services or meetings where attendance is recorded.
- `attendance_records` stores each person's presence for a session.
- `communication_templates` stores reusable message content.
- `communication_campaigns` stores targeted communication sends and their status.
- `pastoral_records` stores restricted counselling and visitation notes.
- `follow_ups` stores care tasks, due dates, assignments, and completion status.
- `app_roles` stores configurable church roles and descriptions.
- `app_permissions` stores granular permission keys.
- `role_permissions` links roles to permissions.
- `user_roles` links authenticated Supabase users to church roles.

2. Security
- Existing church data policies are changed from public anon access to authenticated access.
- Every new table has RLS enabled and four separate authenticated policies.
- Pastoral records are readable and writable only by authenticated users assigned a pastoral or administrator role.
- Role and permission configuration is readable by authenticated users and writable only by administrators through explicit role checks.

3. Important Notes
- Authentication is now required for the management workspace; Supabase email/password authentication should have email confirmation disabled for the initial rollout.
- No existing records or columns are deleted or renamed.
- The application remains single-organization, while roles provide the first server-enforced protection layer for sensitive records.
*/

CREATE TABLE IF NOT EXISTS attendance_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE,
  branch_id uuid REFERENCES branches(id) ON DELETE SET NULL,
  title text NOT NULL,
  session_type text NOT NULL DEFAULT 'service',
  session_date date NOT NULL DEFAULT current_date,
  expected_count integer NOT NULL DEFAULT 0 CHECK (expected_count >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS attendance_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES attendance_sessions(id) ON DELETE CASCADE,
  member_id uuid REFERENCES members(id) ON DELETE SET NULL,
  person_name text NOT NULL,
  category text NOT NULL DEFAULT 'member',
  checked_in_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS communication_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  channel text NOT NULL DEFAULT 'email',
  subject text,
  body text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS communication_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  channel text NOT NULL DEFAULT 'email',
  audience text NOT NULL,
  message text NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  scheduled_for timestamptz,
  sent_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS pastoral_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE,
  member_id uuid REFERENCES members(id) ON DELETE SET NULL,
  record_type text NOT NULL DEFAULT 'visit',
  title text NOT NULL,
  notes text NOT NULL,
  record_date date NOT NULL DEFAULT current_date,
  privacy_level text NOT NULL DEFAULT 'restricted',
  status text NOT NULL DEFAULT 'open',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS follow_ups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE,
  member_id uuid REFERENCES members(id) ON DELETE SET NULL,
  title text NOT NULL,
  category text NOT NULL DEFAULT 'care',
  due_date date NOT NULL,
  assigned_to uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS app_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  is_system boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS app_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  module text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS role_permissions (
  role_id uuid NOT NULL REFERENCES app_roles(id) ON DELETE CASCADE,
  permission_id uuid NOT NULL REFERENCES app_permissions(id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE IF NOT EXISTS user_roles (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role_id uuid NOT NULL REFERENCES app_roles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, role_id)
);

ALTER TABLE attendance_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE communication_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE communication_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE pastoral_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE follow_ups ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "shared_select_organizations" ON organizations;
DROP POLICY IF EXISTS "shared_insert_organizations" ON organizations;
DROP POLICY IF EXISTS "shared_update_organizations" ON organizations;
DROP POLICY IF EXISTS "shared_delete_organizations" ON organizations;
CREATE POLICY "authenticated_select_organizations" ON organizations FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated_insert_organizations" ON organizations FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "authenticated_update_organizations" ON organizations FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_delete_organizations" ON organizations FOR DELETE TO authenticated USING (true);

DROP POLICY IF EXISTS "shared_select_branches" ON branches;
DROP POLICY IF EXISTS "shared_insert_branches" ON branches;
DROP POLICY IF EXISTS "shared_update_branches" ON branches;
DROP POLICY IF EXISTS "shared_delete_branches" ON branches;
CREATE POLICY "authenticated_select_branches" ON branches FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated_insert_branches" ON branches FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "authenticated_update_branches" ON branches FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_delete_branches" ON branches FOR DELETE TO authenticated USING (true);

DROP POLICY IF EXISTS "shared_select_members" ON members;
DROP POLICY IF EXISTS "shared_insert_members" ON members;
DROP POLICY IF EXISTS "shared_update_members" ON members;
DROP POLICY IF EXISTS "shared_delete_members" ON members;
CREATE POLICY "authenticated_select_members" ON members FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated_insert_members" ON members FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "authenticated_update_members" ON members FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_delete_members" ON members FOR DELETE TO authenticated USING (true);

DROP POLICY IF EXISTS "shared_select_events" ON events;
DROP POLICY IF EXISTS "shared_insert_events" ON events;
DROP POLICY IF EXISTS "shared_update_events" ON events;
DROP POLICY IF EXISTS "shared_delete_events" ON events;
CREATE POLICY "authenticated_select_events" ON events FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated_insert_events" ON events FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "authenticated_update_events" ON events FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_delete_events" ON events FOR DELETE TO authenticated USING (true);

DROP POLICY IF EXISTS "shared_select_giving" ON giving_transactions;
DROP POLICY IF EXISTS "shared_insert_giving" ON giving_transactions;
DROP POLICY IF EXISTS "shared_update_giving" ON giving_transactions;
DROP POLICY IF EXISTS "shared_delete_giving" ON giving_transactions;
CREATE POLICY "authenticated_select_giving" ON giving_transactions FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated_insert_giving" ON giving_transactions FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "authenticated_update_giving" ON giving_transactions FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_delete_giving" ON giving_transactions FOR DELETE TO authenticated USING (true);

CREATE OR REPLACE FUNCTION public.has_church_role(required_role text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM user_roles ur
    JOIN app_roles ar ON ar.id = ur.role_id
    WHERE ur.user_id = auth.uid()
      AND (ar.code = required_role OR ar.code = 'administrator')
  );
$$;
REVOKE EXECUTE ON FUNCTION public.has_church_role(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.has_church_role(text) TO authenticated;

CREATE POLICY "authenticated_select_attendance_sessions" ON attendance_sessions FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated_insert_attendance_sessions" ON attendance_sessions FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "authenticated_update_attendance_sessions" ON attendance_sessions FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_delete_attendance_sessions" ON attendance_sessions FOR DELETE TO authenticated USING (true);
CREATE POLICY "authenticated_select_attendance_records" ON attendance_records FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated_insert_attendance_records" ON attendance_records FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "authenticated_update_attendance_records" ON attendance_records FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_delete_attendance_records" ON attendance_records FOR DELETE TO authenticated USING (true);
CREATE POLICY "authenticated_select_communication_templates" ON communication_templates FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated_insert_communication_templates" ON communication_templates FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "authenticated_update_communication_templates" ON communication_templates FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_delete_communication_templates" ON communication_templates FOR DELETE TO authenticated USING (true);
CREATE POLICY "authenticated_select_communication_campaigns" ON communication_campaigns FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated_insert_communication_campaigns" ON communication_campaigns FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "authenticated_update_communication_campaigns" ON communication_campaigns FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_delete_communication_campaigns" ON communication_campaigns FOR DELETE TO authenticated USING (true);
CREATE POLICY "pastoral_select_records" ON pastoral_records FOR SELECT TO authenticated USING (public.has_church_role('pastoral_care'));
CREATE POLICY "pastoral_insert_records" ON pastoral_records FOR INSERT TO authenticated WITH CHECK (public.has_church_role('pastoral_care'));
CREATE POLICY "pastoral_update_records" ON pastoral_records FOR UPDATE TO authenticated USING (public.has_church_role('pastoral_care')) WITH CHECK (public.has_church_role('pastoral_care'));
CREATE POLICY "pastoral_delete_records" ON pastoral_records FOR DELETE TO authenticated USING (public.has_church_role('pastoral_care'));
CREATE POLICY "authenticated_select_follow_ups" ON follow_ups FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated_insert_follow_ups" ON follow_ups FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "authenticated_update_follow_ups" ON follow_ups FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_delete_follow_ups" ON follow_ups FOR DELETE TO authenticated USING (true);
CREATE POLICY "authenticated_select_roles" ON app_roles FOR SELECT TO authenticated USING (true);
CREATE POLICY "administrator_insert_roles" ON app_roles FOR INSERT TO authenticated WITH CHECK (public.has_church_role('administrator'));
CREATE POLICY "administrator_update_roles" ON app_roles FOR UPDATE TO authenticated USING (public.has_church_role('administrator')) WITH CHECK (public.has_church_role('administrator'));
CREATE POLICY "administrator_delete_roles" ON app_roles FOR DELETE TO authenticated USING (public.has_church_role('administrator'));
CREATE POLICY "authenticated_select_permissions" ON app_permissions FOR SELECT TO authenticated USING (true);
CREATE POLICY "administrator_insert_permissions" ON app_permissions FOR INSERT TO authenticated WITH CHECK (public.has_church_role('administrator'));
CREATE POLICY "administrator_update_permissions" ON app_permissions FOR UPDATE TO authenticated USING (public.has_church_role('administrator')) WITH CHECK (public.has_church_role('administrator'));
CREATE POLICY "administrator_delete_permissions" ON app_permissions FOR DELETE TO authenticated USING (public.has_church_role('administrator'));
CREATE POLICY "authenticated_select_role_permissions" ON role_permissions FOR SELECT TO authenticated USING (true);
CREATE POLICY "administrator_insert_role_permissions" ON role_permissions FOR INSERT TO authenticated WITH CHECK (public.has_church_role('administrator'));
CREATE POLICY "administrator_update_role_permissions" ON role_permissions FOR UPDATE TO authenticated USING (public.has_church_role('administrator')) WITH CHECK (public.has_church_role('administrator'));
CREATE POLICY "administrator_delete_role_permissions" ON role_permissions FOR DELETE TO authenticated USING (public.has_church_role('administrator'));
CREATE POLICY "authenticated_select_user_roles" ON user_roles FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.has_church_role('administrator'));
CREATE POLICY "administrator_insert_user_roles" ON user_roles FOR INSERT TO authenticated WITH CHECK (public.has_church_role('administrator'));
CREATE POLICY "administrator_update_user_roles" ON user_roles FOR UPDATE TO authenticated USING (public.has_church_role('administrator')) WITH CHECK (public.has_church_role('administrator'));
CREATE POLICY "administrator_delete_user_roles" ON user_roles FOR DELETE TO authenticated USING (public.has_church_role('administrator'));

CREATE INDEX IF NOT EXISTS attendance_sessions_date_idx ON attendance_sessions(session_date);
CREATE INDEX IF NOT EXISTS attendance_records_session_idx ON attendance_records(session_id);
CREATE INDEX IF NOT EXISTS campaigns_status_idx ON communication_campaigns(status);
CREATE INDEX IF NOT EXISTS pastoral_records_date_idx ON pastoral_records(record_date);
CREATE INDEX IF NOT EXISTS follow_ups_due_date_idx ON follow_ups(due_date);

INSERT INTO app_roles (code, name, description, is_system) VALUES
  ('administrator', 'Administrator', 'Full church administration access', true),
  ('pastoral_care', 'Pastoral Care', 'Restricted care and visitation access', true),
  ('finance', 'Finance Officer', 'Giving and financial reports access', true),
  ('communications', 'Communication Officer', 'Campaigns and message templates access', true)
ON CONFLICT (code) DO NOTHING;

INSERT INTO app_permissions (code, name, module) VALUES
  ('attendance.view', 'View attendance', 'Attendance'),
  ('attendance.record', 'Record attendance', 'Attendance'),
  ('communications.manage', 'Manage communications', 'Communication'),
  ('pastoral.view', 'View pastoral care', 'Pastoral Care'),
  ('pastoral.manage', 'Manage pastoral care', 'Pastoral Care'),
  ('reports.view', 'View reports', 'Reports'),
  ('administration.manage', 'Manage administration', 'Administration')
ON CONFLICT (code) DO NOTHING;