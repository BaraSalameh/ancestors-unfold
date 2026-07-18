import type { FamilyMember, SubFamily } from "./types";

export const getChildren = (members: FamilyMember[], id: string) =>
  members.filter((member) => member.father_id === id || member.mother_id === id);

export function getGeneration(
  members: FamilyMember[],
  id: string,
  cache = new Map<string, number>(),
  visiting = new Set<string>(),
): number {
  if (cache.has(id)) return cache.get(id)!;
  if (visiting.has(id)) return 0;
  const member = members.find((candidate) => candidate.id === id);
  if (!member) return 0;
  visiting.add(id);
  const parents = [member.father_id, member.mother_id].filter(Boolean) as string[];
  const generation = parents.length
    ? Math.max(...parents.map((parent) => getGeneration(members, parent, cache, visiting))) + 1
    : 0;
  visiting.delete(id);
  cache.set(id, generation);
  return generation;
}

export function getSubfamilyMembers(
  members: FamilyMember[],
  subfamilies: SubFamily[],
  subfamilyId: string,
): FamilyMember[] {
  const subfamily = subfamilies.find((candidate) => candidate.id === subfamilyId);
  if (!subfamily?.linked_male_id || !members.some((m) => m.id === subfamily.linked_male_id)) {
    return members.filter((member) => member.subfamily_id === subfamilyId);
  }

  const branchIds = new Set<string>();
  const queue = [subfamily.linked_male_id];
  while (queue.length) {
    const id = queue.shift()!;
    if (branchIds.has(id)) continue;
    branchIds.add(id);
    for (const child of getChildren(members, id)) queue.push(child.id);
  }
  return members.filter(
    (member) => member.subfamily_id === subfamilyId || branchIds.has(member.id),
  );
}
