import { describe, expect, it } from "vitest";
import {
  canEditDashboardTree,
  dashboardAttentionItems,
  dashboardBranches,
  dashboardKpis,
  dashboardRelativeTime,
} from "./dashboard-projections";
import type {
  CurrentTree,
  DashboardData,
  DashboardQualityInsights,
  Statistics,
} from "./dashboard-types";

const tree: CurrentTree = {
  id: "tree-1",
  name_en: "Family",
  name_ar: "العائلة",
  created_at: "2026-01-01T00:00:00Z",
  version: 1,
  role: "owner",
  affiliation_status: "active",
  assigned_branch_id: null,
  analysis_enabled: true,
};

const stats = {
  total_members: 120,
  active_contributors: 3,
  managed_branches: 3,
  total_branches: 5,
  serious_complaints: 0,
  last_contribution_at: "2026-08-02T12:00:00Z",
} as Statistics;

const quality: DashboardQualityInsights = {
  total: 120,
  missing_name_en: 4,
  missing_name_ar: 3,
  missing_birth_date: 9,
  missing_branch: 2,
  missing_image: 10,
  unknown_placeholders: 0,
  no_parents_recorded: 0,
  missing_parent: 0,
  possible_duplicate_groups: 2,
  contradictory_dates: 1,
  graph_cycles: 1,
};

function dashboard(overrides: Partial<DashboardData> = {}): DashboardData {
  return {
    tree,
    stats,
    branches: [],
    invitations: [],
    activity: [],
    ownershipTransfer: null,
    ...overrides,
  };
}

describe("dashboard projections", () => {
  it("selects role-specific KPIs", () => {
    expect(dashboardKpis(tree, stats, undefined).map((item) => item.kind)).toEqual([
      "members",
      "contributors",
      "branches",
      "last_activity",
    ]);
    expect(
      dashboardKpis({ ...tree, role: "contributor", assigned_branch_id: "branch-1" }, stats, {
        id: "branch-1",
        name_en: "Branch",
        name_ar: null,
        total: 24,
        completeness_percent: 75,
      }).map((item) => item.value),
    ).toEqual([24, "75%", 120, stats.last_contribution_at]);
  });

  it("prioritizes critical and owner collaboration tasks and caps the queue", () => {
    const items = dashboardAttentionItems(
      dashboard({
        stats: { ...stats, serious_complaints: 2 },
        invitations: [{ status: "pending" }, { status: "pending" }] as DashboardData["invitations"],
        branches: [{ status: "inactive" }] as DashboardData["branches"],
      }),
      quality,
    );
    expect(items).toHaveLength(5);
    expect(items.map((item) => item.id)).toEqual([
      "authenticity_review",
      "graph_cycles",
      "contradictory_dates",
      "pending_invitations",
      "inactive_branches",
    ]);
  });

  it("returns an empty queue when no signals need attention", () => {
    const emptyQuality = Object.fromEntries(
      Object.keys(quality).map((key) => [key, key === "total" ? 120 : 0]),
    ) as unknown as DashboardQualityInsights;
    expect(dashboardAttentionItems(dashboard(), emptyQuality)).toEqual([]);
  });

  it("never reports missing branch assignment to contributors", () => {
    const branchOnlyQuality = Object.fromEntries(
      Object.keys(quality).map((key) => [key, key === "total" ? 24 : 0]),
    ) as unknown as DashboardQualityInsights;
    branchOnlyQuality.missing_branch = 7;
    branchOnlyQuality.missing_image = 1;

    const items = dashboardAttentionItems(
      dashboard({
        tree: { ...tree, role: "contributor", assigned_branch_id: "branch-1" },
      }),
      branchOnlyQuality,
    );

    expect(items.map((item) => item.id)).toEqual(["missing_image"]);
  });

  it("orders owner branches by inactive status and completeness and scopes contributors", () => {
    const branches = [
      { id: "healthy", name_en: "Healthy", status: "active" },
      { id: "inactive", name_en: "Inactive", status: "inactive" },
      { id: "needs-work", name_en: "Needs work", status: "active" },
    ] as DashboardData["branches"];
    const health = [
      { id: "healthy", name_en: "Healthy", name_ar: null, total: 10, completeness_percent: 90 },
      { id: "inactive", name_en: "Inactive", name_ar: null, total: 10, completeness_percent: 80 },
      {
        id: "needs-work",
        name_en: "Needs work",
        name_ar: null,
        total: 10,
        completeness_percent: 40,
      },
    ];
    expect(dashboardBranches(tree, branches, health).map((branch) => branch.id)).toEqual([
      "inactive",
      "needs-work",
      "healthy",
    ]);
    expect(
      dashboardBranches(
        { ...tree, role: "contributor", assigned_branch_id: "healthy" },
        branches,
        health,
      ).map((branch) => branch.id),
    ).toEqual(["healthy"]);
  });

  it("gates editing by affiliation and formats localized relative activity", () => {
    expect(canEditDashboardTree(tree)).toBe(true);
    expect(canEditDashboardTree({ affiliation_status: "read_only" })).toBe(false);
    expect(
      dashboardRelativeTime("2026-08-02T12:00:00Z", "en", Date.parse("2026-08-03T12:00:00Z")),
    ).toBe("yesterday");
    expect(
      dashboardRelativeTime("2026-08-02T12:00:00Z", "ar", Date.parse("2026-08-03T12:00:00Z")),
    ).not.toBeNull();
  });
});
