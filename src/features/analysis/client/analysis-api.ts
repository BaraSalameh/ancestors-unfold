import type { z } from "zod";
import { ApiClientError, validatedApiRequest } from "@/shared/api/client";
import type { AnalysisBranch, AnalysisQueryDefinition } from "../domain/types";
import {
  analysisCatalogSchema,
  analysisEnvelopeSchema,
  analysisMemberPageSchema,
  analysisSummarySchema,
  analysisTreeSchema,
  branchReportRowSchema,
  qualityReportSchema,
  relationshipReportSchema,
  savedAnalysisViewSchema,
  successResponseSchema,
} from "./analysis-response-schemas";

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

type AnalysisRequestInit = Omit<RequestInit, "body"> & { body?: unknown };

const analysisJson = <Schema extends z.ZodTypeAny>(
  schema: Schema,
  url: string,
  init?: AnalysisRequestInit,
) => validatedApiRequest(schema, url, init);

export function analysisScopeQuery(branchId: string | null, excludeWives = false) {
  const parameters = new URLSearchParams();
  if (branchId) parameters.set("branchId", branchId);
  if (excludeWives) parameters.set("excludeWives", "true");
  const query = parameters.toString();
  return query ? `?${query}` : "";
}

const branchQuery = (branchId: string | null) => analysisScopeQuery(branchId);

export const getAnalysisTree = (signal?: AbortSignal) =>
  analysisJson(analysisTreeSchema, "/api/tree/current", { signal });
export const getAnalysisCatalog = (treeId: string, signal?: AbortSignal) =>
  analysisJson(
    analysisEnvelopeSchema(analysisCatalogSchema),
    `/api/trees/${treeId}/analysis/catalog`,
    { signal },
  );
export const getAnalysisSummary = (
  treeId: string,
  branchId: string | null,
  excludeWives = false,
  signal?: AbortSignal,
) =>
  analysisJson(
    analysisEnvelopeSchema(analysisSummarySchema),
    `/api/trees/${treeId}/analysis/summary${analysisScopeQuery(branchId, excludeWives)}`,
    { signal },
  );
export const getAnalysisReport = (
  treeId: string,
  branchId: string | null,
  report: "branches" | "relationships" | "quality",
  excludeWives = false,
  signal?: AbortSignal,
) => {
  const schema =
    report === "branches"
      ? zArrayEnvelope(branchReportRowSchema)
      : analysisEnvelopeSchema(
          report === "relationships" ? relationshipReportSchema : qualityReportSchema,
        );
  return analysisJson(
    schema,
    `/api/trees/${treeId}/analysis/query${analysisScopeQuery(branchId, excludeWives)}`,
    {
      method: "POST",
      signal,
      headers: { "content-type": "application/json" },
      body: { report },
    },
  );
};

const zArrayEnvelope = <Schema extends z.ZodTypeAny>(schema: Schema) =>
  analysisEnvelopeSchema(schema.array());

export const getAnalysisMembers = (
  treeId: string,
  branchId: string | null,
  definition: AnalysisQueryDefinition,
  cursor: string | null,
  signal?: AbortSignal,
) =>
  analysisJson(
    analysisEnvelopeSchema(analysisMemberPageSchema),
    `/api/trees/${treeId}/analysis/members${branchQuery(branchId)}`,
    {
      method: "POST",
      signal,
      headers: { "content-type": "application/json" },
      body: { ...definition, cursor, limit: 50 },
    },
  );

export const getSavedAnalysisViews = (treeId: string) =>
  analysisJson(
    analysisEnvelopeSchema(savedAnalysisViewSchema.array()),
    `/api/trees/${treeId}/analysis/views`,
  );

export const createAnalysisView = (
  treeId: string,
  name: string,
  definition: AnalysisQueryDefinition,
) =>
  analysisJson(
    analysisEnvelopeSchema(savedAnalysisViewSchema),
    `/api/trees/${treeId}/analysis/views`,
    {
      method: "POST",
      body: { name, definition },
    },
  );

export const deleteAnalysisView = (treeId: string, viewId: string) =>
  analysisJson(
    analysisEnvelopeSchema(successResponseSchema),
    `/api/trees/${treeId}/analysis/views/${viewId}`,
    { method: "DELETE" },
  );

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
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as unknown;
    const code =
      payload &&
      typeof payload === "object" &&
      "code" in payload &&
      typeof payload.code === "string"
        ? payload.code
        : "REQUEST_FAILED";
    throw new ApiClientError(code, response.status, payload);
  }
  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement("a");
  link.href = url;
  link.download = `family-analysis.${format}`;
  link.click();
  URL.revokeObjectURL(url);
}
