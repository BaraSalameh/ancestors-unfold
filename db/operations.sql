-- Examples for the deployment/maintenance system; do not run this file as a migration.

-- Provision the current and next audit partitions.
SELECT audit.create_month_partition(current_date);
SELECT audit.create_month_partition((current_date + interval '1 month')::date);

-- Find active sessions that the server should reject or revoke.
SELECT s.id, s.user_id
FROM app.sessions s
LEFT JOIN app.password_credentials p ON p.user_id = s.user_id
WHERE s.revoked_at IS NULL
  AND (s.idle_expires_at <= now() OR s.absolute_expires_at <= now()
       OR (p.user_id IS NOT NULL AND p.credential_version <> s.credential_version));

-- Seven-year audit retention candidate partitions are listed through the catalog;
-- the maintenance job must validate each partition bound before dropping it.
SELECT child.relname AS partition_name, pg_get_expr(child.relpartbound, child.oid) AS partition_bound
FROM pg_inherits
JOIN pg_class parent ON parent.oid = inhparent
JOIN pg_class child ON child.oid = inhrelid
JOIN pg_namespace ns ON ns.oid = child.relnamespace
WHERE ns.nspname = 'audit' AND parent.relname = 'events';
