import { describe, expect, it } from "vitest";
import { clearAnalysisFilters, hasActiveAnalysisFilters } from "./filter-state";
import type { AnalysisQueryDefinition } from "./types";

describe("analysis filter state", () => {
  it("recognizes active values without treating undefined placeholders as filters", () => {
    expect(hasActiveAnalysisFilters({})).toBe(false);
    expect(hasActiveAnalysisFilters({ search: undefined, excludeWives: undefined })).toBe(false);
    expect(hasActiveAnalysisFilters({ excludeWives: true })).toBe(true);
    expect(hasActiveAnalysisFilters({ hasChildren: false })).toBe(true);
  });

  it("clears filters while preserving query presentation settings", () => {
    const definition: AnalysisQueryDefinition = {
      filters: { search: "Khalil", excludeWives: true, minAge: 18 },
      sort: "generation",
      direction: "desc",
      view: "explorer",
    };

    expect(clearAnalysisFilters(definition)).toEqual({
      filters: {},
      sort: "generation",
      direction: "desc",
      view: "explorer",
    });
  });
});
