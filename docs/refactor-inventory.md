# Refactor inventory

This inventory is the compatibility baseline for the feature-first restructure.

## Browser routes

`/`, `/activity`, `/auth`, `/profile`, `/settings`, `/reset-password`,
`/invitation/$token`, `/tree/$id`, `/tree/$id/add`, `/add`, `/edit/$id`,
`/member/$id`, and `/subfamilies`.

## API groups

- Authentication: Google OAuth, registration, verification, login, logout,
  password reset, sessions, and session revocation.
- Account: profile names, contributor deletion, and email-change flows.
- Trees: list/create/update/delete, authenticated snapshots, and public preview.
- Collaboration: current tree, branches, invitations, ownership, activity,
  authenticity, and member-change workflows.
- Member data: contacts and branch grants.
- Operations: health, readiness, and migration status.

All existing paths, methods, status codes, cookies, and response shapes remain
compatibility contracts during this refactor.

## Environment variables

| Area           | Variables                                                                                         |
| -------------- | ------------------------------------------------------------------------------------------------- |
| Database       | `DATABASE_URL`, `DATABASE_URL_UNPOOLED`, `DATABASE_SSL`, `REQUIRED_MIGRATIONS`                    |
| Sessions       | `SESSION_IDLE_HOURS`, `SESSION_ABSOLUTE_DAYS`, `SESSION_COOKIE_SECURE`                            |
| OAuth          | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `PUBLIC_ORIGIN`                                       |
| Token delivery | `AUTH_TOKEN_DELIVERY`, `EMAIL_CODE_SECRET`                                                        |
| SMTP/Resend    | `EMAIL_FROM`, `RESEND_API_KEY`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS` |
| Collaboration  | `AUTHENTICITY_ADMIN_USER_IDS`                                                                     |
| Runtime        | `NODE_ENV`                                                                                        |

No variable is renamed or removed by the restructure.

## Database object usage matrix

| Classification          | Objects                                                                                                                                                             | Evidence required before removal                                                                                          |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Active identity/session | `users`, `password_credentials`, `oauth_accounts`, verification/reset tokens, `sessions`, `auth_attempts`                                                           | Auth handlers, rate limits, session revocation, account deletion, RLS context                                             |
| Active tree graph       | `family_trees`, `tree_memberships`, `family_members`, `subfamilies`, parent-child relationships, `unions`, `union_partners`, `external_children`, `branch_grants`   | Snapshot read/write SQL, contributor policies, RLS helpers, integrity triggers                                            |
| Active collaboration    | `contributor_invitations`, `ownership_transfers`, `tree_activity`, `member_contacts`                                                                                | Collaboration endpoints, dashboard/activity contracts, contact authorization                                              |
| Audit/operations        | `audit.events` and partitions, `schema_migrations`, `import_id_map`                                                                                                 | Audit triggers, readiness checks, import compatibility                                                                    |
| Deprecation candidates  | TOTP/recovery, device-login challenges, files/media, subfamily attachments, share links, ownership history, change requests, complaints, authenticity configuration | Runtime SQL search, RLS/policy search, trigger search, DB tests, operational scripts, and a production deprecation period |

The enum types, indexes, RLS helpers, validation triggers, and audit functions attached
to active objects are active dependencies even when application TypeScript does not
refer to their names directly.

## Public response families

- Auth responses preserve session user identity, bilingual profile names, session
  expiry, verification state, and stable error codes.
- Tree responses preserve tree identity/metadata, role and affiliation fields,
  snapshot `version`, members, subfamilies, and member capability flags.
- Collaboration responses preserve branch, invitation, ownership, activity,
  authenticity, statistics, and contact permission shapes.
- Operations responses preserve health/readiness status and migration counts.

Characterization tests remain the authoritative field-level contract; this inventory
is a review index and does not authorize response-field removal.

## Database deprecation review

Runtime SQL, RLS policies, triggers, audit requirements, tests, and operational
scripts must all be checked before an object is classified as unused.

Initial candidates requiring a deprecation period include device-login remnants,
TOTP recovery storage, file/media tables, persisted subfamily attachments,
share-link storage, ownership history, member-change requests, complaints, and
authenticity configuration. No object is approved for removal by this document.

## Generated and historical sources

`src/routeTree.gen.ts` is generated. Existing migration files are historical and
must not be rewritten. Database removals require a later forward migration.
