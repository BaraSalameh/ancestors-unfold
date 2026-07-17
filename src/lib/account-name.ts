import type { Lang } from "./i18n";

type AccountNames = {
  fullNameEn: string;
  fullNameAr: string;
  email: string;
};

export function accountDisplayName(user: AccountNames | null, lang: Lang): string {
  if (!user) return "";
  if (lang === "ar") return user.fullNameAr || user.fullNameEn || user.email;
  return user.fullNameEn || user.fullNameAr || user.email;
}
