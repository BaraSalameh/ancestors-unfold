import { describe, expect, it } from "vitest";
import {
  analysisExcludeWivesDisabled,
  analysisPageSearchSchema,
  analysisPageState,
} from "./analysis-page-search";

describe("analysis dashboard deep links", () => {
  it("initializes branch quality reports", () => {
    const search = analysisPageSearchSchema.parse({
      tab: "quality",
      branchId: "550e8400-e29b-41d4-a716-446655440000",
    });
    expect(analysisPageState(search)).toMatchObject({
      tab: "quality",
      branchId: "550e8400-e29b-41d4-a716-446655440000",
    });
  });

  it("initializes a missing-field explorer", () => {
    const state = analysisPageState(
      analysisPageSearchSchema.parse({ tab: "explorer", missingField: "birth_date" }),
    );
    expect(state.tab).toBe("explorer");
    expect(state.definition.filters.missingFields).toEqual(["birth_date"]);
  });

  it("drops invalid search values safely", () => {
    const state = analysisPageState(
      analysisPageSearchSchema.parse({
        tab: "invalid",
        branchId: "not-a-uuid",
        missingField: "unknown",
      }),
    );
    expect(state).toMatchObject({ tab: "overview", branchId: null, definition: { filters: {} } });
  });

  it("disables wife exclusion only for relationships and data quality", () => {
    expect(analysisExcludeWivesDisabled("relationships")).toBe(true);
    expect(analysisExcludeWivesDisabled("quality")).toBe(true);
    expect(analysisExcludeWivesDisabled("overview")).toBe(false);
    expect(analysisExcludeWivesDisabled("branches")).toBe(false);
    expect(analysisExcludeWivesDisabled("explorer")).toBe(false);
    expect(analysisExcludeWivesDisabled("saved")).toBe(false);
  });
});
