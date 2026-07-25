import { createFileRoute } from "@tanstack/react-router";
import { SubfamiliesPage } from "@/features/subfamilies";

export const Route = createFileRoute("/subfamilies")({
  validateSearch: (search: Record<string, unknown>) => ({
    treeId: typeof search.treeId === "string" ? search.treeId : undefined,
  }),
  component: SubfamiliesPage,
});
