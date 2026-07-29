import { Link, useSearch } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { SubfamilyPanel } from "@/features/trees";
import { familyStore } from "@/features/trees";
import { useEffect, useState } from "react";
import { useI18n } from "@/shared/i18n";
import { contributorSubfamilyAccess } from "@/features/subfamilies";
import { SubfamiliesPageSkeleton } from "@/shared/ui/page-skeletons";

type CurrentTree = {
  id: string;
  role: "owner" | "contributor";
  assigned_branch_id: string | null;
};

export function SubfamiliesPage() {
  const { treeId: treeIdFromSearch } = useSearch({ from: "/subfamilies" });
  const { t } = useI18n();
  const [tree, setTree] = useState<CurrentTree>();
  const treeId = tree?.id ?? treeIdFromSearch ?? familyStore.getActiveTreeId();
  const [selectedSubfamilyId, setSelectedSubfamilyId] = useState<string | null>(null);
  const [filterEnabled, setFilterEnabled] = useState(false);
  useEffect(() => {
    void fetch("/api/tree/current", { credentials: "include" })
      .then((response) => {
        if (!response.ok) throw new Error("TREE_UNAVAILABLE");
        return response.json() as Promise<CurrentTree>;
      })
      .then((current) => {
        if (treeIdFromSearch && current.id !== treeIdFromSearch) throw new Error("FORBIDDEN");
        familyStore.activateTree(current.id, "edit");
        setTree(current);
        if (current.role === "contributor" && current.assigned_branch_id) {
          setSelectedSubfamilyId(current.assigned_branch_id);
          setFilterEnabled(true);
        }
      });
  }, [treeIdFromSearch]);

  if (!tree) return <SubfamiliesPageSkeleton label={t("loading")} />;
  const access = contributorSubfamilyAccess(tree.role, tree.assigned_branch_id);

  return (
    <div className="mx-auto flex min-h-[calc(100vh-3.5rem)] max-w-6xl flex-col gap-4 px-4 py-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{t("subfamilies")}</h1>
          <p className="text-sm text-muted-foreground">
            {tree.role === "owner" ? t("subfamilies_manage_desc") : t("assigned_subfamily_desc")}
          </p>
        </div>
        <Link
          to="/tree/$id"
          params={{ id: treeId }}
          search={{ mode: "edit" }}
          className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm hover:bg-accent"
        >
          <ArrowLeft className="h-4 w-4" />
          {t("back_to_tree")}
        </Link>
      </div>

      <div className="rounded-xl border bg-card p-4 shadow-sm">
        <SubfamilyPanel
          mode="manage"
          selectedSubfamilyId={selectedSubfamilyId}
          onSelectSubfamily={setSelectedSubfamilyId}
          filterEnabled={filterEnabled}
          onToggleFilter={setFilterEnabled}
          readOnly={access.readOnly}
          allowedSubfamilyId={access.allowedSubfamilyId}
        />
      </div>
    </div>
  );
}
