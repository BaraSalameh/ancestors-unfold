import { describe, expect, it } from "vitest";
import { isPublicPreviewRoute } from "./public-route";

describe("public preview routes", () => {
  it("allows tree previews and preview member details", () => {
    expect(isPublicPreviewRoute("/tree/tree-id", { mode: "preview" })).toBe(true);
    expect(
      isPublicPreviewRoute("/member/member-id", {
        treeId: "tree-id",
        returnMode: "preview",
      }),
    ).toBe(true);
  });

  it("keeps malformed, edit, and view member details authenticated", () => {
    expect(isPublicPreviewRoute("/member/member-id", { returnMode: "preview" })).toBe(false);
    expect(
      isPublicPreviewRoute("/member/member-id", { treeId: "tree-id", returnMode: "edit" }),
    ).toBe(false);
    expect(
      isPublicPreviewRoute("/member/member-id", { treeId: "tree-id", returnMode: "view" }),
    ).toBe(false);
  });
});
