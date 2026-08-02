import type { PoolClient } from "pg";
import { ApiError } from "@/server/security";

export async function requireTreeOwner(client: PoolClient, treeId: string, userId: string) {
  const result = await client.query(
    `SELECT 1 FROM app.tree_memberships WHERE tree_id=$1 AND user_id=$2
     AND role='owner' AND affiliation_status='active' AND revoked_at IS NULL`,
    [treeId, userId],
  );
  if (!result.rowCount) throw new ApiError("FORBIDDEN", 403);
}
