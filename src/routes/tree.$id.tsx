import { createFileRoute } from "@tanstack/react-router";
import { TreePage } from "@/features/trees";

export const Route = createFileRoute("/tree/$id")({
  validateSearch: (search: Record<string, unknown>) => ({
    mode:
      search.mode === "preview"
        ? ("preview" as const)
        : search.mode === "view"
          ? ("view" as const)
          : ("edit" as const),
  }),
  head: () => ({ meta: [{ title: "Family Tree | Ancestors Unfold" }] }),
  component: TreePage,
});
