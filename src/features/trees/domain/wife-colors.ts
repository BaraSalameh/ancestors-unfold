import type { FamilyMember } from "@/features/members";

// Distinct approved palette for wives: 1st = pink, then rotating hues.
const WIFE_COLORS = [
  { name: "pink", stroke: "#ec4899", bg: "#fce7f3", text: "#9d174d", dark: "#f9a8d4" },
  { name: "amber", stroke: "#f59e0b", bg: "#fef3c7", text: "#92400e", dark: "#fcd34d" },
  { name: "emerald", stroke: "#10b981", bg: "#d1fae5", text: "#065f46", dark: "#6ee7b7" },
  { name: "violet", stroke: "#8b5cf6", bg: "#ede9fe", text: "#5b21b6", dark: "#c4b5fd" },
  { name: "cyan", stroke: "#06b6d4", bg: "#cffafe", text: "#155e75", dark: "#67e8f9" },
  { name: "rose", stroke: "#f43f5e", bg: "#ffe4e6", text: "#9f1239", dark: "#fda4af" },
  { name: "lime", stroke: "#84cc16", bg: "#ecfccb", text: "#3f6212", dark: "#bef264" },
] as const;

type WifeColor = (typeof WIFE_COLORS)[number];

/**
 * Ordered list of wives per husband (male). A "wife" is any female who either
 * co-parents a child with the husband, is listed on the husband's spouse_ids,
 * or points back to him through spouse_id. This keeps older one-way records
 * visible inside the husband's card.
 */
export function computeWivesByHusband(members: FamilyMember[]): Map<string, FamilyMember[]> {
  const byId = new Map(members.map((m) => [m.id, m]));
  const map = new Map<string, FamilyMember[]>();

  for (const husband of members) {
    if (husband.gender !== "male") continue;
    const evidence = wifeEvidenceForHusband(husband, members, byId);
    const wives = [...evidence.ids]
      .map((id) => byId.get(id)!)
      .sort(wifeComparator(evidence.explicitOrder, evidence.firstChildYear));

    if (wives.length) map.set(husband.id, wives);
  }
  return map;
}

function wifeEvidenceForHusband(
  husband: FamilyMember,
  members: FamilyMember[],
  byId: ReadonlyMap<string, FamilyMember>,
) {
  const ids = new Set<string>();
  const firstChildYear = new Map<string, number>();
  const explicitOrder = new Map<string, number>();
  const addExplicit = (id: string | undefined) => {
    if (id && !explicitOrder.has(id)) explicitOrder.set(id, explicitOrder.size);
  };
  for (const id of husband.spouse_ids ?? []) addExplicit(id);
  addExplicit(husband.spouse_id);
  for (const spouse of members)
    if (spouse.gender === "female" && spouse.spouse_id === husband.id) addExplicit(spouse.id);
  for (const child of members) recordChildMother(husband.id, child, byId, ids, firstChildYear);
  for (const id of explicitOrder.keys()) if (byId.get(id)?.gender === "female") ids.add(id);
  return { ids, firstChildYear, explicitOrder };
}

function recordChildMother(
  husbandId: string,
  child: FamilyMember,
  byId: ReadonlyMap<string, FamilyMember>,
  ids: Set<string>,
  firstChildYear: Map<string, number>,
) {
  if (child.father_id !== husbandId || !child.mother_id) return;
  const mother = byId.get(child.mother_id);
  if (mother?.gender !== "female") return;
  ids.add(mother.id);
  const year = Number.parseInt(child.birth_date?.slice(0, 4) ?? "", 10);
  const previous = firstChildYear.get(mother.id);
  if (Number.isFinite(year) && (previous === undefined || year < previous))
    firstChildYear.set(mother.id, year);
}

function wifeComparator(
  explicitOrder: ReadonlyMap<string, number>,
  firstChildYear: ReadonlyMap<string, number>,
) {
  return (first: FamilyMember, second: FamilyMember) => {
    const firstOrder = explicitOrder.get(first.id);
    const secondOrder = explicitOrder.get(second.id);
    if (firstOrder !== undefined || secondOrder !== undefined)
      return (
        (firstOrder ?? Number.POSITIVE_INFINITY) - (secondOrder ?? Number.POSITIVE_INFINITY) ||
        first.name_en.localeCompare(second.name_en)
      );
    const firstYear = firstChildYear.get(first.id) ?? Number.POSITIVE_INFINITY;
    const secondYear = firstChildYear.get(second.id) ?? Number.POSITIVE_INFINITY;
    return firstYear - secondYear || first.name_en.localeCompare(second.name_en);
  };
}

export function wifeColorFor(index: number): WifeColor {
  return WIFE_COLORS[index % WIFE_COLORS.length];
}
