BEGIN;

UPDATE app.tree_activity a
SET subject_name_en=i.invited_name_en,subject_name_ar=i.invited_name_ar
FROM app.contributor_invitations i
WHERE a.target_type='invitation' AND a.target_id=i.id
  AND a.action_type IN ('invitation_sent','invitation_resent','invitation_cancelled')
  AND a.subject_name_en IS NULL AND a.subject_name_ar IS NULL;

UPDATE app.tree_activity
SET subject_user_id=actor_user_id,
    subject_name_en=actor_name_en,
    subject_name_ar=actor_name_ar
WHERE action_type='invitation_accepted' AND actor_user_id IS NOT NULL
  AND subject_name_en IS NULL AND subject_name_ar IS NULL;

WITH recovered_cancellations AS (
  SELECT DISTINCT ON (a.id)
    a.id,
    COALESCE(
      NULLIF(e.before_state->>'name_en',''),
      NULLIF(e.before_state->>'name_ar',''),
      a.actor_name_en
    ) name_en,
    COALESCE(
      NULLIF(e.before_state->>'name_ar',''),
      NULLIF(e.before_state->>'name_en',''),
      a.actor_name_ar
    ) name_ar
  FROM app.tree_activity a
  JOIN audit.events e ON e.tree_id=a.tree_id
    AND e.entity_type='family_members' AND e.action='update'
    AND e.before_state->>'linked_user_id'=a.actor_user_id::text
    AND e.after_state->>'linked_user_id' IS NULL
  WHERE a.action_type='contributor_account_deleted'
    AND a.actor_name_en='Deleted User'
  ORDER BY a.id,e.occurred_at DESC
)
UPDATE app.tree_activity a
SET actor_name_en=r.name_en,actor_name_ar=r.name_ar,
    subject_name_en=r.name_en,subject_name_ar=r.name_ar
FROM recovered_cancellations r
WHERE a.id=r.id;

CREATE INDEX tree_activity_tree_order_idx
  ON app.tree_activity(tree_id,created_at DESC,id DESC);
CREATE INDEX tree_activity_identity_search_idx ON app.tree_activity USING gin ((
  lower(
    COALESCE(actor_name_en,'')||' '||COALESCE(actor_name_ar,'')||' '||
    COALESCE(subject_name_en,'')||' '||COALESCE(subject_name_ar,'')
  )
) gin_trgm_ops);

COMMIT;
