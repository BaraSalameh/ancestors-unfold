import { useNavigate, useSearch } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { useI18n } from "@/shared/i18n";
import { Button } from "@/shared/ui/button";
import { TreeLoadingIndicator } from "@/shared/ui/page-skeletons";
import { useContributorRemoval } from "../client/use-contributor-removal";
import { invalidateDashboardCache } from "../client/dashboard-cache";
import { useDashboardInvitations } from "../client/use-dashboard-invitations";
import { familyStore } from "../client/family-store";
import { useFamilyPersistence } from "../client/family-hooks";
import { BranchesWorkspace } from "../components/branches-workspace";
import type { Branch, CurrentTree, Invitation } from "./dashboard-types";

export interface BranchesData {
  branches: Branch[];
  invitations: Invitation[];
  tree: CurrentTree;
}

async function getJson<Value>(url: string): Promise<Value> {
  const response = await fetch(url, { credentials: "include" });
  if (!response.ok) throw new Error((await response.json()).code ?? "REQUEST_FAILED");
  return response.json() as Promise<Value>;
}

async function loadBranchesData(treeIdFromSearch?: string): Promise<BranchesData> {
  const tree = await getJson<CurrentTree>("/api/tree/current");
  if (treeIdFromSearch && tree.id !== treeIdFromSearch) throw new Error("FORBIDDEN");
  const [branches, invitations] = await Promise.all([
    getJson<Branch[]>(`/api/trees/${tree.id}/branches`),
    tree.role === "owner"
      ? getJson<Invitation[]>(`/api/trees/${tree.id}/invitations`)
      : Promise.resolve([]),
  ]);
  return { branches, invitations, tree };
}

export function BranchesPage() {
  const { treeId, branchId } = useSearch({ from: "/branches" });
  const navigate = useNavigate();
  const { t } = useI18n();
  const [data, setData] = useState<BranchesData>();
  const [error, setError] = useState(false);
  const [selectedId, setSelectedId] = useState<string | undefined>(branchId);
  const previousSelectedId = useRef<string | undefined>(undefined);
  const persistence = useFamilyPersistence();
  const reload = useCallback(async () => {
    try {
      const next = await loadBranchesData(treeId);
      setData(next);
      setSelectedId((current) => selectedBranchId(current ?? branchId, next));
      setError(false);
    } catch {
      setError(true);
    }
  }, [branchId, treeId]);
  useEffect(() => void reload(), [reload]);
  useEffect(() => {
    if (data?.tree.id) familyStore.activateTree(data.tree.id, "edit");
  }, [data?.tree.id]);
  const invitations = useDashboardInvitations(reload);
  const removal = useContributorRemoval(data?.tree, data?.branches ?? [], reload);
  const refreshSnapshot = async () => {
    invalidateDashboardCache();
    await reload();
    familyStore.reloadAfterConflict();
  };
  const selectBranch = (id: string | undefined) => {
    if (id === "new") {
      previousSelectedId.current = selectedId;
      setSelectedId("new");
      return;
    }
    setSelectedId(id);
    void navigate({
      to: "/branches",
      search: { treeId: data?.tree.id ?? treeId, branchId: id },
      replace: true,
    });
  };
  const cancelCreate = () => selectBranch(previousSelectedId.current ?? data?.branches[0]?.id);

  if (!data && !error) return <TreeLoadingIndicator label={t("loading")} />;
  if (!data)
    return (
      <main className="mx-auto max-w-xl px-4 py-10 text-center">
        <p className="text-sm text-muted-foreground">{t("branch_management_failed")}</p>
        <Button className="mt-4" onClick={() => void reload()}>
          {t("retry")}
        </Button>
      </main>
    );
  return (
    <BranchesWorkspace
      data={data}
      selectedId={selectedId}
      setSelectedId={selectBranch}
      onCancelCreate={cancelCreate}
      treeDirty={persistence.dirty}
      invitations={invitations}
      removal={removal}
      onSaved={refreshSnapshot}
    />
  );
}

function selectedBranchId(current: string | undefined, data: BranchesData) {
  if (current === "new" || data.branches.some(({ id }) => id === current)) return current;
  return data.tree.assigned_branch_id ?? data.branches[0]?.id;
}
