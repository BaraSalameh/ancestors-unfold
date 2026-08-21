import { useNavigate, useSearch } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "@/shared/i18n";
import { Button } from "@/shared/ui/button";
import { BranchesPageSkeleton } from "@/shared/ui/page-skeletons";
import {
  dashboardBootstrapQueryOptions,
  invalidateDashboardQueries,
  useContributorRemoval,
  useDashboardInvitations,
  type Branch,
  type CurrentTree,
  type DashboardBootstrap,
  type Invitation,
} from "@/features/collaboration";
import { familyStore, useFamilyPersistence } from "@/features/trees/client";
import { BranchesWorkspace } from "../components/branches-workspace";

export interface BranchesData {
  branches: Branch[];
  invitations: Invitation[];
  tree: CurrentTree;
}

export function BranchesPage({
  initialBootstrap,
}: {
  initialBootstrap?: DashboardBootstrap | null;
}) {
  const { treeId, branchId } = useSearch({ from: "/branches" });
  const navigate = useNavigate();
  const { t, lang } = useI18n();
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | undefined>(branchId);
  const previousSelectedId = useRef<string | undefined>(undefined);
  const persistence = useFamilyPersistence();
  const {
    data: bootstrap,
    isPending,
    isFetching,
    refetch,
  } = useQuery({
    ...dashboardBootstrapQueryOptions(lang),
    initialData: initialBootstrap?.locale === lang ? initialBootstrap : undefined,
    placeholderData: (previous) => previous,
  });
  const data = useMemo<BranchesData | undefined>(() => {
    if (!bootstrap || (treeId && bootstrap.tree.id !== treeId)) return undefined;
    return {
      tree: bootstrap.tree,
      branches: bootstrap.branches,
      invitations: bootstrap.invitations,
    };
  }, [bootstrap, treeId]);
  const reload = useCallback(async () => {
    await refetch();
  }, [refetch]);
  useEffect(() => {
    if (data) setSelectedId((current) => selectedBranchId(branchId ?? current, data));
  }, [branchId, data]);
  useEffect(() => {
    if (data?.tree.id) familyStore.activateTree(data.tree.id, "edit");
  }, [data?.tree.id]);
  const invitations = useDashboardInvitations(reload);
  const removal = useContributorRemoval(data?.tree, data?.branches ?? [], reload);
  const refreshSnapshot = async () => {
    await invalidateDashboardQueries(queryClient, data?.tree.id);
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

  if (!data && isPending) return <BranchesPageSkeleton label={t("loading")} />;
  if (!data)
    return (
      <main className="mx-auto max-w-xl px-4 py-10 text-center">
        <p className="text-sm text-muted-foreground">{t("branch_management_failed")}</p>
        <Button className="mt-4" onClick={() => void reload()} disabled={isFetching}>
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
