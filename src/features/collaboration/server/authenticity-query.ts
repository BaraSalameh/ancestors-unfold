export const authenticitySql = `
  WITH cfg AS (
    SELECT version,growing_contributors,growing_branches,
      backed_contributors,backed_branches,
      established_contributors,established_branches,
      established_min_days,recent_activity_days,serious_complaint_downgrade
    FROM app.authenticity_config
    UNION ALL
    SELECT 1,2,2,4,3,8,5,365,90,true
    WHERE NOT EXISTS (SELECT 1 FROM app.authenticity_config)
    ORDER BY version DESC LIMIT 1
  ), stats AS (
    SELECT t.id,
      count(DISTINCT g.user_id) FILTER (
        WHERE g.role='branch_editor' AND g.revoked_at IS NULL AND b.status='active'
          AND u.status='active' AND u.email_verified_at IS NOT NULL
      )::integer active_contributors,
      count(DISTINCT g.root_subfamily_id) FILTER (
        WHERE g.role='branch_editor' AND g.revoked_at IS NULL AND b.status='active'
          AND u.status='active'
      )::integer managed_branches,
      count(DISTINCT b.id) FILTER (WHERE b.deleted_at IS NULL)::integer total_branches,
      count(DISTINCT m.id) FILTER (WHERE m.deleted_at IS NULL)::integer total_members,
      count(DISTINCT c.id) FILTER (
        WHERE c.status='open' AND c.serious
      )::integer serious_complaints,
      GREATEST(
        max(a.created_at),
        (SELECT max(e.occurred_at) FROM audit.events e WHERE e.tree_id=t.id)
      ) last_contribution_at
    FROM app.family_trees t
    LEFT JOIN app.subfamilies b ON b.tree_id=t.id
    LEFT JOIN app.branch_grants g ON g.tree_id=t.id AND g.root_subfamily_id=b.id
    LEFT JOIN app.users u ON u.id=g.user_id
    LEFT JOIN app.family_members m ON m.tree_id=t.id
    LEFT JOIN app.tree_complaints c ON c.tree_id=t.id
    LEFT JOIN app.tree_activity a ON a.tree_id=t.id
    WHERE t.id=$1 GROUP BY t.id
  ), scored AS (
  SELECT s.*,
    CASE
      WHEN s.active_contributors>=cfg.established_contributors
       AND s.managed_branches>=cfg.established_branches
       AND ft.created_at<=now()-(cfg.established_min_days||' days')::interval
       AND s.last_contribution_at>=now()-(cfg.recent_activity_days||' days')::interval
        THEN 'established'
      WHEN s.active_contributors>=cfg.backed_contributors
       AND s.managed_branches>=cfg.backed_branches THEN 'family_backed'
      WHEN s.active_contributors>=cfg.growing_contributors
       AND s.managed_branches>=cfg.growing_branches THEN 'growing'
      ELSE 'new'
    END earned_authenticity_level,
    cfg.growing_contributors,cfg.growing_branches,
    cfg.backed_contributors,cfg.backed_branches,
    cfg.established_contributors,cfg.established_branches,
    cfg.established_min_days,cfg.recent_activity_days,
    floor(extract(epoch FROM (now()-ft.created_at))/86400)::integer tree_age_days,
    COALESCE(
      s.last_contribution_at>=now()-(cfg.recent_activity_days||' days')::interval,
      false
    ) recent_activity_met,
    cfg.serious_complaint_downgrade
  FROM stats s JOIN app.family_trees ft ON ft.id=s.id CROSS JOIN cfg
  ) SELECT scored.*,
    CASE
      WHEN serious_complaints>0 AND serious_complaint_downgrade THEN 'under_review'
      ELSE earned_authenticity_level
    END authenticity_level
  FROM scored`;
