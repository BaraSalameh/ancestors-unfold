import { createFileRoute } from "@tanstack/react-router";
import { FamilyTree } from "@/components/FamilyTree";
import { familyStore } from "@/lib/family-store";

export const Route = createFileRoute("/tree/$id")({
  validateSearch: (search: Record<string, unknown>) => ({
    mode: search.mode === "preview" ? ("preview" as const) : ("edit" as const),
  }),
  head: () => ({ meta: [{ title: "Family Tree | Ancestors Unfold" }] }),
  component: TreePage,
});

function TreePage() {
  const { mode } = Route.useSearch();
  const { id } = Route.useParams();
  familyStore.activateTree(id);
  return (
    <div className="h-[calc(100vh-3.5rem)] w-full">
      <FamilyTree readOnly={mode === "preview"} />
    </div>
  );
}
