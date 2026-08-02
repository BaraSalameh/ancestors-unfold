export function canUseOwnerTreeControls(role: "owner" | "contributor"): boolean {
  return role === "owner";
}

export function canUseTreePreviewControls(role: "owner" | "contributor"): boolean {
  return role === "owner" || role === "contributor";
}

export function activeContributorBranches<
  T extends { status: string; contributor_user_id: string | null },
>(branches: T[]): T[] {
  return branches.filter(
    (branch) => branch.status === "active" && Boolean(branch.contributor_user_id),
  );
}

export function shouldRefreshDashboard(
  visibilityState: DocumentVisibilityState,
  cacheUpdatedAt: number,
  now: number,
  staleAfterMs: number,
): boolean {
  return visibilityState === "visible" && now - cacheUpdatedAt >= staleAfterMs;
}
