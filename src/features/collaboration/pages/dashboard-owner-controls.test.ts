import { describe, expect, it } from "vitest";
import {
  activeContributorBranches,
  canUseOwnerTreeControls,
  canUseTreePreviewControls,
  shouldRefreshDashboard,
} from "./dashboard-owner-controls";

describe("dashboard owner controls", () => {
  it("allows only the tree owner to use owner controls", () => {
    expect(canUseOwnerTreeControls("owner")).toBe(true);
    expect(canUseOwnerTreeControls("contributor")).toBe(false);
  });

  it("allows owners and contributors to use preview controls", () => {
    expect(canUseTreePreviewControls("owner")).toBe(true);
    expect(canUseTreePreviewControls("contributor")).toBe(true);
  });

  it("offers cancellation only for active branches with a contributor", () => {
    const branches = [
      { id: "active", status: "active", contributor_user_id: "user-1" },
      { id: "unassigned", status: "active", contributor_user_id: null },
      { id: "inactive", status: "inactive", contributor_user_id: "user-2" },
    ];
    expect(activeContributorBranches(branches)).toEqual([branches[0]]);
  });

  it("refreshes only when a visible dashboard is stale", () => {
    expect(shouldRefreshDashboard("visible", 1_000, 61_000, 60_000)).toBe(true);
    expect(shouldRefreshDashboard("visible", 1_000, 60_999, 60_000)).toBe(false);
    expect(shouldRefreshDashboard("hidden", 1_000, 100_000, 60_000)).toBe(false);
  });
});
