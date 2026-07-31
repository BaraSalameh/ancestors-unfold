import { createFileRoute } from "@tanstack/react-router";
import { chronologicalPeriodOrDefault, TreePage } from "@/features/trees";

interface TreeSearch {
  mode: "edit" | "view" | "preview";
  preview?: "lineage" | "chronological";
  period?: number;
}

export const Route = createFileRoute("/tree/$id")({
  validateSearch: (search: Record<string, unknown>): TreeSearch => {
    const mode =
      search.mode === "preview"
        ? ("preview" as const)
        : search.mode === "view"
          ? ("view" as const)
          : ("edit" as const);
    const preview =
      mode === "preview" && search.preview === "chronological"
        ? ("chronological" as const)
        : search.preview === "lineage"
          ? ("lineage" as const)
          : undefined;
    const period = chronologicalPeriodOrDefault(search.period);
    return {
      mode,
      period,
      ...(preview ? { preview } : {}),
    };
  },
  head: () => ({ meta: [{ title: "Family Tree | Ancestors Unfold" }] }),
  component: TreePage,
});
