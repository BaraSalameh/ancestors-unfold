import { memberPaternalSearchLabel, type FamilyMember } from "@/features/members/domain";
import type { Lang } from "@/shared/i18n";

export function canvasSearchResultLabel(
  member: FamilyMember,
  membersById: ReadonlyMap<string, FamilyMember>,
  lang: Lang,
): string {
  return memberPaternalSearchLabel(member, membersById, lang);
}
