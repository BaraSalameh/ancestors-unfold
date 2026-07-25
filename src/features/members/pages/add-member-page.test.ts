import { describe, expect, it } from "vitest";
import { addMemberSearchSchema } from "./add-member-page";

describe("connector member creation search context", () => {
  it("accepts an explicit child parent pair", () => {
    expect(
      addMemberSearchSchema.parse({
        fatherId: "father",
        motherId: "mother",
      }),
    ).toEqual({ fatherId: "father", motherId: "mother" });
  });

  it("accepts an explicit missing-parent role", () => {
    expect(
      addMemberSearchSchema.parse({
        childId: "child",
        parentRole: "mother",
      }),
    ).toEqual({ childId: "child", parentRole: "mother" });
  });

  it("rejects an invalid parent role", () => {
    expect(() =>
      addMemberSearchSchema.parse({ childId: "child", parentRole: "guardian" }),
    ).toThrow();
  });

  it("rejects the obsolete ambiguous parent parameter", () => {
    expect(() => addMemberSearchSchema.parse({ parentId: "parent" })).toThrow();
  });
});
