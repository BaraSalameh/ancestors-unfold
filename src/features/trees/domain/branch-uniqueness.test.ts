import { describe, expect, it } from "vitest";
import {
  branchConflicts,
  newBranchConflicts,
  type BranchUniquenessInput,
} from "./branch-uniqueness";

const branch = (id: string, patch: Partial<BranchUniquenessInput> = {}): BranchUniquenessInput => ({
  id,
  name_en: id,
  ...patch,
});

describe("branch uniqueness", () => {
  it("matches trimmed case-insensitive English and trimmed exact Arabic independently", () => {
    expect(
      branchConflicts([
        branch("one", { name_en: " Main Branch ", name_ar: "الشرق" }),
        branch("two", { name_en: "main branch", name_ar: "الغرب" }),
        branch("three", { name_en: "Other", name_ar: " الشرق " }),
      ]).map(({ code, column }) => ({ code, column })),
    ).toEqual([
      { code: "DUPLICATE_BRANCH_NAME", column: "branch_name_en" },
      { code: "DUPLICATE_BRANCH_NAME", column: "branch_name_ar" },
    ]);
  });

  it("does not compare names across languages or treat blank Arabic names as duplicates", () => {
    expect(
      branchConflicts([
        branch("one", { name_en: "East", name_ar: "" }),
        branch("two", { name_en: "الشرق", name_ar: "East" }),
        branch("three", { name_en: "West", name_ar: "  " }),
      ]),
    ).toEqual([]);
  });

  it("rejects repeated non-null roots", () => {
    expect(
      branchConflicts([
        branch("one", { linked_male_id: "root" }),
        branch("two", { linked_male_id: "root" }),
      ]),
    ).toEqual([
      expect.objectContaining({
        code: "DUPLICATE_BRANCH_ROOT",
        column: "linked_male_id",
      }),
    ]);
  });

  it("grandfathers unchanged conflicts but rejects new or worsened conflicts", () => {
    const current = [branch("one", { name_en: "Legacy" }), branch("two", { name_en: "legacy" })];
    expect(newBranchConflicts(current, current)).toEqual([]);
    const addedNameConflicts = newBranchConflicts(current, [
      ...current,
      branch("three", { name_en: "LEGACY" }),
    ]);
    expect(addedNameConflicts).toHaveLength(2);
    expect(addedNameConflicts.every(({ code }) => code === "DUPLICATE_BRANCH_NAME")).toBe(true);
    expect(
      newBranchConflicts(current, [
        current[0],
        { ...current[1], linked_male_id: "root" },
        branch("three", { linked_male_id: "root" }),
      ]),
    ).toEqual([expect.objectContaining({ code: "DUPLICATE_BRANCH_ROOT" })]);
  });
});
