/*
# Create church dashboard foundation

1. New Tables
- `organizations` stores the church identity and primary branding details.
- `branches` stores campuses and their status.
- `members` stores people records used by the people dashboard.
- `events` stores upcoming services and church activities.
- `giving_transactions` stores giving totals used by finance summaries.

2. Security
- Row Level Security is enabled on every table.
- This first release is intentionally single-tenant and has no sign-in screen, so anon and authenticated roles can use the shared church workspace.
- Separate read, insert, update, and delete policies are provided for each table.

3. Important Notes
- Records are soft-archivable through status fields rather than physical deletion in the interface.
- Monetary values use numeric columns and are displayed in Ghana cedis by the application.
- The schema is intentionally small enough to support the first dashboard release while leaving room for the full SRS modules.
*/

CREATE TABLE IF NOT EXISTS organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  tagline text,
  location text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS branches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  code text NOT NULL,
  location text,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE,
  branch_id uuid REFERENCES branches(id) ON DELETE SET NULL,
  first_name text NOT NULL,
  last_name text NOT NULL,
  email text,
  phone text,
  membership_status text NOT NULL DEFAULT 'member',
  avatar_url text,
  joined_at date NOT NULL DEFAULT current_date,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE,
  branch_id uuid REFERENCES branches(id) ON DELETE SET NULL,
  title text NOT NULL,
  event_type text NOT NULL DEFAULT 'service',
  starts_at timestamptz NOT NULL,
  location text,
  attendee_count integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'scheduled',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS giving_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE,
  branch_id uuid REFERENCES branches(id) ON DELETE SET NULL,
  amount numeric(12,2) NOT NULL CHECK (amount >= 0),
  category text NOT NULL DEFAULT 'offering',
  payment_method text NOT NULL DEFAULT 'cash',
  given_at date NOT NULL DEFAULT current_date,
  status text NOT NULL DEFAULT 'verified',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE members ENABLE ROW LEVEL SECURITY;
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE giving_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "shared_select_organizations" ON organizations;
CREATE POLICY "shared_select_organizations" ON organizations FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "shared_insert_organizations" ON organizations;
CREATE POLICY "shared_insert_organizations" ON organizations FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "shared_update_organizations" ON organizations;
CREATE POLICY "shared_update_organizations" ON organizations FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "shared_delete_organizations" ON organizations;
CREATE POLICY "shared_delete_organizations" ON organizations FOR DELETE TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "shared_select_branches" ON branches;
CREATE POLICY "shared_select_branches" ON branches FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "shared_insert_branches" ON branches;
CREATE POLICY "shared_insert_branches" ON branches FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "shared_update_branches" ON branches;
CREATE POLICY "shared_update_branches" ON branches FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "shared_delete_branches" ON branches;
CREATE POLICY "shared_delete_branches" ON branches FOR DELETE TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "shared_select_members" ON members;
CREATE POLICY "shared_select_members" ON members FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "shared_insert_members" ON members;
CREATE POLICY "shared_insert_members" ON members FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "shared_update_members" ON members;
CREATE POLICY "shared_update_members" ON members FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "shared_delete_members" ON members;
CREATE POLICY "shared_delete_members" ON members FOR DELETE TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "shared_select_events" ON events;
CREATE POLICY "shared_select_events" ON events FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "shared_insert_events" ON events;
CREATE POLICY "shared_insert_events" ON events FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "shared_update_events" ON events;
CREATE POLICY "shared_update_events" ON events FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "shared_delete_events" ON events;
CREATE POLICY "shared_delete_events" ON events FOR DELETE TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "shared_select_giving" ON giving_transactions;
CREATE POLICY "shared_select_giving" ON giving_transactions FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "shared_insert_giving" ON giving_transactions;
CREATE POLICY "shared_insert_giving" ON giving_transactions FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "shared_update_giving" ON giving_transactions;
CREATE POLICY "shared_update_giving" ON giving_transactions FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "shared_delete_giving" ON giving_transactions;
CREATE POLICY "shared_delete_giving" ON giving_transactions FOR DELETE TO anon, authenticated USING (true);

CREATE INDEX IF NOT EXISTS members_organization_id_idx ON members(organization_id);
CREATE INDEX IF NOT EXISTS members_status_idx ON members(membership_status);
CREATE INDEX IF NOT EXISTS events_starts_at_idx ON events(starts_at);
CREATE INDEX IF NOT EXISTS giving_given_at_idx ON giving_transactions(given_at);