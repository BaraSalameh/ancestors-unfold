import { createFileRoute } from "@tanstack/react-router";
import { AddMemberPage, addMemberSearchSchema } from "@/routes/add";
import { familyStore } from "@/lib/family-store";

export const Route = createFileRoute("/tree/$id_/add")({
  validateSearch: addMemberSearchSchema,
  head: () => ({ meta: [{ title: "Add Member | Ancestors Unfold" }] }),
  component: TreeAddMemberPage,
});

function TreeAddMemberPage() {
  const { id } = Route.useParams();
  const search = Route.useSearch();
  familyStore.activateTree(id);
  return <AddMemberPage treeId={id} {...search} />;
}
