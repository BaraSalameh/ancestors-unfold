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

## Next milestones

1. Add PostgreSQL-role integration coverage and install Playwright for critical browser-flow coverage.
2. Continue extracting auth/profile, tree/snapshot, and sharing/contact route modules from `src/server/api.ts` behind unchanged contracts.
3. Move all authenticated RLS access behind capability repositories and verify it using the restricted application database role.
4. Introduce a typed frontend API client and replace silent dashboard/profile failures.
5. Extract pure family-domain transformations and split the oversized visualization/form components.
6. Add migration-identity readiness checks, maintenance retention, accessibility coverage, and measured bundle improvements.

## Known risks and deferred work

- Browser E2E coverage is not installed yet.
- Several pool-level authenticated queries still require contextual repository migration.
- Dashboard member and generation counts remain compatibility placeholders.
- TOTP schema exists but no incomplete UI or no-op service is exposed.
- Dependency vulnerability audit requires registry connectivity.
