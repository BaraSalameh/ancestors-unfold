import { describe, expect, it } from "vitest";
import { currentTreeDisplayName, guardedRedirect, mayAccessRoute } from "./auth-guard-policy";

describe("auth guard policy", () => {
  it("allows authentication flows, public previews, and authenticated routes", () => {
    expect(mayAccessRoute("/auth", {}, false)).toBe(true);
    expect(mayAccessRoute("/invitation/token", {}, false)).toBe(true);
    expect(mayAccessRoute("/tree/id", { mode: "preview" }, false)).toBe(true);
    expect(mayAccessRoute("/profile", {}, true)).toBe(true);
    expect(mayAccessRoute("/profile", {}, true, false)).toBe(true);
    expect(mayAccessRoute("/dashboard", {}, true, false)).toBe(false);
    expect(mayAccessRoute("/profile", {}, false)).toBe(false);
  });

  it("preserves query text in guarded redirects", () => {
    expect(guardedRedirect("/profile", "/profile?tab=email")).toBe("/profile?tab=email");
    expect(guardedRedirect("/profile", "/profile")).toBe("/profile");
  });

  it("selects the localized tree name with a fallback", () => {
    const tree = { nameEn: "Family", nameAr: "العائلة" };
    expect(currentTreeDisplayName(tree, "ar")).toBe("العائلة");
    expect(currentTreeDisplayName({ ...tree, nameAr: null }, "ar")).toBe("Family");
  });
});
