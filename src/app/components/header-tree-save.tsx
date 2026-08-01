import { toast } from "sonner";
import { familyStore } from "@/features/trees";
import { Button } from "@/shared/ui/button";
import type { TranslationKey } from "@/locales";

type Persistence = {
  dirty: boolean;
  saving: boolean;
  conflicted: boolean;
  error: string | null;
};

type Translate = (key: TranslationKey) => string;

function saveLabel(persistence: Persistence, t: Translate) {
  if (persistence.saving) return t("updating_tree");
  if (persistence.conflicted) return t("reload_latest");
  if (persistence.error) return t("retry_update");
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
    } catch {
      const conflicted = familyStore.getPersistenceState().conflicted;
      toast.error(conflicted ? t("tree_version_conflict") : t("tree_update_failed_draft"));
    }
  };

  return (
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
  );
}
