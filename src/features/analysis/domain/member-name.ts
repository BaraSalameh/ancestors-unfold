import type { AnalysisMember } from "./types";

function joinNameParts(parts: Array<string | null>): string {
  return parts
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part))
    .join(" ");
}

export function analysisMemberNames(member: AnalysisMember): { en: string; ar: string } {
  return {
    en: joinNameParts([
      member.name_en,
      member.father_name_en,
      member.grandfather_name_en,
      member.great_grandfather_name_en,
    ]),
    ar: joinNameParts([
      member.name_ar,
      member.father_name_ar,
      member.grandfather_name_ar,
      member.great_grandfather_name_ar,
    ]),
  };
}
