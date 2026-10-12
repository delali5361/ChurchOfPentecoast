-- Phase 10: organization administration, role assignment, and access audit.
-- This migration targets the Phase 1 app_role_id/app_permission_id schema.

INSERT INTO public.app_permissions (code, name, description, resource, action)
VALUES
  ('administration.roles', 'Manage church roles', 'Assign permitted roles and manage non-privileged role permissions', 'administration', 'roles')
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.role_permissions (app_role_id, app_permission_id)
SELECT role.id, permission.id
FROM public.app_roles AS role
JOIN public.app_permissions AS permission ON permission.code = 'administration.roles'
WHERE role.code IN ('administrator', 'super_administrator')
ON CONFLICT (app_role_id, app_permission_id) DO NOTHING;

GRANT SELECT, INSERT, DELETE ON public.user_roles TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.role_permissions TO authenticated;
GRANT UPDATE (status) ON public.users TO authenticated;

CREATE OR REPLACE FUNCTION public.is_super_administrator()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles AS actor_assignment
    JOIN public.app_roles AS actor_role ON actor_role.id = actor_assignment.app_role_id
    WHERE actor_assignment.user_id = auth.uid()
      AND actor_role.code = 'super_administrator'
  );
$$;
REVOKE ALL ON FUNCTION public.is_super_administrator() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_super_administrator() TO authenticated;

DROP POLICY IF EXISTS "administrator_insert_user_roles" ON public.user_roles;
DROP POLICY IF EXISTS "administrator_update_user_roles" ON public.user_roles;
DROP POLICY IF EXISTS "administrator_delete_user_roles" ON public.user_roles;
DROP POLICY IF EXISTS phase10_user_roles_insert ON public.user_roles;
DROP POLICY IF EXISTS phase10_user_roles_delete ON public.user_roles;

CREATE POLICY phase10_user_roles_insert
  ON public.user_roles FOR INSERT TO authenticated
  WITH CHECK (
    public.has_church_permission(
      'administration.roles',
      (SELECT profile.organization_id FROM public.users AS profile WHERE profile.id = user_id),
      branch_id
    )
    AND (
      public.is_super_administrator()
      OR NOT EXISTS (
        SELECT 1 FROM public.app_roles AS target_role
        WHERE target_role.id = app_role_id
          AND target_role.code IN ('administrator', 'super_administrator')
      )
    )
    AND (
      branch_id IS NULL
      OR EXISTS (
        SELECT 1
        FROM public.branches AS target_branch
        JOIN public.users AS target_user ON target_user.organization_id = target_branch.organization_id
        WHERE target_branch.id = branch_id
          AND target_user.id = user_id
      )
    )
  );

CREATE POLICY phase10_user_roles_delete
  ON public.user_roles FOR DELETE TO authenticated
  USING (
    public.has_church_permission(
      'administration.roles',
      (SELECT profile.organization_id FROM public.users AS profile WHERE profile.id = user_id),
      branch_id
    )
    AND (
      public.is_super_administrator()
      OR NOT EXISTS (
        SELECT 1 FROM public.app_roles AS target_role
        WHERE target_role.id = app_role_id
          AND target_role.code IN ('administrator', 'super_administrator')
      )
    )
  );

DROP POLICY IF EXISTS "administrator_insert_role_permissions" ON public.role_permissions;
DROP POLICY IF EXISTS "administrator_update_role_permissions" ON public.role_permissions;
DROP POLICY IF EXISTS "administrator_delete_role_permissions" ON public.role_permissions;
DROP POLICY IF EXISTS phase10_role_permissions_insert ON public.role_permissions;
DROP POLICY IF EXISTS phase10_role_permissions_delete ON public.role_permissions;

