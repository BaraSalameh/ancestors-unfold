export function canUseOwnerTreeControls(role: "owner" | "contributor"): boolean {
  return role === "owner";
}
