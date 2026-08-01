import { useAuth } from "@/features/auth";
import { useI18n } from "@/shared/i18n";
import { DashboardPageSkeleton } from "@/shared/ui/page-skeletons";
import { useCollaborationDashboard } from "../client/use-collaboration-dashboard";
import { useDashboardInvitations } from "../client/use-dashboard-invitations";
import { useDashboardTreeControls } from "../client/use-dashboard-tree-controls";
import { useOwnershipTransfer } from "../client/use-ownership-transfer";
import { useContributorRemoval } from "../client/use-contributor-removal";
import { useContributorAccountDeletion } from "../client/use-contributor-account-deletion";
import { DashboardLoaded } from "../components/dashboard-loaded";

export function CollaborationDashboard() {
  const { t, lang } = useI18n();
  const { session } = useAuth();
  const dashboard = useCollaborationDashboard(lang);
  const data = dashboard.data;
  const tree = data?.tree;
  const invitation = useDashboardInvitations(() => dashboard.load(true));
  const treeControls = useDashboardTreeControls(tree, dashboard.updateTree);
  const transfer = useOwnershipTransfer(
    tree,
    data?.ownershipTransfer ?? null,
    () => dashboard.load(true),
    dashboard.invalidate,
  );
  const removal = useContributorRemoval(tree, data?.branches ?? [], () => dashboard.load(true));
  const accountDeletion = useContributorAccountDeletion();
  if (!data) {
    const local = (en?: string | null, ar?: string | null) =>
      lang === "ar" ? ar || en || "" : en || ar || "";
    return (
      <DashboardPageSkeleton
        label={t("loading")}
        role={session?.currentTree?.role}
        familyName={local(session?.currentTree?.nameEn, session?.currentTree?.nameAr)}
      />
    );
  }
  return (
    <DashboardLoaded
      data={data}
      invitation={invitation}
      treeControls={treeControls}
      transfer={transfer}
      removal={removal}
      accountDeletion={accountDeletion}
    />
  );
}
