import type { PoolClient } from "pg";
import { ApiError, type SnapshotInput } from "@/server/security";

/** Reject stale branch roots before persistence so database constraints never surface as a 500. */
export function validateSnapshotBranchRoots(snapshot: SnapshotInput): void {
  const members = new Map((snapshot.members ?? []).map((member) => [member.id, member]));
  for (const branch of snapshot.subfamilies ?? []) {
    if (!branch.linked_male_id) continue;
    const linkedMember = members.get(branch.linked_male_id);
    if (!linkedMember || linkedMember.gender !== "male")
      throw new ApiError("INVALID_SUBFAMILY_ROOT", 422);
  }
}

export async function validateBranchEditorRoot(
  client: PoolClient,
  treeId: string,
  branchId: string | null,
  snapshot: SnapshotInput,
): Promise<void> {
  if (!branchId) return;
  const branch = await client.query<{ linked_male_id: string | null }>(
    `SELECT linked_male_id FROM app.subfamilies
     WHERE tree_id=$1 AND id=$2 AND status='active' AND deleted_at IS NULL`,
    [treeId, branchId],
  );
  const linkedMaleId = branch.rows[0]?.linked_male_id;
  if (!linkedMaleId) return;
  const submittedRoot = snapshot.members?.find(({ id }) => id === linkedMaleId);
  if (!submittedRoot || submittedRoot.gender !== "male")
    throw new ApiError("BRANCH_ROOT_REQUIRED", 422);
}
