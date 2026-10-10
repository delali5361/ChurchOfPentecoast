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
The module workspaces clearly identify implementation work that remains.

**Next phases:** connect organization and people data; build households and
church structure; implement attendance and events; add role-restricted finance,
communications, and pastoral workflows; then deliver reporting, exports,
administration, and production readiness.

Pastoral and financial data requires server-side authorization and organization
and branch scoping before production use. Any production rollout also needs
security review, operational monitoring, backup and recovery procedures, and
privacy review for the church's jurisdiction.
