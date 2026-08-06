BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM app.family_members
    WHERE image_file_id IS NOT NULL OR decade_pos_x IS NOT NULL OR decade_pos_y IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'obsolete family member columns contain data; review before migration';
  END IF;

  IF EXISTS (
    SELECT 1 FROM app.family_trees
    WHERE nullif(btrim(color), '') IS NOT NULL OR theme_metadata <> '{}'::jsonb
  ) THEN
    RAISE EXCEPTION 'obsolete family tree appearance columns contain data; review before migration';
  END IF;

  IF EXISTS (
    SELECT 1 FROM app.subfamilies
    WHERE nullif(btrim(color), '') IS NOT NULL OR nullif(btrim(position_label), '') IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'obsolete subfamily columns contain data; review before migration';
  END IF;

  IF EXISTS (
    SELECT 1 FROM app.unions
    WHERE started_on IS NOT NULL OR ended_on IS NOT NULL OR nullif(btrim(notes), '') IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'obsolete union columns contain data; review before migration';
  END IF;

  IF EXISTS (SELECT 1 FROM app.users WHERE timezone <> 'UTC') THEN
    RAISE EXCEPTION 'non-default user timezones exist; review before migration';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM app.subfamily_attachments attachment
    JOIN app.files file ON file.id = attachment.file_id
    WHERE attachment.title IS DISTINCT FROM file.original_name
       OR attachment.attachment_type IS DISTINCT FROM file.media_type
       OR nullif(btrim(attachment.description), '') IS NOT NULL
       OR attachment.display_order <> 0
       OR attachment.preview_safe
  ) THEN
    RAISE EXCEPTION 'subfamily attachment metadata differs from canonical file metadata; review before migration';
  END IF;
END $$;

ALTER TABLE app.family_members
  DROP COLUMN image_file_id,
  DROP COLUMN decade_pos_x,
  DROP COLUMN decade_pos_y;

ALTER TABLE app.family_trees
  DROP COLUMN color,
  DROP COLUMN theme_metadata;

ALTER TABLE app.subfamilies
  DROP COLUMN color,
  DROP COLUMN position_label;

ALTER TABLE app.unions
  DROP COLUMN started_on,
  DROP COLUMN ended_on,
  DROP COLUMN notes;

ALTER TABLE app.users
  DROP COLUMN timezone;

ALTER TABLE app.subfamily_attachments
  DROP COLUMN title,
  DROP COLUMN attachment_type,
  DROP COLUMN description,
  DROP COLUMN display_order,
  DROP COLUMN preview_safe;

COMMIT;
