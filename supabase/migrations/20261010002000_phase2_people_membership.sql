-- Phase 2: member profiles, directory permissions, and safe profile updates.

ALTER TABLE public.members
  ADD COLUMN IF NOT EXISTS membership_number text,
  ADD COLUMN IF NOT EXISTS gender text,
  ADD COLUMN IF NOT EXISTS date_of_birth date,
  ADD COLUMN IF NOT EXISTS baptism_date date,
  ADD COLUMN IF NOT EXISTS address text,
  ADD COLUMN IF NOT EXISTS city text,
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS members_membership_status_idx
  ON public.members (membership_status);

CREATE INDEX IF NOT EXISTS members_membership_number_idx
  ON public.members (membership_number)
  WHERE membership_number IS NOT NULL;

CREATE OR REPLACE FUNCTION public.set_member_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS members_set_updated_at ON public.members;
CREATE TRIGGER members_set_updated_at
  BEFORE UPDATE ON public.members
  FOR EACH ROW
  EXECUTE FUNCTION public.set_member_updated_at();

INSERT INTO public.app_roles (code, name, description, precedence, is_system_role)
VALUES
  ('pastor', 'Pastor', 'People directory access for pastoral leadership', 20, true),
  ('branch_administrator', 'Branch Administrator', 'People directory access for branch administrators', 30, true)
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.app_permissions (code, name, description, resource, action)
VALUES
  ('members.view', 'View people directory', 'Read member profiles in authorized organizations and branches', 'members', 'view'),
  ('members.create', 'Create people records', 'Create member profiles in authorized organizations and branches', 'members', 'create'),
  ('members.update', 'Update people records', 'Update member profiles in authorized organizations and branches', 'members', 'update')
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.role_permissions (app_role_id, app_permission_id)
SELECT role.id, permission.id
FROM public.app_roles AS role
CROSS JOIN public.app_permissions AS permission
WHERE role.code IN ('pastor', 'branch_administrator', 'pastoral_care_officer')
  AND permission.code IN ('members.view', 'members.create', 'members.update')
ON CONFLICT (app_role_id, app_permission_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.has_church_permission(
  requested_code text,
  target_organization_id uuid,
  target_branch_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles AS user_role
    JOIN public.app_roles AS church_role ON church_role.id = user_role.app_role_id
    LEFT JOIN public.role_permissions AS role_permission ON role_permission.app_role_id = church_role.id
    LEFT JOIN public.app_permissions AS permission ON permission.id = role_permission.app_permission_id
    WHERE user_role.user_id = auth.uid()
      AND (user_role.branch_id IS NULL OR user_role.branch_id = target_branch_id)
      AND (church_role.code IN ('super_administrator', 'administrator') OR permission.code = requested_code)
      AND (
        EXISTS (
          SELECT 1 FROM public.users AS profile
          WHERE profile.id = auth.uid()
            AND profile.organization_id = target_organization_id
        )
        OR EXISTS (
          SELECT 1 FROM public.user_organizations AS organization_access
          WHERE organization_access.user_id = auth.uid()
            AND organization_access.organization_id = target_organization_id
        )
      )
  );
$$;

REVOKE EXECUTE ON FUNCTION public.has_church_permission(text, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_church_permission(text, uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.assign_member_organization()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.organization_id IS NULL THEN
    SELECT profile.organization_id
    INTO NEW.organization_id
    FROM public.users AS profile
    WHERE profile.id = auth.uid();
  END IF;

  IF NEW.organization_id IS NULL THEN
    RAISE EXCEPTION 'An authorized organization is required for a member record';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS members_assign_organization ON public.members;
CREATE TRIGGER members_assign_organization
  BEFORE INSERT ON public.members
  FOR EACH ROW
  EXECUTE FUNCTION public.assign_member_organization();

DO $$
DECLARE
  organization_count integer;
  only_organization_id uuid;
BEGIN
  SELECT count(*)
  INTO organization_count
  FROM public.organizations;

  IF organization_count = 1 THEN
    SELECT id INTO only_organization_id FROM public.organizations;
    UPDATE public.members
    SET organization_id = only_organization_id
    WHERE organization_id IS NULL;
  END IF;
END;
$$;

ALTER TABLE public.members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "shared_select_members" ON public.members;
DROP POLICY IF EXISTS "shared_insert_members" ON public.members;
DROP POLICY IF EXISTS "shared_update_members" ON public.members;
DROP POLICY IF EXISTS "shared_delete_members" ON public.members;
DROP POLICY IF EXISTS "authenticated_select_members" ON public.members;
DROP POLICY IF EXISTS "authenticated_insert_members" ON public.members;
DROP POLICY IF EXISTS "authenticated_update_members" ON public.members;
DROP POLICY IF EXISTS "authenticated_delete_members" ON public.members;
DROP POLICY IF EXISTS "phase2_members_select" ON public.members;
DROP POLICY IF EXISTS "phase2_members_insert" ON public.members;
DROP POLICY IF EXISTS "phase2_members_update" ON public.members;

CREATE POLICY "phase2_members_select"
  ON public.members FOR SELECT TO authenticated
  USING (public.has_church_permission('members.view', organization_id, branch_id));

CREATE POLICY "phase2_members_insert"
  ON public.members FOR INSERT TO authenticated
  WITH CHECK (public.has_church_permission('members.create', organization_id, branch_id));

CREATE POLICY "phase2_members_update"
  ON public.members FOR UPDATE TO authenticated
  USING (public.has_church_permission('members.update', organization_id, branch_id))
  WITH CHECK (public.has_church_permission('members.update', organization_id, branch_id));

REVOKE ALL ON public.members FROM anon;
REVOKE DELETE ON public.members FROM authenticated;
GRANT SELECT, INSERT, UPDATE ON public.members TO authenticated;
