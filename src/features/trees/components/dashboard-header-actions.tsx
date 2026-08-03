import { Link } from "@tanstack/react-router";
import {
  Copy,
  ExternalLink,
  MailPlus,
  MoreHorizontal,
  Pencil,
  ShieldCheck,
  TextCursorInput,
  Trash2,
  ChartNoAxesCombined,
} from "lucide-react";
import { Button } from "@/shared/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/shared/ui/dropdown-menu";
import { TooltipProvider } from "@/shared/ui/tooltip";
import { useI18n } from "@/shared/i18n";
import {
  canUseOwnerTreeControls,
  canUseTreePreviewControls,
} from "../pages/dashboard-owner-controls";
import type { CurrentTree } from "../pages/dashboard-types";
import type { DashboardTreeControls } from "../client/use-dashboard-tree-controls";
import type { ContributorAccountDeletionController } from "../client/use-contributor-account-deletion";
import type { DashboardInvitationsController } from "../client/use-dashboard-invitations";
import type { OwnershipTransferController } from "../client/use-ownership-transfer";
import type { ContributorRemovalController } from "../client/use-contributor-removal";
import type { OwnershipTransfer } from "../pages/dashboard-types";
import { DashboardActionTooltip } from "./dashboard-components";

type HeaderActionsProps = {
  tree: CurrentTree;
  treeControls: DashboardTreeControls;
  accountDeletion: ContributorAccountDeletionController;
  invitation: DashboardInvitationsController;
  transfer: OwnershipTransferController;
  removal: ContributorRemovalController;
  ownershipTransfer: OwnershipTransfer | null;
};

function TreeActionsTrigger() {
  const { t } = useI18n();
  return (
    <DropdownMenuTrigger asChild>
      <Button variant="outline" data-dashboard-action="tree-actions">
        <MoreHorizontal aria-hidden="true" />
        {t("tree_actions")}
      </Button>
    </DropdownMenuTrigger>
  );
}

function OwnerTreeActions({
  tree,
  treeControls,
  invitation,
  transfer,
  removal,
  ownershipTransfer,
}: Omit<HeaderActionsProps, "accountDeletion">) {
  const { t } = useI18n();
  return (
    <DropdownMenu>
      <TreeActionsTrigger />
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel>{t("tree_actions")}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={treeControls.openRename}>
          <TextCursorInput aria-hidden="true" />
          {t("rename")}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => invitation.setInviteOpen(true)}>
          <MailPlus aria-hidden="true" />
          {t("invite_contributor")}
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={removal.removableBranches.length === 0}
          onSelect={() => removal.setOpen(true)}
        >
          <Trash2 aria-hidden="true" />
          {t("cancel_contributor_contribution")}
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={Boolean(ownershipTransfer?.verified)}
          onSelect={() => transfer.setOpen(true)}
        >
          <ShieldCheck aria-hidden="true" />
          {t(
            ownershipTransfer && !ownershipTransfer.verified
              ? "continue_ownership_transfer"
              : "transfer_ownership",
          )}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link
            to="/tree/$id"
            params={{ id: tree.id }}
            search={{ mode: "preview", preview: "lineage" }}
            target="_blank"
            rel="noopener noreferrer"
          >
            <ExternalLink aria-hidden="true" />
            {t("open_preview")}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => void treeControls.copyPreview()}>
          <Copy aria-hidden="true" />
          {t("copy_preview_link")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ContributorTreeActions({
  tree,
  treeControls,
  accountDeletion,
}: Pick<HeaderActionsProps, "tree" | "treeControls" | "accountDeletion">) {
  const { t } = useI18n();
  return (
    <DropdownMenu>
      <TreeActionsTrigger />
      <DropdownMenuContent align="end" className="w-64">
        {canUseTreePreviewControls(tree.role) && (
          <>
            <DropdownMenuItem asChild>
              <Link
                to="/tree/$id"
                params={{ id: tree.id }}
                search={{ mode: "preview", preview: "lineage" }}
                target="_blank"
                rel="noopener noreferrer"
              >
                <ExternalLink aria-hidden="true" />
                {t("open_preview")}
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => void treeControls.copyPreview()}>
              <Copy aria-hidden="true" />
              {t("copy_preview_link")}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        )}
        <DropdownMenuItem
          className="text-destructive focus:text-destructive"
          onSelect={() => accountDeletion.setOpen(true)}
        >
          <Trash2 className="me-2 h-4 w-4" />
          {t("cancel_contribution")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function DashboardHeaderActions({
  tree,
  treeControls,
  accountDeletion,
  invitation,
  transfer,
  removal,
  ownershipTransfer,
}: HeaderActionsProps) {
  const { t } = useI18n();
  return (
    <TooltipProvider delayDuration={350}>
      <div className="flex flex-wrap justify-end gap-2">
        {tree.analysis_enabled !== false && (
          <Button asChild variant="outline" data-dashboard-action="analysis">
            <Link to="/analysis">
              <ChartNoAxesCombined aria-hidden="true" />
              {t("analysis")}
            </Link>
          </Button>
        )}
        {canUseOwnerTreeControls(tree.role) && (
          <OwnerTreeActions
            tree={tree}
            treeControls={treeControls}
            invitation={invitation}
            transfer={transfer}
            removal={removal}
            ownershipTransfer={ownershipTransfer}
          />
        )}
        {tree.role === "contributor" && (
          <ContributorTreeActions
            tree={tree}
            treeControls={treeControls}
            accountDeletion={accountDeletion}
          />
        )}
        <DashboardActionTooltip title={t("edit")} description={t("edit_tooltip_description")}>
          <Button
            asChild
            size="icon"
            data-dashboard-action="edit"
            className="ring-2 ring-primary/20 ring-offset-2 ring-offset-background"
          >
            <Link
              to="/tree/$id"
              params={{ id: tree.id }}
              search={{ mode: "edit" }}
              aria-label={t("edit")}
            >
              <Pencil aria-hidden="true" />
            </Link>
          </Button>
        </DashboardActionTooltip>
      </div>
    </TooltipProvider>
  );
}
