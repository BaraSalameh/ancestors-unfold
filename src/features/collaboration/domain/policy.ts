export function activityRequestLimit(value: string | null): number {
  if (value === null || !/^\d+$/.test(value)) return 25;
  const requested = Number(value);
  return Math.min(100, Math.max(1, requested));
}

export function canDeleteContributorAccount(roles: readonly string[]): boolean {
  return roles.length > 0 && !roles.includes("owner");
}
