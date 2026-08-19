import { ActiveTreeMemberDetails } from "../components/active-tree-member-details";
import type {
  TreeMemberRouteSearch,
  TreeModalMemberNavigationContext,
} from "../domain/member-navigation";

interface TreeMemberDetailsPageProps {
  memberId: string;
  treeId: string;
  treeSearch: TreeMemberRouteSearch;
}

export function TreeMemberDetailsPage(props: TreeMemberDetailsPageProps) {
  const navigation: TreeModalMemberNavigationContext = {
    treeId: props.treeId,
    returnMode: props.treeSearch.mode,
    returnPreview: props.treeSearch.preview ?? "lineage",
    presentation: "tree-modal",
    treeSearch: props.treeSearch,
  };
  return (
    <div className="fixed inset-x-0 bottom-0 top-14 z-40 overflow-y-auto overscroll-contain bg-background [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <ActiveTreeMemberDetails memberId={props.memberId} navigation={navigation} />
    </div>
  );
}
