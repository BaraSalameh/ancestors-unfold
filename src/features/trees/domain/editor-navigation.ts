export function isTreeEditorDestination(
  pathname: string,
  search: { mode?: string },
  activeTreeId: string,
): boolean {
  const activeTreePath = `/tree/${activeTreeId}`;
  return (
    (pathname === activeTreePath && search.mode === "edit") ||
    pathname.startsWith(`${activeTreePath}/`) ||
    /^\/(edit|member)\//.test(pathname) ||
    pathname === "/add" ||
    pathname === "/subfamilies"
  );
}
