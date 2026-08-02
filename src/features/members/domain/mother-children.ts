import type { FamilyMember } from "./types";

export function husbandIdsForMother(members: FamilyMember[], motherId: string): Set<string> {
  const husbands = new Set<string>();
  const mother = members.find((member) => member.id === motherId);
  if (mother?.spouse_id) {
    const spouse = members.find((member) => member.id === mother.spouse_id);
    if (spouse?.gender === "male") husbands.add(spouse.id);
  }

  for (const member of members) {
    if (
      member.gender === "male" &&
      (member.spouse_id === motherId || member.spouse_ids?.includes(motherId))
    ) {
      husbands.add(member.id);
    }
    if (member.mother_id === motherId && member.father_id) husbands.add(member.father_id);
  }
  return husbands;
}

export function childrenEligibleForMother(
  members: FamilyMember[],
  motherId: string,
): FamilyMember[] {
  const husbandIds = husbandIdsForMother(members, motherId);
  return members.filter(
    (member) =>
      member.id !== motherId &&
      (member.mother_id === motherId ||
        (!member.mother_id && Boolean(member.father_id && husbandIds.has(member.father_id)))),
  );
}
