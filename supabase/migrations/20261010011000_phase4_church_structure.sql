-- Phase 4: branches, ministry hierarchy, and member serving assignments.

ALTER TABLE public.branches
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS contact_email text,
  ADD COLUMN IF NOT EXISTS contact_phone text,
  ADD COLUMN IF NOT EXISTS is_headquarters boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS branches_organization_status_idx
  ON public.branches (organization_id, status);

CREATE TABLE IF NOT EXISTS public.organization_units (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  branch_id uuid REFERENCES public.branches(id) ON DELETE SET NULL,
  parent_id uuid REFERENCES public.organization_units(id) ON DELETE SET NULL,
  name text NOT NULL,
  unit_type text NOT NULL CHECK (unit_type IN ('department', 'ministry', 'group')),
  description text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS organization_units_org_branch_idx
  ON public.organization_units (organization_id, branch_id, unit_type, status);

CREATE INDEX IF NOT EXISTS organization_units_parent_idx
  ON public.organization_units (parent_id);

CREATE TABLE IF NOT EXISTS public.worker_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  branch_id uuid REFERENCES public.branches(id) ON DELETE SET NULL,
  unit_id uuid NOT NULL REFERENCES public.organization_units(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  role_title text NOT NULL DEFAULT 'Volunteer',
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  assigned_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS worker_assignments_one_active_member_unit_idx
  ON public.worker_assignments (member_id, unit_id)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS worker_assignments_org_branch_status_idx
  ON public.worker_assignments (organization_id, branch_id, status);

CREATE OR REPLACE FUNCTION public.validate_organization_unit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  branch_organization uuid;
  parent_organization uuid;
  parent_branch uuid;
  parent_type text;
BEGIN
  IF NEW.branch_id IS NOT NULL THEN
    SELECT organization_id INTO branch_organization
    FROM public.branches
    WHERE id = NEW.branch_id;
    IF branch_organization IS DISTINCT FROM NEW.organization_id THEN
      RAISE EXCEPTION 'Branch must belong to the same organization as the team';
    END IF;
  END IF;

  IF NEW.parent_id IS NOT NULL THEN
    SELECT organization_id, branch_id, unit_type
    INTO parent_organization, parent_branch, parent_type
    FROM public.organization_units
    WHERE id = NEW.parent_id;

    IF parent_organization IS DISTINCT FROM NEW.organization_id THEN
      RAISE EXCEPTION 'Parent team must belong to the same organization';
    END IF;
    IF parent_type <> CASE NEW.unit_type WHEN 'ministry' THEN 'department' WHEN 'group' THEN 'ministry' ELSE '' END THEN
      RAISE EXCEPTION 'Departments, ministries, and groups must follow the department to ministry to group hierarchy';
    END IF;
    IF parent_branch IS NOT NULL AND NEW.branch_id IS NOT NULL AND parent_branch <> NEW.branch_id THEN
      RAISE EXCEPTION 'Child team must use its parent team branch';
    END IF;
    IF parent_branch IS NOT NULL AND NEW.branch_id IS NULL THEN
      NEW.branch_id := parent_branch;
    END IF;
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS organization_units_validate ON public.organization_units;
CREATE TRIGGER organization_units_validate
  BEFORE INSERT OR UPDATE ON public.organization_units
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_organization_unit();

CREATE OR REPLACE FUNCTION public.validate_worker_assignment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  unit_organization uuid;
  unit_branch uuid;
  unit_status text;
  person_organization uuid;
  person_branch uuid;
  person_status text;
BEGIN
  SELECT organization_id, branch_id, status
  INTO unit_organization, unit_branch, unit_status
  FROM public.organization_units
  WHERE id = NEW.unit_id;

  SELECT organization_id, branch_id, membership_status
  INTO person_organization, person_branch, person_status
  FROM public.members
  WHERE id = NEW.member_id;

  IF unit_organization IS DISTINCT FROM NEW.organization_id
     OR person_organization IS DISTINCT FROM NEW.organization_id THEN
    RAISE EXCEPTION 'Worker, team, and assignment must belong to the same organization';
  END IF;
  IF (unit_branch IS NOT NULL AND person_branch IS NOT NULL AND unit_branch IS DISTINCT FROM person_branch)
     OR NEW.branch_id IS DISTINCT FROM COALESCE(unit_branch, person_branch) THEN
    RAISE EXCEPTION 'Worker assignment must match the team and member branch';
  END IF;
  IF NEW.status = 'active' AND (unit_status <> 'active' OR person_status <> 'member') THEN
    RAISE EXCEPTION 'Only active teams and church members can have active worker assignments';
  END IF;

  NEW.updated_at := now();
  IF NEW.status = 'inactive' AND NEW.ended_at IS NULL THEN
    NEW.ended_at := now();
  ELSIF NEW.status = 'active' THEN
    NEW.ended_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS worker_assignments_validate ON public.worker_assignments;
CREATE TRIGGER worker_assignments_validate
  BEFORE INSERT OR UPDATE ON public.worker_assignments
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_worker_assignment();

INSERT INTO public.app_permissions (code, name, description, resource, action)
VALUES
  ('structure.view', 'View church structure', 'View branches, departments, ministries, groups, and workers', 'structure', 'view'),
  ('structure.manage', 'Manage church structure', 'Create and update branches, ministry teams, and worker assignments', 'structure', 'manage')
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.role_permissions (app_role_id, app_permission_id)
SELECT church_role.id, permission.id
FROM public.app_roles AS church_role
CROSS JOIN public.app_permissions AS permission
WHERE church_role.code IN ('pastor', 'branch_administrator')
  AND permission.code = 'structure.view'
ON CONFLICT (app_role_id, app_permission_id) DO NOTHING;

ALTER TABLE public.organization_units ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.worker_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.branches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "shared_select_branches" ON public.branches;
DROP POLICY IF EXISTS "shared_insert_branches" ON public.branches;
DROP POLICY IF EXISTS "shared_update_branches" ON public.branches;
DROP POLICY IF EXISTS "shared_delete_branches" ON public.branches;
DROP POLICY IF EXISTS "authenticated_select_branches" ON public.branches;
DROP POLICY IF EXISTS "authenticated_insert_branches" ON public.branches;
DROP POLICY IF EXISTS "authenticated_update_branches" ON public.branches;
DROP POLICY IF EXISTS "authenticated_delete_branches" ON public.branches;

CREATE POLICY "phase4_branches_select"
  ON public.branches FOR SELECT TO authenticated
  USING (public.has_church_permission('structure.view', organization_id, id));

CREATE POLICY "phase4_branches_insert"
  ON public.branches FOR INSERT TO authenticated
  WITH CHECK (public.has_church_permission('structure.manage', organization_id, id));

CREATE POLICY "phase4_branches_update"
  ON public.branches FOR UPDATE TO authenticated
  USING (public.has_church_permission('structure.manage', organization_id, id))
  WITH CHECK (public.has_church_permission('structure.manage', organization_id, id));

CREATE POLICY "phase4_organization_units_select"
  ON public.organization_units FOR SELECT TO authenticated
  USING (public.has_church_permission('structure.view', organization_id, branch_id));

CREATE POLICY "phase4_organization_units_insert"
  ON public.organization_units FOR INSERT TO authenticated
  WITH CHECK (public.has_church_permission('structure.manage', organization_id, branch_id));

CREATE POLICY "phase4_organization_units_update"
  ON public.organization_units FOR UPDATE TO authenticated
  USING (public.has_church_permission('structure.manage', organization_id, branch_id))
  WITH CHECK (public.has_church_permission('structure.manage', organization_id, branch_id));

CREATE POLICY "phase4_worker_assignments_select"
  ON public.worker_assignments FOR SELECT TO authenticated
  USING (public.has_church_permission('structure.view', organization_id, branch_id));

CREATE POLICY "phase4_worker_assignments_insert"
  ON public.worker_assignments FOR INSERT TO authenticated
  WITH CHECK (public.has_church_permission('structure.manage', organization_id, branch_id));

CREATE POLICY "phase4_worker_assignments_update"
  ON public.worker_assignments FOR UPDATE TO authenticated
  USING (public.has_church_permission('structure.manage', organization_id, branch_id))
  WITH CHECK (public.has_church_permission('structure.manage', organization_id, branch_id));

GRANT SELECT, INSERT, UPDATE ON public.branches TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.organization_units TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.worker_assignments TO authenticated;
