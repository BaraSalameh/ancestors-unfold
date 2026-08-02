import { describe, expect, it } from "vitest";
import { existingStagedSpouse, moveStagedSpouse, stagedSpouseMember } from "./staged-spouse";
import type { FamilyMember } from "./types";

const member = (id: string): FamilyMember => ({
  id,
  name_en: id,
  name_ar: id,
  gender: "female",
  created_at: "then",
  updated_at: "then",
});

describe("staged spouses", () => {
  it("creates a locked existing row and resolves its member", () => {
    const spouse = existingStagedSpouse("mother", true);
    expect(spouse).toMatchObject({ memberId: "mother", locked: true, divorced: false });
    expect(stagedSpouseMember(spouse, [member("mother")])?.id).toBe("mother");
  });

  it("reorders rows without mutating the original list", () => {
    const first = existingStagedSpouse("first");
    const second = existingStagedSpouse("second");
    const original = [first, second];
    const moved = moveStagedSpouse(original, second.key, -1);
    expect(moved.map(({ key }) => key)).toEqual([second.key, first.key]);
    expect(original.map(({ key }) => key)).toEqual([first.key, second.key]);
  });
});
