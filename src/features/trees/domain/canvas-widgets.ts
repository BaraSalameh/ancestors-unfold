export const CANVAS_NAVIGATION_ZOOM_STEP = 2;
export const CANVAS_NAVIGATION_MAP_WIDTH = 272;

export function branchesWidgetVisible(canManageBranches: boolean, overviewMode: boolean): boolean {
  return canManageBranches || overviewMode;
}

export function registeredMembersLabelKey(count: number) {
  return count === 1 ? "registered_members_one" : "registered_members_many";
}
