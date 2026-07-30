import { describe, expect, it } from "vitest";
import { memberDeleteDestination } from "./member-navigation";

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
