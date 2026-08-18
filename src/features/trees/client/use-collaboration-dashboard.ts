import { useQuery, useQueryClient, type UseQueryResult } from "@tanstack/react-query";
import type { ActivityPageResponse } from "../domain/activity-label";
import type {
  Branch,
  CurrentTree,
  DashboardResource,
  Invitation,
  OwnershipTransfer,
  Statistics,
} from "../pages/dashboard-types";
import { dashboardQueryKeys, invalidateDashboardQueries } from "./dashboard-queries";

const DASHBOARD_STALE_MS = 60_000;

async function getJson<Value>(url: string, signal?: AbortSignal): Promise<Value> {
  const response = await fetch(url, { credentials: "include", signal });
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { code?: string };
    throw new Error(body.code ?? "REQUEST_FAILED");
  }
  return response.json() as Promise<Value>;
}

function resource<Value>(query: UseQueryResult<Value>): DashboardResource<Value> {
  return {
    data: query.data,
    pending: query.isPending,
    fetching: query.isFetching,
    error: query.isError,
    retry: () => void query.refetch(),
  };
}

export function useCollaborationDashboard(lang: string) {
  const queryClient = useQueryClient();
  const treeQuery = useQuery({
    queryKey: dashboardQueryKeys.currentTree,
    queryFn: ({ signal }) => getJson<CurrentTree>("/api/tree/current", signal),
    staleTime: DASHBOARD_STALE_MS,
    refetchOnMount: "always",
  });
  const tree = treeQuery.data;
  const treeId = tree?.id ?? "pending";
  const enabled = Boolean(tree);
  const statisticsQuery = useQuery({
    queryKey: dashboardQueryKeys.statistics(treeId),
    queryFn: ({ signal }) => getJson<Statistics>(`/api/trees/${treeId}/statistics`, signal),
    enabled,
    staleTime: DASHBOARD_STALE_MS,
    refetchOnMount: "always",
  });
  const branchesQuery = useQuery({
    queryKey: dashboardQueryKeys.branches(treeId),
    queryFn: ({ signal }) => getJson<Branch[]>(`/api/trees/${treeId}/branches`, signal),
    enabled,
    staleTime: DASHBOARD_STALE_MS,
    refetchOnMount: "always",
  });
  const activityQuery = useQuery({
    queryKey: dashboardQueryKeys.activity(treeId, lang),
    queryFn: ({ signal }) =>
      getJson<ActivityPageResponse>(
        `/api/trees/${treeId}/activity?limit=5&locale=${lang}`,
        signal,
      ).then((page) => page.items),
    enabled,
    staleTime: DASHBOARD_STALE_MS,
    refetchOnMount: "always",
  });
  const invitationsQuery = useQuery({
    queryKey: dashboardQueryKeys.invitations(treeId),
    queryFn: ({ signal }) => getJson<Invitation[]>(`/api/trees/${treeId}/invitations`, signal),
    enabled: enabled && tree?.role === "owner",
    staleTime: DASHBOARD_STALE_MS,
    refetchOnMount: "always",
  });
  const ownershipTransferQuery = useQuery({
    queryKey: dashboardQueryKeys.ownershipTransfer(treeId),
    queryFn: ({ signal }) =>
      getJson<OwnershipTransfer | null>(`/api/trees/${treeId}/ownership-transfers`, signal),
    enabled,
    staleTime: DASHBOARD_STALE_MS,
    refetchOnMount: "always",
  });
  const refresh = async () => {
    if (!tree) {
      await treeQuery.refetch();
      return;
    }
    await invalidateDashboardQueries(queryClient, tree.id);
  };
  const updateTree = (updated: CurrentTree) => {
    queryClient.setQueryData(dashboardQueryKeys.currentTree, updated);
    void invalidateDashboardQueries(queryClient, updated.id);
  };
  return {
    tree: resource(treeQuery),
    statistics: resource(statisticsQuery),
    branches: resource(branchesQuery),
    activity: resource(activityQuery),
    invitations:
      tree?.role === "owner"
        ? resource(invitationsQuery)
        : ({
            data: [],
            pending: false,
            fetching: false,
            error: false,
            retry: () => {},
          } satisfies DashboardResource<Invitation[]>),
    ownershipTransfer: resource(ownershipTransferQuery),
    refresh,
    updateTree,
  };
}
