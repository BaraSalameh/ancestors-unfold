import { describe, expect, it } from "vitest";
import { treeAccessPolicy } from "./access-policy";

describe("tree access policy", () => {
  it.each(["tree", "branch"] as const)("allows %s scope to edit in edit mode", (scope) => {
    expect(treeAccessPolicy(scope, "edit").canEdit).toBe(true);
  });

  it("keeps preview scope and non-edit routes read-only", () => {
    expect(treeAccessPolicy("preview", "edit").canEdit).toBe(false);
    expect(treeAccessPolicy("tree", "preview").canEdit).toBe(false);
    expect(treeAccessPolicy("branch", "view").canEdit).toBe(false);
  });

  it("reserves sub-family management for tree scope", () => {
    expect(treeAccessPolicy("tree", "edit").canManageSubfamilies).toBe(true);
    expect(treeAccessPolicy("branch", "edit").canManageSubfamilies).toBe(false);
    expect(treeAccessPolicy("preview", "preview").canManageSubfamilies).toBe(false);
  });
});
