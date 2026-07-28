import { describe, expect, it } from "vitest";
import { activityRequestLimit, canDeleteContributorAccount } from "./policy";

describe("collaboration policy", () => {
  it("caps and normalizes activity limits", () => {
    expect(activityRequestLimit("1")).toBe(1);
    expect(activityRequestLimit("500")).toBe(100);
    expect(activityRequestLimit("0")).toBe(1);
    expect(activityRequestLimit("invalid")).toBe(25);
    expect(activityRequestLimit("5x")).toBe(25);
    expect(activityRequestLimit(null)).toBe(25);
  });

  it("allows account deletion only for affiliated non-owners", () => {
    expect(canDeleteContributorAccount(["viewer"])).toBe(true);
    expect(canDeleteContributorAccount(["editor"])).toBe(true);
    expect(canDeleteContributorAccount(["owner"])).toBe(false);
    expect(canDeleteContributorAccount([])).toBe(false);
  });
});
