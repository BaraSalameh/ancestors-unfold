import type { DashboardData } from "../pages/dashboard-types";

interface DashboardCacheState {
  data?: DashboardData;
  updatedAt: number;
}

const state: DashboardCacheState = { updatedAt: 0 };

export function readDashboardCache(): Readonly<DashboardCacheState> {
  return state;
}

export function writeDashboardCache(data: DashboardData, updatedAt = Date.now()): void {
  state.data = data;
  state.updatedAt = updatedAt;
}

export function invalidateDashboardCache(): void {
  state.data = undefined;
  state.updatedAt = 0;
}
