import { describe, expect, it } from "vitest";
import { isDescendant, linkSpouses, removeMember, toggleDivorce } from "./relationships";
import type { FamilyMember } from "./types";

const member = (id: string, gender: "male" | "female", patch: Partial<FamilyMember> = {}) => ({
  id,
  gender,
  name_en: id,
  name_ar: id,
  created_at: "created",
  updated_at: "old",
  ...patch,
});

describe("family relationships", () => {
  it("links spouses symmetrically without duplicating the male ordering", () => {
    const result = linkSpouses(
      [member("m", "male", { spouse_ids: ["f"] }), member("f", "female")],
      "m",
      "f",
      "now",
    );
    expect(result[0]).toMatchObject({ spouse_id: "f", spouse_ids: ["f"], updated_at: "now" });
    expect(result[1]).toMatchObject({ spouse_id: "m", updated_at: "now" });
  });

  it("adds and removes divorce markers on both partners", () => {
    const members = [member("m", "male"), member("f", "female")];
    const divorced = toggleDivorce(members, "m", "f", "one");
    expect(divorced.map((value) => value.divorced_from)).toEqual([["f"], ["m"]]);
    expect(toggleDivorce(divorced, "m", "f", "two").map((value) => value.divorced_from)).toEqual([
      [],
      [],
    ]);
  });

  it("removes all references when deleting a member", () => {
    const result = removeMember(
      [
        member("gone", "male"),
        member("child", "female", {
          father_id: "gone",
          spouse_id: "gone",
          spouse_ids: ["gone"],
          divorced_from: ["gone"],
        }),
      ],
      "gone",
    );
    expect(result).toEqual([
      expect.objectContaining({
        id: "child",
        father_id: undefined,
        spouse_id: undefined,
        spouse_ids: [],
        divorced_from: [],
      }),
    ]);
  });

  it("handles cyclic malformed ancestry without looping", () => {
    const members = [
      member("a", "male", { father_id: "b" }),
      member("b", "male", { father_id: "a" }),
      member("c", "female", { father_id: "b" }),
    ];
    expect(isDescendant(members, "a", "c")).toBe(true);
    expect(isDescendant(members, "a", "missing")).toBe(false);
  });
});
