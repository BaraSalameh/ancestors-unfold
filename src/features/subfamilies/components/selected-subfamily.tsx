import { useState } from "react";
import { ArrowLeft, Pencil, Trash2 } from "lucide-react";
import { familyStore } from "@/features/trees";
import type { FamilyMember, SubFamily } from "@/features/members";
import { useI18n } from "@/shared/i18n";
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
import { SubfamilyAttachments } from "./subfamily-attachments";
import { SubfamilyEditForm } from "./subfamily-edit-form";
import { SubfamilySummary } from "./subfamily-summary";

export function SelectedSubfamily({
  subfamily,
  members,
  maleMembers,
  linkedMale,
  readOnly,
  allowBack,
  onBack,
  onDelete,
}: {
  subfamily: SubFamily;
  members: FamilyMember[];
  maleMembers: FamilyMember[];
  linkedMale: FamilyMember | null;
  readOnly: boolean;
  allowBack: boolean;
  onBack: () => void;
  onDelete: () => void;
}) {
  const { t } = useI18n();
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const deleteSubfamily = () => {
    familyStore.deleteSubfamily(subfamily.id);
    onDelete();
    setEditing(false);
  };
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        {allowBack && (
          <button onClick={onBack} className="text-xs hover:underline">
            <ArrowLeft className="me-1 inline h-3 w-3 rtl:rotate-180" />
            {t("back")}
          </button>
        )}
        {!readOnly && (
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="rounded border p-1 text-muted-foreground hover:bg-accent"
              title={t("edit")}
            >
              <Pencil className="h-3 w-3" />
            </button>
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              disabled={familyStore.isProtectedImportBranch(subfamily.id)}
              className="rounded border p-1 text-muted-foreground hover:bg-accent"
              title={t("delete")}
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </div>
        )}
      </div>
      {editing ? (
        <SubfamilyEditForm
          subfamily={subfamily}
          maleMembers={maleMembers}
          onClose={() => setEditing(false)}
        />
      ) : (
        <>
          <SubfamilySummary subfamily={subfamily} members={members} linkedMale={linkedMale} />
          {!readOnly && <SubfamilyAttachments subfamily={subfamily} />}
        </>
      )}
      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("delete_subfamily_title")}</AlertDialogTitle>
            <AlertDialogDescription>{t("delete_subfamily_desc")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={deleteSubfamily}
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
