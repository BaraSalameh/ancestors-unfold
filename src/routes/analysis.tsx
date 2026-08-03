import { createFileRoute } from "@tanstack/react-router";
import { AnalysisPage, analysisPageSearchSchema } from "@/features/analysis";

export const Route = createFileRoute("/analysis")({
  validateSearch: analysisPageSearchSchema,
  head: () => ({ meta: [{ title: "Family analysis | Ancestors Unfold" }] }),
  component: AnalysisPage,
});
