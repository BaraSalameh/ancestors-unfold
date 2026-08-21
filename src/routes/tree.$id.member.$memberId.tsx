import { createFileRoute } from "@tanstack/react-router";
import { TreeMemberDetailsPage } from "@/features/members";

export const Route = createFileRoute("/tree/$id/member/$memberId")({
  head: () => ({ meta: [{ title: "Member Details | Ancestors Unfold" }] }),
  component: TreeMemberDetailsRoute,
});

function TreeMemberDetailsRoute() {
  const { id, memberId } = Route.useParams();
  const treeSearch = Route.useSearch();
  return <TreeMemberDetailsPage treeId={id} memberId={memberId} treeSearch={treeSearch} />;
}
