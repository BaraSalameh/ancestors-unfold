import { Trash2, UserMinus, UserPlus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useI18n } from "@/shared/i18n";
import { Button } from "@/shared/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/shared/ui/alert-dialog";
import type { Branch } from "../pages/dashboard-types";
import type { CurrentTree } from "../pages/dashboard-types";
import { MemberSearchPicker, type FamilyMember } from "@/features/members";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/shared/ui/dialog";
import { Label } from "@/shared/ui/label";
import { BranchDeactivationDialog } from "./branch-deactivation-dialog";
import type { BranchMutation, BranchMutationAction } from "./branch-editor";

// Lifecycle dialogs live beside their triggering controls to keep branch selection stable.
// eslint-disable-next-line max-lines-per-function
export function BranchLifecycleActions({
  branch,
  mutate,
  saving,
  onInvite,
  onRemoveContributor,
  tree,
  members,
  onSaved,
}: {
  branch: Branch;
  mutate: BranchMutation;
  saving?: BranchMutationAction;
  onInvite?: () => void;
  onRemoveContributor?: () => void;
  tree: CurrentTree;
  members: FamilyMember[];
  onSaved: () => Promise<void>;
}) {
  const { t } = useI18n();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmDeactivate, setConfirmDeactivate] = useState(false);
  const [confirmReactivate, setConfirmReactivate] = useState(false);
  const [reactivationRootId, setReactivationRootId] = useState("");
  const path = `/${branch.id}`;
  const reactivate = async () => {
    if (!reactivationRootId) return;
    if (
      await mutate(
        "PATCH",
        path,
        { status: "active", rootFamilyMemberId: reactivationRootId },
        "reactivate",
      )
    ) {
      setConfirmReactivate(false);
      setReactivationRootId("");
      toast.success(t("branch_saved"));
    }
  };
  const remove = async () => {
    if (await mutate("DELETE", path, {}, "delete")) toast.success(t("branch_deleted"));
  };
  return (
    <section className="flex flex-wrap gap-2 border-t pt-5">
      {branch.status === "active" ? (
        <Button
          variant="outline"
          disabled={Boolean(saving)}
          onClick={() => setConfirmDeactivate(true)}
        >
          {t("deactivate_branch")}
        </Button>
      ) : (
        <Button
          variant="outline"
          disabled={Boolean(saving)}
          onClick={() => setConfirmReactivate(true)}
        >
          {t("reactivate_branch")}
        </Button>
      )}
      {!branch.contributor_user_id && branch.status === "active" ? (
        <Button variant="outline" onClick={onInvite}>
          <UserPlus aria-hidden="true" />
          {t("invite_contributor")}
        </Button>
      ) : null}
      {branch.contributor_user_id ? (
        <Button variant="outline" onClick={onRemoveContributor}>
          <UserMinus aria-hidden="true" />
          {t("remove_contributor")}
        </Button>
      ) : null}
      {branch.status === "inactive" ? (
        <Button variant="destructive" onClick={() => setConfirmDelete(true)}>
          <Trash2 aria-hidden="true" />
          {t("delete_branch")}
        </Button>
      ) : null}
      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("delete_subfamily_title")}</AlertDialogTitle>
            <AlertDialogDescription>{t("delete_subfamily_desc")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground"
              onClick={() => void remove()}
            >
              {t("delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <BranchDeactivationDialog
        open={confirmDeactivate}
        onOpenChange={setConfirmDeactivate}
        branch={branch}
        tree={tree}
        onSaved={onSaved}
      />
      <Dialog open={confirmReactivate} onOpenChange={setConfirmReactivate}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("reactivate_branch")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label>{t("branch_root")}</Label>
            <MemberSearchPicker
              value={reactivationRootId}
              onChange={setReactivationRootId}
              options={members.filter(({ gender, is_unknown }) => gender === "male" && !is_unknown)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmReactivate(false)}>
              {t("cancel")}
            </Button>
            <Button
              loading={saving === "reactivate"}
              disabled={!reactivationRootId || Boolean(saving)}
              onClick={() => void reactivate()}
            >
              {t("reactivate_branch")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
