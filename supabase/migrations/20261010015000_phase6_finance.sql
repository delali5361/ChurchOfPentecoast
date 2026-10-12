-- Phase 6: restricted giving, pledges, and expense approvals.

ALTER TABLE public.giving_transactions
  ADD COLUMN IF NOT EXISTS donor_name text,
  ADD COLUMN IF NOT EXISTS member_id uuid REFERENCES public.members(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE TABLE IF NOT EXISTS public.financial_pledges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  branch_id uuid REFERENCES public.branches(id) ON DELETE SET NULL,
  member_id uuid REFERENCES public.members(id) ON DELETE SET NULL,
  donor_name text NOT NULL,
  purpose text NOT NULL,
  pledged_amount numeric(12,2) NOT NULL CHECK (pledged_amount > 0),
  start_date date NOT NULL DEFAULT current_date,
  due_date date,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'cancelled')),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (due_date IS NULL OR due_date >= start_date)
);

ALTER TABLE public.giving_transactions
  ADD COLUMN IF NOT EXISTS pledge_id uuid REFERENCES public.financial_pledges(id) ON DELETE SET NULL;

DO $$
DECLARE
  organization_count integer;
  only_organization_id uuid;
BEGIN
  UPDATE public.giving_transactions AS giving
  SET organization_id = branch.organization_id
  FROM public.branches AS branch
  WHERE giving.branch_id = branch.id
    AND giving.organization_id IS NULL;

  SELECT count(*) INTO organization_count FROM public.organizations;
  IF organization_count = 1 THEN
    SELECT id INTO only_organization_id FROM public.organizations;
    UPDATE public.giving_transactions
    SET organization_id = only_organization_id
    WHERE organization_id IS NULL;
  END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS public.financial_expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  branch_id uuid REFERENCES public.branches(id) ON DELETE SET NULL,
  amount numeric(12,2) NOT NULL CHECK (amount > 0),
  category text NOT NULL,
  vendor text,
  description text NOT NULL,
  incurred_at date NOT NULL DEFAULT current_date,
  status text NOT NULL DEFAULT 'submitted'
    CHECK (status IN ('submitted', 'approved', 'rejected', 'paid')),
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at timestamptz,
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  paid_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  paid_at timestamptz,
  review_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS giving_transactions_org_date_idx
  ON public.giving_transactions (organization_id, given_at DESC);
CREATE INDEX IF NOT EXISTS financial_pledges_org_status_idx
  ON public.financial_pledges (organization_id, status, due_date);
CREATE INDEX IF NOT EXISTS financial_pledges_member_idx
  ON public.financial_pledges (member_id) WHERE member_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS financial_expenses_org_status_date_idx
  ON public.financial_expenses (organization_id, status, incurred_at DESC);

CREATE OR REPLACE FUNCTION public.validate_financial_giving()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  member_organization uuid;
  member_branch uuid;
  pledge_organization uuid;
  pledge_branch uuid;
  pledge_member uuid;
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.created_by := auth.uid();
  END IF;

  IF NEW.member_id IS NOT NULL THEN
    SELECT organization_id, branch_id
    INTO member_organization, member_branch
    FROM public.members
    WHERE id = NEW.member_id;
    IF member_organization IS DISTINCT FROM NEW.organization_id THEN
      RAISE EXCEPTION 'Donor must belong to the giving organization';
    END IF;
    IF NEW.branch_id IS NULL THEN
      NEW.branch_id := member_branch;
    ELSIF member_branch IS NOT NULL AND NEW.branch_id IS DISTINCT FROM member_branch THEN
      RAISE EXCEPTION 'Donor branch does not match the giving branch';
    END IF;
  END IF;

  IF NEW.pledge_id IS NOT NULL THEN
    SELECT organization_id, branch_id, member_id
    INTO pledge_organization, pledge_branch, pledge_member
    FROM public.financial_pledges
    WHERE id = NEW.pledge_id;
    IF pledge_organization IS DISTINCT FROM NEW.organization_id
       OR (pledge_branch IS NOT NULL AND NEW.branch_id IS NOT NULL AND NEW.branch_id IS DISTINCT FROM pledge_branch) THEN
      RAISE EXCEPTION 'Giving record must match its pledge organization and branch';
    END IF;
    IF NEW.branch_id IS NULL THEN
      NEW.branch_id := pledge_branch;
    END IF;
    IF pledge_member IS NOT NULL AND NEW.member_id IS DISTINCT FROM pledge_member THEN
      RAISE EXCEPTION 'Giving donor must match the pledge donor';
    END IF;
  END IF;

  IF NEW.status NOT IN ('verified', 'pending', 'void') THEN
    RAISE EXCEPTION 'Giving status is invalid';
  END IF;
  NEW.donor_name := NULLIF(trim(NEW.donor_name), '');
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS giving_transactions_validate_finance ON public.giving_transactions;
CREATE TRIGGER giving_transactions_validate_finance
  BEFORE INSERT OR UPDATE ON public.giving_transactions
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_financial_giving();

