import { describe, expect, it } from "vitest";
import { canDeleteContributorAccount } from "./policy";

describe("collaboration policy", () => {
  it("allows account deletion only for affiliated non-owners", () => {
    expect(canDeleteContributorAccount(["viewer"])).toBe(true);
    expect(canDeleteContributorAccount(["editor"])).toBe(true);
    expect(canDeleteContributorAccount(["owner"])).toBe(false);
    expect(canDeleteContributorAccount([])).toBe(false);
  });
});
