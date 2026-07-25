import { describe, expect, it } from "vitest";
import { canUpdateTreeMetadata, descriptionPatchValue } from "./tree-metadata-policy";

describe("tree metadata policy", () => {
  it("allows only owners to update tree metadata", () => {
    expect(canUpdateTreeMetadata("owner")).toBe(true);
    expect(canUpdateTreeMetadata("administrator")).toBe(false);
    expect(canUpdateTreeMetadata("editor")).toBe(false);
    expect(canUpdateTreeMetadata("viewer")).toBe(false);
    expect(canUpdateTreeMetadata(undefined)).toBe(false);
  });

  it("preserves a description when the field is omitted", () => {
    expect(descriptionPatchValue(undefined)).toEqual({ value: null, supplied: false });
  });

  it("allows an explicitly empty description to be cleared", () => {
    expect(descriptionPatchValue("")).toEqual({ value: null, supplied: true });
  });

  it("updates a supplied description", () => {
    expect(descriptionPatchValue("Family history")).toEqual({
      value: "Family history",
      supplied: true,
    });
  });
});
