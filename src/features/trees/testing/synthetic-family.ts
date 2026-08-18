import type { FamilyMember } from "@/features/members";

const timestamp = "2026-01-01T00:00:00.000Z";

function syntheticMemberId(index: number) {
  return `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`;
}

export function createSyntheticFamily(count: number): FamilyMember[] {
  return Array.from({ length: count }, (_, index) => {
    const id = syntheticMemberId(index);
    const parentIndex = index === 0 ? -1 : Math.floor((index - 1) / 4);
    const generation = index === 0 ? 0 : Math.floor(Math.log(index * 3 + 1) / Math.log(4));
    const gender = index % 5 === 4 ? "female" : "male";
    return {
      id,
      name_en: `Synthetic member ${index + 1}`,
      name_ar: `فرد تجريبي ${index + 1}`,
      gender,
      father_id: parentIndex >= 0 ? syntheticMemberId(parentIndex) : undefined,
      birth_date: `${Math.min(9999, 1750 + generation * 24 + (index % 17))}-01-01`,
      citizen_status: "resident",
      subfamily_id: syntheticMemberId(Math.floor(index / 250) * 250),
      created_at: timestamp,
      updated_at: timestamp,
    } satisfies FamilyMember;
  });
}
