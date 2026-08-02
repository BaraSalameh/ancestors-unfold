import { createFileRoute } from "@tanstack/react-router";
import { AnalysisPage } from "@/features/analysis";

export const Route = createFileRoute("/analysis")({
  head: () => ({ meta: [{ title: "Family analysis | Ancestors Unfold" }] }),
  component: AnalysisPage,
});
