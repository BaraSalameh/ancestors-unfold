import { createContext, useContext } from "react";
import type { Lang, TranslationKey, TranslationValues } from "@/locales";

interface I18nContextValue {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: (key: TranslationKey, values?: TranslationValues) => string;
  dir: "ltr" | "rtl";
}

export const I18nContext = createContext<I18nContextValue | null>(null);

export function useI18n() {
  const context = useContext(I18nContext);
  if (!context) throw new Error("useI18n outside provider");
  return context;
}
