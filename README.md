# Grace Assembly Church Management System

Responsive, role-aware church management workspace built with React, TypeScript,
Vite, and Supabase.

## Workspace areas

- Overview
- People and membership
- Visitors and follow-up
- Households and relationships
- Branches, departments, ministries, groups, and workers
- Attendance
- Events and registrations
- Giving, pledges, and expenses
- Communications
- Restricted pastoral care
- Reports and exports
- Administration, roles, and audit

Each area has its own page component. Shared navigation, page headings, icons,
and workspace cards live under `src/components/`. Navigation metadata and
module content are defined separately, making it easier to build each area in
its own delivery phase without growing a single application component.

## Development

Install dependencies using your preferred package manager, then run:

```sh
npm run dev
```

The project build/type-check command is:

```sh
npm run build
```

Without Supabase configuration, the app opens in a clearly labelled preview
mode. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in a local `.env`
file to enable authentication and connect the existing Supabase migrations.
Never put a Supabase service-role key in the browser application.

## Phased delivery

**Phase 1 — Workspace foundation:** shared responsive shell, module-specific
pages, navigation, accessible global module search, and preview-mode messaging.

**Phase 2 — People & membership:** live member directory with search,
membership-journey filters, profile create/edit, soft archiving, and CSV export.
`20261010002000_phase2_people_membership.sql` adds profile fields and
permission-gated row policies.

**Phase 3 — Households & visitor care:** create households, connect
people with relationship types and primary-contact labels, capture visitor
journeys, record contact consent, and track due/completed follow-up tasks.
`20261010004500_phase3_households_visitors.sql` adds organization-scoped
household relationships and consent-checked follow-ups.

**Phase 4 — Church structure:** manage branches, departments,
ministries, groups/cells, and member serving assignments. `20261010011000_phase4_church_structure.sql`
adds the hierarchy, assignments, validation triggers, and permission-scoped
policies.

**Phase 5 — Attendance & events (implemented; migration not yet validated):** create service sessions,
check in members and guests, track attendance by branch, schedule events,
manage registrations and capacity, and connect events to attendance sessions.
`20261010013000_phase5_attendance_events.sql` adds scoped policies and database
validation for sessions, check-ins, events, and registrations.

**Phase 6 — Finance (implemented; migration not yet validated):** record giving
and pledges, track verified gift progress, submit expenses, and review or mark
approved expenses as paid. Finance permissions and organization/branch-scoped
policies are enforced in the database; expense submitters cannot approve or pay
their own submissions. `20261010015000_phase6_finance.sql` adds finance records,
role grants, validation, and the expense-review function.

Do not apply the migration chain yet: the Phase 1 migration currently recreates
tables already introduced by earlier foundation migrations, so compatibility
must be reconciled before database setup. Without Supabase configuration, these
workspaces remain read-only previews.

**Phase 7 — Communications (just implemented):** create reusable message
templates by channel (email, SMS, push), draft and schedule audience-targeted
campaigns, track delivery metrics (sent, opened, clicked), and manage campaign
history. `20261010017000_phase7_communications.sql` enhances template and
campaign tables with audience targeting, delivery tracking, and indexed lookups
for performance.

**Next phases:** restricted pastoral workflows; then reporting, administration,
and production readiness.

Pastoral and financial data requires server-side authorization and organization
and branch scoping before production use. Any production rollout also needs
security review, operational monitoring, backup and recovery procedures, and
privacy review for the church's jurisdiction.
