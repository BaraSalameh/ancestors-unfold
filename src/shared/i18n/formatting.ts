import type { Lang } from "@/locales";

export function ordinal(value: number, lang: Lang): string {
  if (lang === "ar") {
    const arabic = [
      "الأولى",
      "الثانية",
      "الثالثة",
      "الرابعة",
      "الخامسة",
      "السادسة",
      "السابعة",
      "الثامنة",
    ];
    return arabic[value - 1] ?? `${value}`;
  }
  const suffixes = ["th", "st", "nd", "rd"];
  const remainder = value % 100;
  return value + (suffixes[(remainder - 20) % 10] || suffixes[remainder] || suffixes[0]);
}

export function displayName(member: { name_en: string; name_ar: string }, lang: Lang) {
  return lang === "ar" ? member.name_ar || member.name_en : member.name_en || member.name_ar;
}
