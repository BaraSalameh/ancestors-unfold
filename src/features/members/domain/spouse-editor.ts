import type { FamilyMember } from "./types";

export function linkedSpouseIds(maleId: string, members: FamilyMember[]): Set<string> {
  const male = members.find((member) => member.id === maleId);
  const ids = new Set(male?.spouse_ids ?? []);
  if (male?.spouse_id) ids.add(male.spouse_id);
  for (const member of members) {
    if (member.father_id === maleId && member.mother_id) ids.add(member.mother_id);
  }
  return ids;
}

export function linkedSpouses(
  ids: Set<string>,
  members: FamilyMember[],
  fallback: (id: string) => FamilyMember | undefined,
): FamilyMember[] {
  const byId = new Map(members.map((member) => [member.id, member]));
  return [...ids]
    .map((id) => byId.get(id) ?? fallback(id))
    .filter((member): member is FamilyMember => member !== undefined);
}

export function spouseSearchResults(query: string, members: FamilyMember[]): FamilyMember[] {
  const normalized = query.trim();
  if (!normalized) return [];
  const lower = normalized.toLowerCase();
  return members
    .filter((member) => member.gender === "female" && !member.is_unknown)
    .filter(
      (member) =>
        member.name_en.toLowerCase().includes(lower) || member.name_ar.includes(normalized),
    )
    .slice(0, 10);
}
