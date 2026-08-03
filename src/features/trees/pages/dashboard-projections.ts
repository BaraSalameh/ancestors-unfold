import type {
  Branch,
  CurrentTree,
  DashboardBranchHealth,
  DashboardData,
  DashboardQualityInsights,
  OwnershipTransfer,
  Statistics,
} from "./dashboard-types";

type DashboardKpiKind =
  "members" | "contributors" | "branches" | "branch_members" | "completeness" | "last_activity";

type DashboardKpi = {
  kind: DashboardKpiKind;
  value: number | string | null;
};

export type AttentionSeverity = "critical" | "warning" | "info";

export type AttentionItem = {
  id:
    | "access"
    | "ownership_transfer"
    | "authenticity_review"
    | "graph_cycles"
    | "contradictory_dates"
    | "pending_invitations"
    | "inactive_branches"
    | "possible_duplicates"
    | "missing_name_en"
    | "missing_name_ar"
    | "missing_birth_date"
    | "missing_branch"
    | "missing_image";
  count: number;
  severity: AttentionSeverity;
  anchor?: "ownership-transfer" | "authenticity" | "pending-invitations" | "branches";
  analysis?: {
    tab: "quality" | "explorer";
    missingField?: "name_en" | "name_ar" | "birth_date" | "branch" | "image";
  };
};

export function canEditDashboardTree(tree: Pick<CurrentTree, "affiliation_status">): boolean {
  return tree.affiliation_status === "active";
}

export function dashboardRelativeTime(
  value: string | null,
  locale: "en" | "ar",
  now = Date.now(),
): string | null {
  if (!value) return null;
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return null;
  const elapsedSeconds = Math.round((timestamp - now) / 1000);
  const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ["year", 31_536_000],
    ["month", 2_592_000],
    ["week", 604_800],
    ["day", 86_400],
    ["hour", 3_600],
    ["minute", 60],
  ];
  const [unit, divisor] =
    units.find(([, seconds]) => Math.abs(elapsedSeconds) >= seconds) ?? (["second", 1] as const);
  return new Intl.RelativeTimeFormat(locale, { numeric: "auto" }).format(
    Math.round(elapsedSeconds / divisor),
    unit,
  );
}

export function dashboardKpis(
  tree: CurrentTree,
  stats: Statistics,
  assignedBranch: DashboardBranchHealth | undefined,
): DashboardKpi[] {
  if (tree.role === "owner") {
    return [
      { kind: "members", value: stats.total_members },
      { kind: "contributors", value: stats.active_contributors },
      { kind: "branches", value: `${stats.managed_branches}/${stats.total_branches}` },
      { kind: "last_activity", value: stats.last_contribution_at },
    ];
  }
  return [
    { kind: "branch_members", value: assignedBranch?.total ?? null },
    {
      kind: "completeness",
      value:
        assignedBranch?.completeness_percent === undefined
          ? null
          : `${assignedBranch.completeness_percent}%`,
    },
    { kind: "members", value: stats.total_members },
    { kind: "last_activity", value: stats.last_contribution_at },
  ];
}

function transferNeedsAction(tree: CurrentTree, transfer: OwnershipTransfer | null) {
  if (!transfer) return false;
  return tree.role === "owner" ? !transfer.verified : transfer.verified;
}

export function dashboardAttentionItems(
  data: DashboardData,
  quality?: DashboardQualityInsights,
): AttentionItem[] {
  const items: AttentionItem[] = [];
  const add = (item: AttentionItem) => {
    if (item.count > 0) items.push(item);
  };
  if (!canEditDashboardTree(data.tree)) add({ id: "access", count: 1, severity: "critical" });
  if (transferNeedsAction(data.tree, data.ownershipTransfer))
    add({
      id: "ownership_transfer",
      count: 1,
      severity: "critical",
      anchor: "ownership-transfer",
    });
  add({
    id: "authenticity_review",
    count: data.stats.serious_complaints,
    severity: "critical",
    anchor: "authenticity",
  });
  add({
    id: "graph_cycles",
    count: quality?.graph_cycles ?? 0,
    severity: "critical",
    analysis: { tab: "quality" },
  });
  add({
    id: "contradictory_dates",
    count: quality?.contradictory_dates ?? 0,
    severity: "critical",
    analysis: { tab: "quality" },
  });
  if (data.tree.role === "owner") {
    add({
      id: "pending_invitations",
      count: data.invitations.filter((invitation) => invitation.status === "pending").length,
      severity: "warning",
      anchor: "pending-invitations",
    });
    add({
      id: "inactive_branches",
      count: data.branches.filter((branch) => branch.status !== "active").length,
      severity: "warning",
      anchor: "branches",
    });
  }
  add({
    id: "possible_duplicates",
    count: quality?.possible_duplicate_groups ?? 0,
    severity: "warning",
    analysis: { tab: "quality" },
  });
  const missing: Array<
    [AttentionItem["id"], keyof DashboardQualityInsights, AttentionItem["analysis"]]
  > = [
    ["missing_name_en", "missing_name_en", { tab: "explorer", missingField: "name_en" }],
    ["missing_name_ar", "missing_name_ar", { tab: "explorer", missingField: "name_ar" }],
    ["missing_birth_date", "missing_birth_date", { tab: "explorer", missingField: "birth_date" }],
    ["missing_image", "missing_image", { tab: "explorer", missingField: "image" }],
  ];
  if (data.tree.role === "owner") {
    missing.splice(3, 0, [
      "missing_branch",
      "missing_branch",
      { tab: "explorer", missingField: "branch" },
    ]);
  }
  for (const [id, key, analysis] of missing) {
    add({ id, count: quality?.[key] ?? 0, severity: "info", analysis });
  }
  return items.slice(0, 5);
}

export function dashboardBranches(
  tree: CurrentTree,
  branches: Branch[],
  health: DashboardBranchHealth[],
): Branch[] {
  const visible =
    tree.role === "owner"
      ? [...branches]
      : branches.filter((branch) => branch.id === tree.assigned_branch_id);
  const healthById = new Map(health.map((branch) => [branch.id, branch]));
  return visible.sort((left, right) => {
    const statusDifference = Number(left.status === "active") - Number(right.status === "active");
    if (statusDifference !== 0) return statusDifference;
    const leftCompleteness = healthById.get(left.id)?.completeness_percent ?? 101;
    const rightCompleteness = healthById.get(right.id)?.completeness_percent ?? 101;
    if (leftCompleteness !== rightCompleteness) return leftCompleteness - rightCompleteness;
    return left.name_en.localeCompare(right.name_en);
  });
}
