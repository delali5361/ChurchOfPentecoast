/*
# Phase 8: Pastoral care enhancements

This migration adds indexing, status tracking, and sensitive-care metadata for the
pastoral care module. It builds on earlier foundation tables created in the
auth-and-operations migration.

1. Care record utilities
- Add supporting indexes for search and retrieval by organization, member, and date.
- Keep the stricter pastoral access policy established earlier.

2. Follow-up tracking
- Add organization and due-date indexes for care workflows and scheduling.
*/

ALTER TABLE public.pastoral_records
  ADD COLUMN IF NOT EXISTS branch_id uuid REFERENCES public.branches(id) ON DELETE SET NULL;
ALTER TABLE public.follow_ups
  ADD COLUMN IF NOT EXISTS branch_id uuid REFERENCES public.branches(id) ON DELETE SET NULL;

UPDATE public.pastoral_records AS record
SET branch_id = member.branch_id
FROM public.members AS member
WHERE member.id = record.member_id
  AND record.branch_id IS NULL;

UPDATE public.follow_ups AS follow_up
SET branch_id = member.branch_id
FROM public.members AS member
WHERE member.id = follow_up.member_id
  AND follow_up.branch_id IS NULL;

CREATE INDEX IF NOT EXISTS pastoral_records_org_member_idx
  ON pastoral_records (organization_id, member_id, record_date DESC);

CREATE INDEX IF NOT EXISTS pastoral_records_status_idx
  ON pastoral_records (organization_id, status, privacy_level);
CREATE INDEX IF NOT EXISTS pastoral_records_org_branch_idx
  ON pastoral_records (organization_id, branch_id, record_date DESC);

CREATE INDEX IF NOT EXISTS follow_ups_org_status_due_idx
  ON follow_ups (organization_id, status, due_date);

CREATE INDEX IF NOT EXISTS follow_ups_member_idx
  ON follow_ups (member_id, due_date DESC);
CREATE INDEX IF NOT EXISTS follow_ups_org_branch_idx
  ON follow_ups (organization_id, branch_id, due_date);

CREATE OR REPLACE FUNCTION public.validate_phase8_care_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  member_organization_id uuid;
  member_branch_id uuid;
  branch_organization_id uuid;
BEGIN
  IF NEW.member_id IS NOT NULL THEN
    SELECT organization_id, branch_id
    INTO member_organization_id, member_branch_id
    FROM public.members
    WHERE id = NEW.member_id;
    IF NOT FOUND OR member_organization_id IS DISTINCT FROM NEW.organization_id THEN
      RAISE EXCEPTION 'Care record member must belong to its organization';
    END IF;
    IF NEW.branch_id IS NULL THEN
      NEW.branch_id := member_branch_id;
    ELSIF NEW.branch_id IS DISTINCT FROM member_branch_id THEN
      RAISE EXCEPTION 'Care record branch must match the member branch';
    END IF;
  END IF;

  IF NEW.branch_id IS NOT NULL THEN
    SELECT organization_id INTO branch_organization_id
    FROM public.branches
    WHERE id = NEW.branch_id;
    IF branch_organization_id IS DISTINCT FROM NEW.organization_id THEN
      RAISE EXCEPTION 'Care record branch must belong to its organization';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS pastoral_records_validate_scope ON public.pastoral_records;
CREATE TRIGGER pastoral_records_validate_scope
  BEFORE INSERT OR UPDATE ON public.pastoral_records
  FOR EACH ROW EXECUTE FUNCTION public.validate_phase8_care_scope();

DROP TRIGGER IF EXISTS follow_ups_validate_scope ON public.follow_ups;
CREATE TRIGGER follow_ups_validate_scope
  BEFORE INSERT OR UPDATE ON public.follow_ups
  FOR EACH ROW EXECUTE FUNCTION public.validate_phase8_care_scope();
REVOKE ALL ON FUNCTION public.validate_phase8_care_scope() FROM PUBLIC, anon, authenticated;

INSERT INTO public.role_permissions (app_role_id, app_permission_id)
SELECT church_role.id, permission.id
FROM public.app_roles AS church_role
CROSS JOIN public.app_permissions AS permission
WHERE church_role.code IN ('pastor', 'pastoral_care_officer')
  AND permission.code IN ('pastoral.view', 'pastoral.create', 'pastoral.update')
ON CONFLICT (app_role_id, app_permission_id) DO NOTHING;

DROP POLICY IF EXISTS "pastoral_select_records" ON public.pastoral_records;
DROP POLICY IF EXISTS "pastoral_insert_records" ON public.pastoral_records;
DROP POLICY IF EXISTS "pastoral_update_records" ON public.pastoral_records;
DROP POLICY IF EXISTS "pastoral_delete_records" ON public.pastoral_records;
DROP POLICY IF EXISTS phase8_pastoral_records_select ON public.pastoral_records;
DROP POLICY IF EXISTS phase8_pastoral_records_insert ON public.pastoral_records;
DROP POLICY IF EXISTS phase8_pastoral_records_update ON public.pastoral_records;
DROP POLICY IF EXISTS phase8_pastoral_records_delete ON public.pastoral_records;

CREATE POLICY phase8_pastoral_records_select
  ON public.pastoral_records FOR SELECT TO authenticated
  USING (public.has_church_permission('pastoral.view', organization_id, branch_id));
CREATE POLICY phase8_pastoral_records_insert
  ON public.pastoral_records FOR INSERT TO authenticated
  WITH CHECK (public.has_church_permission('pastoral.create', organization_id, branch_id));
CREATE POLICY phase8_pastoral_records_update
  ON public.pastoral_records FOR UPDATE TO authenticated
  USING (public.has_church_permission('pastoral.update', organization_id, branch_id))
  WITH CHECK (public.has_church_permission('pastoral.update', organization_id, branch_id));
CREATE POLICY phase8_pastoral_records_delete
  ON public.pastoral_records FOR DELETE TO authenticated
  USING (public.has_church_permission('pastoral.update', organization_id, branch_id));

DROP POLICY IF EXISTS "authenticated_select_follow_ups" ON public.follow_ups;
DROP POLICY IF EXISTS "authenticated_insert_follow_ups" ON public.follow_ups;
DROP POLICY IF EXISTS "authenticated_update_follow_ups" ON public.follow_ups;
DROP POLICY IF EXISTS "authenticated_delete_follow_ups" ON public.follow_ups;
DROP POLICY IF EXISTS phase8_follow_ups_select ON public.follow_ups;
DROP POLICY IF EXISTS phase8_follow_ups_insert ON public.follow_ups;
DROP POLICY IF EXISTS phase8_follow_ups_update ON public.follow_ups;
DROP POLICY IF EXISTS phase8_follow_ups_delete ON public.follow_ups;

CREATE POLICY phase8_follow_ups_select
  ON public.follow_ups FOR SELECT TO authenticated
  USING (public.has_church_permission('pastoral.view', organization_id, branch_id));
CREATE POLICY phase8_follow_ups_insert
  ON public.follow_ups FOR INSERT TO authenticated
  WITH CHECK (public.has_church_permission('pastoral.create', organization_id, branch_id));
CREATE POLICY phase8_follow_ups_update
  ON public.follow_ups FOR UPDATE TO authenticated
  USING (public.has_church_permission('pastoral.update', organization_id, branch_id))
  WITH CHECK (public.has_church_permission('pastoral.update', organization_id, branch_id));
CREATE POLICY phase8_follow_ups_delete
  ON public.follow_ups FOR DELETE TO authenticated
  USING (public.has_church_permission('pastoral.update', organization_id, branch_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON pastoral_records TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON follow_ups TO authenticated;
