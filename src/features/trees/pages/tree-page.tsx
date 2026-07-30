import { useParams, useSearch } from "@tanstack/react-router";
import { TriangleAlert } from "lucide-react";
import { FamilyTree } from "@/features/trees";
import { familyStore, useFamilyLoadState } from "@/features/trees";
import { useI18n } from "@/shared/i18n";
import { TreeLoadingIndicator } from "@/shared/ui/page-skeletons";

export function TreePage() {
  const { mode } = useSearch({ from: "/tree/$id" });
  const { id } = useParams({ from: "/tree/$id" });
  const { t } = useI18n();
  familyStore.activateTree(id, mode);
  const loadState = useFamilyLoadState();
  if (loadState === "loading" || loadState === "idle")
    return <TreeLoadingIndicator label={t("loading_tree")} />;
  if (loadState === "error")
    return (
      <div className="flex h-[calc(100vh-3.5rem)] items-center justify-center p-6 text-center">
        <div>
          <TriangleAlert className="mx-auto h-8 w-8 text-muted-foreground" />
          <h1 className="mt-3 text-lg font-semibold">{t("tree_unavailable")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("tree_unavailable_hint")}</p>
        </div>
      </div>
    );
  return (
    <div className="h-[calc(100vh-3.5rem)] w-full">
      <FamilyTree readOnly={mode !== "edit"} />
    </div>
  );
}
