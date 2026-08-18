import { PowerOff, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useI18n } from "@/shared/i18n";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/shared/ui/alert-dialog";
import { Button } from "@/shared/ui/button";
import type { Branch, CurrentTree } from "../pages/dashboard-types";
import { BranchDeactivationDialog } from "./branch-deactivation-dialog";

// Bulk lifecycle state stays together so its confirmation dialogs share one immutable selection.
// eslint-disable-next-line max-lines-per-function
export function BulkBranchActions({
  branches,
  tree,
  treeDirty,
  onSaved,
  onClear,
}: {
  branches: Branch[];
  tree: CurrentTree;
  treeDirty: boolean;
  onSaved: () => Promise<void>;
  onClear: () => void;
}) {
  const { t } = useI18n();
  const [deactivateOpen, setDeactivateOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const active = branches.filter(({ status }) => status === "active");
  const inactive = branches.filter(({ status }) => status === "inactive");
  const ensureTreeSaved = () => {
    if (!treeDirty) return true;
    toast.error(t("save_tree_before_branch_management"));
    return false;
  };
  const remove = async () => {
    if (deleting || !inactive.length || !ensureTreeSaved()) return;
    setDeleting(true);
    try {
      const response = await fetch(`/api/trees/${tree.id}/branches`, {
        method: "DELETE",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          branchIds: inactive.map(({ id }) => id),
          expectedVersion: tree.version,
          batchId: crypto.randomUUID(),
        }),
      });
      const body = (await response.json()) as { code?: string };
      if (!response.ok) {
        toast.error(
          body.code === "BRANCH_IN_USE"
            ? t("branch_in_use")
            : body.code === "BRANCH_MUST_BE_INACTIVE"
              ? t("branch_must_be_inactive")
              : t("branch_management_failed"),
        );
        return;
      }
      setDeleteOpen(false);
      await onSaved();
      onClear();
      toast.success(t("branches_deleted", { count: inactive.length }));
    } catch {
      toast.error(t("branch_management_failed"));
    } finally {
      setDeleting(false);
    }
  };
  return (
    <>
      <div className="mb-5 flex flex-wrap items-center gap-2 rounded-lg border bg-muted/30 p-3">
        <span className="me-auto text-sm font-medium">
          {t("selected_branches", { count: branches.length })}
        </span>
        {active.length ? (
          <Button
            variant="outline"
            onClick={() => {
              if (ensureTreeSaved()) setDeactivateOpen(true);
            }}
          >
            <PowerOff aria-hidden="true" />
            {t("deactivate_selected_branches", { count: active.length })}
          </Button>
        ) : null}
        {inactive.length ? (
          <Button
            variant="destructive"
            onClick={() => {
              if (ensureTreeSaved()) setDeleteOpen(true);
            }}
          >
            <Trash2 aria-hidden="true" />
            {t("delete_selected_branches", { count: inactive.length })}
          </Button>
        ) : null}
        <Button variant="ghost" onClick={onClear}>
          {t("cancel")}
        </Button>
      </div>
      {active[0] ? (
        <BranchDeactivationDialog
          open={deactivateOpen}
          onOpenChange={setDeactivateOpen}
          branch={active[0]}
          branches={active}
          tree={tree}
          onSaved={onSaved}
        />
      ) : null}
      <AlertDialog
        open={deleteOpen}
        onOpenChange={(open) => {
          if (!deleting) setDeleteOpen(open);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("delete_selected_branches_title")}</AlertDialogTitle>
            <AlertDialogDescription>{t("delete_selected_branches_desc")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>{t("cancel")}</AlertDialogCancel>
            <Button variant="destructive" loading={deleting} onClick={() => void remove()}>
              {t("delete_selected_branches", { count: inactive.length })}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
