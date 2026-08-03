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

function branchMemberIds(
  members: FamilyMember[],
  subfamilies: SubFamily[],
  subfamilyId: string,
): Set<string> {
  const subfamily = subfamilies.find((candidate) => candidate.id === subfamilyId);
  const branchIds = new Set<string>();
  const linkedMaleId = subfamily?.linked_male_id;
  const queue =
    linkedMaleId && members.some((member) => member.id === linkedMaleId) ? [linkedMaleId] : [];
  while (queue.length) {
    const id = queue.shift()!;
    if (branchIds.has(id)) continue;
    branchIds.add(id);
    for (const child of getChildren(members, id)) queue.push(child.id);
  }

  return new Set(
    members
      .filter((member) => member.subfamily_id === subfamilyId || branchIds.has(member.id))
      .map((member) => member.id),
  );
}

function hasVisibleHusbandLink(member: FamilyMember, husbandIds: Set<string>): boolean {
  if (member.spouse_id && husbandIds.has(member.spouse_id)) return true;
  return member.spouse_ids?.some((spouseId) => husbandIds.has(spouseId)) ?? false;
}

function includeVisibleHusbandsWives(members: FamilyMember[], visibleIds: Set<string>) {
  const visibleHusbands = members.filter(
    (member) => member.gender === "male" && visibleIds.has(member.id),
  );
  const husbandIds = new Set(visibleHusbands.map((member) => member.id));
  const memberById = new Map(members.map((member) => [member.id, member]));

  for (const husband of visibleHusbands) {
    if (husband.spouse_id && memberById.get(husband.spouse_id)?.gender === "female") {
      visibleIds.add(husband.spouse_id);
    }
    for (const spouseId of husband.spouse_ids ?? []) {
      if (memberById.get(spouseId)?.gender === "female") visibleIds.add(spouseId);
    }
  }

  const coParentWifeIds = new Set(
    members
      .filter((child) => child.father_id && husbandIds.has(child.father_id) && child.mother_id)
      .map((child) => child.mother_id!),
  );
  for (const candidate of members) {
    if (candidate.gender !== "female") continue;
    if (hasVisibleHusbandLink(candidate, husbandIds) || coParentWifeIds.has(candidate.id)) {
      visibleIds.add(candidate.id);
    }
  }
}

export function getSubfamilyMembers(
  members: FamilyMember[],
  subfamilies: SubFamily[],
  subfamilyId: string,
): FamilyMember[] {
  const visibleIds = branchMemberIds(members, subfamilies, subfamilyId);
  includeVisibleHusbandsWives(members, visibleIds);
  return members.filter((member) => visibleIds.has(member.id));
}
