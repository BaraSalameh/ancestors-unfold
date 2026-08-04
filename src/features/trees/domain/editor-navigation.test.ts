import { describe, expect, it } from "vitest";
import { isTreeEditorDestination } from "./editor-navigation";

describe("tree editor navigation", () => {
  it.each([
    ["/add", {}],
    ["/edit/member-id", {}],
    ["/member/member-id", {}],
    ["/subfamilies", {}],
    ["/branches", {}],
    ["/tree/tree-id", { mode: "edit" }],
    ["/tree/tree-id/add", {}],
  ])("keeps %s inside the active draft workspace", (pathname, search) => {
    expect(isTreeEditorDestination(pathname, search, "tree-id")).toBe(true);
  });

  it.each([
    ["/", {}],
    ["/activity", {}],
    ["/tree/tree-id", { mode: "view" }],
    ["/tree/other-tree", { mode: "edit" }],
  ])("treats %s as leaving the active draft workspace", (pathname, search) => {
    expect(isTreeEditorDestination(pathname, search, "tree-id")).toBe(false);
  });
});
