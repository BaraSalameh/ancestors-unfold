import type { FamilyMember } from "@/features/members/domain";

export function mirrorSpouseLink(
  members: FamilyMember[],
  memberId: string,
  spouseId: string,
  updatedAt: string,
): FamilyMember[] {
  const member = members.find(({ id }) => id === memberId);
  const spouse = members.find(({ id }) => id === spouseId);
  if (!member || !spouse) return members;
  return members.map((candidate) => mirroredCandidate(candidate, member, spouse, updatedAt));
}

function mirroredCandidate(
  candidate: FamilyMember,
  member: FamilyMember,
  spouse: FamilyMember,
  updatedAt: string,
): FamilyMember {
  if (member.gender === "female" && spouse.gender === "male" && candidate.id === spouse.id)
    return appendSpouse(candidate, member.id, updatedAt);
  if (member.gender === "male" && spouse.gender === "female" && candidate.id === member.id)
    return appendSpouse(candidate, spouse.id, updatedAt);
  if (member.gender === "male" && spouse.gender === "female" && candidate.id === spouse.id)
    return { ...candidate, spouse_id: candidate.spouse_id ?? member.id, updated_at: updatedAt };
  return candidate;
}

function appendSpouse(member: FamilyMember, spouseId: string, updatedAt: string): FamilyMember {
  const spouseIds = new Set(member.spouse_ids ?? []);
  spouseIds.add(spouseId);
  return {
    ...member,
    spouse_ids: [...spouseIds],
    spouse_id: member.spouse_id ?? spouseId,
    updated_at: updatedAt,
  };
}
