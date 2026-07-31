export function isPublicPreviewRoute(pathname: string, search: Record<string, unknown>): boolean {
  if (pathname.startsWith("/tree/")) return search.mode === "preview";
  return (
    /^\/member\/[^/]+$/.test(pathname) &&
    search.returnMode === "preview" &&
    typeof search.treeId === "string" &&
    search.treeId.length > 0
  );
}
