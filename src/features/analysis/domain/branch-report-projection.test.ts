import { describe, expect, it } from "vitest";
import { branchReportMetricValue, branchReportSections } from "./branch-report-projection";
import type { BranchReportRow } from "./types";

const row = {
  id: "branch-1",
  name_en: "North",
  name_ar: null,
  total: 12,
  living: 10,
  deceased: 2,
  male: 7,
  female: 5,
  adults: 8,
  minors: 3,
  unknown_age: 1,
  age_0_9: 0,
  age_10_17: 3,
  age_18_19: 1,
  age_20_29: 2,
  age_30_39: 2,
  age_40_49: 1,
  age_50_59: 1,
  age_60_69: 1,
  age_70_plus: 0,
  age_18_29: 3,
  age_30_44: 3,
  age_45_59: 2,
  age_60_74: 1,
  age_75_plus: 0,
  resident: 9,
  non_resident: 3,
  completeness_percent: 84,
} satisfies BranchReportRow;

describe("branch report projection", () => {
  it("groups metrics in the requested order", () => {
    expect(branchReportSections.map((section) => section.label)).toEqual([
      "analysis_branch_members",
      "gender",
      "analysis_branch_age_summary",
      "analysis_age_bands",
      "citizenship_status",
    ]);

    expect(branchReportSections.flatMap((section) => section.metrics.map(([key]) => key))).toEqual([
      "total",
      "living",
      "deceased",
      "male",
      "female",
      "adults",
      "minors",
      "unknown_age",
      "age_0_9",
      "age_10_17",
      "age_18_19",
      "age_20_29",
      "age_30_39",
      "age_40_49",
      "age_50_59",
      "age_60_69",
      "age_70_plus",
      "resident",
      "non_resident",
    ]);
  });

  it("omits compatibility fields and preserves zero-valued metrics", () => {
    const renderedKeys = branchReportSections.flatMap((section) =>
      section.metrics.map(([key]) => key),
    );

    expect(renderedKeys).not.toContain("completeness_percent");
    expect(renderedKeys).not.toContain("age_18_29");
    expect(renderedKeys).not.toContain("age_75_plus");
    expect(branchReportMetricValue(row, "age_0_9")).toBe(0);
  });
});
