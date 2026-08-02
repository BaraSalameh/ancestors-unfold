import type { PoolClient } from "pg";
import type { SnapshotInput } from "@/server/security";

type SnapshotMember = NonNullable<SnapshotInput["members"]>[number];

export async function enforceBranchSnapshotScope(
  client: PoolClient,
  treeId: string,
  userId: string,
  allMembers: SnapshotMember[],
  editableMembers: SnapshotMember[],
  existingMemberIds: Set<string>,
  mutableMembers: Set<string>,
): Promise<void> {
  const existingRelations = await client.query<{
    relation_type: string;
    left_id: string;
    right_id: string;
    relation_role: string;
  }>(
    `SELECT 'parent' relation_type,child_id left_id,parent_id right_id,parent_role::text relation_role
     FROM app.parent_child_relationships
     WHERE tree_id=$1 AND deleted_at IS NULL
     UNION ALL
     SELECT 'spouse',least(a.member_id,b.member_id),greatest(a.member_id,b.member_id),u.status::text
     FROM app.union_partners a
     JOIN app.union_partners b ON b.union_id=a.union_id AND a.member_id<b.member_id
     JOIN app.unions u ON u.id=a.union_id AND u.deleted_at IS NULL
     WHERE a.tree_id=$1`,
    [treeId],
  );
  const relationKeys = new Set(
    existingRelations.rows.map(
      ({ relation_type, left_id, right_id, relation_role }) =>
        `${relation_type}:${left_id}:${right_id}:${relation_role}`,
    ),
  );
  for (const member of editableMembers) {
    assertParentRelationsAllowed(member, existingMemberIds, mutableMembers, relationKeys);
    assertSpouseRelationsAllowed(member, existingMemberIds, mutableMembers, relationKeys);
  }
  const payloadIds = new Set(allMembers.map(({ id }) => id));
  const deletedIds = [...mutableMembers].filter((id) => !payloadIds.has(id));
  if (!deletedIds.length) return;
  await client.query(
    "UPDATE app.family_members SET deleted_at=now(),updated_by=$3 WHERE tree_id=$1 AND id=ANY($2::uuid[])",
    [treeId, deletedIds, userId],
  );
  await client.query(
    `UPDATE app.parent_child_relationships SET deleted_at=now()
     WHERE tree_id=$1 AND deleted_at IS NULL
       AND (parent_id=ANY($2::uuid[]) OR child_id=ANY($2::uuid[]))`,
    [treeId, deletedIds],
  );
  await client.query(
    `UPDATE app.unions SET deleted_at=now()
     WHERE tree_id=$1 AND deleted_at IS NULL
       AND id IN (
         SELECT union_id FROM app.union_partners WHERE member_id=ANY($2::uuid[])
       )`,
    [treeId, deletedIds],
  );
}

function assertParentRelationsAllowed(
  member: SnapshotMember,
  existingIds: Set<string>,
  mutableIds: Set<string>,
  relationKeys: Set<string>,
): void {
  for (const [role, relatedId] of [
    ["father", member.father_id],
    ["mother", member.mother_id],
  ] as const)
    if (
      relatedId &&
      existingIds.has(relatedId) &&
      !mutableIds.has(relatedId) &&
      !relationKeys.has(`parent:${member.id}:${relatedId}:${role}`)
    )
      throw new Error("FORBIDDEN");
}

function assertSpouseRelationsAllowed(
  member: SnapshotMember,
  existingIds: Set<string>,
  mutableIds: Set<string>,
  relationKeys: Set<string>,
): void {
  for (const relatedId of [
    member.spouse_id,
    ...(member.spouse_ids ?? []),
    ...(member.divorced_from ?? []),
  ])
    if (relatedId && existingIds.has(relatedId) && !mutableIds.has(relatedId)) {
      const [left, right] = [member.id, relatedId].sort();
      const status = (member.divorced_from ?? []).includes(relatedId) ? "divorced" : "current";
      if (!relationKeys.has(`spouse:${left}:${right}:${status}`)) throw new Error("FORBIDDEN");
    }
}
