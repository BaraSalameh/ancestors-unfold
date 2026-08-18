import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import { dashboardQueryKeys, invalidateDashboardQueries } from "./dashboard-queries";

describe("dashboard query invalidation", () => {
  it("invalidates each affected tree resource and both insight reports", async () => {
    const client = new QueryClient();
    const treeId = "tree-1";
    const affected = [
      dashboardQueryKeys.currentTree,
      dashboardQueryKeys.statistics(treeId),
      dashboardQueryKeys.branches(treeId),
      dashboardQueryKeys.activity(treeId, "en"),
      dashboardQueryKeys.invitations(treeId),
      dashboardQueryKeys.ownershipTransfer(treeId),
      [...dashboardQueryKeys.insights(treeId), "owner", null, "quality"],
      [...dashboardQueryKeys.insights(treeId), "owner", null, "branches"],
    ] as const;
    const unrelated = dashboardQueryKeys.statistics("tree-2");
    for (const key of affected) client.setQueryData(key, {});
    client.setQueryData(unrelated, {});

    await invalidateDashboardQueries(client, treeId);

    for (const key of affected) {
      expect(client.getQueryState(key)?.isInvalidated).toBe(true);
    }
    expect(client.getQueryState(unrelated)?.isInvalidated).toBe(false);
  });
});
