import { displayName, type Lang } from "@/shared/i18n";
import type { FamilyMember } from "@/features/members";

export function matchingMaleMember(
  members: FamilyMember[],
  value: string,
  lang: Lang,
): FamilyMember | undefined {
  const normalized = value.trim();
  const lower = normalized.toLowerCase();
  return members.find(
    (member) =>
      displayName(member, lang).toLowerCase() === lower ||
      member.name_en.toLowerCase() === lower ||
      member.name_ar === normalized,
  );
}
