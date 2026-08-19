import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { normalizeLang, translate, type Lang } from "@/locales";
import { I18nContext } from "./context";

export function I18nProvider({
  children,
  initialLang,
  onLangChange,
}: {
  children: ReactNode;
  initialLang?: Lang;
  onLangChange?: (lang: Lang) => void;
}) {
  const [lang, setLangState] = useState<Lang>(initialLang ?? "en");

  useEffect(() => {
    if (initialLang) return;
    const saved = normalizeLang(
      typeof window !== "undefined" ? window.localStorage.getItem("ft:lang") : null,
    );
    if (saved) setLangState(saved);
  }, [initialLang]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
  }, [lang]);

  const setLang = useCallback(
    (next: Lang) => {
      setLangState(next);
      onLangChange?.(next);
      if (typeof window !== "undefined") {
        window.localStorage.setItem("ft:lang", next);
        document.cookie = `ft:lang=${next}; Path=/; Max-Age=31536000; SameSite=Lax`;
      }
    },
    [onLangChange],
  );

  const t = useCallback(
    (key: Parameters<typeof translate>[1], values?: Parameters<typeof translate>[2]) =>
      translate(lang, key, values),
    [lang],
  );
  const dir: "rtl" | "ltr" = lang === "ar" ? "rtl" : "ltr";
  const value = useMemo(() => ({ lang, setLang, t, dir }), [dir, lang, setLang, t]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}
