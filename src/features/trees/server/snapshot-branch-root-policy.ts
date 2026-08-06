import type { PoolClient } from "pg";
import { ApiError, type SnapshotInput } from "@/server/security";

type SnapshotBranch = NonNullable<SnapshotInput["subfamilies"]>[number];
type SnapshotMember = NonNullable<SnapshotInput["members"]>[number];

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
  const submittedBranches = new Map(
    (snapshot.subfamilies ?? []).map((branch) => [branch.id, branch]),
  );
  const submittedMembers = new Map((snapshot.members ?? []).map((member) => [member.id, member]));
  enforceRetainedBranchRoots(branches.rows, submittedBranches, submittedMembers, requiredBranchId);
  enforceProposedBranchRoots(submittedBranches.values(), submittedMembers);
}

function enforceRetainedBranchRoots(
  branches: Array<{ id: string; linked_male_id: string }>,
  submittedBranches: ReadonlyMap<string, SnapshotBranch>,
  submittedMembers: ReadonlyMap<string, SnapshotMember>,
  requiredBranchId: string | null,
) {
  for (const branch of branches) {
    const submitted = submittedBranches.get(branch.id);
    if (!submitted && branch.id !== requiredBranchId) continue;
    const rootId = submitted?.linked_male_id ?? branch.linked_male_id;
    const root = submittedMembers.get(rootId);
    if (!root && rootId === branch.linked_male_id)
      throw new ApiError("BRANCH_ROOT_DELETE_BLOCKED", 409);
    if (!root || root.gender !== "male") throw new ApiError("MEMBER_UNAVAILABLE", 409);
  }
}

function enforceProposedBranchRoots(
  branches: Iterable<SnapshotBranch>,
  submittedMembers: ReadonlyMap<string, SnapshotMember>,
) {
  for (const branch of branches) {
    if (!branch.linked_male_id) continue;
    const root = submittedMembers.get(branch.linked_male_id);
    if (!root || root.gender !== "male") throw new ApiError("MEMBER_UNAVAILABLE", 409);
  }
}
