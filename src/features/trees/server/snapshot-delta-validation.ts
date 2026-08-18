import type { PoolClient } from "pg";
import type { SnapshotDeltaInput } from "@/server/snapshot-delta-schema";
import { ApiError } from "@/server/security";
import { assertBranchSetUnique, loadTreeBranches } from "./snapshot-branch-uniqueness";

// Reference validation deliberately walks every relationship-bearing field in the wire contract.
// eslint-disable-next-line complexity
export async function validateDeltaReferences(
  client: PoolClient,
  treeId: string,
  delta: SnapshotDeltaInput,
) {
  const submittedMemberIds = new Set(delta.upsertMembers.map(({ id }) => id));
  const referencedMemberIds = new Set<string>();
  for (const member of delta.upsertMembers)
    for (const id of [
      member.father_id,
      member.mother_id,
      member.spouse_id,
      ...(member.spouse_ids ?? []),
      ...(member.divorced_from ?? []),
    ])
      if (id && !submittedMemberIds.has(id)) referencedMemberIds.add(id);
  for (const branch of delta.upsertSubfamilies)
    if (branch.linked_male_id && !submittedMemberIds.has(branch.linked_male_id))
      referencedMemberIds.add(branch.linked_male_id);
  if (delta.deleteMemberIds.some((id) => referencedMemberIds.has(id)))
    throw new ApiError("INVALID_INPUT", 400);
  if (referencedMemberIds.size) {
    const existing = await client.query<{ id: string }>(
      `SELECT id FROM app.family_members
       WHERE tree_id=$1 AND id=ANY($2::uuid[]) AND deleted_at IS NULL`,
      [treeId, [...referencedMemberIds]],
    );
    if (existing.rowCount !== referencedMemberIds.size) throw new ApiError("INVALID_INPUT", 400);
  }
  const submittedBranchIds = new Set(delta.upsertSubfamilies.map(({ id }) => id));
  const referencedBranchIds = new Set<string>();
  for (const member of delta.upsertMembers)
    if (member.subfamily_id && !submittedBranchIds.has(member.subfamily_id))
      referencedBranchIds.add(member.subfamily_id);
  for (const branch of delta.upsertSubfamilies)
    if (branch.parent_subfamily_id && !submittedBranchIds.has(branch.parent_subfamily_id))
      referencedBranchIds.add(branch.parent_subfamily_id);
  if (delta.deleteSubfamilyIds.some((id) => referencedBranchIds.has(id)))
    throw new ApiError("INVALID_INPUT", 400);
  if (referencedBranchIds.size) {
    const existing = await client.query<{ id: string }>(
      `SELECT id FROM app.subfamilies
       WHERE tree_id=$1 AND id=ANY($2::uuid[]) AND deleted_at IS NULL`,
      [treeId, [...referencedBranchIds]],
    );
    if (existing.rowCount !== referencedBranchIds.size) throw new ApiError("INVALID_INPUT", 400);
  }
}

export async function validateDeltaBranches(
  client: PoolClient,
  treeId: string,
  delta: SnapshotDeltaInput,
) {
  if (!delta.upsertSubfamilies.length && !delta.deleteSubfamilyIds.length) return;
  const current = await loadTreeBranches(client, treeId);
  const deleted = new Set(delta.deleteSubfamilyIds);
  const upsertById = new Map(delta.upsertSubfamilies.map((branch) => [branch.id, branch]));
  const next = [
    ...current.filter(({ id }) => !deleted.has(id) && !upsertById.has(id)),
    ...delta.upsertSubfamilies,
  ];
  assertBranchSetUnique(current, next);
  const roots = delta.upsertSubfamilies.flatMap((branch) =>
    branch.linked_male_id ? [branch.linked_male_id] : [],
  );
  if (!roots.length) return;
  const rootRows = await client.query<{ id: string; gender: string }>(
    `SELECT id,gender::text gender FROM app.family_members
     WHERE tree_id=$1 AND id=ANY($2::uuid[]) AND deleted_at IS NULL
     UNION ALL
     SELECT input.id,input.gender::text
     FROM jsonb_to_recordset($3::jsonb) AS input(id uuid,gender app.gender)`,
    [treeId, roots, JSON.stringify(delta.upsertMembers)],
  );
  const rootGender = new Map(rootRows.rows.map(({ id, gender }) => [id, gender]));
  if (roots.some((id) => rootGender.get(id) !== "male"))
    throw new ApiError("MEMBER_UNAVAILABLE", 409);
}

export async function authorizeDeltaScope(
  client: PoolClient,
  treeId: string,
  userId: string,
  delta: SnapshotDeltaInput,
  access: { isBranchEditor: boolean; branchRootId: string | null },
) {
  if (!access.isBranchEditor) return;
  if (delta.upsertSubfamilies.length || delta.deleteSubfamilyIds.length)
    throw new ApiError("FORBIDDEN", 403);
  const allowed = await client.query<{ id: string }>(
    `SELECT member_id id FROM app.branch_members($1,$2)
     UNION
     SELECT id FROM app.family_members
     WHERE tree_id=$1 AND created_by=$2 AND deleted_at IS NULL
       AND app.is_unattached_member(tree_id,id)`,
    [treeId, userId],
  );
  const allowedIds = new Set(allowed.rows.map(({ id }) => id));
  const existingTouched = await client.query<{ id: string }>(
    `SELECT id FROM app.family_members
     WHERE tree_id=$1 AND id=ANY($2::uuid[]) AND deleted_at IS NULL`,
    [treeId, [...delta.upsertMembers.map(({ id }) => id), ...delta.deleteMemberIds]],
  );
  if (existingTouched.rows.some(({ id }) => !allowedIds.has(id)))
    throw new ApiError("FORBIDDEN", 403);
}

export async function rejectProtectedDeletes(
  client: PoolClient,
  treeId: string,
  memberIds: string[],
  branchIds: string[],
) {
  if (memberIds.length) {
    const protectedMembers = await client.query(
      `SELECT 1 FROM app.family_members member
       WHERE member.tree_id=$1 AND member.id=ANY($2::uuid[]) AND (
         member.linked_user_id IS NOT NULL OR EXISTS (
           SELECT 1 FROM app.subfamilies branch
           WHERE branch.tree_id=$1 AND branch.linked_male_id=member.id
             AND branch.status='active' AND branch.deleted_at IS NULL
         )
       ) LIMIT 1`,
      [treeId, memberIds],
    );
    if (protectedMembers.rowCount) throw new ApiError("PROTECTED_MEMBER", 409);
  }
  if (branchIds.length) {
    const protectedBranches = await client.query(
      `SELECT 1 FROM app.branch_grants
       WHERE tree_id=$1 AND root_subfamily_id=ANY($2::uuid[]) AND revoked_at IS NULL LIMIT 1`,
      [treeId, branchIds],
    );
    if (protectedBranches.rowCount) throw new ApiError("PROTECTED_BRANCH", 409);
  }
}
