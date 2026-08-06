import { memberSpouses } from "./member-details";
import type { FamilyMember } from "./types";

export interface MemberDeletionPlan {
  selectedIds: string[];
  wifeIds: string[];
  protectedSelectedIds: string[];
  protectedWifeIds: string[];
}

export function memberDeletionPlan(
  selectedIds: Iterable<string>,
  members: FamilyMember[],
  isProtected: (id: string) => boolean = () => false,
): MemberDeletionPlan {
  const memberById = new Map(members.map((member) => [member.id, member]));
  const selected = [...new Set(selectedIds)].filter((id) => memberById.has(id));
  const selectedSet = new Set(selected);
  const wifeIds = new Set<string>();
  for (const id of selected) {
    const member = memberById.get(id)!;
    if (member.gender !== "male" || isProtected(id)) continue;
    const linkedWives = new Set([
      ...memberSpouses(member, members),
      ...(member.divorced_from ?? []).flatMap((wifeId) => {
        const wife = memberById.get(wifeId);
        return wife ? [wife] : [];
      }),
      ...members.filter((candidate) => candidate.divorced_from?.includes(member.id)),
    ]);
    for (const spouse of linkedWives) {
      if (spouse.gender === "female" && !selectedSet.has(spouse.id)) wifeIds.add(spouse.id);
    }
  }
  const protectedWifeIds = [...wifeIds].filter(isProtected);
  return {
    selectedIds: selected,
    wifeIds: [...wifeIds].filter((id) => !isProtected(id)),
    protectedSelectedIds: selected.filter(isProtected),
    protectedWifeIds,
  };
}
