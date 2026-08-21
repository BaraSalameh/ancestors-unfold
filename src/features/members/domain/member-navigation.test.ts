import { describe, expect, it } from "vitest";
import {
  memberDeleteDestination,
  memberDetailsDestination,
  memberDetailsSearch,
  memberReturnDestination,
  parseMemberNavigationSearch,
} from "./member-navigation";

describe("member detail navigation", () => {
  it("parses public chronological preview context", () => {
    expect(
      parseMemberNavigationSearch({
        treeId: "tree-id",
        returnMode: "preview",
        returnPreview: "chronological",
      }),
    ).toEqual({
      treeId: "tree-id",
      returnMode: "preview",
      returnPreview: "chronological",
    });
  });

  it("keeps legacy member links in edit lineage mode", () => {
    expect(parseMemberNavigationSearch({})).toEqual({
      treeId: undefined,
      returnMode: "edit",
      returnPreview: "lineage",
    });
  });

  it("returns preview details to the same preview layout", () => {
    const context = {
      treeId: "tree-id",
      returnMode: "preview" as const,
      returnPreview: "chronological" as const,
    };
    expect(memberDetailsSearch(context)).toEqual(context);
    expect(memberReturnDestination(context)).toEqual({
      to: "/tree/$id",
      params: { id: "tree-id" },
      search: { mode: "preview", preview: "chronological" },
    });
  });

  it("returns edit and view details without preview-only search", () => {
    expect(
      memberReturnDestination({
        treeId: "tree-id",
        returnMode: "view",
        returnPreview: "lineage",
      }).search,
    ).toEqual({ mode: "view" });
  });

  it("keeps relationship navigation inside the tree modal with all tree search state", () => {
    const treeSearch = {
      mode: "preview" as const,
      preview: "chronological" as const,
      period: 25,
      branchId: "branch-id",
    };
    const context = {
      treeId: "tree-id",
      returnMode: "preview" as const,
      returnPreview: "chronological" as const,
      presentation: "tree-modal" as const,
      treeSearch,
    };

    expect(memberDetailsDestination("father-id", context)).toEqual({
      to: "/tree/$id/member/$memberId",
      params: { id: "tree-id", memberId: "father-id" },
      search: treeSearch,
    });
    expect(memberReturnDestination(context)).toEqual({
      to: "/tree/$id",
      params: { id: "tree-id" },
      search: treeSearch,
    });
  });
});

describe("member deletion navigation", () => {
  it("replaces the deleted member route with the active tree editor", () => {
    expect(memberDeleteDestination("family-tree")).toEqual({
      to: "/tree/$id",
      params: { id: "family-tree" },
      search: { mode: "edit", preview: "lineage" },
      replace: true,
    });
  });

  it("preserves the chronological preview after deletion", () => {
    expect(memberDeleteDestination("family-tree", "chronological").search).toEqual({
      mode: "edit",
      preview: "chronological",
    });
  });

  it("does not navigate to the dashboard", () => {
    expect(memberDeleteDestination("family-tree").to).not.toBe("/");
  });
});
