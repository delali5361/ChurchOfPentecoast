-- Phase 5: service attendance, church events, and event registrations.

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS ends_at timestamptz,
  ADD COLUMN IF NOT EXISTS capacity integer,
  ADD COLUMN IF NOT EXISTS registration_required boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'events_capacity_nonnegative'
      AND conrelid = 'public.events'::regclass
  ) THEN
    ALTER TABLE public.events
      ADD CONSTRAINT events_capacity_nonnegative CHECK (capacity IS NULL OR capacity >= 0) NOT VALID;
  END IF;
END;
$$;

ALTER TABLE public.attendance_sessions
  ADD COLUMN IF NOT EXISTS event_id uuid REFERENCES public.events(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'open',
  ADD COLUMN IF NOT EXISTS ended_at timestamptz,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'attendance_sessions_status_check'
      AND conrelid = 'public.attendance_sessions'::regclass
  ) THEN
    ALTER TABLE public.attendance_sessions
      ADD CONSTRAINT attendance_sessions_status_check
      CHECK (status IN ('open', 'closed')) NOT VALID;
  END IF;
END;
$$;

ALTER TABLE public.attendance_records
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS branch_id uuid REFERENCES public.branches(id) ON DELETE SET NULL;

UPDATE public.attendance_records AS record
SET organization_id = session.organization_id,
    branch_id = session.branch_id
FROM public.attendance_sessions AS session
WHERE session.id = record.session_id
  AND record.organization_id IS NULL;

CREATE INDEX IF NOT EXISTS events_org_starts_idx
  ON public.events (organization_id, starts_at);

CREATE INDEX IF NOT EXISTS attendance_sessions_org_date_idx
  ON public.attendance_sessions (organization_id, session_date DESC);

