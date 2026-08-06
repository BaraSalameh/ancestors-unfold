import { Link } from "@tanstack/react-router";
import {
  Copy,
  GitBranch,
  MoreHorizontal,
  Pencil,
  ShieldCheck,
  TextCursorInput,
  Trash2,
  ChartNoAxesCombined,
  Eye,
  FileUp,
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
import { canUseOwnerTreeControls } from "../pages/dashboard-owner-controls";
import type { CurrentTree } from "../pages/dashboard-types";
import type { DashboardTreeControls } from "../client/use-dashboard-tree-controls";
import type { ContributorAccountDeletionController } from "../client/use-contributor-account-deletion";
import type { OwnershipTransferController } from "../client/use-ownership-transfer";
import type { OwnershipTransfer } from "../pages/dashboard-types";
import { DashboardActionTooltip } from "./dashboard-components";
import { canEditDashboardTree } from "../pages/dashboard-projections";

type HeaderActionsProps = {
  tree: CurrentTree;
  treeControls: DashboardTreeControls;
  accountDeletion: ContributorAccountDeletionController;
  transfer: OwnershipTransferController;
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
  transfer,
  ownershipTransfer,
}: Pick<HeaderActionsProps, "tree" | "treeControls" | "transfer" | "ownershipTransfer">) {
  const { t } = useI18n();
  return (
    <DropdownMenu>
      <TreeActionsTrigger />
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel>{t("tree_actions")}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link to="/branches" search={{ treeId: tree.id }}>
            <GitBranch aria-hidden="true" />
            {t("manage_branches")}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={treeControls.openManage}>
          <TextCursorInput aria-hidden="true" />
          {t("manage_family")}
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link to="/tree/$id" params={{ id: tree.id }} search={{ mode: "edit", import: "csv" }}>
            <FileUp aria-hidden="true" />
            {t("family_csv_import")}
          </Link>
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
        <DropdownMenuItem asChild>
          <Link to="/branches" search={{ treeId: tree.id }}>
            <GitBranch aria-hidden="true" />
            {t("branches")}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => void treeControls.copyPreview()}>
          <Copy aria-hidden="true" />
          {t("copy_preview_link")}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
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

function DisabledEditingAction({ label, icon }: { label: string; icon: React.ReactNode }) {
  const { t } = useI18n();
  return (
    <DashboardActionTooltip title={label} description={t("read_only_action_description")}>
      <span className="inline-flex" tabIndex={0}>
        <Button disabled data-dashboard-action="edit">
          {icon}
          {label}
        </Button>
      </span>
    </DashboardActionTooltip>
  );
}

function EditingActions({ tree }: Pick<HeaderActionsProps, "tree">) {
  const { t } = useI18n();
  const editable = canEditDashboardTree(tree);
  const editLabel = tree.role === "owner" ? t("edit_tree") : t("continue_assigned_branch");
  return (
    <>
      {editable ? (
        <Button data-dashboard-action="edit" asChild>
          <Link to="/tree/$id" params={{ id: tree.id }} search={{ mode: "edit" }}>
            <Pencil aria-hidden="true" />
            {editLabel}
          </Link>
        </Button>
      ) : (
        <DisabledEditingAction label={editLabel} icon={<Pencil aria-hidden="true" />} />
      )}
      <Button data-dashboard-action="preview" asChild variant="outline">
        <Link
          to="/tree/$id"
          params={{ id: tree.id }}
          search={{ mode: "preview", preview: "lineage" }}
          target="_blank"
          rel="noopener noreferrer"
        >
          <Eye aria-hidden="true" />
          {t("preview")}
        </Link>
      </Button>
    </>
  );
}

export function DashboardHeaderActions({
  tree,
  treeControls,
  accountDeletion,
  transfer,
  ownershipTransfer,
}: HeaderActionsProps) {
  const { t } = useI18n();
  return (
    <TooltipProvider delayDuration={350}>
      <div className="flex flex-wrap justify-end gap-2">
        <EditingActions tree={tree} />
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
            transfer={transfer}
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
      </div>
    </TooltipProvider>
  );
}
