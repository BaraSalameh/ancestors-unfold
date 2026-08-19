import { useQuery, useQueryClient, type UseQueryResult } from "@tanstack/react-query";
import { dashboardBootstrapQueryOptions } from "./dashboard-bootstrap-query";
import type { DashboardBootstrap } from "../domain/dashboard-bootstrap";
import type { DashboardInsights, DashboardResource, CurrentTree } from "../pages/dashboard-types";
import { dashboardQueryKeys } from "./dashboard-queries";

function resource<Value>(
  query: UseQueryResult<DashboardBootstrap>,
  select: (bootstrap: DashboardBootstrap) => Value,
): DashboardResource<Value> {
  return {
    data: query.data ? select(query.data) : undefined,
    pending: query.isPending,
    fetching: query.isFetching,
    error: query.isError,
    retry: () => void query.refetch(),
  };
}

function dashboardInsights(query: UseQueryResult<DashboardBootstrap>): DashboardInsights {
  const insights = query.data?.insights;
  return {
    quality: insights?.quality,
    branches: insights?.branches ?? [],
    qualityPending: query.isPending,
    qualityError: query.isError,
    retryQuality: () => void query.refetch(),
    branchesPending: query.isPending,
    branchesError: query.isError,
    retryBranches: () => void query.refetch(),
  };
}

export function useCollaborationDashboard(
  lang: "en" | "ar",
  initialBootstrap?: DashboardBootstrap | null,
) {
  const queryClient = useQueryClient();
  const query = useQuery({
    ...dashboardBootstrapQueryOptions(lang),
    initialData: initialBootstrap?.locale === lang ? initialBootstrap : undefined,
    placeholderData: (previous) => previous,
  });
  const tree = query.data?.tree;
  const refresh = async () => {
    await query.refetch();
  };
  const updateTree = (updated: CurrentTree) => {
    queryClient.setQueriesData<DashboardBootstrap>(
      { queryKey: ["collaboration", "dashboard"] },
      (current) =>
        current
          ? {
              ...current,
              tree: {
                ...updated,
                analysis_enabled: updated.analysis_enabled ?? current.tree.analysis_enabled,
              },
            }
          : current,
    );
    queryClient.setQueryData(dashboardQueryKeys.currentTree, updated);
    void queryClient.invalidateQueries({ queryKey: ["collaboration", "dashboard"] });
  };
  return {
    tree: resource(query, (bootstrap) => bootstrap.tree),
    statistics: resource(query, (bootstrap) => bootstrap.statistics),
    branches: resource(query, (bootstrap) => bootstrap.branches),
    activity: resource(query, (bootstrap) => bootstrap.activity),
    invitations:
      tree?.role === "owner"
        ? resource(query, (bootstrap) => bootstrap.invitations)
        : ({
            data: [],
            pending: false,
            fetching: false,
            error: false,
            retry: () => undefined,
          } satisfies DashboardResource<DashboardBootstrap["invitations"]>),
    ownershipTransfer: resource(query, (bootstrap) => bootstrap.ownershipTransfer),
    insights: dashboardInsights(query),
    refresh,
    updateTree,
  };
}
