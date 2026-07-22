# Ancestors Unfold

A bilingual family-tree application built with React, TanStack Start, Nitro, and PostgreSQL.

## Local development

1. Connect the Vercel project to a Neon development database and rotate any exposed credentials.
2. Run `npm ci`.
3. Pull Vercel's Development variables with `vercel env pull .env.local --environment=development` and add the remaining values from `.env.example`.
4. Apply migrations to Neon with `npm run db:migrate`.
5. Start the application with `npm run dev`.

Local development uses the pooled `DATABASE_URL`. Migrations prefer `DATABASE_URL_UNPOOLED` so schema changes do not pass through PgBouncer. Both files containing secrets (`.env` and `.env.local`) are git-ignored.

Authentication email is printed to the server terminal by default. See `docs/email-delivery.md` before configuring SMTP or Resend.

## Validation and production

Run `npm run validate` for type checking, linting, the database smoke test, and the production build. `npm run format:check` verifies formatting without rewriting files.

`npm run build` generates the deployable Nitro Node server in `.output`; start it with `npm run preview`. The production runtime requires PostgreSQL, secure environment configuration, TLS, and `SESSION_COOKIE_SECURE=true` for an HTTPS public origin.

See `ARCHITECTURE.md` for system boundaries and `AGENTS.md` for contribution and security rules.
