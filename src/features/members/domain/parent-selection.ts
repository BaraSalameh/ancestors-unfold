import type { FamilyMember, Gender } from "./types";

function husbandIdsForFemale(
  members: FamilyMember[],
  femaleId: string,
  byId: ReadonlyMap<string, FamilyMember>,
): Set<string> {
  const husbandIds = new Set<string>();
  const directSpouseId = byId.get(femaleId)?.spouse_id;
  if (directSpouseId && byId.get(directSpouseId)?.gender === "male") {
    husbandIds.add(directSpouseId);
  }

  for (const member of members) {
    const isExplicitHusband =
      member.gender === "male" &&
      (member.spouse_id === femaleId || member.spouse_ids?.includes(femaleId));
    if (isExplicitHusband) husbandIds.add(member.id);
    if (member.mother_id === femaleId && member.father_id) husbandIds.add(member.father_id);
  }
  return husbandIds;
}

function addAncestorIds(
  initialIds: ReadonlySet<string>,
  byId: ReadonlyMap<string, FamilyMember>,
): Set<string> {
  const result = new Set(initialIds);
  const queue = [...initialIds];
  while (queue.length) {
    const current = byId.get(queue.shift()!);
    for (const parentId of [current?.father_id, current?.mother_id]) {
      if (!parentId || result.has(parentId)) continue;
      result.add(parentId);
      queue.push(parentId);
    }
  }
  return result;
}

function siblingIds(
  members: FamilyMember[],
  memberId: string,
  byId: ReadonlyMap<string, FamilyMember>,
): Set<string> {
  const member = byId.get(memberId);
  const parentIds = new Set([member?.father_id, member?.mother_id].filter(Boolean));
  if (!parentIds.size) return new Set();

  return new Set(
    members
      .filter(
        (candidate) =>
          candidate.id !== memberId &&
          [candidate.father_id, candidate.mother_id].some(
            (parentId) => parentId && parentIds.has(parentId),
          ),
      )
      .map(({ id }) => id),
  );
}

function addSiblingsAndTheirChildren(
  result: Set<string>,
  subjectIds: Iterable<string>,
  members: FamilyMember[],
  byId: ReadonlyMap<string, FamilyMember>,
): void {
  const siblings = new Set<string>();
  for (const subjectId of subjectIds) {
    for (const siblingId of siblingIds(members, subjectId, byId)) siblings.add(siblingId);
  }

  for (const siblingId of siblings) {
    result.add(siblingId);
    for (const member of members) {
      if (member.father_id === siblingId || member.mother_id === siblingId) result.add(member.id);
    }
  }
}

export function invalidFatherIdsForFemale(members: FamilyMember[], femaleId: string): Set<string> {
  const byId = new Map(members.map((member) => [member.id, member]));
  const husbandIds = husbandIdsForFemale(members, femaleId, byId);
  const result = addAncestorIds(husbandIds, byId);
  addSiblingsAndTheirChildren(result, [femaleId, ...husbandIds], members, byId);
  return result;
}

export function eligibleParentCandidates({
  members,
  memberId,
  birthDate,
  gender,
  excludedIds,
}: {
  members: FamilyMember[];
  memberId?: string;
  birthDate?: string;
  gender: Extract<Gender, "male" | "female">;
  excludedIds?: ReadonlySet<string>;
}): FamilyMember[] {
  if (!birthDate) return [];

  return members.filter(
    (candidate) =>
      candidate.id !== memberId &&
      !excludedIds?.has(candidate.id) &&
      candidate.gender === gender &&
      !candidate.is_unknown &&
      Boolean(candidate.birth_date) &&
      candidate.birth_date! < birthDate,
  );
}

export function searchParentCandidates(candidates: FamilyMember[], query: string): FamilyMember[] {
  const trimmedQuery = query.trim();
  if (!trimmedQuery) return [];

  const normalizedQuery = trimmedQuery.toLowerCase();
  return candidates.filter(
    (candidate) =>
      candidate.name_en.toLowerCase().includes(normalizedQuery) ||
      candidate.name_ar.includes(trimmedQuery),
  );
}

export function parentDisplayName(member: FamilyMember, name: string): string {
  const birthYear = member.birth_date?.slice(0, 4);
  return birthYear ? `${name} (${birthYear})` : name;
}

export function reconcileMotherForFather(
  motherId: string,
  fatherId: string,
  fatherSpouseIds: ReadonlySet<string>,
): string {
  if (!fatherId || !motherId || fatherSpouseIds.has(motherId)) return motherId;
  return "";
}
