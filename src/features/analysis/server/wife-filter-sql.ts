export const excludeMarriageOnlyWivesSql = `NOT (
  member.gender='female'
  AND EXISTS (
    SELECT 1 FROM app.union_partners wife
    JOIN app.unions marriage ON marriage.id=wife.union_id
      AND marriage.tree_id=$1 AND marriage.deleted_at IS NULL
    JOIN app.union_partners husband_link ON husband_link.union_id=wife.union_id
      AND husband_link.member_id<>wife.member_id
    JOIN scoped_members husband ON husband.id=husband_link.member_id AND husband.gender='male'
    WHERE wife.tree_id=$1 AND wife.member_id=member.id
  )
  AND NOT EXISTS (
    SELECT 1 FROM app.parent_child_relationships family_parent
    WHERE family_parent.tree_id=$1 AND family_parent.child_id=member.id
      AND family_parent.deleted_at IS NULL
  )
)`;
