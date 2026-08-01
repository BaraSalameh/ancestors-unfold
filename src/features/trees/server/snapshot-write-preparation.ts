import type { PoolClient } from "pg";
import { ApiError } from "@/server/security";

interface SnapshotWriteAccess {
  isBranchEditor: boolean;
  branchRootId: string | null;
}

interface CompletedSnapshotWrite {
  batchId: string;
  mapped: number;
  reconciled: true;
  version: number;
}

export async function authorizeSnapshotWrite(
  client: PoolClient,
  treeId: string,
  userId: string,
): Promise<SnapshotWriteAccess> {
  const membershipAccess = await client.query(
    `SELECT 1 FROM app.family_trees t
     WHERE t.id=$1 AND t.deleted_at IS NULL AND (
       t.owner_user_id=$2 OR EXISTS (
         SELECT 1 FROM app.tree_memberships m
         WHERE m.tree_id=t.id AND m.user_id=$2
           AND m.role IN ('owner','administrator','editor') AND m.revoked_at IS NULL
       )
     )`,
    [treeId, userId],
  );
  const branchAccess = membershipAccess.rowCount
    ? null
    : await client.query<{ root_subfamily_id: string }>(
        `SELECT root_subfamily_id FROM app.branch_grants
         WHERE tree_id=$1 AND user_id=$2 AND role='branch_editor'
           AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at>now())`,
        [treeId, userId],
      );
  if (!membershipAccess.rowCount && !branchAccess?.rowCount) throw new Error("FORBIDDEN");
  return {
    isBranchEditor: !membershipAccess.rowCount,
    branchRootId: branchAccess?.rows[0].root_subfamily_id ?? null,
  };
}

export async function completedSnapshotWrite(
  client: PoolClient,
  treeId: string,
  batchId: string,
): Promise<CompletedSnapshotWrite | undefined> {
  const priorBatch = await client.query<{ version: number }>(
    "SELECT app.saved_snapshot_version($1::uuid,$2::uuid) version",
    [treeId, batchId],
  );
  if (!priorBatch.rows[0]?.version) return undefined;
  return {
    batchId,
    mapped: 0,
    reconciled: true,
    version: Number(priorBatch.rows[0].version),
  };
}

export async function lockSnapshotVersion(
  client: PoolClient,
  treeId: string,
  suppliedVersion: number,
): Promise<number> {
  const expectedVersion = Number(suppliedVersion);
  if (!Number.isInteger(expectedVersion) || expectedVersion < 1)
    throw new ApiError("VERSION_REQUIRED", 428);
  const locked = await client.query<{ version: number }>(
    "SELECT version FROM app.family_trees WHERE id=$1 AND deleted_at IS NULL FOR UPDATE",
    [treeId],
  );
  if (!locked.rowCount) throw new ApiError("NOT_FOUND", 404);
  if (locked.rows[0].version !== expectedVersion) throw new ApiError("VERSION_CONFLICT", 409);
  return expectedVersion;
}
