import type { FamilyMember } from "./types";

const addUnique = (values: string[] | undefined, id: string) =>
  values?.includes(id) ? values : [...(values ?? []), id];

const removeValue = (values: string[] | undefined, id: string) =>
  (values ?? []).filter((value) => value !== id);

export function linkSpouses(
  members: FamilyMember[],
  maleId: string,
  femaleId: string,
  updatedAt: string,
): FamilyMember[] {
  const male = members.find((member) => member.id === maleId);
  const female = members.find((member) => member.id === femaleId);
  if (male?.gender !== "male" || female?.gender !== "female") return members;

  return members.map((member) => {
    if (member.id === maleId) {
      return {
        ...member,
        spouse_ids: addUnique(member.spouse_ids, femaleId),
        spouse_id: member.spouse_id ?? femaleId,
        updated_at: updatedAt,
      };
    }
    if (member.id === femaleId) {
      return { ...member, spouse_id: member.spouse_id ?? maleId, updated_at: updatedAt };
    }
    return member;
  });
}

export function toggleDivorce(
  members: FamilyMember[],
  firstId: string,
  secondId: string,
  updatedAt: string,
): FamilyMember[] {
  const first = members.find((member) => member.id === firstId);
  if (!first) return members;
  const divorced = first.divorced_from?.includes(secondId) ?? false;

  return members.map((member) => {
    if (member.id !== firstId && member.id !== secondId) return member;
    const otherId = member.id === firstId ? secondId : firstId;
    return {
      ...member,
      divorced_from: divorced
        ? removeValue(member.divorced_from, otherId)
        : addUnique(member.divorced_from, otherId),
      updated_at: updatedAt,
    };
  });
}

export function removeMember(members: FamilyMember[], id: string): FamilyMember[] {
  return members
    .filter((member) => member.id !== id)
    .map((member) => ({
      ...member,
      father_id: member.father_id === id ? undefined : member.father_id,
      mother_id: member.mother_id === id ? undefined : member.mother_id,
      spouse_id: member.spouse_id === id ? undefined : member.spouse_id,
      spouse_ids: member.spouse_ids?.filter((value) => value !== id),
      divorced_from: member.divorced_from?.filter((value) => value !== id),
    }));
}

export function isDescendant(
  members: FamilyMember[],
  ancestorId: string,
  targetId: string,
): boolean {
  const visited = new Set<string>();
  const queue = [ancestorId];
  while (queue.length) {
    const id = queue.shift()!;
    if (visited.has(id)) continue;
    visited.add(id);
    for (const child of members.filter((m) => m.father_id === id || m.mother_id === id)) {
      if (child.id === targetId) return true;
      queue.push(child.id);
    }
  }
  return false;
}
