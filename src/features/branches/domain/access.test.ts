import { describe, expect, it } from "vitest";
import { contributorSubfamilyAccess } from "./access";

describe("subfamily page access", () => {
  it("gives owners full management access", () => {
    expect(contributorSubfamilyAccess("owner", "branch")).toEqual({ readOnly: false });
  });

  it("limits contributors to their assigned branch", () => {
    expect(contributorSubfamilyAccess("contributor", "branch")).toEqual({
      readOnly: true,
      allowedSubfamilyId: "branch",
    });
  });
});