CREATE OR REPLACE FUNCTION public.validate_financial_pledge()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  member_organization uuid;
  member_branch uuid;
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.created_by := auth.uid();
  END IF;
  IF NEW.member_id IS NOT NULL THEN
    SELECT organization_id, branch_id
    INTO member_organization, member_branch
    FROM public.members
    WHERE id = NEW.member_id;
    IF member_organization IS DISTINCT FROM NEW.organization_id THEN
      RAISE EXCEPTION 'Pledge donor must belong to the pledge organization';
    END IF;
    IF NEW.branch_id IS NULL THEN
      NEW.branch_id := member_branch;
    ELSIF member_branch IS NOT NULL AND NEW.branch_id IS DISTINCT FROM member_branch THEN
      RAISE EXCEPTION 'Pledge donor branch does not match the pledge branch';
    END IF;
    IF trim(NEW.donor_name) = '' THEN
      SELECT concat_ws(' ', first_name, last_name)
      INTO NEW.donor_name
      FROM public.members
      WHERE id = NEW.member_id;
    END IF;
  END IF;
  IF NEW.due_date IS NOT NULL AND NEW.due_date < NEW.start_date THEN
    RAISE EXCEPTION 'Pledge due date cannot be before its start date';
  END IF;
  NEW.donor_name := NULLIF(trim(NEW.donor_name), '');
  IF NEW.donor_name IS NULL OR trim(NEW.purpose) = '' THEN
    RAISE EXCEPTION 'Pledge donor name and purpose are required';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS financial_pledges_validate ON public.financial_pledges;
CREATE TRIGGER financial_pledges_validate
  BEFORE INSERT OR UPDATE ON public.financial_pledges
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_financial_pledge();

CREATE OR REPLACE FUNCTION public.validate_financial_expense()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  branch_organization uuid;
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.created_by := auth.uid();
    NEW.status := 'submitted';
  ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NOT public.has_church_permission('finance.approve', OLD.organization_id, OLD.branch_id) THEN
      RAISE EXCEPTION 'Finance approval permission is required to change expense status';
    END IF;
    IF auth.uid() = OLD.created_by THEN
      RAISE EXCEPTION 'Expense submitters cannot approve or pay their own expenses';
    END IF;
    IF NOT (
      (OLD.status = 'submitted' AND NEW.status IN ('approved', 'rejected'))
      OR (OLD.status = 'approved' AND NEW.status = 'paid')
    ) THEN
      RAISE EXCEPTION 'Expense status transition is not allowed';
    END IF;
  END IF;

  IF NEW.branch_id IS NOT NULL THEN
    SELECT organization_id INTO branch_organization
    FROM public.branches
    WHERE id = NEW.branch_id;
    IF branch_organization IS DISTINCT FROM NEW.organization_id THEN
      RAISE EXCEPTION 'Expense branch must belong to its organization';
    END IF;
  END IF;
  IF trim(NEW.category) = '' OR trim(NEW.description) = '' THEN
    RAISE EXCEPTION 'Expense category and description are required';
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status IN ('approved', 'rejected') THEN
      NEW.reviewed_by := auth.uid();
      NEW.reviewed_at := now();
      IF NEW.status = 'approved' THEN
        NEW.approved_by := auth.uid();
        NEW.approved_at := now();
      END IF;
    ELSIF NEW.status = 'paid' THEN
      NEW.paid_by := auth.uid();
      NEW.paid_at := now();
    END IF;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS financial_expenses_validate ON public.financial_expenses;
CREATE TRIGGER financial_expenses_validate
  BEFORE INSERT OR UPDATE ON public.financial_expenses
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_financial_expense();

