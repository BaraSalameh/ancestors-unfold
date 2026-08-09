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
  ), branch_stats AS (
    SELECT b.tree_id,
      count(DISTINCT g.user_id) FILTER (
        WHERE g.role='branch_editor' AND g.revoked_at IS NULL AND b.status='active'
          AND (g.expires_at IS NULL OR g.expires_at>now())
          AND u.status='active' AND u.email_verified_at IS NOT NULL
      )::integer active_contributors,
      count(DISTINCT g.root_subfamily_id) FILTER (
        WHERE g.role='branch_editor' AND g.revoked_at IS NULL AND b.status='active'
          AND (g.expires_at IS NULL OR g.expires_at>now())
          AND u.status='active'
      )::integer managed_branches,
      count(DISTINCT b.id) FILTER (WHERE b.deleted_at IS NULL)::integer total_branches
    FROM app.subfamilies b
    LEFT JOIN app.branch_grants g ON g.tree_id=b.tree_id AND g.root_subfamily_id=b.id
    LEFT JOIN app.users u ON u.id=g.user_id
    WHERE b.tree_id=$1
    GROUP BY b.tree_id
  ), member_stats AS (
    SELECT tree_id,count(*)::integer total_members
    FROM app.family_members WHERE tree_id=$1 AND deleted_at IS NULL GROUP BY tree_id
  ), complaint_stats AS (
    SELECT tree_id,count(*)::integer serious_complaints
    FROM app.tree_complaints
    WHERE tree_id=$1 AND status='open' AND serious GROUP BY tree_id
  ), activity_stats AS (
    SELECT tree_id,max(created_at) last_activity_at
    FROM app.tree_activity WHERE tree_id=$1 GROUP BY tree_id
  ), audit_stats AS (
    SELECT tree_id,max(occurred_at) last_audit_at
    FROM audit.events WHERE tree_id=$1 GROUP BY tree_id
  ), stats AS (
    SELECT t.id,
      coalesce(b.active_contributors,0) active_contributors,
      coalesce(b.managed_branches,0) managed_branches,
      coalesce(b.total_branches,0) total_branches,
      coalesce(m.total_members,0) total_members,
      coalesce(c.serious_complaints,0) serious_complaints,
      greatest(a.last_activity_at,e.last_audit_at) last_contribution_at
    FROM app.family_trees t
    LEFT JOIN branch_stats b ON b.tree_id=t.id
    LEFT JOIN member_stats m ON m.tree_id=t.id
    LEFT JOIN complaint_stats c ON c.tree_id=t.id
    LEFT JOIN activity_stats a ON a.tree_id=t.id
    LEFT JOIN audit_stats e ON e.tree_id=t.id
    WHERE t.id=$1
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
