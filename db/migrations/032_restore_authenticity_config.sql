BEGIN;

INSERT INTO app.authenticity_config(
  version,
  growing_contributors,
  growing_branches,
  backed_contributors,
  backed_branches,
  established_contributors,
  established_branches,
  established_min_days,
  recent_activity_days,
  serious_complaint_downgrade
)
SELECT 1,2,2,4,3,8,5,365,90,true
WHERE NOT EXISTS (SELECT 1 FROM app.authenticity_config);

COMMIT;
