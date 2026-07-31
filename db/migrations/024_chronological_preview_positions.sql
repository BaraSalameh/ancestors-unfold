BEGIN;

ALTER TABLE app.family_members
  ADD COLUMN decade_pos_x double precision,
  ADD COLUMN decade_pos_y double precision;

COMMIT;
