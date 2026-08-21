import { useAuth } from "@/features/auth/client";
import { useI18n } from "@/shared/i18n";
import { DashboardPageSkeleton } from "@/shared/ui/page-skeletons";
import { useCollaborationDashboard } from "../client/use-collaboration-dashboard";
import { useDashboardTreeControls } from "../client/use-dashboard-tree-controls";
import { useOwnershipTransfer } from "../client/use-ownership-transfer";
import { useContributorAccountDeletion } from "../client/use-contributor-account-deletion";
import type { DashboardBootstrap } from "../domain/dashboard-bootstrap";
import { DashboardLoaded } from "../components/dashboard-loaded";
import { Button } from "@/shared/ui/button";
import { Card, CardContent } from "@/shared/ui/card";
import { TriangleAlert } from "lucide-react";

export function CollaborationDashboard({
  initialBootstrap,
}: {
  initialBootstrap?: DashboardBootstrap | null;
}) {
  const { t, lang } = useI18n();
  const { session } = useAuth();
  const dashboard = useCollaborationDashboard(lang, initialBootstrap);
  const tree = dashboard.tree.data;
  const treeControls = useDashboardTreeControls(tree, dashboard.updateTree);
  const transfer = useOwnershipTransfer(
    tree,
    dashboard.ownershipTransfer.data ?? null,
    dashboard.refresh,
  );
  const accountDeletion = useContributorAccountDeletion();
  if (!tree && dashboard.tree.error) {
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
            <Button onClick={dashboard.tree.retry}>{t("retry")}</Button>
          </CardContent>
        </Card>
      </main>
    );
  }
  if (!tree) {
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
      tree={tree}
      statistics={dashboard.statistics}
      branches={dashboard.branches}
      activity={dashboard.activity}
      invitations={dashboard.invitations}
      ownershipTransfer={dashboard.ownershipTransfer}
      insights={dashboard.insights}
      treeControls={treeControls}
      transfer={transfer}
      accountDeletion={accountDeletion}
    />
  );
}
