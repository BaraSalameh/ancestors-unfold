import { describe, expect, it } from "vitest";
import type { FamilyMember } from "./types";
import { memberDeletionPlan } from "./member-deletion";

const member = (id: string, patch: Partial<FamilyMember> = {}): FamilyMember => ({
  id,
  name_en: id,
  name_ar: id,
  gender: "male",
  citizen_status: "resident",
  created_at: "then",
  updated_at: "then",
  ...patch,
});

describe("member deletion planning", () => {
  it("finds explicit, legacy, inferred, unknown, and divorced wives", () => {
    const members = [
      member("father", {
        spouse_id: "legacy",
        spouse_ids: ["explicit", "unknown"],
        divorced_from: ["divorced"],
      }),
      member("legacy", { gender: "female" }),
      member("explicit", { gender: "female" }),
      member("unknown", { gender: "female", is_unknown: true }),
      member("divorced", { gender: "female" }),
      member("reciprocal-divorced", { gender: "female", divorced_from: ["father"] }),
      member("inferred", { gender: "female" }),
      member("child", { father_id: "father", mother_id: "inferred" }),
    ];

    expect(memberDeletionPlan(["father"], members).wifeIds.sort()).toEqual(
      ["explicit", "unknown", "divorced", "legacy", "inferred", "reciprocal-divorced"].sort(),
    );
  });

  it("deduplicates selected wives and separates protected records", () => {
    const members = [
      member("father", { spouse_ids: ["selected-wife", "protected-wife"] }),
      member("selected-wife", { gender: "female" }),
      member("protected-wife", { gender: "female" }),
      member("protected-selected"),
    ];
    expect(
      memberDeletionPlan(["father", "selected-wife", "protected-selected"], members, (id) =>
        id.startsWith("protected"),
      ),
    ).toEqual({
      selectedIds: ["father", "selected-wife", "protected-selected"],
      wifeIds: [],
      protectedSelectedIds: ["protected-selected"],
      protectedWifeIds: ["protected-wife"],
    });
  });

  it("does not offer husbands when a woman is selected", () => {
    const members = [
      member("husband", { spouse_id: "wife" }),
      member("wife", { gender: "female", spouse_id: "husband" }),
    ];
    expect(memberDeletionPlan(["wife"], members).wifeIds).toEqual([]);
  });

  it("does not offer a wife when her selected husband cannot be deleted", () => {
    const members = [
      member("protected-father", { spouse_id: "wife" }),
      member("wife", { gender: "female" }),
    ];
    expect(
      memberDeletionPlan(["protected-father"], members, (id) => id === "protected-father"),
    ).toEqual({
      selectedIds: ["protected-father"],
      wifeIds: [],
      protectedSelectedIds: ["protected-father"],
      protectedWifeIds: [],
    });
  });
});
