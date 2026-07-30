import { describe, expect, it } from "vitest";
import { resolveTheme, themeBootstrapScript } from "./theme";

describe("theme initialization", () => {
  it.each([
    ["dark", false, "dark"],
    ["light", true, "light"],
    [null, true, "dark"],
    [null, false, "light"],
    ["invalid", true, "dark"],
  ] as const)("resolves saved %s with system dark %s to %s", (saved, systemDark, expected) => {
    expect(resolveTheme(saved, systemDark)).toBe(expected);
  });

  it("bootstraps the root class and color scheme before hydration", () => {
    expect(themeBootstrapScript).toContain('localStorage.getItem("ft:theme")');
    expect(themeBootstrapScript).toContain('classList.toggle("dark"');
    expect(themeBootstrapScript).toContain("style.colorScheme");
    expect(themeBootstrapScript).toContain("prefers-color-scheme: dark");
  });
});
