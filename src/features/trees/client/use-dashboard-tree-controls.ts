import { useState } from "react";
import { toast } from "sonner";
import { useI18n } from "@/shared/i18n";
import { canUseOwnerTreeControls } from "../pages/dashboard-owner-controls";
import { copyTreePreviewUrl } from "../pages/dashboard-share";
import type { CurrentTree } from "../pages/dashboard-types";

export function useDashboardTreeControls(
  tree: CurrentTree | undefined,
  updateTree: (tree: CurrentTree) => void,
) {
  const { t } = useI18n();
  const [renameOpen, setRenameOpen] = useState(false);
  const [nameEn, setNameEn] = useState("");
  const [nameAr, setNameAr] = useState("");
  const [renaming, setRenaming] = useState(false);
  const openRename = () => {
    if (!tree || !canUseOwnerTreeControls(tree.role)) return;
    setNameEn(tree.name_en ?? "");
    setNameAr(tree.name_ar ?? "");
    setRenameOpen(true);
  };
  const rename = async () => {
    if (renaming || !tree || !canUseOwnerTreeControls(tree.role) || !nameEn.trim()) return;
    setRenaming(true);
    try {
      const response = await fetch(`/api/trees/${tree.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name_en: nameEn.trim(), name_ar: nameAr.trim() }),
      });
      if (!response.ok) throw new Error("TREE_RENAME_FAILED");
      updateTree({ ...tree, name_en: nameEn.trim(), name_ar: nameAr.trim() || null });
      setRenameOpen(false);
      toast.success(t("updated"));
    } catch {
      toast.error(t("tree_update_failed"));
    } finally {
      setRenaming(false);
    }
  };
  const copyPreview = async () => {
    if (!tree || !canUseOwnerTreeControls(tree.role)) return;
    try {
      await copyTreePreviewUrl(tree.id, window.location.origin, navigator.clipboard);
      toast.success(t("preview_link_copied"));
    } catch {
      toast.error(t("preview_link_copy_failed"));
    }
  };
  return {
    renameOpen,
    setRenameOpen,
    nameEn,
    setNameEn,
    nameAr,
    setNameAr,
    renaming,
    openRename,
    rename,
    copyPreview,
  };
}

export type DashboardTreeControls = ReturnType<typeof useDashboardTreeControls>;
