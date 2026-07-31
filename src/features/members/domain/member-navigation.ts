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
