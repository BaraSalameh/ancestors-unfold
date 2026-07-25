export function memberDeleteDestination(treeId: string) {
  return {
    to: "/tree/$id" as const,
    params: { id: treeId },
    search: { mode: "edit" as const },
    replace: true,
  };
}
