import type {
  AnalysisBranch,
  AnalysisEnvelope,
  AnalysisMember,
  AnalysisQueryDefinition,
  SavedAnalysisView,
  SummaryData,
} from "../domain/types";

export type AnalysisTree = {
  id: string;
  name_en: string | null;
  name_ar: string | null;
  role: "owner" | "contributor";
  assigned_branch_id: string | null;
  analysis_enabled: boolean;
};

export type AnalysisCatalog = {
  branches: AnalysisBranch[];
  filters: string[];
  reports: string[];
  export_formats: string[];
  maximum_page_size: number;
  maximum_export_rows: number;
};

type MemberPage = {
  items: AnalysisMember[];
  total: number;
  applied_filters: AnalysisQueryDefinition["filters"];
  next_cursor: string | null;
};

async function responseError(response: Response) {
  const body = (await response.json().catch(() => ({}))) as { code?: string };
  return new Error(body.code ?? "REQUEST_FAILED");
}

async function analysisJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { credentials: "include", ...init });
  if (!response.ok) throw await responseError(response);
  return response.json() as Promise<T>;
}

const branchQuery = (branchId: string | null) =>
  branchId ? `?branchId=${encodeURIComponent(branchId)}` : "";

export const getAnalysisTree = (signal?: AbortSignal) =>
  analysisJson<AnalysisTree>("/api/tree/current", { signal });
export const getAnalysisCatalog = (treeId: string, signal?: AbortSignal) =>
  analysisJson<AnalysisEnvelope<AnalysisCatalog>>(`/api/trees/${treeId}/analysis/catalog`, {
    signal,
  });
export const getAnalysisSummary = (treeId: string, branchId: string | null, signal?: AbortSignal) =>
  analysisJson<AnalysisEnvelope<SummaryData>>(
    `/api/trees/${treeId}/analysis/summary${branchQuery(branchId)}`,
    { signal },
  );
export const getAnalysisReport = <T>(
  treeId: string,
  branchId: string | null,
  report: "branches" | "relationships" | "quality",
  signal?: AbortSignal,
) =>
  analysisJson<AnalysisEnvelope<T>>(`/api/trees/${treeId}/analysis/query${branchQuery(branchId)}`, {
    method: "POST",
    signal,
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ report }),
  });

export const getAnalysisMembers = (
  treeId: string,
  branchId: string | null,
  definition: AnalysisQueryDefinition,
  cursor: string | null,
  signal?: AbortSignal,
) =>
  analysisJson<AnalysisEnvelope<MemberPage>>(
    `/api/trees/${treeId}/analysis/members${branchQuery(branchId)}`,
    {
      method: "POST",
      signal,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...definition, cursor, limit: 50 }),
    },
  );

export const getSavedAnalysisViews = (treeId: string) =>
  analysisJson<AnalysisEnvelope<SavedAnalysisView[]>>(`/api/trees/${treeId}/analysis/views`);

export const createAnalysisView = (
  treeId: string,
  name: string,
  definition: AnalysisQueryDefinition,
) =>
  analysisJson<AnalysisEnvelope<SavedAnalysisView>>(`/api/trees/${treeId}/analysis/views`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name, definition }),
  });

export const deleteAnalysisView = (treeId: string, viewId: string) =>
  analysisJson<AnalysisEnvelope<{ ok: true }>>(`/api/trees/${treeId}/analysis/views/${viewId}`, {
    method: "DELETE",
  });

export async function downloadAnalysis(
  treeId: string,
  branchId: string | null,
  definition: AnalysisQueryDefinition,
  format: "csv" | "json",
) {
  const response = await fetch(`/api/trees/${treeId}/analysis/export${branchQuery(branchId)}`, {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...definition, format }),
  });
  if (!response.ok) throw await responseError(response);
  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement("a");
  link.href = url;
  link.download = `family-analysis.${format}`;
  link.click();
  URL.revokeObjectURL(url);
}
