import { useParams, useSearch } from "@tanstack/react-router";
import { TriangleAlert } from "lucide-react";
import { TreeLoadingIndicator } from "@/shared/ui/page-skeletons";
import { useI18n } from "@/shared/i18n";
import {
  familyStore,
  getChildren,
  getGeneration,
  useFamily,
  useFamilyLoadState,
} from "@/features/trees";
import { MemberDetailsView } from "../components/member-details-view";
import { memberDescendants, memberSpouses, paternalAncestors } from "../domain/member-details";
import type { MemberNavigationContext } from "../domain/member-navigation";

function TreeUnavailable() {
  const { t } = useI18n();
  return (
    <div className="flex min-h-[calc(100vh-3.5rem)] items-center justify-center p-6 text-center">
      <div>
        <TriangleAlert className="mx-auto h-8 w-8 text-muted-foreground" />
        <h1 className="mt-3 text-lg font-semibold">{t("tree_unavailable")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("tree_unavailable_hint")}</p>
      </div>
    </div>
  );
}

export function MemberPage() {
  const { id } = useParams({ from: "/member/$id" });
  const {
    treeId: requestedTreeId,
    returnMode,
    returnPreview,
  } = useSearch({
    from: "/member/$id",
  });
  if (requestedTreeId) familyStore.activateTree(requestedTreeId, returnMode);

  const loadState = useFamilyLoadState();
  const members = useFamily();
  const { t } = useI18n();
  if (requestedTreeId && (loadState === "loading" || loadState === "idle")) {
    return <TreeLoadingIndicator label={t("loading_tree")} />;
  }
  if (requestedTreeId && loadState === "error") return <TreeUnavailable />;

  const member = members.find((candidate) => candidate.id === id);
  if (!member) return <div className="p-8 text-center text-muted-foreground">{t("not_found")}</div>;

  const treeId = requestedTreeId ?? familyStore.getActiveTreeId();
  const navigation: MemberNavigationContext = { treeId, returnMode, returnPreview };
  return (
    <MemberDetailsView
      member={member}
      father={members.find((candidate) => candidate.id === member.father_id)}
      mother={members.find((candidate) => candidate.id === member.mother_id)}
      spouses={memberSpouses(member, members)}
      children={getChildren(members, member.id)}
      ancestors={paternalAncestors(member, members)}
      descendants={memberDescendants(member, members)}
      generation={getGeneration(members, member.id)}
      imageSrc={familyStore.getMemberImageSrc(id)}
      canEdit={familyStore.canEditActiveTree()}
      navigation={navigation}
    />
  );
}
