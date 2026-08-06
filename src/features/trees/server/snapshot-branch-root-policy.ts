import type { PoolClient } from "pg";
import { ApiError, type SnapshotInput } from "@/server/security";

export async function enforceSnapshotBranchRoots(
  client: PoolClient,
  treeId: string,
  snapshot: SnapshotInput,
  requiredBranchId: string | null,
): Promise<void> {
  const branches = await client.query<{ id: string; linked_male_id: string }>(
    `SELECT id,linked_male_id FROM app.subfamilies
     WHERE tree_id=$1 AND status='active' AND deleted_at IS NULL AND linked_male_id IS NOT NULL`,
    [treeId],
  );
  const submittedBranches = new Set((snapshot.subfamilies ?? []).map(({ id }) => id));
  const submittedMembers = new Map((snapshot.members ?? []).map((member) => [member.id, member]));
  for (const branch of branches.rows) {
    if (!submittedBranches.has(branch.id) && branch.id !== requiredBranchId) continue;
    const root = submittedMembers.get(branch.linked_male_id);
    if (!root || root.gender !== "male") throw new ApiError("BRANCH_ROOT_DELETE_BLOCKED", 409);
  }
}
