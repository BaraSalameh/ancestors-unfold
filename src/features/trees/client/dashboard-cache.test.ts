import { describe, expect, it } from "vitest";
import type { DashboardData } from "../pages/dashboard-types";
import {
  invalidateDashboardCache,
  readDashboardCache,
  writeDashboardCache,
} from "./dashboard-cache";

describe("dashboard cache", () => {
  it("clears cached branch status after branch management mutations", () => {
    writeDashboardCache({ branches: [{ status: "inactive" }] } as DashboardData, 123);

    invalidateDashboardCache();

    expect(readDashboardCache()).toEqual({ data: undefined, updatedAt: 0 });
  });
});
