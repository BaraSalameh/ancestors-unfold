import type { QueryClient } from "@tanstack/react-query";

export const dashboardQueryKeys = {
  all: ["dashboard"] as const,
  currentTree: ["dashboard", "current-tree"] as const,
  tree: (treeId: string) => ["dashboard", "tree", treeId] as const,
  statistics: (treeId: string) => ["dashboard", "tree", treeId, "statistics"] as const,
  branches: (treeId: string) => ["dashboard", "tree", treeId, "branches"] as const,
  activity: (treeId: string, lang: string) =>
    ["dashboard", "tree", treeId, "activity", lang] as const,
  invitations: (treeId: string) => ["dashboard", "tree", treeId, "invitations"] as const,
  ownershipTransfer: (treeId: string) =>
    ["dashboard", "tree", treeId, "ownership-transfer"] as const,
  insights: (treeId: string) => ["dashboard-insights", treeId] as const,
};

export async function invalidateDashboardQueries(queryClient: QueryClient, treeId?: string) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: dashboardQueryKeys.currentTree }),
    queryClient.invalidateQueries({
      queryKey: treeId ? dashboardQueryKeys.tree(treeId) : dashboardQueryKeys.all,
    }),
    queryClient.invalidateQueries({
      queryKey: treeId ? dashboardQueryKeys.insights(treeId) : ["dashboard-insights"],
    }),
  ]);
}
