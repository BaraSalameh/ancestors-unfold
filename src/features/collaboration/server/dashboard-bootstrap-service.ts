import { analysisReport } from "@/features/analysis/server";
import { readActivityPage } from "@/features/activity/server";
import { ApiError } from "@/server/security";
import { serverConfig } from "@/shared/server/config";
import { currentTreeForSession } from "./current-tree-repository";
import { readTreeInvitations } from "./invitation-handler";
import { readPendingOwnershipTransfer } from "./ownership-transfer-handler";
import { readTreeBranches, readTreeStatistics } from "./tree-overview-handler";
import type { CollaborationSession } from "./types";

async function readDashboardInsights(
  tree: { id: string; role: string; assigned_branch_id: string | null },
  session: CollaborationSession,
  requestId: string,
) {
  const branchId = tree.role === "contributor" ? tree.assigned_branch_id : null;
  const enabled = serverConfig.ANALYSIS_ENABLED && (tree.role === "owner" || Boolean(branchId));
  if (!enabled) return { quality: undefined, branches: [] };
  const [quality, branches] = await Promise.all([
    analysisReport(session, requestId, tree.id, branchId, "quality"),
    analysisReport(session, requestId, tree.id, branchId, "branches"),
  ]);
  return { quality: quality.data, branches: branches.data };
}

export async function readDashboardBootstrap(
  session: CollaborationSession,
  requestId: string,
  locale: "en" | "ar",
) {
  const current = await currentTreeForSession(session, requestId);
  const currentTree = current.rows[0];
  if (!currentTree) throw new ApiError("TREE_UNAVAILABLE", 404);
  const tree = { ...currentTree, analysis_enabled: serverConfig.ANALYSIS_ENABLED };
  const [statistics, branches, activity, invitations, ownershipTransfer, insights] =
    await Promise.all([
      readTreeStatistics(tree.id, session, requestId),
      readTreeBranches(tree.id, session, requestId),
      readActivityPage(session, requestId, {
        treeId: tree.id,
        limit: 5,
        cursor: null,
        query: "",
        locale,
      }),
      tree.role === "owner" ? readTreeInvitations(tree.id, session, requestId) : [],
      readPendingOwnershipTransfer(tree.id, session, requestId),
      readDashboardInsights(tree, session, requestId),
    ]);
  return {
    locale,
    tree,
    statistics,
    branches,
    activity: activity.items,
    invitations,
    ownershipTransfer,
    insights,
  };
}
