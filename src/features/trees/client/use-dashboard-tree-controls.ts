import { useState } from "react";
import { toast } from "sonner";
import { useI18n } from "@/shared/i18n";
import {
  canUseOwnerTreeControls,
  canUseTreePreviewControls,
} from "../pages/dashboard-owner-controls";
import { copyTreePreviewUrl } from "../pages/dashboard-share";
import type { CurrentTree } from "../pages/dashboard-types";

export function useDashboardTreeControls(
  tree: CurrentTree | undefined,
  updateTree: (tree: CurrentTree) => void,
) {
  const { t } = useI18n();
  const [manageOpen, setManageOpen] = useState(false);
  const [nameEn, setNameEn] = useState("");
  const [nameAr, setNameAr] = useState("");
  const [descriptionEn, setDescriptionEn] = useState("");
  const [descriptionAr, setDescriptionAr] = useState("");
  const [countryCode, setCountryCode] = useState<string | null>(null);
  const [visibility, setVisibility] = useState<"private" | "public">("private");
  const [managing, setManaging] = useState(false);
  const openManage = () => {
    if (!tree || !canUseOwnerTreeControls(tree.role)) return;
    setNameEn(tree.name_en ?? "");
    setNameAr(tree.name_ar ?? "");
    setDescriptionEn(tree.description_en ?? "");
    setDescriptionAr(tree.description_ar ?? "");
    setCountryCode(tree.country_code ?? null);
    setVisibility(tree.visibility ?? "private");
    setManageOpen(true);
  };
  const manage = async () => {
    if (managing || !tree || !canUseOwnerTreeControls(tree.role) || !nameEn.trim()) return;
    setManaging(true);
    try {
      const response = await fetch(`/api/trees/${tree.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name_en: nameEn.trim(),
          name_ar: nameAr.trim() || null,
          description_en: descriptionEn.trim() || null,
          description_ar: descriptionAr.trim() || null,
          country_code: countryCode,
          visibility,
        }),
      });
      if (!response.ok) throw new Error("TREE_UPDATE_FAILED");
      const updated = (await response.json()) as CurrentTree;
      updateTree({ ...tree, ...updated });
      setManageOpen(false);
      toast.success(t("updated"));
    } catch {
      toast.error(t("tree_update_failed"));
    } finally {
      setManaging(false);
    }
  };
  const copyPreview = async () => {
    if (!tree || !canUseTreePreviewControls(tree.role)) return;
    try {
      await copyTreePreviewUrl(tree.id, window.location.origin, navigator.clipboard);
      toast.success(t("preview_link_copied"));
    } catch {
      toast.error(t("preview_link_copy_failed"));
    }
  };
  return {
    manageOpen,
    setManageOpen,
    nameEn,
    setNameEn,
    nameAr,
    setNameAr,
    descriptionEn,
    setDescriptionEn,
    descriptionAr,
    setDescriptionAr,
    countryCode,
    setCountryCode,
    visibility,
    setVisibility,
    managing,
    openManage,
    manage,
    copyPreview,
  };
}

export type DashboardTreeControls = ReturnType<typeof useDashboardTreeControls>;
