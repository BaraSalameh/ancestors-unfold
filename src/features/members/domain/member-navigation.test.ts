import { describe, expect, it } from "vitest";
import { memberDeleteDestination } from "./member-navigation";

describe("member deletion navigation", () => {
  it("replaces the deleted member route with the active tree editor", () => {
    expect(memberDeleteDestination("family-tree")).toEqual({
      to: "/tree/$id",
      params: { id: "family-tree" },
      search: { mode: "edit" },
      replace: true,
    });
  });

  it("does not navigate to the dashboard", () => {
    expect(memberDeleteDestination("family-tree").to).not.toBe("/");
  });
});
