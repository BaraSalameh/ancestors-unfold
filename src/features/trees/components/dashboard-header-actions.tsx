import { Link } from "@tanstack/react-router";
import { Copy, ExternalLink, Pencil, TextCursorInput, Trash2 } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { TooltipProvider } from "@/shared/ui/tooltip";
import { useI18n } from "@/shared/i18n";
import { canUseOwnerTreeControls } from "../pages/dashboard-owner-controls";
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
            <DashboardActionTooltip
              title={t("open_preview")}
              description={t("open_preview_tooltip_description")}
            >
              <Button asChild size="icon" variant="outline">
                <Link
                  to="/tree/$id"
                  params={{ id: tree.id }}
                  search={{ mode: "preview", preview: "lineage" }}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={t("open_preview")}
                >
                  <ExternalLink aria-hidden="true" />
                </Link>
              </Button>
            </DashboardActionTooltip>
            <DashboardActionTooltip
              title={t("copy_preview_link")}
              description={t("copy_preview_link_tooltip_description")}
            >
              <Button
                size="icon"
                variant="outline"
                onClick={() => void treeControls.copyPreview()}
                aria-label={t("copy_preview_link")}
              >
                <Copy aria-hidden="true" />
              </Button>
            </DashboardActionTooltip>
          </>
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
            <DashboardActionTooltip
              title={t("preview")}
              description={t("preview_tooltip_description")}
            >
              <Button asChild size="icon" variant="outline">
                <Link
                  to="/tree/$id"
                  params={{ id: tree.id }}
                  search={{ mode: "preview" }}
                  aria-label={t("preview")}
                >
                  <ExternalLink aria-hidden="true" />
                </Link>
              </Button>
            </DashboardActionTooltip>
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
