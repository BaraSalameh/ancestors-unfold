export function canDeleteContributorAccount(roles: readonly string[]): boolean {
  return roles.length > 0 && !roles.includes("owner");
}
