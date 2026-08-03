import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import type { CurrentTree, DashboardInsights } from "../pages/dashboard-types";

const qualitySchema = z.object({
  total: z.number(),
  missing_name_en: z.number(),
  missing_name_ar: z.number(),
  missing_birth_date: z.number(),
  missing_citizenship: z.number(),
  missing_branch: z.number(),
  missing_image: z.number(),
  unknown_placeholders: z.number(),
  no_parents_recorded: z.number(),
  possible_duplicate_groups: z.number(),
  contradictory_dates: z.number(),
  graph_cycles: z.number(),
});

const branchHealthSchema = z.array(
  z.object({
    id: z.string(),
    name_en: z.string(),
    name_ar: z.string().nullable(),
    total: z.number(),
    completeness_percent: z.number(),
  }),
);

async function getInsight<T>(
  url: string,
  schema: z.ZodType<T>,
  report: "quality" | "branches",
  signal: AbortSignal,
) {
  const response = await fetch(url, {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ report }),
    signal,
  });
  if (!response.ok) throw new Error("DASHBOARD_INSIGHTS_FAILED");
  const envelope = z.object({ data: schema }).parse(await response.json());
  return envelope.data;
}

const insightUrl = (tree: CurrentTree) => {
  const branchId = tree.role === "contributor" ? tree.assigned_branch_id : null;
  const query = branchId ? `?branchId=${encodeURIComponent(branchId)}` : "";
  return `/api/trees/${tree.id}/analysis/query${query}`;
};

export function useDashboardInsights(tree: CurrentTree | undefined): DashboardInsights {
  const enabled = Boolean(
    tree?.analysis_enabled !== false && tree && (tree.role === "owner" || tree.assigned_branch_id),
  );
  const quality = useQuery({
    queryKey: ["dashboard-insights", tree?.id, tree?.role, tree?.assigned_branch_id, "quality"],
    queryFn: ({ signal }) => getInsight(insightUrl(tree!), qualitySchema, "quality", signal),
    enabled,
    staleTime: 60_000,
  });
  const branches = useQuery({
    queryKey: ["dashboard-insights", tree?.id, tree?.role, tree?.assigned_branch_id, "branches"],
    queryFn: ({ signal }) => getInsight(insightUrl(tree!), branchHealthSchema, "branches", signal),
    enabled,
    staleTime: 60_000,
  });
  return {
    quality: quality.data,
    branches: branches.data ?? [],
    loading: quality.isLoading || branches.isLoading,
    error: quality.isError || branches.isError,
    retry: () => {
      void quality.refetch();
      void branches.refetch();
    },
  };
}
