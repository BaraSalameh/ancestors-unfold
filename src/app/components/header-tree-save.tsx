import { toast } from "sonner";
import { familyStore } from "@/features/trees";
import { Button } from "@/shared/ui/button";
import type { TranslationKey } from "@/locales";
import { ApiClientError } from "@/shared/api/client";

type Persistence = {
  dirty: boolean;
  saving: boolean;
  conflicted: boolean;
  error: string | null;
  importPending: boolean;
};

type Translate = (key: TranslationKey) => string;

function saveLabel(persistence: Persistence, t: Translate) {
  if (persistence.saving) return t("updating_tree");
  if (persistence.conflicted) return t("reload_latest");
  if (persistence.error) return t("retry_update");
  if (persistence.importPending) return t("family_csv_save_import");
  return persistence.dirty ? t("update") : t("saved");
}

export function HeaderTreeSave({ persistence, t }: { persistence: Persistence; t: Translate }) {
  const updateTree = async () => {
    if (persistence.conflicted) {
      if (window.confirm(t("reload_latest_warning"))) familyStore.reloadAfterConflict();
      return;
    }
    try {
      await familyStore.updateSnapshot();
      toast.success(t("tree_saved"));
    } catch (error) {
      const conflicted = familyStore.getPersistenceState().conflicted;
      const duplicateKey =
        error instanceof ApiClientError && error.code === "DUPLICATE_BRANCH_NAME"
          ? "duplicate_branch_name"
          : error instanceof ApiClientError && error.code === "DUPLICATE_BRANCH_ROOT"
            ? "duplicate_branch_root"
            : undefined;
      toast.error(
        duplicateKey
          ? t(duplicateKey)
          : conflicted
            ? t("tree_version_conflict")
            : t("tree_update_failed_draft"),
      );
    }
  };

  const discard = () => {
    if (window.confirm(t("discard_changes_warning"))) familyStore.discardDraft();
  };

  return (
    <div className="flex items-center gap-1">
      {persistence.dirty ? (
        <Button size="sm" variant="ghost" disabled={persistence.saving} onClick={discard}>
          {t("discard_changes")}
        </Button>
      ) : null}
      <Button
        size="sm"
        variant={persistence.dirty ? "default" : "secondary"}
        loading={persistence.saving}
        disabled={!persistence.dirty}
        onClick={() => void updateTree()}
        aria-live="polite"
      >
        {saveLabel(persistence, t)}
      </Button>
    </div>
  );
}
