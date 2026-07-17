import { describe, expect, it } from "vitest";
import { normalizeLang, translate } from "@/locales";
import { ar } from "@/locales/ar";
import { en } from "@/locales/en";

describe("translations", () => {
  it("keeps English and Arabic locale keys in parity", () => {
    expect(Object.keys(ar).sort()).toEqual(Object.keys(en).sort());
  });

  it("looks up messages in both supported languages", () => {
    expect(translate("en", "dashboard")).toBe("Dashboard");
    expect(translate("ar", "dashboard")).toBe("لوحة التحكم");
  });

  it("interpolates string and number values", () => {
    expect(translate("en", "welcome_back", { name: "Maya", visits: 2 })).toBe("Welcome back, Maya");
    expect(translate("ar", "welcome_back", { name: "مايا" })).toBe("مرحباً بك مجدداً، مايا");
  });

  it("leaves placeholders visible when a value is missing", () => {
    expect(translate("en", "welcome_back")).toBe("Welcome back, {name}");
    expect(translate("en", "welcome_back", {})).toBe("Welcome back, {name}");
  });

  it("rejects unknown saved languages so the provider keeps its English default", () => {
    expect(normalizeLang("en")).toBe("en");
    expect(normalizeLang("ar")).toBe("ar");
    expect(normalizeLang("fr")).toBeNull();
    expect(normalizeLang(null)).toBeNull();
  });
});
