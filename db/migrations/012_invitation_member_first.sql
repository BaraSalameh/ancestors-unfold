BEGIN;

ALTER TABLE app.contributor_invitations
  ALTER COLUMN position_label DROP NOT NULL;

CREATE POLICY invitation_invitee_read ON app.contributor_invitations FOR SELECT USING (
  invited_email=(SELECT email FROM app.users WHERE id=app.current_user_id())
);

DROP FUNCTION app.public_invitation(bytea);
CREATE FUNCTION app.public_invitation(p_token_hash bytea)
RETURNS TABLE(
  invited_email text, invited_name_en text, invited_name_ar text,
  member_gender app.gender, member_birth_date date, expires_at timestamptz,
  tree_name_en text, tree_name_ar text, branch_name_en text, branch_name_ar text,
  owner_name_en text, owner_name_ar text
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,app AS $$
  SELECT i.invited_email,
    COALESCE(NULLIF(m.name_en,''),m.name_ar),
    COALESCE(NULLIF(m.name_ar,''),m.name_en),
    m.gender,m.birth_date,i.expires_at,
    t.name_en,t.name_ar,b.name_en,b.name_ar,u.full_name_en,u.full_name_ar
  FROM app.contributor_invitations i
  JOIN app.family_trees t ON t.id=i.tree_id AND t.deleted_at IS NULL
  JOIN app.subfamilies b ON b.id=i.branch_id AND b.status='active' AND b.deleted_at IS NULL
  JOIN app.family_members m ON m.id=i.existing_family_member_id
    AND m.tree_id=i.tree_id AND m.linked_user_id IS NULL AND m.deleted_at IS NULL
  JOIN app.users u ON u.id=t.owner_user_id
  WHERE i.token_hash=p_token_hash AND i.status='pending' AND i.expires_at>now()
$$;
GRANT EXECUTE ON FUNCTION app.public_invitation(bytea) TO ancestors_app;

CREATE FUNCTION app.registration_invitation_id(p_token_hash bytea,p_email text)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,app AS $$
  SELECT i.id FROM app.contributor_invitations i
  JOIN app.subfamilies b ON b.id=i.branch_id AND b.tree_id=i.tree_id
    AND b.status='active' AND b.deleted_at IS NULL
  JOIN app.family_members m ON m.id=i.existing_family_member_id AND m.tree_id=i.tree_id
    AND m.linked_user_id IS NULL AND m.deleted_at IS NULL
  WHERE i.token_hash=p_token_hash AND i.invited_email=lower(btrim(p_email))
    AND i.status='pending' AND i.expires_at>now()
$$;
GRANT EXECUTE ON FUNCTION app.registration_invitation_id(bytea,text) TO ancestors_app;

COMMIT;