CREATE POLICY phase10_role_permissions_insert
  ON public.role_permissions FOR INSERT TO authenticated
  WITH CHECK (
    public.has_church_permission(
      'administration.roles',
      (SELECT profile.organization_id FROM public.users AS profile WHERE profile.id = auth.uid()),
      NULL
    )
    AND (
      public.is_super_administrator()
      OR (
        NOT EXISTS (
          SELECT 1 FROM public.app_roles AS target_role
          WHERE target_role.id = app_role_id
            AND target_role.code IN ('administrator', 'super_administrator')
        )
        AND NOT EXISTS (
          SELECT 1 FROM public.app_permissions AS target_permission
          WHERE target_permission.id = app_permission_id
            AND target_permission.code IN ('administration.roles', 'administration.audit')
        )
      )
    )
  );

CREATE POLICY phase10_role_permissions_delete
  ON public.role_permissions FOR DELETE TO authenticated
  USING (
    public.has_church_permission(
      'administration.roles',
      (SELECT profile.organization_id FROM public.users AS profile WHERE profile.id = auth.uid()),
      NULL
    )
    AND (
      public.is_super_administrator()
      OR (
        NOT EXISTS (
          SELECT 1 FROM public.app_roles AS target_role
          WHERE target_role.id = app_role_id
            AND target_role.code IN ('administrator', 'super_administrator')
        )
        AND NOT EXISTS (
          SELECT 1 FROM public.app_permissions AS target_permission
          WHERE target_permission.id = app_permission_id
            AND target_permission.code IN ('administration.roles', 'administration.audit')
        )
      )
    )
  );

DROP POLICY IF EXISTS phase10_users_update_status ON public.users;
CREATE POLICY phase10_users_update_status
  ON public.users FOR UPDATE TO authenticated
  USING (
    id <> auth.uid()
    AND public.has_church_permission('administration.users', organization_id, NULL)
  )
  WITH CHECK (
    id <> auth.uid()
    AND public.has_church_permission('administration.users', organization_id, NULL)
  );

DROP POLICY IF EXISTS "users_see_organization_audit_logs" ON public.audit_logs;
DROP POLICY IF EXISTS phase10_audit_logs_select ON public.audit_logs;
CREATE POLICY phase10_audit_logs_select
  ON public.audit_logs FOR SELECT TO authenticated
  USING (public.has_church_permission('administration.audit', organization_id, NULL));
GRANT SELECT ON public.audit_logs TO authenticated;

CREATE OR REPLACE FUNCTION public.audit_phase10_access_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  affected_user_id uuid;
  affected_organization_id uuid;
  audit_action text;
  before_values jsonb;
  after_values jsonb;
BEGIN
  IF TG_TABLE_NAME = 'user_roles' THEN
    affected_user_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.user_id ELSE NEW.user_id END;
    audit_action := CASE WHEN TG_OP = 'DELETE' THEN 'role.revoked' ELSE 'role.assigned' END;
    before_values := CASE WHEN TG_OP = 'DELETE' THEN to_jsonb(OLD) ELSE NULL END;
    after_values := CASE WHEN TG_OP = 'INSERT' THEN to_jsonb(NEW) ELSE NULL END;
  ELSE
    affected_user_id := NEW.id;
    audit_action := 'user.status_changed';
    before_values := jsonb_build_object('status', OLD.status);
    after_values := jsonb_build_object('status', NEW.status);
  END IF;

  SELECT profile.organization_id
  INTO affected_organization_id
  FROM public.users AS profile
  WHERE profile.id = affected_user_id;

  IF affected_organization_id IS NOT NULL THEN
    INSERT INTO public.audit_logs (
      organization_id, user_id, action, resource, resource_id, entity_type,
      previous_values, new_values
    )
    VALUES (
      affected_organization_id, auth.uid(), audit_action, TG_TABLE_NAME,
      affected_user_id::text, TG_TABLE_NAME, before_values, after_values
    );
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS user_roles_audit_access_change ON public.user_roles;
CREATE TRIGGER user_roles_audit_access_change
  AFTER INSERT OR DELETE ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION public.audit_phase10_access_change();

DROP TRIGGER IF EXISTS users_audit_status_change ON public.users;
CREATE TRIGGER users_audit_status_change
  AFTER UPDATE OF status ON public.users
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION public.audit_phase10_access_change();

REVOKE ALL ON FUNCTION public.audit_phase10_access_change() FROM PUBLIC, anon, authenticated;
