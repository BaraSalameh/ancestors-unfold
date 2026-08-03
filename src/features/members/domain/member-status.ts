import type { FamilyMember } from "./types";

export function isMemberDeceased(
  member: Pick<FamilyMember, "is_deceased" | "death_date">,
): boolean {
  return member.is_deceased ?? Boolean(member.death_date);
}
