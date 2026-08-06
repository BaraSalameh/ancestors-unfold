import type { PoolClient } from "pg";
import { ApiError, type SnapshotInput } from "@/server/security";

export async function requireFamilyCsvImportManager(
  client: PoolClient,
  treeId: string,
  userId: string,
) {
  const access = await client.query(
    `SELECT 1 FROM app.family_trees tree
     LEFT JOIN app.tree_memberships membership
       ON membership.tree_id=tree.id AND membership.user_id=$2 AND membership.revoked_at IS NULL
     WHERE tree.id=$1 AND tree.deleted_at IS NULL
       AND (tree.owner_user_id=$2 OR membership.role IN ('owner','administrator'))`,
    [treeId, userId],
  );
  if (!access.rowCount) throw new ApiError("FORBIDDEN", 403);
}

export async function validateFamilyCsvAppend(
  client: PoolClient,
  treeId: string,
  snapshot: SnapshotInput,
) {
  const currentMembers = await client.query<{ id: string }>(
    "SELECT id FROM app.family_members WHERE tree_id=$1 AND deleted_at IS NULL",
    [treeId],
  );
  const currentBranches = await client.query<{ id: string }>(
    "SELECT id FROM app.subfamilies WHERE tree_id=$1 AND deleted_at IS NULL",
    [treeId],
  );
  const submittedMembers = new Set((snapshot.members ?? []).map(({ id }) => id));
  const submittedBranches = new Set((snapshot.subfamilies ?? []).map(({ id }) => id));
  if (
    currentMembers.rows.some(({ id }) => !submittedMembers.has(id)) ||
    currentBranches.rows.some(({ id }) => !submittedBranches.has(id))
  )
    throw new ApiError("IMPORT_MUST_APPEND", 422);
}

export function validateSourceMappings(
  snapshot: SnapshotInput,
  memberMappings: ReadonlyMap<string, string>,
  branchMappings: ReadonlyMap<string, string>,
) {
  const memberIds = new Set((snapshot.members ?? []).map(({ id }) => id));
  const branchIds = new Set((snapshot.subfamilies ?? []).map(({ id }) => id));
  const validate = (ids: ReadonlySet<string>, mappings: ReadonlyMap<string, string>) => {
    if (ids.size !== mappings.size) throw new ApiError("INVALID_IMPORT_MAPPING", 422);
    const sources = new Set<string>();
    for (const [target, source] of mappings) {
      if (!ids.has(target) || sources.has(source))
        throw new ApiError("INVALID_IMPORT_MAPPING", 422);
      sources.add(source);
    }
    for (const id of ids) if (!mappings.has(id)) throw new ApiError("INVALID_IMPORT_MAPPING", 422);
  };
  validate(memberIds, memberMappings);
  validate(branchIds, branchMappings);
}

export function countImportedSourceMappings(
  mappings: ReadonlyMap<string, string>,
  entity: "member" | "branch",
) {
  let count = 0;
  for (const [targetId, sourceId] of mappings)
    if (sourceId !== `existing|${entity}|${targetId}`) count += 1;
  return count;
}
