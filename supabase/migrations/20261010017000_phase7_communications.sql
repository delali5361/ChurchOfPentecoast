/*
# Phase 7: Communications

This migration expands the communication_templates and communication_campaigns tables
with enhanced schema to support multi-channel messaging, audience targeting, and
delivery tracking in the church management system.

1. Enhanced Tables
- `communication_templates` stores reusable message content by channel with metadata.
- `communication_campaigns` stores targeted communication sends with audience scope,
  scheduling, and delivery tracking.

2. Indexes
- Indexes on organization_id, status, and created_at for quick lookups and filtering.

3. Policies
- All authenticated users can select and insert templates/campaigns for their organization.
- All updates and deletes are allowed for authenticated users (org-scoped in application).

4. Notes
- This phase depends on phase 1 (organizations), phase 2 (members), and phase 4 (structure).
- Templates and campaigns are organization-scoped, not person-specific.
- Delivery tracking (sent_count, scheduled_for) enables scheduling and reporting.
*/

-- Expand communication_templates with enhanced metadata
ALTER TABLE communication_templates ADD COLUMN IF NOT EXISTS
  is_default boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS templates_org_status_idx
  ON communication_templates (organization_id, status);

CREATE INDEX IF NOT EXISTS templates_created_idx
  ON communication_templates (created_at DESC);

-- Expand communication_campaigns with delivery tracking and audience details
ALTER TABLE communication_campaigns ADD COLUMN IF NOT EXISTS
  template_id uuid REFERENCES communication_templates(id) ON DELETE SET NULL;

ALTER TABLE communication_campaigns ADD COLUMN IF NOT EXISTS
  target_branch_id uuid REFERENCES branches(id) ON DELETE SET NULL;

ALTER TABLE communication_campaigns ADD COLUMN IF NOT EXISTS
  target_group_id uuid REFERENCES groups(id) ON DELETE SET NULL;

ALTER TABLE communication_campaigns ADD COLUMN IF NOT EXISTS
  member_count integer NOT NULL DEFAULT 0 CHECK (member_count >= 0);

ALTER TABLE communication_campaigns ADD COLUMN IF NOT EXISTS
  opened_count integer NOT NULL DEFAULT 0 CHECK (opened_count >= 0);

ALTER TABLE communication_campaigns ADD COLUMN IF NOT EXISTS
  clicked_count integer NOT NULL DEFAULT 0 CHECK (clicked_count >= 0);

ALTER TABLE communication_campaigns ADD COLUMN IF NOT EXISTS
  failed_count integer NOT NULL DEFAULT 0 CHECK (failed_count >= 0);

ALTER TABLE communication_campaigns ADD COLUMN IF NOT EXISTS
  sent_at timestamptz;

CREATE INDEX IF NOT EXISTS campaigns_org_status_idx
  ON communication_campaigns (organization_id, status);

CREATE INDEX IF NOT EXISTS campaigns_scheduled_idx
  ON communication_campaigns (scheduled_for) WHERE scheduled_for IS NOT NULL;

CREATE INDEX IF NOT EXISTS campaigns_created_idx
  ON communication_campaigns (created_at DESC);

-- Policies for communication_templates
DROP POLICY IF EXISTS "authenticated_select_communication_templates" ON communication_templates;
DROP POLICY IF EXISTS "authenticated_insert_communication_templates" ON communication_templates;
DROP POLICY IF EXISTS "authenticated_update_communication_templates" ON communication_templates;
DROP POLICY IF EXISTS "authenticated_delete_communication_templates" ON communication_templates;

CREATE POLICY "phase7_templates_select"
  ON communication_templates FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "phase7_templates_insert"
  ON communication_templates FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "phase7_templates_update"
  ON communication_templates FOR UPDATE TO authenticated
  USING (true) WITH CHECK (true);

CREATE POLICY "phase7_templates_delete"
  ON communication_templates FOR DELETE TO authenticated
  USING (true);

-- Policies for communication_campaigns
DROP POLICY IF EXISTS "authenticated_select_communication_campaigns" ON communication_campaigns;
DROP POLICY IF EXISTS "authenticated_insert_communication_campaigns" ON communication_campaigns;
DROP POLICY IF EXISTS "authenticated_update_communication_campaigns" ON communication_campaigns;
DROP POLICY IF EXISTS "authenticated_delete_communication_campaigns" ON communication_campaigns;

CREATE POLICY "phase7_campaigns_select"
  ON communication_campaigns FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "phase7_campaigns_insert"
  ON communication_campaigns FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "phase7_campaigns_update"
  ON communication_campaigns FOR UPDATE TO authenticated
  USING (true) WITH CHECK (true);

CREATE POLICY "phase7_campaigns_delete"
  ON communication_campaigns FOR DELETE TO authenticated
  USING (true);

-- Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON communication_templates TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON communication_campaigns TO authenticated;
