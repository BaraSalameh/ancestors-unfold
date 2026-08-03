import { describe, expect, it } from "vitest";
import { getGeneration, getSubfamilyMembers } from "./queries";
import type { FamilyMember, SubFamily } from "./types";

const member = (id: string, patch: Partial<FamilyMember> = {}): FamilyMember => ({
  id,
  gender: "male",
  citizen_status: "resident",
  name_en: id,
  name_ar: id,
  created_at: "created",
  updated_at: "updated",
  ...patch,
});

describe("family queries", () => {
  it("calculates generations and terminates for malformed cycles", () => {
    expect(getGeneration([member("root"), member("child", { father_id: "root" })], "child")).toBe(
      1,
    );
    expect(
      getGeneration([member("a", { father_id: "b" }), member("b", { father_id: "a" })], "a"),
    ).toBeGreaterThanOrEqual(1);
  });

  it("includes a linked male's descendants, explicit members, and their wives", () => {
    const members = [
      member("root", { spouse_ids: ["root-wife"] }),
      member("root-wife", { gender: "female" }),
      member("child", { father_id: "root" }),
      member("child-wife", { gender: "female", spouse_id: "child" }),
      member("grandchild", { father_id: "child", mother_id: "co-parent-wife" }),
      member("co-parent-wife", { gender: "female" }),
      member("explicit", { subfamily_id: "branch" }),
      member("explicit-wife", { gender: "female", spouse_id: "explicit" }),
      member("other"),
      member("other-wife", { gender: "female", spouse_id: "other" }),
    ];
    const subfamilies: SubFamily[] = [
      {
        id: "branch",
        name_en: "Branch",
        name_ar: "Branch",
        linked_male_id: "root",
        created_at: "created",
        updated_at: "updated",
      },
    ];
    expect(getSubfamilyMembers(members, subfamilies, "branch").map(({ id }) => id)).toEqual([
      "root",
      "root-wife",
      "child",
      "child-wife",
      "grandchild",
      "co-parent-wife",
      "explicit",
      "explicit-wife",
    ]);
  });
});