CREATE OR REPLACE FUNCTION public.review_financial_expense(
  target_expense_id uuid,
  requested_decision text,
  decision_note text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  expense public.financial_expenses%ROWTYPE;
BEGIN
  IF requested_decision IS NULL OR requested_decision NOT IN ('approved', 'rejected', 'paid') THEN
    RAISE EXCEPTION 'Expense decision is invalid';
  END IF;
  SELECT * INTO expense
  FROM public.financial_expenses
  WHERE id = target_expense_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Expense was not found';
  END IF;
  IF NOT public.has_church_permission('finance.approve', expense.organization_id, expense.branch_id) THEN
    RAISE EXCEPTION 'You do not have permission to review this expense';
  END IF;
  IF auth.uid() = expense.created_by THEN
    RAISE EXCEPTION 'Expense submitters cannot approve or pay their own expenses';
  END IF;
  IF NOT (
    (expense.status = 'submitted' AND requested_decision IN ('approved', 'rejected'))
    OR (expense.status = 'approved' AND requested_decision = 'paid')
  ) THEN
    RAISE EXCEPTION 'Expense status transition is not allowed';
  END IF;

  UPDATE public.financial_expenses
  SET status = requested_decision,
      review_note = NULLIF(trim(decision_note), '')
  WHERE id = target_expense_id;
END;
$$;

INSERT INTO public.app_permissions (code, name, description, resource, action)
VALUES
  ('finance.pledge.create', 'Record pledges', 'Create giving commitments', 'finance', 'pledge.create')
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.role_permissions (app_role_id, app_permission_id)
SELECT church_role.id, permission.id
FROM public.app_roles AS church_role
CROSS JOIN public.app_permissions AS permission
WHERE church_role.code = 'finance_officer'
  AND permission.code IN (
    'finance.view',
    'finance.giving.create',
    'finance.expense.create',
    'finance.pledge.create',
    'finance.approve'
  )
ON CONFLICT (app_role_id, app_permission_id) DO NOTHING;

ALTER TABLE public.giving_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financial_pledges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financial_expenses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "shared_select_giving" ON public.giving_transactions;
DROP POLICY IF EXISTS "shared_insert_giving" ON public.giving_transactions;
DROP POLICY IF EXISTS "shared_update_giving" ON public.giving_transactions;
DROP POLICY IF EXISTS "shared_delete_giving" ON public.giving_transactions;
DROP POLICY IF EXISTS "authenticated_select_giving" ON public.giving_transactions;
DROP POLICY IF EXISTS "authenticated_insert_giving" ON public.giving_transactions;
DROP POLICY IF EXISTS "authenticated_update_giving" ON public.giving_transactions;
DROP POLICY IF EXISTS "authenticated_delete_giving" ON public.giving_transactions;

CREATE POLICY "phase6_giving_select"
  ON public.giving_transactions FOR SELECT TO authenticated
  USING (public.has_church_permission('finance.view', organization_id, branch_id));
CREATE POLICY "phase6_giving_insert"
  ON public.giving_transactions FOR INSERT TO authenticated
  WITH CHECK (public.has_church_permission('finance.giving.create', organization_id, branch_id));

CREATE POLICY "phase6_pledges_select"
  ON public.financial_pledges FOR SELECT TO authenticated
  USING (public.has_church_permission('finance.view', organization_id, branch_id));
CREATE POLICY "phase6_pledges_insert"
  ON public.financial_pledges FOR INSERT TO authenticated
  WITH CHECK (public.has_church_permission('finance.pledge.create', organization_id, branch_id));

CREATE POLICY "phase6_expenses_select"
  ON public.financial_expenses FOR SELECT TO authenticated
  USING (public.has_church_permission('finance.view', organization_id, branch_id));
CREATE POLICY "phase6_expenses_insert"
  ON public.financial_expenses FOR INSERT TO authenticated
  WITH CHECK (public.has_church_permission('finance.expense.create', organization_id, branch_id));

GRANT SELECT, INSERT ON public.giving_transactions TO authenticated;
REVOKE UPDATE, DELETE ON public.giving_transactions FROM authenticated;
REVOKE ALL ON public.giving_transactions FROM anon;
GRANT SELECT, INSERT ON public.financial_pledges TO authenticated;
REVOKE UPDATE, DELETE ON public.financial_pledges FROM authenticated;
REVOKE ALL ON public.financial_pledges FROM anon;
GRANT SELECT, INSERT ON public.financial_expenses TO authenticated;
REVOKE UPDATE, DELETE ON public.financial_expenses FROM authenticated;
REVOKE ALL ON public.financial_expenses FROM anon;

REVOKE ALL ON FUNCTION public.review_financial_expense(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.review_financial_expense(uuid, text, text) TO authenticated;

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
    OR public.has_church_permission('finance.view', organization_id, branch_id)
  );
