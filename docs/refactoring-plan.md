# Refactoring Plan

## Completed baseline

- Documented the architecture and durable development rules.
- Added explicit typecheck, formatting-check, and aggregate validation commands.
- Established LF normalization and formatted the repository.
- Fixed the existing strict TypeScript errors.
- Added Vitest characterization tests and strict bounded validation for tree snapshot writes.
- Serialized optimistic snapshot persistence and surfaced version conflicts.
- Added validated core server configuration, redacted error logging, and PostgreSQL shutdown handling.
- Established the feature-first module boundaries and automated size/complexity guardrails.
- Extracted feature-owned family domain types, pure relationship/query operations, and characterization tests.
- Introduced a shared typed browser transport and a tree snapshot API client while retaining the family-store compatibility surface.
- Promoted file-size, function-size, complexity, and dependency boundaries to
  CI-blocking errors with a finite documented legacy-exception ledger.
- Extracted authentication crypto, cookies, OAuth configuration, session
  lifecycle, and verification delivery from the central API dispatcher behind
  the auth feature's server entrypoint.
- Extracted snapshot reads, authenticated tree request handling, collaboration
  activity projection, and registration onboarding into focused server modules.
- Separated tree-store React hooks and fixtures, isolated graph layout with
  characterization tests, and eliminated Fast Refresh boundary warnings.
- Restored the dead-code gate by internalizing unused implementation details and
  removing obsolete Knip configuration exceptions.
- Replaced the central server request god files with a thin dispatcher and
  capability handlers for authentication, account, trees, members,
  collaboration, and operational endpoints.
- Split collaboration into invitation, ownership, activity, contributor,
  authenticity, moderation, branch, and tree-access capabilities.
- Split snapshot persistence into access preparation, read projection, member
  and relationship writers, branch scope, image validation, and serialized
  version completion while preserving contextual transactions.
- Decomposed the family-store implementation into compatibility facade, React
  subscriptions, member commands, relationship mutations, subfamily commands,
  fixtures, and persistence behavior.
- Decomposed tree rendering into pure layout/route projection, canvas input,
  graph synchronization, member commands, flow interactions, focused controls,
  dialogs, sidebar widgets, and a thin React Flow composition shell.
- Split the authentication, collaboration dashboard, profile, member,
  subfamily, header, member-node, and skeleton UI hotspots into focused pages,
  hooks, domain functions, and presentational components.
- Removed the complete temporary architecture exception ledger. All production
  source now passes the CI-blocking 400-line, 120-line function, complexity, and
  dependency-boundary rules.

## Next milestones

1. Add PostgreSQL role-matrix integration coverage using the restricted
   application database role.
2. Install browser E2E coverage for English/Arabic critical workflows,
   accessibility behavior, RTL layout, and visual regression baselines.
3. Add migration-identity readiness checks, maintenance retention, and measured
   bundle-performance budgets.

## Known risks and deferred work

- Browser E2E coverage is not installed yet.
- Dashboard member and generation counts remain compatibility placeholders.
- TOTP schema exists but no incomplete UI or no-op service is exposed.
- Dependency vulnerability audit requires registry connectivity.
