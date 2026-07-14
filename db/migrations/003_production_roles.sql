BEGIN;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='ancestors_app') THEN CREATE ROLE ancestors_app NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='ancestors_readonly') THEN CREATE ROLE ancestors_readonly NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS; END IF;
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'Role provisioning skipped; managed PostgreSQL administrator must create ancestors_app and ancestors_readonly';
END $$;

GRANT USAGE ON SCHEMA app,audit TO ancestors_app;
GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA app TO ancestors_app;
GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA app TO ancestors_app;
GRANT SELECT,INSERT ON audit.events TO ancestors_app;
REVOKE UPDATE,DELETE,TRUNCATE ON audit.events FROM ancestors_app;
GRANT SELECT ON app.family_trees,app.family_members,app.subfamilies,app.unions,app.union_partners TO ancestors_readonly;

ALTER DEFAULT PRIVILEGES IN SCHEMA app GRANT SELECT,INSERT,UPDATE,DELETE ON TABLES TO ancestors_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA app GRANT USAGE,SELECT ON SEQUENCES TO ancestors_app;

COMMIT;
