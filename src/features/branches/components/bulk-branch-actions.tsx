import { PowerOff, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
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
import { ApiClientError, validatedApiRequest } from "@/shared/api/client";
import type { Branch, CurrentTree } from "@/features/collaboration";
import { BranchDeactivationDialog } from "./branch-deactivation-dialog";

const branchMutationResponseSchema = z
  .object({ version: z.number().int().positive() })
  .passthrough();

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
  const active = branches.filter(({ status }) => status === "active");
  const inactive = branches.filter(({ status }) => status === "inactive");
  const ensureTreeSaved = () => {
    if (!treeDirty) return true;
    toast.error(t("save_tree_before_branch_management"));
    return false;
  };
  const deletion = useBulkBranchDeletion({ tree, branches: inactive, onSaved, onClear });
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
          onSaved={async () => {
            await onSaved();
            onClear();
          }}
        />
      ) : null}
      <AlertDialog
        open={deleteOpen}
        onOpenChange={(open) => {
          if (!deletion.pending) setDeleteOpen(open);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("delete_selected_branches_title")}</AlertDialogTitle>
            <AlertDialogDescription>{t("delete_selected_branches_desc")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletion.pending}>{t("cancel")}</AlertDialogCancel>
            <Button
              variant="destructive"
              loading={deletion.pending}
              onClick={() => void deletion.remove(() => setDeleteOpen(false), ensureTreeSaved)}
            >
              {t("delete_selected_branches", { count: inactive.length })}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function useBulkBranchDeletion({
  tree,
  branches,
  onSaved,
  onClear,
}: {
  tree: CurrentTree;
  branches: Branch[];
  onSaved: () => Promise<void>;
  onClear: () => void;
}) {
  const { t } = useI18n();
  const [pending, setPending] = useState(false);
  const remove = async (close: () => void, ensureTreeSaved: () => boolean) => {
    if (pending || !branches.length || !ensureTreeSaved()) return;
    setPending(true);
    try {
      await validatedApiRequest(branchMutationResponseSchema, `/api/trees/${tree.id}/branches`, {
        method: "DELETE",
        body: {
          branchIds: branches.map(({ id }) => id),
          expectedVersion: tree.version,
          batchId: crypto.randomUUID(),
        },
      });
      close();
      await onSaved();
      onClear();
      toast.success(t("branches_deleted", { count: branches.length }));
    } catch (error) {
      const code = error instanceof ApiClientError ? error.code : "REQUEST_FAILED";
      if (code === "BRANCH_IN_USE") toast.error(t("branch_in_use"));
      else if (code === "BRANCH_MUST_BE_INACTIVE") toast.error(t("branch_must_be_inactive"));
      else toast.error(t("branch_management_failed"));
    } finally {
      setPending(false);
    }
  };
  return { pending, remove };
}
