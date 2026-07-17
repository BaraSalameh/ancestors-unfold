import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import {
  normalizeLang,
  translate,
  type Lang,
  type TranslationKey,
  type TranslationValues,
} from "@/locales";

export type { Lang, TranslationKey, TranslationValues } from "@/locales";

export function ordinal(n: number, lang: Lang): string {
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
    return arabic[n - 1] ?? `${n}`;
  }
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

interface I18nCtx {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: TranslationKey, values?: TranslationValues) => string;
  dir: "ltr" | "rtl";
}

const Ctx = createContext<I18nCtx | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>("en");

  useEffect(() => {
    const saved = normalizeLang(
      typeof window !== "undefined" ? window.localStorage.getItem("ft:lang") : null,
    );
    if (saved) setLangState(saved);
  }, []);

  useEffect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
  }, [lang]);

  const setLang = (l: Lang) => {
    setLangState(l);
    if (typeof window !== "undefined") window.localStorage.setItem("ft:lang", l);
  };

  const t = (key: TranslationKey, values?: TranslationValues) => translate(lang, key, values);
  const dir = lang === "ar" ? "rtl" : "ltr";

  return <Ctx.Provider value={{ lang, setLang, t, dir }}>{children}</Ctx.Provider>;
}

export function useI18n() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useI18n outside provider");
  return c;
}

export function displayName(m: { name_en: string; name_ar: string }, lang: Lang) {
  if (lang === "ar") return m.name_ar || m.name_en;
  return m.name_en || m.name_ar;
}
