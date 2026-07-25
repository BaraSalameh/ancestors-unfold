export function contributorSubfamilyAccess(
  role: "owner" | "contributor",
  assignedBranchId: string | null,
): { readOnly: boolean; allowedSubfamilyId?: string } {
  return role === "owner"
    ? { readOnly: false }
    : { readOnly: true, allowedSubfamilyId: assignedBranchId ?? undefined };
}
