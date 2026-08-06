import { createFileRoute } from "@tanstack/react-router";
import { chronologicalPeriodOrDefault, TreePage } from "@/features/trees";

interface TreeSearch {
  mode: "edit" | "view" | "preview";
  import?: "csv";
  branchId?: string;
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
    const branchId =
      typeof search.branchId === "string" &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        search.branchId,
      )
        ? search.branchId
        : undefined;
    const csvImport = mode === "edit" && search.import === "csv" ? ("csv" as const) : undefined;
    return {
      mode,
      period,
      ...(csvImport ? { import: csvImport } : {}),
      ...(branchId ? { branchId } : {}),
      ...(preview ? { preview } : {}),
    };
  },
  head: () => ({ meta: [{ title: "Family Tree | Ancestors Unfold" }] }),
  component: TreePage,
});
