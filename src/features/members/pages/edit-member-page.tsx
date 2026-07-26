import { useNavigate, useParams } from "@tanstack/react-router";
import { useState } from "react";
import { LoaderCircle, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { MemberForm } from "@/features/members";
import { familyStore, useFamily } from "@/features/trees";
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
import { memberDeleteDestination } from "../domain/member-navigation";

export function EditPage() {
  const { id } = useParams({ from: "/edit/$id" });
  const navigate = useNavigate();
  const members = useFamily();
  const { t } = useI18n();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const member = members.find((m) => m.id === id);
  const treeId = familyStore.getActiveTreeId();

  if (!member || !familyStore.canEditActiveTree()) {
    return <div className="p-8 text-center text-muted-foreground">{t("not_found")}</div>;
  }
  const children = members.filter((candidate) =>
    [candidate.father_id, candidate.mother_id].includes(member.id),
  );

  const handleDelete = async () => {
    setIsDeleting(true);
    familyStore.remove(member.id);
    try {
      await familyStore.flushPendingSave();
      toast.success(t("deleted"));
      navigate(memberDeleteDestination(treeId));
    } catch {
      familyStore.reloadAfterConflict();
      toast.error(t("save_failed"));
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-foreground">{t("edit_member")}</h1>
        <Button type="button" variant="destructive" onClick={() => setConfirmOpen(true)}>
          <Trash2 className="me-2 h-4 w-4" />
          {t("delete")}
        </Button>
      </div>
      <div className="rounded-xl border bg-card p-6 shadow-sm">
        <MemberForm
          initial={member}
          memberId={id}
          members={members.filter((m) => m.id !== id)}
          submitLabel={t("save")}
          onCancel={() =>
            navigate({ to: "/tree/$id", params: { id: treeId }, search: { mode: "edit" } })
          }
          onSubmit={(data) => {
            familyStore.update(id, data);
            toast.success(t("updated"));
            navigate({ to: "/member/$id", params: { id } });
          }}
        />
      </div>
      <AlertDialog
        open={confirmOpen}
        onOpenChange={(open) => {
          if (!isDeleting) setConfirmOpen(open);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("confirm_delete")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("confirm_delete_desc")}
              {children.length > 0 && (
                <span className="mt-2 block text-destructive">{t("delete_warning_children")}</span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>{t("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              disabled={isDeleting}
              onClick={(event) => {
                event.preventDefault();
                void handleDelete();
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting && <LoaderCircle className="me-2 h-4 w-4 animate-spin" />}
              {isDeleting ? t("loading") : t("delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
