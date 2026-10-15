-- Phase 11 foundation: role portal accounts and public Member provisioning.

ALTER TABLE public.members
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES public.users(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS members_user_id_unique_idx
  ON public.members (user_id)
  WHERE user_id IS NOT NULL;

INSERT INTO public.app_roles (code, name, description, precedence, is_system_role)
VALUES
  ('member', 'Member', 'Personal church member workspace', 100, true),
  ('presiding_elder', 'Presiding Elder', 'Church-wide leadership and oversight', 15, true),
  ('youth_executive', 'Youth Executive', 'Youth ministry leadership', 35, true),
  ('media', 'Media', 'Church media and communications', 45, true)
ON CONFLICT (code) DO NOTHING;

UPDATE public.app_roles
SET name = 'Admin', description = 'Full administration of the Grace Assembly workspace'
WHERE code = 'administrator';

INSERT INTO public.app_permissions (code, name, description, resource, action)
VALUES
  ('communications.manage', 'Manage church communications', 'Manage church-wide templates and campaign drafts', 'communications', 'manage'),
  ('members.self.view', 'View own member profile', 'View the linked member profile for the signed-in account', 'members', 'self.view'),
  ('events.register', 'Register own event attendance', 'Register the signed-in member for church events', 'events', 'register')
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.role_permissions (app_role_id, app_permission_id)
SELECT church_role.id, permission.id
FROM public.app_roles AS church_role
CROSS JOIN public.app_permissions AS permission
WHERE
  (church_role.code = 'member' AND permission.code IN ('events.view', 'events.register', 'members.self.view'))
  OR (church_role.code = 'presiding_elder' AND permission.code IN (
    'members.view', 'members.create', 'members.update', 'visitors.view', 'visitors.create', 'visitors.update',
    'attendance.view', 'attendance.create', 'attendance.update', 'events.view', 'events.create', 'events.update',
    'structure.view', 'reports.view'
  ))
  OR (church_role.code = 'media' AND permission.code IN (
    'events.view', 'events.create', 'events.update', 'communications.manage'
  ))
ON CONFLICT (app_role_id, app_permission_id) DO NOTHING;

-- Public registration must never inherit an administrator role from a client request.
DROP TRIGGER IF EXISTS bootstrap_first_church_administrator_trigger ON auth.users;

CREATE OR REPLACE FUNCTION public.provision_grace_assembly_member()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  church_id uuid;
  member_role_id uuid;
  first_name text;
  last_name text;
  preferred_name text;
  phone_number text;
BEGIN
  SELECT id INTO church_id
  FROM public.organizations
  WHERE slug = 'grace-assembly' OR name = 'Grace Assembly'
  ORDER BY CASE WHEN slug = 'grace-assembly' THEN 0 ELSE 1 END
  LIMIT 1;

  IF church_id IS NULL THEN
    RAISE EXCEPTION 'Grace Assembly must be configured before public Member registration';
  END IF;

  first_name := NULLIF(trim(NEW.raw_user_meta_data ->> 'first_name'), '');
  last_name := NULLIF(trim(NEW.raw_user_meta_data ->> 'last_name'), '');
  preferred_name := NULLIF(trim(NEW.raw_user_meta_data ->> 'preferred_name'), '');
  phone_number := NULLIF(trim(NEW.raw_user_meta_data ->> 'phone'), '');

  IF first_name IS NULL OR last_name IS NULL THEN
    RAISE EXCEPTION 'First and last name are required for Member registration';
  END IF;

  SELECT id INTO member_role_id
  FROM public.app_roles
  WHERE code = 'member';

  IF member_role_id IS NULL THEN
    RAISE EXCEPTION 'Member role is not configured';
  END IF;

  INSERT INTO public.users (id, organization_id, preferred_name, phone)
  VALUES (NEW.id, church_id, COALESCE(preferred_name, first_name), phone_number)
  ON CONFLICT (id) DO UPDATE
    SET organization_id = EXCLUDED.organization_id,
        preferred_name = EXCLUDED.preferred_name,
        phone = EXCLUDED.phone;

  INSERT INTO public.user_roles (user_id, app_role_id, branch_id)
  VALUES (NEW.id, member_role_id, NULL)
  ON CONFLICT (user_id, app_role_id, branch_id) DO NOTHING;

  INSERT INTO public.members (
    organization_id, user_id, first_name, last_name, email, phone, membership_status
  )
  VALUES (
    church_id, NEW.id, first_name, last_name, NEW.email, phone_number, 'member'
  )
  ON CONFLICT (user_id) WHERE user_id IS NOT NULL DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS provision_grace_assembly_member_trigger ON auth.users;
CREATE TRIGGER provision_grace_assembly_member_trigger
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.provision_grace_assembly_member();

REVOKE EXECUTE ON FUNCTION public.provision_grace_assembly_member() FROM PUBLIC, anon, authenticated;

-- Role permissions are enforced at the database boundary, not only in navigation.
DROP POLICY IF EXISTS phase7_templates_select ON public.communication_templates;
DROP POLICY IF EXISTS phase7_templates_insert ON public.communication_templates;
DROP POLICY IF EXISTS phase7_templates_update ON public.communication_templates;
DROP POLICY IF EXISTS phase7_templates_delete ON public.communication_templates;
DROP POLICY IF EXISTS phase7_campaigns_select ON public.communication_campaigns;
DROP POLICY IF EXISTS phase7_campaigns_insert ON public.communication_campaigns;
DROP POLICY IF EXISTS phase7_campaigns_update ON public.communication_campaigns;
DROP POLICY IF EXISTS phase7_campaigns_delete ON public.communication_campaigns;

CREATE POLICY phase11_templates_select
  ON public.communication_templates FOR SELECT TO authenticated
  USING (public.has_church_permission('communications.manage', organization_id, NULL));
CREATE POLICY phase11_templates_insert
  ON public.communication_templates FOR INSERT TO authenticated
  WITH CHECK (public.has_church_permission('communications.manage', organization_id, NULL));
CREATE POLICY phase11_templates_update
  ON public.communication_templates FOR UPDATE TO authenticated
  USING (public.has_church_permission('communications.manage', organization_id, NULL))
  WITH CHECK (public.has_church_permission('communications.manage', organization_id, NULL));
CREATE POLICY phase11_templates_delete
  ON public.communication_templates FOR DELETE TO authenticated
  USING (public.has_church_permission('communications.manage', organization_id, NULL));
CREATE POLICY phase11_campaigns_select
  ON public.communication_campaigns FOR SELECT TO authenticated
  USING (public.has_church_permission('communications.manage', organization_id, target_branch_id));
CREATE POLICY phase11_campaigns_insert
  ON public.communication_campaigns FOR INSERT TO authenticated
  WITH CHECK (public.has_church_permission('communications.manage', organization_id, target_branch_id));
CREATE POLICY phase11_campaigns_update
  ON public.communication_campaigns FOR UPDATE TO authenticated
  USING (public.has_church_permission('communications.manage', organization_id, target_branch_id))
  WITH CHECK (public.has_church_permission('communications.manage', organization_id, target_branch_id));
CREATE POLICY phase11_campaigns_delete
  ON public.communication_campaigns FOR DELETE TO authenticated
  USING (public.has_church_permission('communications.manage', organization_id, target_branch_id));

DROP POLICY IF EXISTS phase2_members_select ON public.members;
CREATE POLICY phase2_members_select
  ON public.members FOR SELECT TO authenticated
  USING (
    public.has_church_permission('members.view', organization_id, branch_id)
    OR (
      membership_status IN ('visitor', 'newcomer')
      AND public.has_church_permission('visitors.view', organization_id, branch_id)
    )
    OR public.has_church_permission('attendance.view', organization_id, branch_id)
  );

CREATE POLICY phase11_member_self_select
  ON public.members FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS phase5_event_registrations_select ON public.event_registrations;
CREATE POLICY phase11_event_registrations_select
  ON public.event_registrations FOR SELECT TO authenticated
  USING (
    public.has_church_permission('events.create', organization_id, branch_id)
    OR public.has_church_permission('events.update', organization_id, branch_id)
    OR member_id IN (SELECT id FROM public.members WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS phase5_event_registrations_insert ON public.event_registrations;
CREATE POLICY phase11_event_registrations_insert
  ON public.event_registrations FOR INSERT TO authenticated
  WITH CHECK (
    public.has_church_permission('events.create', organization_id, branch_id)
    OR (
      public.has_church_permission('events.register', organization_id, branch_id)
      AND member_id IN (SELECT id FROM public.members WHERE user_id = auth.uid())
      AND status = 'registered'
    )
  );

GRANT SELECT ON public.members TO authenticated;
