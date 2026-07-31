import { useNavigate, useParams, useSearch } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { Trash2 } from "lucide-react";
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
import { memberDeleteDestination, memberDetailsSearch } from "../domain/member-navigation";

export function EditPage() {
  const { id } = useParams({ from: "/edit/$id" });
  const { returnPreview } = useSearch({ from: "/edit/$id" });
  const navigate = useNavigate();
  const members = useFamily();
  const { t } = useI18n();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const member = members.find((m) => m.id === id);
  const treeId = familyStore.getActiveTreeId();
  const checkpoint = useRef<ReturnType<typeof familyStore.createDraftCheckpoint> | null>(null);
  if (member && familyStore.canEditActiveTree() && !checkpoint.current)
    checkpoint.current = familyStore.createDraftCheckpoint();

  if (!member || !familyStore.canEditActiveTree()) {
    return <div className="p-8 text-center text-muted-foreground">{t("not_found")}</div>;
  }
  const children = members.filter((candidate) =>
    [candidate.father_id, candidate.mother_id].includes(member.id),
  );

  const handleDelete = () => {
    familyStore.remove(member.id);
    toast.success(t("deleted"));
    navigate(memberDeleteDestination(treeId, returnPreview));
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
          members={members}
          submitLabel={t("save")}
          onCancel={() => {
            if (checkpoint.current) familyStore.restoreDraftCheckpoint(checkpoint.current);
            navigate({
              to: "/tree/$id",
              params: { id: treeId },
              search: { mode: "edit", preview: returnPreview },
            });
          }}
          onSubmit={(data) => {
            familyStore.update(id, data);
            toast.success(t("updated"));
            navigate({
              to: "/member/$id",
              params: { id },
              search: memberDetailsSearch({
                treeId,
                returnMode: "edit",
                returnPreview,
              }),
            });
          }}
        />
      </div>
      <AlertDialog
        open={confirmOpen}
        onOpenChange={(open) => {
          setConfirmOpen(open);
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
            <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                handleDelete();
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t("delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
