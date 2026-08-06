import { useNavigate, useParams, useSearch } from "@tanstack/react-router";
import { TriangleAlert } from "lucide-react";
import { FamilyTree } from "@/features/trees";
import { familyStore, useFamilyLoadState } from "@/features/trees";
import { useI18n } from "@/shared/i18n";
import { TreeLoadingIndicator } from "@/shared/ui/page-skeletons";

export function TreePage() {
  const { mode, preview, period, branchId, import: csvImport } = useSearch({ from: "/tree/$id" });
  const { id } = useParams({ from: "/tree/$id" });
  const navigate = useNavigate();
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
  const selectedBranchId =
    familyStore.getAccessScope() === "branch" ? familyStore.getAssignedBranchId() : branchId;
  return (
    <div className="h-[calc(100vh-3.5rem)] w-full">
      <FamilyTree
        readOnly={mode !== "edit"}
        overviewMode={mode === "preview"}
        preview={mode === "preview" ? (preview ?? "lineage") : "lineage"}
        chronologicalPeriod={period ?? 10}
        accessMode={mode}
        initialBranchId={selectedBranchId}
        csvImportOpen={csvImport === "csv"}
        onCsvImportOpenChange={(open) => {
          if (open) return;
          void navigate({
            to: "/tree/$id",
            params: { id },
            search: { mode, preview, period, branchId, import: undefined },
            replace: true,
          });
        }}
      />
    </div>
  );
}
