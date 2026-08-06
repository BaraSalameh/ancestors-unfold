import type { FamilyMember } from "./types";
import { getChildren } from "./queries";

export interface DescendantEntry {
  member: FamilyMember;
  depth: number;
  parentId: string;
  hasDescendants: boolean;
}

export function visibleDescendantEntries(
  descendants: DescendantEntry[],
  collapsedParentIds: ReadonlySet<string>,
): DescendantEntry[] {
  const parentByMember = new Map(descendants.map((entry) => [entry.member.id, entry.parentId]));
  return descendants.filter((entry) => {
    let parentId = entry.parentId;
    while (parentByMember.has(parentId)) {
      if (collapsedParentIds.has(parentId)) return false;
      parentId = parentByMember.get(parentId)!;
    }
    return true;
  });
}

function linkedSpouseIds(member: FamilyMember, members: FamilyMember[]): Set<string> {
  const ids = new Set(member.spouse_ids ?? []);
  if (member.spouse_id) ids.add(member.spouse_id);

  for (const candidate of members) {
    if (member.gender === "male" && candidate.father_id === member.id && candidate.mother_id) {
      ids.add(candidate.mother_id);
    }
    if (member.gender === "female" && candidate.mother_id === member.id && candidate.father_id) {
      ids.add(candidate.father_id);
    }
  }
  return ids;
}

export function memberSpouses(member: FamilyMember, members: FamilyMember[]): FamilyMember[] {
  const byId = new Map(members.map((candidate) => [candidate.id, candidate]));
  return [...linkedSpouseIds(member, members)]
    .map((id) => byId.get(id))
    .filter((candidate): candidate is FamilyMember => candidate !== undefined);
}

export function paternalAncestors(member: FamilyMember, members: FamilyMember[]): FamilyMember[] {
  const byId = new Map(members.map((candidate) => [candidate.id, candidate]));
  const ancestors: FamilyMember[] = [];
  let current = member;
  while (current.father_id) {
    const father = byId.get(current.father_id);
    if (!father) break;
    ancestors.push(father);
    current = father;
  }
  return ancestors;
}

export function memberDescendants(
  member: FamilyMember,
  members: FamilyMember[],
): DescendantEntry[] {
  const descendants: DescendantEntry[] = [];
  const parentIds = new Set<string>();
  for (const candidate of members) {
    if (candidate.father_id) parentIds.add(candidate.father_id);
    if (candidate.mother_id) parentIds.add(candidate.mother_id);
  }
  const visit = (parentId: string, depth: number) => {
    for (const child of getChildren(members, parentId)) {
      descendants.push({
        member: child,
        depth,
        parentId,
        hasDescendants: parentIds.has(child.id),
      });
      visit(child.id, depth + 1);
    }
  };
  visit(member.id, 1);
  return descendants;
}
