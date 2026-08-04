import type { TranslationKey } from "@/locales";
import type { BranchReportRow } from "./types";

type BranchMetricKey =
  | "total"
  | "living"
  | "deceased"
  | "male"
  | "female"
  | "adults"
  | "minors"
  | "unknown_age"
  | "age_0_9"
  | "age_10_17"
  | "age_18_19"
  | "age_20_29"
  | "age_30_39"
  | "age_40_49"
  | "age_50_59"
  | "age_60_69"
  | "age_70_plus"
  | "resident"
  | "non_resident";

type BranchMetric = readonly [BranchMetricKey, TranslationKey];

type BranchReportSection = {
  label: TranslationKey;
  metrics: readonly BranchMetric[];
};

export const branchReportSections = [
  {
    label: "analysis_branch_members",
    metrics: [
      ["total", "analysis_total_members"],
      ["living", "living"],
      ["deceased", "deceased"],
    ],
  },
  {
    label: "gender",
    metrics: [
      ["male", "male"],
      ["female", "female"],
    ],
  },
  {
    label: "analysis_branch_age_summary",
    metrics: [
      ["adults", "analysis_adults"],
      ["minors", "analysis_minors"],
      ["unknown_age", "analysis_unknown_age"],
    ],
  },
  {
    label: "analysis_age_bands",
    metrics: [
      ["age_0_9", "analysis_age_0_9"],
      ["age_10_17", "analysis_age_10_17"],
      ["age_18_19", "analysis_age_18_19"],
      ["age_20_29", "analysis_age_20_29"],
      ["age_30_39", "analysis_age_30_39"],
      ["age_40_49", "analysis_age_40_49"],
      ["age_50_59", "analysis_age_50_59"],
      ["age_60_69", "analysis_age_60_69"],
      ["age_70_plus", "analysis_age_70_plus"],
    ],
  },
  {
    label: "citizenship_status",
    metrics: [
      ["resident", "resident"],
      ["non_resident", "non_resident"],
    ],
  },
] as const satisfies readonly BranchReportSection[];

export function branchReportMetricValue(row: BranchReportRow, key: BranchMetricKey): number {
  return row[key];
}
