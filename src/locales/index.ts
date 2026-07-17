import { ar } from "./ar";
import { en, type TranslationKey } from "./en";

export type Lang = "en" | "ar";
export type TranslationValues = Record<string, string | number>;
export type { TranslationKey } from "./en";

const translations = { en, ar } satisfies Record<Lang, Record<TranslationKey, string>>;

export function normalizeLang(value: string | null): Lang | null {
  return value === "en" || value === "ar" ? value : null;
}

export function translate(lang: Lang, key: TranslationKey, values?: TranslationValues): string {
  const message = translations[lang][key];
  if (!values) return message;

  return message.replace(/\{([^{}]+)\}/g, (placeholder, name: string) =>
    Object.prototype.hasOwnProperty.call(values, name) ? String(values[name]) : placeholder,
  );
}
