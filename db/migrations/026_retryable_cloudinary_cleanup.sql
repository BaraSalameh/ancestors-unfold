BEGIN;

DROP FUNCTION IF EXISTS app.claim_stale_cloudinary_assets();

CREATE FUNCTION app.stale_cloudinary_assets()
RETURNS TABLE(public_id text) LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
  SELECT a.public_id FROM app.cloudinary_assets a
  WHERE a.status='pending' AND a.created_at < now()-interval '24 hours'
$$;
REVOKE ALL ON FUNCTION app.stale_cloudinary_assets() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.stale_cloudinary_assets() TO ancestors_app;

CREATE FUNCTION app.delete_stale_cloudinary_assets(p_public_ids text[])
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
  DELETE FROM app.cloudinary_assets
  WHERE status='pending' AND created_at < now()-interval '24 hours'
    AND public_id=ANY(p_public_ids)
$$;
REVOKE ALL ON FUNCTION app.delete_stale_cloudinary_assets(text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.delete_stale_cloudinary_assets(text[]) TO ancestors_app;

COMMIT;
