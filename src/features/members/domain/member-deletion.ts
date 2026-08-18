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
  const spouseIdsByMember = new Map<string, Set<string>>();
  const link = (firstId: string | undefined, secondId: string | undefined) => {
    if (!firstId || !secondId || firstId === secondId) return;
    const first = spouseIdsByMember.get(firstId) ?? new Set<string>();
    const second = spouseIdsByMember.get(secondId) ?? new Set<string>();
    first.add(secondId);
    second.add(firstId);
    spouseIdsByMember.set(firstId, first);
    spouseIdsByMember.set(secondId, second);
  };
  for (const member of members) {
    link(member.id, member.spouse_id);
    for (const spouseId of member.spouse_ids ?? []) link(member.id, spouseId);
    for (const spouseId of member.divorced_from ?? []) link(member.id, spouseId);
    link(member.father_id, member.mother_id);
  }
  const wifeIds = new Set<string>();
  for (const id of selected) {
    const member = memberById.get(id)!;
    if (member.gender !== "male" || isProtected(id)) continue;
    for (const spouseId of spouseIdsByMember.get(id) ?? []) {
      const spouse = memberById.get(spouseId);
      if (!spouse) continue;
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
