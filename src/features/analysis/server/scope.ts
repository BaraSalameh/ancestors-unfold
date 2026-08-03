import type { PoolClient } from "pg";
import { ApiError } from "@/server/security";
import type { AnalysisBranch, AnalysisScope } from "../domain/types";

type ScopeRow = {
  allowed: boolean;
  is_owner: boolean;
  tree_name_en: string | null;
  tree_name_ar: string | null;
};

export async function resolveAnalysisScope(
  client: PoolClient,
  treeId: string,
  userId: string,
  requestedBranchId: string | null,
): Promise<AnalysisScope> {
  const access = await client.query<ScopeRow>(
    `SELECT app.can_analyze_tree(t.id) allowed,t.owner_user_id=$2 is_owner,
      t.name_en tree_name_en,t.name_ar tree_name_ar
     FROM app.family_trees t
     WHERE t.id=$1 AND t.deleted_at IS NULL`,
    [treeId, userId],
  );
  const row = access.rows[0];
  if (!row?.allowed) throw new ApiError("FORBIDDEN", 403);
  const role = row.is_owner ? "owner" : "contributor";

  if (!requestedBranchId)
    return {
      kind: "tree",
      treeId,
      treeNameEn: row.tree_name_en,
      treeNameAr: row.tree_name_ar,
      branchId: null,
      branchNameEn: null,
      branchNameAr: null,
      role,
    };

  const branch = await client.query<AnalysisBranch>(
    `SELECT id,name_en,name_ar FROM app.subfamilies
     WHERE tree_id=$1 AND id=$2 AND deleted_at IS NULL`,
    [treeId, requestedBranchId],
  );
  if (!branch.rowCount) throw new ApiError("BRANCH_NOT_FOUND", 404);
  return {
    kind: "branch",
    treeId,
    treeNameEn: row.tree_name_en,
    treeNameAr: row.tree_name_ar,
    branchId: branch.rows[0].id,
    branchNameEn: branch.rows[0].name_en,
    branchNameAr: branch.rows[0].name_ar,
    role,
  };
}

export async function analysisBranches(client: PoolClient, scope: AnalysisScope) {
  const result = await client.query<AnalysisBranch>(
    `SELECT id,name_en,name_ar FROM app.subfamilies
     WHERE tree_id=$1 AND deleted_at IS NULL ORDER BY created_at,id`,
    [scope.treeId],
  );
  return result.rows;
}
