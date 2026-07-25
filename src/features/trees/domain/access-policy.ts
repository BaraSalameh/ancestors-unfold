export type TreeAccessScope = "tree" | "branch" | "preview";
export type TreeAccessMode = "edit" | "view" | "preview";

export function treeAccessPolicy(scope: TreeAccessScope, mode: TreeAccessMode) {
  return {
    canEdit: mode === "edit" && (scope === "tree" || scope === "branch"),
    canManageSubfamilies: scope === "tree",
  };
}
