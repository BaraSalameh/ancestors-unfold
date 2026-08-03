import { z } from "zod";
import type { AnalysisQueryDefinition } from "./types";

export const analysisTabs = [
  "overview",
  "branches",
  "relationships",
  "quality",
  "explorer",
  "saved",
] as const;
export type AnalysisTab = (typeof analysisTabs)[number];

const analysisMissingFields = [
  "name_en",
  "name_ar",
  "birth_date",
  "branch",
  "image",
  "parent",
] as const;

export const analysisPageSearchSchema = z.object({
  tab: z.enum(analysisTabs).optional().catch(undefined),
  branchId: z.string().uuid().optional().catch(undefined),
  missingField: z.enum(analysisMissingFields).optional().catch(undefined),
});

type AnalysisPageSearch = z.infer<typeof analysisPageSearchSchema>;

export function analysisPageState(search: AnalysisPageSearch): {
  tab: AnalysisTab;
  branchId: string | null;
  definition: AnalysisQueryDefinition;
} {
  return {
    tab: search.tab ?? (search.missingField ? "explorer" : "overview"),
    branchId: search.branchId ?? null,
    definition: {
      filters: search.missingField ? { missingFields: [search.missingField] } : {},
      sort: "name",
      direction: "asc",
    },
  };
}
