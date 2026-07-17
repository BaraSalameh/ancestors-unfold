# Ancestors Unfold

A bilingual family-tree application built with React, TanStack Start, Nitro, and PostgreSQL.

## Local development

1. Copy `.env.example` to `.env` and replace the development database password and email-code secret.
2. Run `npm ci`.
3. Start PostgreSQL with `npm run db:up`.
4. Apply migrations with `npm run db:migrate`.
5. Start the application with `npm run dev`.

Authentication email is printed to the server terminal by default. See `docs/email-delivery.md` before configuring SMTP or Resend.

## Validation and production

Run `npm run validate` for type checking, linting, the database smoke test, and the production build. `npm run format:check` verifies formatting without rewriting files.

`npm run build` generates the deployable Nitro Node server in `.output`; start it with `npm run preview`. The production runtime requires PostgreSQL, secure environment configuration, TLS, and `SESSION_COOKIE_SECURE=true` for an HTTPS public origin.

See `ARCHITECTURE.md` for system boundaries and `AGENTS.md` for contribution and security rules.
