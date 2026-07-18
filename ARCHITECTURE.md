# Architecture

Ancestors Unfold is a TypeScript full-stack monolith. TanStack Start provides React routing and SSR, Nitro packages the Node runtime, and PostgreSQL stores identity and family-tree data.

## Runtime and request flow

`src/server.ts` is the server entry. Requests under `/api/` are handled by `src/server/api.ts`; other requests continue to TanStack SSR. API writes validate JSON with Zod, authenticate the HttpOnly session cookie, authorize access, and execute PostgreSQL work in a transaction. Authenticated tree snapshot operations set the database request context so PostgreSQL RLS and audit triggers have the actor, session, and correlation ID.

The browser uses `src/lib/auth.tsx` for session state and `src/lib/family-store.ts` for a tree editor. Editor changes are optimistic. Snapshot writes are serialized and use an acknowledged version; a `VERSION_CONFLICT` blocks automatic writes until the user reloads the latest snapshot.

## Boundaries

- UI components may use feature APIs and stores but must not connect to PostgreSQL or access server secrets.
- Runtime input is validated at HTTP boundaries. TypeScript types alone are not a trust boundary.
- Authenticated data access must use a context-bearing transaction when an RLS-protected table is involved.
- Database constraints, RLS, and application authorization are complementary controls.
- Public API routes, response fields, cookie names, and environment names are compatibility contracts.

## Source organization

New work follows a feature-first modular-monolith layout:

- `src/features/*` owns browser-facing domain logic, API adapters, components, and pages for one feature.
- `src/shared/*` contains feature-neutral browser transport, UI primitives, i18n, and utilities.
- `src/app/*` composes providers and application-wide browser behavior.
- `src/server/http` owns HTTP routing and response concerns; `src/server/modules` owns server feature handlers, services, and repositories; `src/server/infrastructure` owns runtime integrations.
- `src/routes/*` remains the TanStack file-routing boundary. Route declarations stay directly in these files so route generation can discover them; route bodies should delegate to feature pages.

Dependencies point from routes to features to shared modules. Server handlers call services, services call capability repositories, and repositories alone issue feature-specific SQL. Browser code must not import `src/server`. Cross-feature imports use an explicit public entrypoint rather than another feature's internals.

Handwritten files under `app`, `features`, and `shared` are limited by ESLint to 400 logical lines, 120 logical lines per function, and cyclomatic complexity 15. Generated code, historical migrations, locale dictionaries, and unmodified UI primitives are documented exceptions.

## Authentication and authorization

Password credentials use Argon2id. Google OAuth uses state, nonce, and PKCE. Sessions are random bearer tokens stored only as hashes in PostgreSQL and delivered through an HttpOnly SameSite cookie. Unsafe methods require an exact same-origin `Origin` header. Tree memberships and branch grants are checked by the application and reinforced by PostgreSQL policies.

## Errors and logging

Expected API failures use stable error codes. Unexpected failures receive `INTERNAL_ERROR` and a request ID. Production error logs are structured, and the logger redacts keys that may contain credentials, cookies, codes, tokens, profiles, or contact data.

## Operations

`/api/health` reports process liveness and `/api/ready` checks database access and migrations. PostgreSQL connections are pooled and closed on SIGTERM/SIGINT. Production is expected to run the generated Nitro Node server behind a trusted TLS-terminating proxy with explicitly configured proxy trust and secure cookies.

## Testing strategy

The executable gates are TypeScript, ESLint/Prettier, Vitest unit and contract tests, the transactional PostgreSQL smoke test, and the production build. PostgreSQL role-matrix and browser E2E coverage remain planned.
