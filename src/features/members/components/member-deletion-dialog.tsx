import type { FamilyMember } from "../domain/types";
import { displayName, useI18n } from "@/shared/i18n";
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

export function MemberDeletionDialog({
  open,
  selected,
  wives,
  hasChildren,
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  selected: FamilyMember[];
  wives: FamilyMember[];
  hasChildren: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (includeWives: boolean) => void;
}) {
  const { t, lang } = useI18n();
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {selected.length === 1
              ? t("confirm_delete")
              : t("confirm_delete_members", { count: selected.length })}
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div>
              <p>{t("confirm_delete_desc")}</p>
              {hasChildren ? (
                <p className="mt-2 text-destructive">{t("delete_warning_children")}</p>
              ) : null}
              {wives.length ? (
                <div className="mt-3 rounded-md border p-3 text-foreground">
                  <p>{t("delete_wives_prompt", { count: wives.length })}</p>
                  <ul className="mt-2 list-disc ps-5 text-sm text-muted-foreground">
                    {wives.map((wife) => (
                      <li key={wife.id}>{displayName(wife, lang)}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
          {wives.length ? (
            <AlertDialogAction
              onClick={() => onConfirm(false)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t("delete_selected_only")}
            </AlertDialogAction>
          ) : null}
          <AlertDialogAction
            onClick={() => onConfirm(wives.length > 0)}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {wives.length ? t("delete_selected_and_wives") : t("delete")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
