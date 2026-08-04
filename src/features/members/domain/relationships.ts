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

export function ensureParentsAreSpouses(
  members: FamilyMember[],
  childId: string,
  updatedAt: string,
): FamilyMember[] {
  const child = members.find((member) => member.id === childId);
  if (!child?.father_id || !child.mother_id) return members;
  return linkSpouses(members, child.father_id, child.mother_id, updatedAt);
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

type ParentRole = "father_id" | "mother_id";

export function detachParentRelationship(
  members: FamilyMember[],
  memberId: string,
  role: ParentRole,
  updatedAt: string,
): FamilyMember[] {
  return members.map((member) =>
    member.id === memberId && member[role]
      ? { ...member, [role]: undefined, updated_at: updatedAt }
      : member,
  );
}

export function setMotherRelationship(
  members: FamilyMember[],
  childId: string,
  motherId: string | undefined,
  updatedAt: string,
): FamilyMember[] {
  const updated = members.map((member) =>
    member.id === childId ? { ...member, mother_id: motherId, updated_at: updatedAt } : member,
  );
  return motherId ? ensureParentsAreSpouses(updated, childId, updatedAt) : updated;
}

export function removeSpouseAttachment(
  members: FamilyMember[],
  husbandId: string,
  wifeId: string,
  updatedAt: string,
): FamilyMember[] {
  const husband = members.find((member) => member.id === husbandId);
  const wife = members.find((member) => member.id === wifeId);
  if (husband?.gender !== "male" || wife?.gender !== "female") return members;

  const isIndependentChild = Boolean(wife.father_id || wife.mother_id);
  const detached = members.map((member) => {
    if (member.id === husbandId) {
      return {
        ...member,
        spouse_id: member.spouse_id === wifeId ? undefined : member.spouse_id,
        spouse_ids: removeValue(member.spouse_ids, wifeId),
        divorced_from: removeValue(member.divorced_from, wifeId),
        updated_at: updatedAt,
      };
    }
    if (member.id === wifeId) {
      return {
        ...member,
        spouse_id: member.spouse_id === husbandId ? undefined : member.spouse_id,
        divorced_from: removeValue(member.divorced_from, husbandId),
        updated_at: updatedAt,
      };
    }
    if (member.father_id === husbandId && member.mother_id === wifeId) {
      return { ...member, mother_id: undefined, updated_at: updatedAt };
    }
    return member;
  });

  return isIndependentChild ? detached : removeMember(detached, wifeId);
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

export function descendantIds(members: FamilyMember[], rootId: string): string[] {
  const descendants: string[] = [];
  const visited = new Set<string>();
  const queue = [rootId];
  while (queue.length) {
    const id = queue.shift()!;
    if (visited.has(id)) continue;
    visited.add(id);
    descendants.push(id);
    for (const member of members) {
      if (member.father_id === id || member.mother_id === id) queue.push(member.id);
    }
  }
  return descendants;
}
