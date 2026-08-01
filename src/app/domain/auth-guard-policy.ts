import { isPublicPreviewRoute } from "./public-route";

export function mayAccessRoute(
  pathname: string,
  search: Record<string, unknown>,
  authenticated: boolean,
) {
  if (authenticated || isPublicPreviewRoute(pathname, search)) return true;
  return (
    pathname === "/auth" || pathname === "/reset-password" || pathname.startsWith("/invitation/")
  );
}

export function guardedRedirect(pathname: string, href: string) {
  const query = href.includes("?") ? `?${href.split("?")[1]}` : "";
  return `${pathname}${query}`;
}

export function currentTreeDisplayName(
  tree: { nameEn: string | null; nameAr: string | null } | null | undefined,
  lang: "en" | "ar",
) {
  if (!tree) return undefined;
  return (lang === "ar" ? tree.nameAr || tree.nameEn : tree.nameEn || tree.nameAr) || undefined;
}
