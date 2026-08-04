import { useCallback, useEffect, useRef, useState } from "react";
import type { ActivityPageResponse } from "../domain/activity-label";
import { shouldRefreshDashboard } from "../pages/dashboard-owner-controls";
import type {
  Branch,
  CurrentTree,
  DashboardData,
  Invitation,
  OwnershipTransfer,
  Statistics,
} from "../pages/dashboard-types";
import {
  invalidateDashboardCache,
  readDashboardCache,
  writeDashboardCache,
} from "./dashboard-cache";

const DASHBOARD_STALE_MS = 60_000;

async function getJson<Value>(url: string): Promise<Value> {
  const response = await fetch(url, { credentials: "include" });
  if (!response.ok) throw new Error((await response.json()).code ?? "REQUEST_FAILED");
  return response.json() as Promise<Value>;
}

async function fetchDashboard(lang: string): Promise<DashboardData> {
  const tree = await getJson<CurrentTree>("/api/tree/current");
  const [stats, branches, activity, ownershipTransfer] = await Promise.all([
    getJson<Statistics>(`/api/trees/${tree.id}/statistics`),
    getJson<Branch[]>(`/api/trees/${tree.id}/branches`),
    getJson<ActivityPageResponse>(`/api/trees/${tree.id}/activity?limit=5&locale=${lang}`).then(
      (page) => page.items,
    ),
    getJson<OwnershipTransfer | null>(`/api/trees/${tree.id}/ownership-transfers`),
  ]);
  const invitations =
    tree.role === "owner" ? await getJson<Invitation[]>(`/api/trees/${tree.id}/invitations`) : [];
  return { tree, stats, branches, activity, invitations, ownershipTransfer };
}

export function useCollaborationDashboard(lang: string) {
  const [data, setData] = useState<DashboardData>();
  const [error, setError] = useState(false);
  const mounted = useRef(false);
  const loadInFlight = useRef<Promise<DashboardData> | undefined>(undefined);
  const load = useCallback(
    async (force = false) => {
      setError(false);
      const cached = readDashboardCache();
      if (!force && cached.data) {
        setData(cached.data);
        if (Date.now() - cached.updatedAt < DASHBOARD_STALE_MS) return;
      }
      loadInFlight.current ??= fetchDashboard(lang).finally(() => {
        loadInFlight.current = undefined;
      });
      try {
        const next = await loadInFlight.current;
        writeDashboardCache(next);
        if (mounted.current) setData(next);
      } catch (requestError) {
        if (mounted.current) setError(true);
        throw requestError;
      }
    },
    [lang],
  );
  useEffect(() => {
    mounted.current = true;
    void load().catch(() => {
      if (mounted.current && !readDashboardCache().data) setData(undefined);
    });
    const refreshWhenVisible = () => {
      const cached = readDashboardCache();
      if (
        shouldRefreshDashboard(
          document.visibilityState,
          cached.updatedAt,
          Date.now(),
          DASHBOARD_STALE_MS,
        )
      ) {
        void load(true).catch(() => undefined);
      }
    };
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      mounted.current = false;
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [load]);
  const updateTree = (tree: CurrentTree) => {
    setData((current) => (current ? { ...current, tree } : current));
  };
  return { data, error, load, updateTree, invalidate: invalidateDashboardCache };
}
