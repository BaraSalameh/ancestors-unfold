import { describe, expect, it } from "vitest";
import type { FamilyMember } from "./types";
import { childrenEligibleForMother, husbandIdsForMother } from "./mother-children";

const member = (id: string, patch: Partial<FamilyMember> = {}): FamilyMember => ({
  id,
  name_en: id,
  name_ar: id,
  gender: "unspecified",
  created_at: "then",
  updated_at: "then",
  ...patch,
});

describe("mother children relationship candidates", () => {
  it("derives husbands from direct, reverse, and co-parent links", () => {
    const members = [
      member("mother", { gender: "female", spouse_id: "direct" }),
      member("direct", { gender: "male" }),
      member("reverse", { gender: "male", spouse_ids: ["mother"] }),
      member("shared-child", { father_id: "co-parent", mother_id: "mother" }),
      member("co-parent", { gender: "male" }),
    ];

    expect([...husbandIdsForMother(members, "mother")]).toEqual(["direct", "reverse", "co-parent"]);
  });

  it("includes linked and motherless children of husbands without exposing reassignment", () => {
    const members = [
      member("mother", { gender: "female", spouse_id: "husband" }),
      member("husband", { gender: "male" }),
      member("linked-without-father", { mother_id: "mother" }),
      member("available", { father_id: "husband" }),
      member("assigned-elsewhere", { father_id: "husband", mother_id: "other-mother" }),
      member("unrelated", { father_id: "other-father" }),
    ];

    expect(childrenEligibleForMother(members, "mother").map(({ id }) => id)).toEqual([
      "linked-without-father",
      "available",
    ]);
  });
});
