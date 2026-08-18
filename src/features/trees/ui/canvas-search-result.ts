import type { FamilyMember } from "@/features/members";
import { memberPaternalSearchLabel } from "@/features/members";
import type { Lang } from "@/shared/i18n";

export function canvasSearchResultLabel(
  member: FamilyMember,
  membersById: ReadonlyMap<string, FamilyMember>,
  lang: Lang,
): string {
  return memberPaternalSearchLabel(member, membersById, lang);
}
