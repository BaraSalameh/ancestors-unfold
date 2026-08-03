import { useAuth } from "@/features/auth";
import { useI18n } from "@/shared/i18n";
import { DashboardPageSkeleton } from "@/shared/ui/page-skeletons";
import { useCollaborationDashboard } from "../client/use-collaboration-dashboard";
import { useDashboardInvitations } from "../client/use-dashboard-invitations";
import { useDashboardTreeControls } from "../client/use-dashboard-tree-controls";
import { useOwnershipTransfer } from "../client/use-ownership-transfer";
import { useContributorRemoval } from "../client/use-contributor-removal";
import { useContributorAccountDeletion } from "../client/use-contributor-account-deletion";
import { useDashboardInsights } from "../client/use-dashboard-insights";
import { DashboardLoaded } from "../components/dashboard-loaded";
import { Button } from "@/shared/ui/button";
import { Card, CardContent } from "@/shared/ui/card";
import { TriangleAlert } from "lucide-react";

export function CollaborationDashboard() {
  const { t, lang } = useI18n();
  const { session } = useAuth();
  const dashboard = useCollaborationDashboard(lang);
  const data = dashboard.data;
  const tree = data?.tree;
  const insights = useDashboardInsights(tree);
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
  if (!data && dashboard.error) {
    return (
      <main className="mx-auto flex min-h-[calc(100vh-3.5rem)] max-w-xl items-center px-4 py-10">
        <Card className="w-full">
          <CardContent className="space-y-4 p-6 text-center">
            <TriangleAlert className="mx-auto h-8 w-8 text-destructive" aria-hidden="true" />
            <div>
              <h1 className="text-lg font-semibold">{t("dashboard_load_failed")}</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                {t("dashboard_load_failed_description")}
              </p>
            </div>
            <Button onClick={() => void dashboard.load(true).catch(() => undefined)}>
              {t("retry")}
            </Button>
          </CardContent>
        </Card>
      </main>
    );
  }
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
      insights={insights}
      invitation={invitation}
      treeControls={treeControls}
      transfer={transfer}
      removal={removal}
      accountDeletion={accountDeletion}
    />
  );
}
