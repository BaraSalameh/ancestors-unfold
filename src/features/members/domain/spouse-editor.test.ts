import { describe, expect, it } from "vitest";
import { linkedSpouseIds, linkedSpouses, spouseSearchResults } from "./spouse-editor";
import type { FamilyMember } from "./types";

const member = (id: string, patch: Partial<FamilyMember> = {}): FamilyMember => ({
  id,
  name_en: id,
  name_ar: id,
  gender: "female",
  created_at: "created",
  updated_at: "updated",
  ...patch,
});

describe("spouse editor projections", () => {
  it("preserves explicit spouse order and appends mothers inferred from children", () => {
    const male = member("male", { gender: "male", spouse_id: "first", spouse_ids: ["first"] });
    const child = member("child", { gender: "male", father_id: "male", mother_id: "second" });
    expect([...linkedSpouseIds("male", [male, child])]).toEqual(["first", "second"]);
  });

  it("resolves linked members from the current list before the store fallback", () => {
    const current = member("current");
    const fallback = member("fallback");
    expect(linkedSpouses(new Set(["current", "fallback"]), [current], () => fallback)).toEqual([
      current,
      fallback,
    ]);
  });

  it("searches eligible women in both languages and caps results", () => {
    const matches = Array.from({ length: 12 }, (_, index) =>
      member(`wife-${index}`, { name_en: `Alice ${index}` }),
    );
    expect(spouseSearchResults("alice", matches)).toHaveLength(10);
    expect(spouseSearchResults("wife-1", matches).map(({ id }) => id)).toContain("wife-1");
    expect(spouseSearchResults("", matches)).toEqual([]);
    expect(
      spouseSearchResults("alice", [member("unknown", { name_en: "Alice", is_unknown: true })]),
    ).toEqual([]);
  });
});
