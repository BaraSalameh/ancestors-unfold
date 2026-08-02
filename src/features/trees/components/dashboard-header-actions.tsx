import { Link } from "@tanstack/react-router";
import { Copy, ExternalLink, Pencil, TextCursorInput, Trash2 } from "lucide-react";
import { Button } from "@/shared/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
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
import { DashboardActionTooltip } from "./dashboard-components";

export function DashboardHeaderActions({
  tree,
  treeControls,
  accountDeletion,
}: {
  tree: CurrentTree;
  treeControls: DashboardTreeControls;
  accountDeletion: ContributorAccountDeletionController;
}) {
  const { t } = useI18n();
  return (
    <TooltipProvider delayDuration={350}>
      <div className="flex flex-wrap justify-end gap-2">
        {canUseOwnerTreeControls(tree.role) && (
          <>
            <DashboardActionTooltip
              title={t("rename")}
              description={t("rename_tooltip_description")}
            >
              <Button
                size="icon"
                variant="outline"
                onClick={treeControls.openRename}
                aria-label={t("rename")}
              >
                <TextCursorInput aria-hidden="true" />
              </Button>
            </DashboardActionTooltip>
          </>
        )}
        {canUseTreePreviewControls(tree.role) && (
          <DropdownMenu>
            <DashboardActionTooltip
              title={t("preview")}
              description={t("preview_tooltip_description")}
            >
              <DropdownMenuTrigger asChild>
                <Button size="icon" variant="outline" aria-label={t("preview")}>
                  <ExternalLink aria-hidden="true" />
                </Button>
              </DropdownMenuTrigger>
            </DashboardActionTooltip>
            <DropdownMenuContent align="end">
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
        )}
        <DashboardActionTooltip title={t("edit")} description={t("edit_tooltip_description")}>
          <Button
            asChild
            size="icon"
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
        {tree.role === "contributor" && (
          <>
            <Button variant="destructive" onClick={() => accountDeletion.setOpen(true)}>
              <Trash2 className="me-2 h-4 w-4" />
              {t("cancel_contribution")}
            </Button>
          </>
        )}
      </div>
    </TooltipProvider>
  );
}
