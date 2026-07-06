import type { FamilyMember } from "./family-types";

// Distinct approved palette for wives: 1st = pink, then rotating hues.
export const WIFE_COLORS = [
  { name: "pink", stroke: "#ec4899", bg: "#fce7f3", text: "#9d174d", dark: "#f9a8d4" },
  { name: "amber", stroke: "#f59e0b", bg: "#fef3c7", text: "#92400e", dark: "#fcd34d" },
  { name: "emerald", stroke: "#10b981", bg: "#d1fae5", text: "#065f46", dark: "#6ee7b7" },
  { name: "violet", stroke: "#8b5cf6", bg: "#ede9fe", text: "#5b21b6", dark: "#c4b5fd" },
  { name: "cyan", stroke: "#06b6d4", bg: "#cffafe", text: "#155e75", dark: "#67e8f9" },
  { name: "rose", stroke: "#f43f5e", bg: "#ffe4e6", text: "#9f1239", dark: "#fda4af" },
  { name: "lime", stroke: "#84cc16", bg: "#ecfccb", text: "#3f6212", dark: "#bef264" },
] as const;

export type WifeColor = (typeof WIFE_COLORS)[number];

/**
 * Ordered list of wives per husband (male). A "wife" is any female who either
 * co-parents a child with the husband, or is directly linked via spouse_id.
 * Order = earliest known child birth year first, then by name.
 */
export function computeWivesByHusband(
  members: FamilyMember[],
): Map<string, FamilyMember[]> {
  const byId = new Map(members.map((m) => [m.id, m]));
  const map = new Map<string, FamilyMember[]>();

  for (const husband of members) {
    if (husband.gender !== "male") continue;

    const wifeIds = new Set<string>();
    const wifeFirstYear = new Map<string, number>();

    for (const child of members) {
      if (child.father_id !== husband.id || !child.mother_id) continue;
      const mother = byId.get(child.mother_id);
      if (!mother || mother.gender !== "female") continue;
      wifeIds.add(mother.id);
      const y = child.birth_date ? parseInt(child.birth_date.slice(0, 4), 10) : NaN;
      if (Number.isFinite(y)) {
        const prev = wifeFirstYear.get(mother.id);
        if (prev === undefined || y < prev) wifeFirstYear.set(mother.id, y);
      }
    }
    if (husband.spouse_id) {
      const sp = byId.get(husband.spouse_id);
      if (sp && sp.gender === "female") wifeIds.add(sp.id);
    }

    const wives = [...wifeIds]
      .map((id) => byId.get(id)!)
      .sort((a, b) => {
        const ya = wifeFirstYear.get(a.id) ?? Number.POSITIVE_INFINITY;
        const yb = wifeFirstYear.get(b.id) ?? Number.POSITIVE_INFINITY;
        if (ya !== yb) return ya - yb;
        return a.name_en.localeCompare(b.name_en);
      });

    if (wives.length) map.set(husband.id, wives);
  }
  return map;
}

export function wifeColorFor(index: number): WifeColor {
  return WIFE_COLORS[index % WIFE_COLORS.length];
}
