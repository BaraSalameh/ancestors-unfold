import { displayName, type Lang } from "@/shared/i18n";

import type { FamilyMember } from "./types";

type SearchableMemberName = Pick<FamilyMember, "name_en" | "name_ar"> & {
  birth_date?: string | null;
  birth_year?: number | null;
};

export function ancestorConnector(dir: "ltr" | "rtl"): "→" | "←" {
  return dir === "rtl" ? "←" : "→";
}

export function memberNameWithBirthYear(member: FamilyMember, lang: Lang): string {
  return memberSearchLabel(member, lang);
}

export function memberSearchLabel(member: SearchableMemberName, lang: Lang): string {
  const name = displayName(member, lang).trim().split(/\s+/u).slice(0, 2).join(" ");
  const birthYear =
    member.birth_year?.toString() ?? member.birth_date?.match(/^(\d{4})(?:-|$)/)?.[1];

  return birthYear ? `${name} (${birthYear})` : name;
}
