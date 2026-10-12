-- Phase 3: household relationships and consent-aware visitor follow-up.

ALTER TABLE public.members
  ADD COLUMN IF NOT EXISTS first_visit_date date,
  ADD COLUMN IF NOT EXISTS visit_source text,
  ADD COLUMN IF NOT EXISTS contact_preference text NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS contact_consent boolean NOT NULL DEFAULT false;

ALTER TABLE public.members
  ADD CONSTRAINT members_contact_preference_check
  CHECK (contact_preference IN ('in_person', 'phone', 'email', 'whatsapp', 'none'));

CREATE TABLE IF NOT EXISTS public.households (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  branch_id uuid REFERENCES public.branches(id) ON DELETE SET NULL,
  name text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, name)
);

CREATE TABLE IF NOT EXISTS public.household_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  relationship text NOT NULL DEFAULT 'other'
    CHECK (relationship IN ('head', 'spouse', 'partner', 'child', 'parent', 'guardian', 'sibling', 'other')),
  is_primary boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (household_id, member_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS household_members_one_primary_idx
  ON public.household_members (household_id)
  WHERE is_primary;

CREATE INDEX IF NOT EXISTS households_organization_branch_idx
  ON public.households (organization_id, branch_id);

CREATE INDEX IF NOT EXISTS household_members_member_idx
  ON public.household_members (member_id);

CREATE TABLE IF NOT EXISTS public.visitor_follow_ups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  branch_id uuid REFERENCES public.branches(id) ON DELETE SET NULL,
  member_id uuid NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  title text NOT NULL,
  due_date date NOT NULL,
  contact_method text NOT NULL DEFAULT 'in_person'
    CHECK (contact_method IN ('in_person', 'phone', 'email', 'whatsapp')),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'in_progress', 'completed')),
  notes text,
  assigned_to uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS visitor_follow_ups_org_due_idx
  ON public.visitor_follow_ups (organization_id, due_date, status);

CREATE INDEX IF NOT EXISTS visitor_follow_ups_member_idx
  ON public.visitor_follow_ups (member_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.validate_household_member()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  household_organization uuid;
  person_organization uuid;
BEGIN
  SELECT organization_id INTO household_organization
  FROM public.households
  WHERE id = NEW.household_id;

  SELECT organization_id INTO person_organization
  FROM public.members
  WHERE id = NEW.member_id;

  IF household_organization IS NULL OR person_organization IS DISTINCT FROM household_organization THEN
    RAISE EXCEPTION 'A household can only include people from the same organization';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS household_members_validate_org ON public.household_members;
CREATE TRIGGER household_members_validate_org
  BEFORE INSERT OR UPDATE ON public.household_members
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_household_member();

CREATE OR REPLACE FUNCTION public.validate_visitor_follow_up()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  person_organization uuid;
  person_branch uuid;
  person_status text;
  person_has_consent boolean;
BEGIN
  SELECT organization_id, branch_id, membership_status, contact_consent
  INTO person_organization, person_branch, person_status, person_has_consent
  FROM public.members
  WHERE id = NEW.member_id;

  IF person_organization IS DISTINCT FROM NEW.organization_id
     OR person_branch IS DISTINCT FROM NEW.branch_id
     OR person_status NOT IN ('visitor', 'newcomer') THEN
    RAISE EXCEPTION 'Follow-up must match a visitor''s organization and branch';
  END IF;

  IF NEW.contact_method <> 'in_person' AND NOT person_has_consent THEN
    RAISE EXCEPTION 'External contact requires the visitor''s consent';
  END IF;

  IF NEW.status = 'completed' AND NEW.completed_at IS NULL THEN
    NEW.completed_at := now();
  ELSIF NEW.status <> 'completed' THEN
    NEW.completed_at := NULL;
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS visitor_follow_ups_validate ON public.visitor_follow_ups;
CREATE TRIGGER visitor_follow_ups_validate
  BEFORE INSERT OR UPDATE ON public.visitor_follow_ups
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_visitor_follow_up();

INSERT INTO public.app_permissions (code, name, description, resource, action)
VALUES
  ('households.view', 'View households', 'View household profiles and relationships', 'households', 'view'),
  ('households.manage', 'Manage households', 'Create and update households and relationships', 'households', 'manage'),
  ('visitors.view', 'View visitor journeys', 'View visitor profiles and follow-up tasks', 'visitors', 'view'),
  ('visitors.create', 'Record visitors', 'Create visitor profiles and follow-up tasks', 'visitors', 'create'),
  ('visitors.update', 'Update visitor journeys', 'Update visitor journeys and follow-up tasks', 'visitors', 'update')
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.role_permissions (app_role_id, app_permission_id)
SELECT church_role.id, permission.id
FROM public.app_roles AS church_role
CROSS JOIN public.app_permissions AS permission
WHERE church_role.code IN ('pastor', 'branch_administrator')
  AND permission.code IN (
    'households.view', 'households.manage',
    'visitors.view', 'visitors.create', 'visitors.update'
  )
ON CONFLICT (app_role_id, app_permission_id) DO NOTHING;

ALTER TABLE public.households ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.household_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.visitor_follow_ups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "phase3_households_select"
  ON public.households FOR SELECT TO authenticated
  USING (public.has_church_permission('households.view', organization_id, branch_id));

CREATE POLICY "phase3_households_insert"
  ON public.households FOR INSERT TO authenticated
  WITH CHECK (public.has_church_permission('households.manage', organization_id, branch_id));

CREATE POLICY "phase3_households_update"
  ON public.households FOR UPDATE TO authenticated
  USING (public.has_church_permission('households.manage', organization_id, branch_id))
  WITH CHECK (public.has_church_permission('households.manage', organization_id, branch_id));

CREATE POLICY "phase3_household_members_select"
  ON public.household_members FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.households AS household
    WHERE household.id = household_id
      AND public.has_church_permission('households.view', household.organization_id, household.branch_id)
  ));

