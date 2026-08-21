# Architecture

Ancestors Unfold is a TypeScript full-stack monolith. TanStack Start provides React routing and SSR, Nitro packages the Node runtime, and PostgreSQL stores identity and family-tree data.

## Runtime and request flow

`src/server.ts` is the server entry. Requests under `/api/` are handled by `src/server/api.ts`; other requests continue to TanStack SSR. API writes validate JSON with Zod, authenticate the HttpOnly session cookie, authorize access, and execute PostgreSQL work in a transaction. Authenticated tree snapshot operations set the database request context so PostgreSQL RLS and audit triggers have the actor, session, and correlation ID.

The browser receives the authenticated session through the root SSR query and
hydrates it into the shared query cache. Feature loaders use stable query options
to warm dashboard, activity, branch, and snapshot data before rendering. The trees
feature's `familyStore` remains the compatibility facade for tree editing. Editor
changes are optimistic. Snapshot writes are serialized and use an acknowledged
version; a `VERSION_CONFLICT` blocks automatic writes until the user reloads the
latest snapshot.

## Boundaries

- UI components may use feature APIs and stores but must not connect to PostgreSQL or access server secrets.
- Runtime input is validated at HTTP boundaries. TypeScript types alone are not a trust boundary.
- Authenticated data access must use a context-bearing transaction when an RLS-protected table is involved.
- Database constraints, RLS, and application authorization are complementary controls.
- Public API routes, response fields, cookie names, and environment names are compatibility contracts.

## Source organization

New work follows a feature-first modular-monolith layout:

- `src/features/*` owns browser-facing domain logic, API adapters, components, and pages for one feature.
- Every feature exposes intentional public entrypoints. Lightweight `client`,
  `components`, `contracts`, `domain`, and `server` entrypoints are permitted when
  importing the root entrypoint would create a browser/server cycle; arbitrary deep
  cross-feature paths remain forbidden.
- `src/shared/*` contains feature-neutral browser transport, UI primitives, i18n, and utilities.
- `src/app/*` composes providers and application-wide browser behavior.
- `src/server/http` owns shared HTTP routing and response concerns. Feature
  server directories own capability handlers, application services, and
  repositories; `src/server` retains only the thin dispatcher and shared
  infrastructure/security composition.
- `src/routes/*` remains the TanStack file-routing boundary. Route declarations stay directly in these files so route generation can discover them; route bodies should delegate to feature pages.

Dependencies point from routes to features to shared modules. Server handlers call services, services call capability repositories, and repositories alone issue feature-specific SQL. Browser code must not import `src/server`. Cross-feature imports use an explicit public entrypoint rather than another feature's internals. The executable architecture graph rejects circular runtime imports and generic dumping-ground filenames.

Handwritten files under `app`, `features`, `server`, and `shared` are limited by
ESLint to 400 logical lines, 120 logical lines per function, and cyclomatic
complexity 15. Generated code, historical migrations, locale dictionaries, and
external-style UI primitives are structural exclusions.

These limits are CI-blocking errors and also apply to handwritten server code.
Temporary violations must be enumerated in `docs/architecture-exceptions.md`;
the ledger is currently empty. New path-based exceptions require deliberate
approval, a reason, an owner phase, and a removal condition. A size limit is a
review guardrail, not permission to split cohesive behavior into arbitrary
fragments.

Files should be named for the capability they own (`snapshot-reader`,
`invitation-service`, `viewport-persistence`) rather than generic buckets such
as `helpers` or `utils`. Tests are colocated with the behavior they characterize
and may be divided by behavior when a suite becomes oversized.

## Authentication and authorization

Password credentials use Argon2id. Google OAuth uses state, nonce, and PKCE. Sessions are random bearer tokens stored only as hashes in PostgreSQL and delivered through an HttpOnly SameSite cookie. Unsafe API methods require an exact same-origin `Origin` header, and TanStack server functions run behind the framework CSRF middleware. Tree memberships and branch grants are checked by the application and reinforced by PostgreSQL policies.

## Errors and logging

Expected API failures use stable error codes. Unexpected failures receive `INTERNAL_ERROR` and a request ID. Production error logs are structured, and the logger redacts keys that may contain credentials, cookies, codes, tokens, profiles, or contact data.

## Operations

`/api/health` reports process liveness and `/api/ready` checks database access and migrations. PostgreSQL connections are pooled and closed on SIGTERM/SIGINT. Production is expected to run the generated Nitro Node server behind a trusted TLS-terminating proxy with explicitly configured proxy trust and secure cookies.

## Testing strategy

The executable gates are TypeScript, ESLint/Prettier, Knip dead-code analysis,
Vitest unit and contract tests, the transactional PostgreSQL smoke test, and the
production client/SSR/server build. The database suite characterizes owner,
contributor, outsider, revoked/expired affiliation, and branch-scope access.
Production route bundle budgets and the large-tree benchmark are also CI gates.
Automated browser E2E, visual-diff infrastructure, and production lab-vitals
collection remain environment-dependent hardening work.

## Performance contracts

The production budget gate measures the emitted dashboard/route chunks using the
same gzip accounting as the established bundle baseline: standard route startup
must remain at or below 200 kB and the shared entry plus tree route/editor chunk at
or below 300 kB. CSV import remains an on-demand chunk. Geometry for trees of 500
members or more runs in a cancellable worker, React Flow culls off-viewport nodes,
and benchmark thresholds are 1, 2, and 5 seconds for 871, 2,000, and 10,000 members.

Server request-duration logs contain only method, path, response status, request
id, and elapsed time. Browser metrics are emitted as numeric-only
`ancestors:performance` events for LCP, CLS, INP interaction latency, hydration,
and tasks at least 50 ms; no session, contact, or family data is included.
