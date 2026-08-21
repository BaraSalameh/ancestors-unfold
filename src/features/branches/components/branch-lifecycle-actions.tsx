import { Trash2, UserMinus, UserPlus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useI18n } from "@/shared/i18n";
import { Button } from "@/shared/ui/button";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/shared/ui/alert-dialog";
import type { Branch, CurrentTree } from "@/features/collaboration";
import { MemberSearchPicker } from "@/features/members/components";
import type { FamilyMember } from "@/features/members/domain";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/shared/ui/dialog";
import { Label } from "@/shared/ui/label";
import { BranchDeactivationDialog } from "./branch-deactivation-dialog";
import type { BranchMutation, BranchMutationAction } from "./branch-editor";

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
    if (await mutate("DELETE", path, {}, "delete")) {
      setConfirmDelete(false);
      toast.success(t("branch_deleted"));
    }
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
      <BranchDeleteDialog
        open={confirmDelete}
        setOpen={setConfirmDelete}
        saving={saving}
        remove={remove}
      />
      <BranchDeactivationDialog
        open={confirmDeactivate}
        onOpenChange={setConfirmDeactivate}
        branch={branch}
        tree={tree}
        onSaved={onSaved}
      />
      <BranchReactivateDialog
        open={confirmReactivate}
        setOpen={setConfirmReactivate}
        rootId={reactivationRootId}
        setRootId={setReactivationRootId}
        members={members}
        saving={saving}
        reactivate={reactivate}
      />
    </section>
  );
}

function BranchDeleteDialog({
  open,
  setOpen,
  saving,
  remove,
}: {
  open: boolean;
  setOpen: (open: boolean) => void;
  saving?: BranchMutationAction;
  remove: () => Promise<void>;
}) {
  const { t } = useI18n();
  return (
    <AlertDialog open={open} onOpenChange={(next) => saving !== "delete" && setOpen(next)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("delete_subfamily_title")}</AlertDialogTitle>
          <AlertDialogDescription>{t("delete_subfamily_desc")}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={saving === "delete"}>{t("cancel")}</AlertDialogCancel>
          <Button
            variant="destructive"
            loading={saving === "delete"}
            disabled={Boolean(saving)}
            onClick={() => void remove()}
          >
            {t("delete")}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function BranchReactivateDialog({
  open,
  setOpen,
  rootId,
  setRootId,
  members,
  saving,
  reactivate,
}: {
  open: boolean;
  setOpen: (open: boolean) => void;
  rootId: string;
  setRootId: (id: string) => void;
  members: FamilyMember[];
  saving?: BranchMutationAction;
  reactivate: () => Promise<void>;
}) {
  const { t } = useI18n();
  const options = members.filter(({ gender, is_unknown }) => gender === "male" && !is_unknown);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("reactivate_branch")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          <Label>{t("branch_root")}</Label>
          <MemberSearchPicker
            value={rootId}
            onChange={setRootId}
            options={options}
            members={members}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            {t("cancel")}
          </Button>
          <Button
            loading={saving === "reactivate"}
            disabled={!rootId || Boolean(saving)}
            onClick={() => void reactivate()}
          >
            {t("reactivate_branch")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
