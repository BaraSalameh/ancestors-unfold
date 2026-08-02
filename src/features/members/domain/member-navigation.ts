export type MemberReturnMode = "edit" | "view" | "preview";
export type MemberReturnPreview = "lineage" | "chronological";

export interface MemberNavigationContext {
  treeId: string;
  returnMode: MemberReturnMode;
  returnPreview: MemberReturnPreview;
}

interface ParsedMemberNavigationSearch {
  treeId?: string;
  returnMode: MemberReturnMode;
  returnPreview: MemberReturnPreview;
}

export function parseMemberNavigationSearch(
  search: Record<string, unknown>,
): ParsedMemberNavigationSearch {
  return {
    treeId: typeof search.treeId === "string" && search.treeId ? search.treeId : undefined,
    returnMode: (search.returnMode === "preview" || search.returnMode === "view"
      ? search.returnMode
      : "edit") as MemberReturnMode,
    returnPreview:
      search.returnPreview === "chronological" ? ("chronological" as const) : ("lineage" as const),
  };
}

export function memberDetailsSearch(context: MemberNavigationContext) {
  return { ...context };
}

export function memberReturnDestination(context: MemberNavigationContext) {
  return {
    to: "/tree/$id" as const,
    params: { id: context.treeId },
    search: {
      mode: context.returnMode,
      ...(context.returnMode === "preview" ? { preview: context.returnPreview } : {}),
    },
  };
}

export function memberDeleteDestination(
  treeId: string,
  preview: "lineage" | "chronological" = "lineage",
) {
  return {
    to: "/tree/$id" as const,
    params: { id: treeId },
    search: { mode: "edit" as const, preview },
    replace: true,
  };
}
