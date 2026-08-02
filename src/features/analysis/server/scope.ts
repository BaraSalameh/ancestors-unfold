import type { PoolClient } from "pg";
import { ApiError } from "@/server/security";
import type { AnalysisBranch, AnalysisScope } from "../domain/types";

type ScopeRow = {
  allowed: boolean;
  is_owner: boolean;
  assigned_branch_id: string | null;
  branch_name_en: string | null;
  branch_name_ar: string | null;
};

export async function resolveAnalysisScope(
  client: PoolClient,
  treeId: string,
  userId: string,
  requestedBranchId: string | null,
): Promise<AnalysisScope> {
  const access = await client.query<ScopeRow>(
    `SELECT app.can_view_tree(t.id) allowed,t.owner_user_id=$2 is_owner,
      g.root_subfamily_id assigned_branch_id,b.name_en branch_name_en,b.name_ar branch_name_ar
     FROM app.family_trees t
     LEFT JOIN app.branch_grants g ON g.tree_id=t.id AND g.user_id=$2
       AND g.revoked_at IS NULL AND (g.expires_at IS NULL OR g.expires_at>now())
     LEFT JOIN app.subfamilies b ON b.id=g.root_subfamily_id AND b.deleted_at IS NULL
     WHERE t.id=$1 AND t.deleted_at IS NULL`,
    [treeId, userId],
  );
  const row = access.rows[0];
  if (!row?.allowed) throw new ApiError("FORBIDDEN", 403);

  if (!row.is_owner) {
    if (!row.assigned_branch_id) throw new ApiError("ANALYSIS_SCOPE_UNAVAILABLE", 403);
    if (requestedBranchId && requestedBranchId !== row.assigned_branch_id)
      throw new ApiError("FORBIDDEN", 403);
    return {
      kind: "branch",
      treeId,
      branchId: row.assigned_branch_id,
      branchNameEn: row.branch_name_en,
      branchNameAr: row.branch_name_ar,
      role: "contributor",
    };
  }

  if (!requestedBranchId)
    return {
      kind: "tree",
      treeId,
      branchId: null,
      branchNameEn: null,
      branchNameAr: null,
      role: "owner",
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
    branchId: branch.rows[0].id,
    branchNameEn: branch.rows[0].name_en,
    branchNameAr: branch.rows[0].name_ar,
    role: "owner",
  };
}

export async function analysisBranches(client: PoolClient, scope: AnalysisScope) {
  if (scope.role === "contributor") {
    return [
      {
        id: scope.branchId!,
        name_en: scope.branchNameEn ?? "",
        name_ar: scope.branchNameAr,
      },
    ];
  }
  const result = await client.query<AnalysisBranch>(
    `SELECT id,name_en,name_ar FROM app.subfamilies
     WHERE tree_id=$1 AND deleted_at IS NULL ORDER BY created_at,id`,
    [scope.treeId],
  );
  return result.rows;
}
