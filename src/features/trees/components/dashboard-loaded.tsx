import { useI18n } from "@/shared/i18n";
import type { DashboardData } from "../pages/dashboard-types";
import type { DashboardInvitationsController } from "../client/use-dashboard-invitations";
import type { DashboardTreeControls } from "../client/use-dashboard-tree-controls";
import type { OwnershipTransferController } from "../client/use-ownership-transfer";
import type { ContributorRemovalController } from "../client/use-contributor-removal";
import type { ContributorAccountDeletionController } from "../client/use-contributor-account-deletion";
import { InviteDialog } from "./dashboard-invite-dialog";
import { OwnershipTransferDialog } from "./ownership-transfer-dialog";
import { ContributorRemovalDialog } from "./contributor-removal-dialog";
import { TreeRenameDialog } from "./tree-rename-dialog";
import { ContributorAccountDeletionDialog } from "./contributor-account-deletion-dialog";
import { DashboardHeader } from "./dashboard-header";
import { AuthenticityCard, BranchesCard, InvitationsCard } from "./dashboard-cards";
import { OwnershipTransferPrompt, OwnershipTransferStatus } from "./dashboard-components";

interface DashboardLoadedProps {
  data: DashboardData;
  invitation: DashboardInvitationsController;
  treeControls: DashboardTreeControls;
  transfer: OwnershipTransferController;
  removal: ContributorRemovalController;
  accountDeletion: ContributorAccountDeletionController;
}

export function DashboardLoaded({
  data,
  invitation,
  treeControls,
  transfer,
  removal,
  accountDeletion,
}: DashboardLoadedProps) {
  const { lang } = useI18n();
  const local = (en?: string | null, ar?: string | null) =>
    lang === "ar" ? ar || en || "" : en || ar || "";
  const ownershipTransfer = data.ownershipTransfer;
  return (
    <main className="min-h-[calc(100vh-3.5rem)] bg-muted/25">
      <DashboardHeader
        tree={data.tree}
        stats={data.stats}
        treeControls={treeControls}
        accountDeletion={accountDeletion}
        invitation={invitation}
        transfer={transfer}
        removal={removal}
        ownershipTransfer={ownershipTransfer}
      />
      <section className="mx-auto grid max-w-7xl gap-5 px-4 py-8 sm:px-6 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          {data.tree.role === "contributor" &&
            ownershipTransfer?.proposed_owner_user_id &&
            ownershipTransfer.verified && (
              <OwnershipTransferPrompt
                transfer={ownershipTransfer}
                local={local}
                action={transfer.action}
                onAction={transfer.act}
              />
            )}
          {data.tree.role === "owner" && ownershipTransfer && (
            <OwnershipTransferStatus
              transfer={ownershipTransfer}
              controller={transfer}
              local={local}
            />
          )}
          <BranchesCard data={data} local={local} />
          {data.tree.role === "owner" &&
            data.invitations.some((item) => item.status === "pending") && (
              <InvitationsCard data={data} controller={invitation} local={local} />
            )}
        </div>
        <div className="space-y-5">
          <AuthenticityCard data={data} local={local} />
        </div>
      </section>
      <InviteDialog
        open={invitation.inviteOpen}
        onOpenChange={invitation.setInviteOpen}
        treeId={data.tree.id}
        onSent={invitation.sent}
      />
      <OwnershipTransferDialog
        controller={transfer}
        transfer={ownershipTransfer}
        branches={removal.removableBranches}
        local={local}
      />
      <ContributorRemovalDialog controller={removal} local={local} />
      <TreeRenameDialog controller={treeControls} />
      <ContributorAccountDeletionDialog controller={accountDeletion} />
    </main>
  );
}
