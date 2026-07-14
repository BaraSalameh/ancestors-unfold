# Ancestors Unfold database

This directory is the PostgreSQL contract for the future server. The current browser application still uses `localStorage`; do not connect it directly to PostgreSQL or expose a database credential to the browser.

## Apply and verify

PostgreSQL 16 or newer is recommended. Apply migrations in filename order using a migration-only database role:

```powershell
docker compose up -d postgres
npm run db:migrate
npm run db:test
npm run dev
```

Copy `.env.example` to `.env` before running these commands. A development `.env` has been created locally and is git-ignored. Production must replace it with the managed PostgreSQL connection string and enable TLS/cookie security.

Each request must begin a transaction and call `app.set_request_context(user_id, session_id, request_id, ip, user_agent)` with server-validated values. Use `SET LOCAL ROLE` for the restricted application role. Never let clients set PostgreSQL context variables themselves.

## Security responsibilities outside SQL

- Hash passwords with calibrated Argon2id in the server. Persist only the encoded `$argon2id$...` value.
- Generate at least 256-bit random session/share/reset tokens. Store `digest(token, 'sha256')`; return the raw value once.
- Encrypt TOTP secrets in the application using an authenticated cipher and a managed KMS key. Store ciphertext and key version only.
- Perform rate limiting before authentication work, backed by `auth_attempts` and a low-latency limiter.
- Authorize object access before issuing short-lived storage-provider download URLs. Upload into quarantine and expose only `clean` files.
- Use TLS, encrypted managed storage, point-in-time recovery, daily backups, and quarterly restore exercises.
- Create separate migration, application, reporting, and maintenance roles. The application role must not own objects, bypass RLS, or update/delete `audit.events`.

## Authorization boundary

`app.has_tree_role`, `app.branch_subfamilies`, `app.branch_members`, and the contact capability functions are the canonical query helpers. RLS is defense in depth. Production connects through a login role granted membership in the non-owner `ancestors_app` role created by migration 003; never use the migration owner for web traffic. Server mutation methods must additionally enforce boundary rules before writing relationships, moving branch roots, deleting shared ancestors, or managing grants.

Tree owners/administrators may manage contacts. A branch grant receives contact access only when its explicit flags permit it. Branch member inference includes nested sub-families, descendants of linked males, explicit assignments, and spouses needed for display.

The `app.preview_members` view deliberately excludes notes and contacts and reduces living-person birth dates to January 1 of the birth year as a typed representation. Public APIs should serialize this as `birth_year`, not as a fabricated full date.

## Audit operations

Run `audit.create_month_partition()` ahead of each month. The default partition prevents lost events if scheduling fails. Maintenance must move default-partition rows into the proper monthly partition, drop partitions older than seven years, and monitor audit insertion failures. Audit trigger redaction is a safety net; service code must never place secrets inside metadata.

## LocalStorage migration order

1. Create a batch ID and import trees.
2. Import members and sub-families while recording source-to-UUID mappings in `app.import_id_map`.
3. Resolve parent links and explicit sub-family assignments.
4. Deduplicate symmetric `spouse_id`, `spouse_ids`, and `divorced_from` values into `unions` and `union_partners`.
5. Import external children, files, attachments, and layout positions.
6. Quarantine dangling references, cycles, cross-tree references, duplicate unions, and invalid dates instead of silently discarding them.
7. Re-run the same batch safely by consulting the mapping table, then reconcile counts and samples before cutover.
