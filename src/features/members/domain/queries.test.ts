import { describe, expect, it } from "vitest";
import { getGeneration, getSubfamilyMembers } from "./queries";
import type { FamilyMember, SubFamily } from "./types";

const member = (id: string, patch: Partial<FamilyMember> = {}): FamilyMember => ({
  id,
  gender: "male",
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

  it("includes a linked male's descendants and explicit members", () => {
    const members = [
      member("root"),
      member("child", { father_id: "root" }),
      member("explicit", { subfamily_id: "branch" }),
      member("other"),
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
      "child",
      "explicit",
    ]);
  });
});
