# Codex Project Instructions

## Project

Ancestors Unfold is a React 19 and TanStack Start TypeScript monolith backed by PostgreSQL 16. Preserve product behavior, API contracts, database compatibility, authentication semantics, bilingual UI, and RTL behavior unless a change is explicitly approved.

## Commands

- Install: `npm ci`
- Develop: `npm run dev`
- Typecheck: `npm run typecheck`
- Lint: `npm run lint`
- Format check: `npm run format:check`
- Database: `npm run db:up`, `npm run db:migrate`, `npm run db:test`
- Build: `npm run build`
- Full available validation: `npm run validate`

Use `npm.cmd`/`npx.cmd` on Windows hosts whose PowerShell policy blocks npm scripts.

## Architecture and security rules

- Keep browser, API/application, and database responsibilities separate.
- Validate untrusted values with Zod before business or persistence logic.
- Use parameterized SQL and context-bearing transactions for authenticated RLS data.
- Never expose database credentials, session tokens, reset tokens, verification codes, OAuth secrets, or contact data in logs.
- Do not weaken CSRF, cookie, rate-limit, RLS, or object-level authorization controls.
- Do not casually edit generated `src/routeTree.gen.ts`, historical migrations, or generated `.output` files.
- Add a new forward migration for schema changes. Never rewrite an applied migration.
- Keep tree snapshot writes versioned and serialized; never silently adopt last-write-wins.

## Definition of done

Run focused checks, then typecheck, lint, relevant database tests, and the production build. Report skipped checks honestly, inspect the diff, and leave unrelated user changes untouched.
