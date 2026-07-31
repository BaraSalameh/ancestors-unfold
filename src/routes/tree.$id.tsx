import { createFileRoute } from "@tanstack/react-router";
import { TreePage } from "@/features/trees";

export const Route = createFileRoute("/tree/$id")({
  validateSearch: (search: Record<string, unknown>) => {
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
    return {
      mode,
      ...(preview ? { preview } : {}),
    };
  },
  head: () => ({ meta: [{ title: "Family Tree | Ancestors Unfold" }] }),
  component: TreePage,
});
