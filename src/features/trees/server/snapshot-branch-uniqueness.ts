import type { PoolClient } from "pg";
import { ApiError, type SnapshotInput } from "@/server/security";
import { newBranchConflicts, type BranchUniquenessInput } from "../domain/branch-uniqueness";

export async function loadTreeBranches(
  client: PoolClient,
  treeId: string,
): Promise<BranchUniquenessInput[]> {
  const result = await client.query<{
    id: string;
    name_en: string;
    name_ar: string | null;
    linked_male_id: string | null;
  }>(
    `SELECT id,name_en,name_ar,linked_male_id FROM app.subfamilies
     WHERE tree_id=$1 AND deleted_at IS NULL`,
    [treeId],
  );
  return result.rows;
}

export function assertBranchSetUnique(
  current: readonly BranchUniquenessInput[],
  next: readonly BranchUniquenessInput[],
) {
  const conflict = newBranchConflicts(current, next)[0];
  if (conflict) throw new ApiError(conflict.code, 409);
}

export async function enforceSnapshotBranchUniqueness(
  client: PoolClient,
  treeId: string,
  snapshot: SnapshotInput,
) {
  const current = await loadTreeBranches(client, treeId);
  assertBranchSetUnique(current, snapshot.subfamilies ?? []);
}
