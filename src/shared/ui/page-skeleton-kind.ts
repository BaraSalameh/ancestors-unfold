type PageSkeletonKind =
  | "dashboard"
  | "activity"
  | "profile"
  | "settings"
  | "subfamilies"
  | "add-member"
  | "edit-member"
  | "member"
  | "tree"
  | "auth"
  | "reset-password"
  | "invitation";

export function pageSkeletonKind(pathname: string): PageSkeletonKind {
  if (pathname === "/") return "dashboard";
  if (pathname === "/activity") return "activity";
  if (pathname === "/profile") return "profile";
  if (pathname === "/settings") return "settings";
  if (pathname === "/subfamilies") return "subfamilies";
  if (pathname === "/auth") return "auth";
  if (pathname === "/reset-password") return "reset-password";
  if (/^\/invitation\/[^/]+$/.test(pathname)) return "invitation";
  if (pathname === "/add" || /^\/tree\/[^/]+\/add$/.test(pathname)) return "add-member";
  if (/^\/edit\/[^/]+$/.test(pathname)) return "edit-member";
  if (/^\/member\/[^/]+$/.test(pathname)) return "member";
  if (/^\/tree\/[^/]+$/.test(pathname)) return "tree";
  return "auth";
}
