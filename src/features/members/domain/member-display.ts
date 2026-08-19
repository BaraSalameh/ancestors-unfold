import { displayName, type Lang } from "@/shared/i18n";

import type { FamilyMember } from "./types";

type SearchableMemberName = Pick<FamilyMember, "name_en" | "name_ar"> & {
  birth_date?: string | null;
  birth_year?: number | null;
};

type PaternalSearchMember = SearchableMemberName & Pick<FamilyMember, "id" | "father_id">;

export function ancestorConnector(dir: "ltr" | "rtl"): "→" | "←" {
  return dir === "rtl" ? "←" : "→";
}

export function memberSearchLabel(member: SearchableMemberName, lang: Lang): string {
  const name = displayName(member, lang).trim().split(/\s+/u).slice(0, 2).join(" ");
  const birthYear = memberBirthYear(member);

  return birthYear ? `${name} (${birthYear})` : name;
}

export function memberPaternalSearchLabel(
  member: PaternalSearchMember,
  membersById: ReadonlyMap<string, PaternalSearchMember>,
  lang: Lang,
): string {
  const lineage: PaternalSearchMember[] = [];
  const visited = new Set<string>();
  let current: PaternalSearchMember | undefined = member;
  while (current && lineage.length < 4 && !visited.has(current.id)) {
    lineage.push(current);
    visited.add(current.id);
    current = current.father_id ? membersById.get(current.father_id) : undefined;
  }
  const names = {
    en: joinNames(lineage.map((relative) => relative.name_en)),
    ar: joinNames(lineage.map((relative) => relative.name_ar)),
  };
  const name = lang === "ar" ? names.ar || names.en : names.en || names.ar;
  const birthYear = memberBirthYear(member);
  return birthYear ? `${name} (${birthYear})` : name;
}

export function memberMatchesPaternalSearch(
  member: PaternalSearchMember,
  membersById: ReadonlyMap<string, PaternalSearchMember>,
  query: string,
): boolean {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return true;
  return (["en", "ar"] as const).some((lang) =>
    memberPaternalSearchLabel(member, membersById, lang).toLowerCase().includes(normalized),
  );
}

function joinNames(names: string[]): string {
  return names
    .map((name) => name.trim())
    .filter(Boolean)
    .join(" ");
}

function memberBirthYear(member: SearchableMemberName): string | undefined {
  return member.birth_year?.toString() ?? member.birth_date?.match(/^(\d{4})(?:-|$)/)?.[1];
}
