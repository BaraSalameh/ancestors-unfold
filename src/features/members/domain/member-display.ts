import { displayName, type Lang } from "@/shared/i18n";

import type { FamilyMember } from "./types";

export function ancestorConnector(dir: "ltr" | "rtl"): "→" | "←" {
  return dir === "rtl" ? "←" : "→";
}

export function memberNameWithBirthYear(member: FamilyMember, lang: Lang): string {
  const name = displayName(member, lang);
  const birthYear = member.birth_date?.match(/^(\d{4})(?:-|$)/)?.[1];

  return birthYear ? `${name} (${birthYear})` : name;
}