CREATE POLICY "phase3_household_members_insert"
  ON public.household_members FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.households AS household
    WHERE household.id = household_id
      AND household.status = 'active'
      AND public.has_church_permission('households.manage', household.organization_id, household.branch_id)
  ));

CREATE POLICY "phase3_household_members_update"
  ON public.household_members FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.households AS household
    WHERE household.id = household_id
      AND public.has_church_permission('households.manage', household.organization_id, household.branch_id)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.households AS household
    WHERE household.id = household_id
      AND public.has_church_permission('households.manage', household.organization_id, household.branch_id)
  ));

CREATE POLICY "phase3_household_members_delete"
  ON public.household_members FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.households AS household
    WHERE household.id = household_id
      AND public.has_church_permission('households.manage', household.organization_id, household.branch_id)
  ));

CREATE POLICY "phase3_visitor_follow_ups_select"
  ON public.visitor_follow_ups FOR SELECT TO authenticated
  USING (public.has_church_permission('visitors.view', organization_id, branch_id));

CREATE POLICY "phase3_visitor_follow_ups_insert"
  ON public.visitor_follow_ups FOR INSERT TO authenticated
  WITH CHECK (public.has_church_permission('visitors.create', organization_id, branch_id));

CREATE POLICY "phase3_visitor_follow_ups_update"
  ON public.visitor_follow_ups FOR UPDATE TO authenticated
  USING (public.has_church_permission('visitors.update', organization_id, branch_id))
  WITH CHECK (public.has_church_permission('visitors.update', organization_id, branch_id));

GRANT SELECT, INSERT, UPDATE ON public.households TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.household_members TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.visitor_follow_ups TO authenticated;

DROP POLICY IF EXISTS "phase2_members_select" ON public.members;
DROP POLICY IF EXISTS "phase2_members_insert" ON public.members;
DROP POLICY IF EXISTS "phase2_members_update" ON public.members;

CREATE POLICY "phase2_members_select"
  ON public.members FOR SELECT TO authenticated
  USING (
    public.has_church_permission('members.view', organization_id, branch_id)
    OR (
      membership_status IN ('visitor', 'newcomer')
      AND public.has_church_permission('visitors.view', organization_id, branch_id)
    )
  );

CREATE POLICY "phase2_members_insert"
  ON public.members FOR INSERT TO authenticated
  WITH CHECK (
    public.has_church_permission('members.create', organization_id, branch_id)
    OR (
      membership_status = 'visitor'
      AND public.has_church_permission('visitors.create', organization_id, branch_id)
    )
  );

CREATE POLICY "phase2_members_update"
  ON public.members FOR UPDATE TO authenticated
  USING (
    public.has_church_permission('members.update', organization_id, branch_id)
    OR (
      membership_status IN ('visitor', 'newcomer')
      AND public.has_church_permission('visitors.update', organization_id, branch_id)
    )
  )
  WITH CHECK (
    public.has_church_permission('members.update', organization_id, branch_id)
    OR (
      membership_status IN ('visitor', 'newcomer')
      AND public.has_church_permission('visitors.update', organization_id, branch_id)
    )
  );
