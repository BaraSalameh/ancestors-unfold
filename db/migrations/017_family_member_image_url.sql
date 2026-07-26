ALTER TABLE app.family_members
  ADD COLUMN image_url text
  CHECK (image_url IS NULL OR (btrim(image_url) <> '' AND char_length(image_url) <= 2048));