CREATE INDEX IF NOT EXISTS attendance_records_org_branch_idx
  ON public.attendance_records (organization_id, branch_id, checked_in_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS attendance_records_session_member_idx
  ON public.attendance_records (session_id, member_id)
  WHERE member_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.event_registrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  branch_id uuid REFERENCES public.branches(id) ON DELETE SET NULL,
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  member_id uuid REFERENCES public.members(id) ON DELETE SET NULL,
  attendee_name text NOT NULL,
  email text,
  phone text,
  status text NOT NULL DEFAULT 'registered'
    CHECK (status IN ('registered', 'attended', 'cancelled')),
  registered_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS event_registrations_event_member_idx
  ON public.event_registrations (event_id, member_id)
  WHERE member_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS event_registrations_event_status_idx
  ON public.event_registrations (event_id, status);

CREATE OR REPLACE FUNCTION public.validate_phase5_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  branch_organization uuid;
BEGIN
  IF NEW.branch_id IS NOT NULL THEN
    SELECT organization_id INTO branch_organization
    FROM public.branches
    WHERE id = NEW.branch_id;
    IF branch_organization IS DISTINCT FROM NEW.organization_id THEN
      RAISE EXCEPTION 'Event branch must belong to its organization';
    END IF;
  END IF;
  IF NEW.ends_at IS NOT NULL AND NEW.ends_at <= NEW.starts_at THEN
    RAISE EXCEPTION 'Event end time must be after its start time';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS events_validate_phase5 ON public.events;
CREATE TRIGGER events_validate_phase5
  BEFORE INSERT OR UPDATE ON public.events
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_phase5_event();

CREATE OR REPLACE FUNCTION public.validate_attendance_session()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  event_organization uuid;
  event_branch uuid;
BEGIN
  IF NEW.branch_id IS NOT NULL THEN
    SELECT organization_id INTO event_organization
    FROM public.branches
    WHERE id = NEW.branch_id;
    IF event_organization IS DISTINCT FROM NEW.organization_id THEN
      RAISE EXCEPTION 'Attendance branch must belong to its organization';
    END IF;
  END IF;

  IF NEW.event_id IS NOT NULL THEN
    SELECT organization_id, branch_id
    INTO event_organization, event_branch
    FROM public.events
    WHERE id = NEW.event_id;
    IF event_organization IS DISTINCT FROM NEW.organization_id
       OR (event_branch IS NOT NULL AND NEW.branch_id IS DISTINCT FROM event_branch) THEN
      RAISE EXCEPTION 'Attendance session must match its event organization and branch';
    END IF;
  END IF;

  IF NEW.status = 'closed' AND NEW.ended_at IS NULL THEN
    NEW.ended_at := now();
  ELSIF NEW.status = 'open' THEN
    NEW.ended_at := NULL;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS attendance_sessions_validate_phase5 ON public.attendance_sessions;
CREATE TRIGGER attendance_sessions_validate_phase5
  BEFORE INSERT OR UPDATE ON public.attendance_sessions
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_attendance_session();

CREATE OR REPLACE FUNCTION public.validate_attendance_record()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  session_organization uuid;
  session_branch uuid;
  session_status text;
  member_organization uuid;
  member_status text;
BEGIN
  SELECT organization_id, branch_id, status
  INTO session_organization, session_branch, session_status
  FROM public.attendance_sessions
  WHERE id = NEW.session_id;

  IF session_organization IS NULL OR session_status <> 'open' THEN
    RAISE EXCEPTION 'Attendance can only be recorded for an open session';
  END IF;

  IF NEW.member_id IS NOT NULL THEN
    SELECT organization_id, membership_status
    INTO member_organization, member_status
    FROM public.members
    WHERE id = NEW.member_id;
    IF member_organization IS DISTINCT FROM session_organization OR member_status = 'inactive' THEN
      RAISE EXCEPTION 'Attendee must be an active person in the same organization';
    END IF;
    NEW.person_name := trim(NEW.person_name);
    IF NEW.person_name = '' THEN
      SELECT concat_ws(' ', first_name, last_name)
      INTO NEW.person_name FROM public.members WHERE id = NEW.member_id;
    END IF;
  ELSIF trim(NEW.person_name) = '' THEN
    RAISE EXCEPTION 'Guest attendee name is required';
  END IF;

  NEW.organization_id := session_organization;
  NEW.branch_id := session_branch;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS attendance_records_validate_phase5 ON public.attendance_records;
CREATE TRIGGER attendance_records_validate_phase5
  BEFORE INSERT OR UPDATE ON public.attendance_records
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_attendance_record();

CREATE OR REPLACE FUNCTION public.validate_event_registration()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  event_organization uuid;
  event_branch uuid;
  event_capacity integer;
  current_registrations integer;
  member_organization uuid;
  member_branch uuid;
  member_status text;
BEGIN
  SELECT organization_id, branch_id, capacity
  INTO event_organization, event_branch, event_capacity
  FROM public.events
  WHERE id = NEW.event_id
  FOR UPDATE;
  IF event_organization IS NULL OR event_organization IS DISTINCT FROM NEW.organization_id THEN
    RAISE EXCEPTION 'Registration must belong to its event organization';
  END IF;

  IF NEW.member_id IS NOT NULL THEN
    SELECT organization_id, branch_id, membership_status
    INTO member_organization, member_branch, member_status
    FROM public.members
    WHERE id = NEW.member_id;
    IF member_organization IS DISTINCT FROM event_organization OR member_status = 'inactive' THEN
      RAISE EXCEPTION 'Registrant must be an active person in the event organization';
    END IF;
    IF event_branch IS NOT NULL AND member_branch IS NOT NULL AND event_branch <> member_branch THEN
      RAISE EXCEPTION 'Registrant branch does not match the event branch';
    END IF;
    IF trim(NEW.attendee_name) = '' THEN
      SELECT concat_ws(' ', first_name, last_name)
      INTO NEW.attendee_name FROM public.members WHERE id = NEW.member_id;
    END IF;
  ELSIF trim(NEW.attendee_name) = '' THEN
    RAISE EXCEPTION 'Guest attendee name is required';
  END IF;

  IF event_capacity IS NOT NULL AND NEW.status <> 'cancelled' THEN
    SELECT count(*)::integer INTO current_registrations
    FROM public.event_registrations AS registration
    WHERE registration.event_id = NEW.event_id
      AND registration.status <> 'cancelled'
      AND registration.id IS DISTINCT FROM NEW.id;
    IF current_registrations >= event_capacity THEN
      RAISE EXCEPTION 'Event has reached its registration capacity';
    END IF;
  END IF;

  NEW.branch_id := COALESCE(event_branch, member_branch);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS event_registrations_validate_phase5 ON public.event_registrations;
CREATE TRIGGER event_registrations_validate_phase5
  BEFORE INSERT OR UPDATE ON public.event_registrations
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_event_registration();

CREATE OR REPLACE FUNCTION public.refresh_event_attendee_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  target_event_id uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    target_event_id := OLD.event_id;
  ELSE
    target_event_id := NEW.event_id;
  END IF;

  UPDATE public.events AS event
  SET attendee_count = (
    SELECT count(*)::integer
    FROM public.event_registrations AS registration
    WHERE registration.event_id = target_event_id
      AND registration.status <> 'cancelled'
  )
  WHERE event.id = target_event_id;

  IF TG_OP = 'UPDATE' AND OLD.event_id IS DISTINCT FROM NEW.event_id THEN
    UPDATE public.events AS event
    SET attendee_count = (
      SELECT count(*)::integer
      FROM public.event_registrations AS registration
      WHERE registration.event_id = OLD.event_id
        AND registration.status <> 'cancelled'
    )
    WHERE event.id = OLD.event_id;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS event_registrations_refresh_count ON public.event_registrations;
CREATE TRIGGER event_registrations_refresh_count
  AFTER INSERT OR UPDATE OR DELETE ON public.event_registrations
  FOR EACH ROW
  EXECUTE FUNCTION public.refresh_event_attendee_count();

INSERT INTO public.app_permissions (code, name, description, resource, action)
VALUES
  ('attendance.view', 'View attendance', 'View attendance sessions and records', 'attendance', 'view'),
  ('attendance.create', 'Record attendance', 'Create sessions and check in attendees', 'attendance', 'create'),
  ('attendance.update', 'Update attendance', 'Update sessions and attendance records', 'attendance', 'update'),
  ('events.view', 'View events', 'View church events and registrations', 'events', 'view'),
  ('events.create', 'Create events', 'Create church events and registrations', 'events', 'create'),
  ('events.update', 'Update events', 'Update church events and registrations', 'events', 'update')
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.role_permissions (app_role_id, app_permission_id)
SELECT church_role.id, permission.id
FROM public.app_roles AS church_role
CROSS JOIN public.app_permissions AS permission
WHERE church_role.code IN ('pastor', 'branch_administrator')
  AND permission.code IN ('attendance.view', 'attendance.create', 'attendance.update', 'events.view', 'events.create', 'events.update')
ON CONFLICT (app_role_id, app_permission_id) DO NOTHING;

ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_registrations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "shared_select_events" ON public.events;
DROP POLICY IF EXISTS "shared_insert_events" ON public.events;
DROP POLICY IF EXISTS "shared_update_events" ON public.events;
DROP POLICY IF EXISTS "shared_delete_events" ON public.events;
DROP POLICY IF EXISTS "authenticated_select_events" ON public.events;
DROP POLICY IF EXISTS "authenticated_insert_events" ON public.events;
DROP POLICY IF EXISTS "authenticated_update_events" ON public.events;
DROP POLICY IF EXISTS "authenticated_delete_events" ON public.events;

CREATE POLICY "phase5_events_select"
  ON public.events FOR SELECT TO authenticated
  USING (public.has_church_permission('events.view', organization_id, branch_id));

CREATE POLICY "phase5_events_insert"
  ON public.events FOR INSERT TO authenticated
  WITH CHECK (public.has_church_permission('events.create', organization_id, branch_id));

CREATE POLICY "phase5_events_update"
  ON public.events FOR UPDATE TO authenticated
  USING (public.has_church_permission('events.update', organization_id, branch_id))
  WITH CHECK (public.has_church_permission('events.update', organization_id, branch_id));

DROP POLICY IF EXISTS "authenticated_select_attendance_sessions" ON public.attendance_sessions;
DROP POLICY IF EXISTS "authenticated_insert_attendance_sessions" ON public.attendance_sessions;
DROP POLICY IF EXISTS "authenticated_update_attendance_sessions" ON public.attendance_sessions;
DROP POLICY IF EXISTS "authenticated_delete_attendance_sessions" ON public.attendance_sessions;

CREATE POLICY "phase5_attendance_sessions_select"
  ON public.attendance_sessions FOR SELECT TO authenticated
  USING (public.has_church_permission('attendance.view', organization_id, branch_id));

CREATE POLICY "phase5_attendance_sessions_insert"
  ON public.attendance_sessions FOR INSERT TO authenticated
  WITH CHECK (public.has_church_permission('attendance.create', organization_id, branch_id));

CREATE POLICY "phase5_attendance_sessions_update"
  ON public.attendance_sessions FOR UPDATE TO authenticated
  USING (public.has_church_permission('attendance.update', organization_id, branch_id))
  WITH CHECK (public.has_church_permission('attendance.update', organization_id, branch_id));

DROP POLICY IF EXISTS "authenticated_select_attendance_records" ON public.attendance_records;
DROP POLICY IF EXISTS "authenticated_insert_attendance_records" ON public.attendance_records;
DROP POLICY IF EXISTS "authenticated_update_attendance_records" ON public.attendance_records;
DROP POLICY IF EXISTS "authenticated_delete_attendance_records" ON public.attendance_records;

CREATE POLICY "phase5_attendance_records_select"
  ON public.attendance_records FOR SELECT TO authenticated
  USING (public.has_church_permission('attendance.view', organization_id, branch_id));

CREATE POLICY "phase5_attendance_records_insert"
  ON public.attendance_records FOR INSERT TO authenticated
  WITH CHECK (public.has_church_permission('attendance.create', organization_id, branch_id));

CREATE POLICY "phase5_attendance_records_update"
  ON public.attendance_records FOR UPDATE TO authenticated
  USING (public.has_church_permission('attendance.update', organization_id, branch_id))
  WITH CHECK (public.has_church_permission('attendance.update', organization_id, branch_id));

CREATE POLICY "phase5_attendance_records_delete"
  ON public.attendance_records FOR DELETE TO authenticated
  USING (public.has_church_permission('attendance.update', organization_id, branch_id));

CREATE POLICY "phase5_event_registrations_select"
  ON public.event_registrations FOR SELECT TO authenticated
  USING (public.has_church_permission('events.view', organization_id, branch_id));

CREATE POLICY "phase5_event_registrations_insert"
  ON public.event_registrations FOR INSERT TO authenticated
  WITH CHECK (public.has_church_permission('events.create', organization_id, branch_id));

CREATE POLICY "phase5_event_registrations_update"
  ON public.event_registrations FOR UPDATE TO authenticated
  USING (public.has_church_permission('events.update', organization_id, branch_id))
  WITH CHECK (public.has_church_permission('events.update', organization_id, branch_id));

GRANT SELECT, INSERT, UPDATE ON public.events TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.attendance_sessions TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.attendance_records TO authenticated;
GRANT DELETE ON public.attendance_records TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.event_registrations TO authenticated;

DROP POLICY IF EXISTS "phase2_members_select" ON public.members;
CREATE POLICY "phase2_members_select"
  ON public.members FOR SELECT TO authenticated
  USING (
    public.has_church_permission('members.view', organization_id, branch_id)
    OR (
      membership_status IN ('visitor', 'newcomer')
      AND public.has_church_permission('visitors.view', organization_id, branch_id)
    )
    OR public.has_church_permission('attendance.view', organization_id, branch_id)
    OR public.has_church_permission('events.view', organization_id, branch_id)
  );
