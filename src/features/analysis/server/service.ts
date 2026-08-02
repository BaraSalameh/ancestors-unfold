import { ApiError } from "@/server/security";
import type { PoolClient } from "pg";
import { transaction } from "@/shared/server/database";
import { logInfo } from "@/shared/server/logger";
import {
  analysisMembersCsv,
  decodeAnalysisCursor,
  encodeAnalysisCursor,
} from "../domain/projection";
import type { AnalysisExportInput, MemberPageInput } from "../domain/schemas";
import type { AnalysisQueryDefinition } from "../domain/types";
import {
  readAnalysisMembers,
  readAnalysisSummary,
  readBranchReport,
  readRelationshipReport,
} from "./repository";
import { readQualityReport } from "./quality-repository";
import {
  createSavedView,
  deleteSavedView,
  listSavedViews,
  updateSavedView,
} from "./saved-views-repository";
import { analysisBranches, resolveAnalysisScope } from "./scope";

type AnalysisSession = { id: string; user_id: string };

async function runAnalysis<T>(
  session: AnalysisSession,
  requestId: string,
  treeId: string,
  branchId: string | null,
  category: string,
  operation: (
    client: PoolClient,
    scope: Awaited<ReturnType<typeof resolveAnalysisScope>>,
  ) => Promise<T>,
) {
  const started = Date.now();
  try {
    const result = await transaction(session.user_id, session.id, requestId, async (client) => {
      await client.query("SET LOCAL statement_timeout='4s'");
      const scope = await resolveAnalysisScope(client, treeId, session.user_id, branchId);
      const data = await operation(client, scope);
      const date = await client.query<{ as_of_date: string }>(
        "SELECT current_date::text as_of_date",
      );
      return { schema_version: 1 as const, as_of_date: date.rows[0].as_of_date, scope, data };
    });
    logInfo("Analysis query completed", {
      requestId,
      treeId,
      category,
      scopeKind: result.scope.kind,
      scopeRole: result.scope.role,
      durationMs: Date.now() - started,
      resultCount: Array.isArray(result.data) ? result.data.length : undefined,
    });
    return result;
  } catch (error) {
    const databaseCode = (error as { code?: string }).code;
    const analysisError =
      databaseCode === "57014"
        ? "ANALYSIS_TOO_COMPLEX"
        : databaseCode === "23505" && category === "save_view"
          ? "ANALYSIS_VIEW_EXISTS"
          : error instanceof ApiError
            ? error.code
            : "ANALYSIS_FAILED";
    logInfo("Analysis query failed", {
      requestId,
      treeId,
      category,
      durationMs: Date.now() - started,
      analysisError,
    });
    if (databaseCode === "57014") throw new ApiError("ANALYSIS_TOO_COMPLEX", 422);
    if (databaseCode === "23505" && category === "save_view")
      throw new ApiError("ANALYSIS_VIEW_EXISTS", 409);
    throw error;
  }
}

export const analysisCatalog = (session: AnalysisSession, requestId: string, treeId: string) =>
  runAnalysis(session, requestId, treeId, null, "catalog", async (client, scope) => ({
    branches: await analysisBranches(client, scope),
    filters: [
      "search",
      "genders",
      "lifeStatus",
      "citizenStatuses",
      "age",
      "birthDate",
      "deathDate",
      "parentCount",
      "hasSpouse",
      "hasChildren",
      "childCount",
      "generation",
      "missingFields",
    ],
    reports: ["branches", "relationships", "quality"],
    export_formats: ["csv", "json"],
    maximum_page_size: 100,
    maximum_export_rows: 10_000,
  }));

export const analysisSummary = (
  session: AnalysisSession,
  requestId: string,
  treeId: string,
  branchId: string | null,
) =>
  runAnalysis(session, requestId, treeId, branchId, "summary", (client, scope) =>
    readAnalysisSummary(client, scope),
  );

export const analysisReport = (
  session: AnalysisSession,
  requestId: string,
  treeId: string,
  branchId: string | null,
  report: "branches" | "relationships" | "quality",
) =>
  runAnalysis(session, requestId, treeId, branchId, report, (client, scope) => {
    if (report === "branches") return readBranchReport(client, scope);
    if (report === "relationships") return readRelationshipReport(client, scope);
    return readQualityReport(client, scope);
  });

export async function analysisMemberPage(
  session: AnalysisSession,
  requestId: string,
  treeId: string,
  branchId: string | null,
  input: MemberPageInput,
) {
  let cursor: ReturnType<typeof decodeAnalysisCursor>;
  try {
    cursor = decodeAnalysisCursor(input.cursor);
  } catch {
    throw new ApiError("INVALID_CURSOR", 400);
  }
  if (cursor && (cursor.sort !== input.sort || cursor.direction !== input.direction))
    throw new ApiError("INVALID_CURSOR", 400);
  return runAnalysis(session, requestId, treeId, branchId, "members", async (client, scope) => {
    const result = await readAnalysisMembers(client, scope, input, cursor);
    const hasMore = result.rows.length > input.limit;
    const items = result.rows.slice(0, input.limit);
    const last = items.at(-1);
    return {
      items,
      total: result.total,
      applied_filters: input.filters,
      next_cursor:
        hasMore && last
          ? encodeAnalysisCursor({
              sort: input.sort,
              direction: input.direction,
              value: result.cursorValue,
              id: last.id,
            })
          : null,
    };
  });
}

export async function analysisExport(
  session: AnalysisSession,
  requestId: string,
  treeId: string,
  branchId: string | null,
  input: AnalysisExportInput,
) {
  const result = await runAnalysis(
    session,
    requestId,
    treeId,
    branchId,
    "export",
    async (client, scope) => {
      const rows = await readAnalysisMembers(
        client,
        scope,
        { ...input, limit: 100, cursor: null },
        null,
        10_001,
      );
      if (rows.rows.length > 10_000) throw new ApiError("EXPORT_TOO_LARGE", 422);
      return rows.rows;
    },
  );
  return input.format === "csv"
    ? {
        body: analysisMembersCsv(result.data),
        contentType: "text/csv; charset=utf-8",
        extension: "csv",
      }
    : {
        body: JSON.stringify(result, null, 2),
        contentType: "application/json; charset=utf-8",
        extension: "json",
      };
}

export const savedViews = (session: AnalysisSession, requestId: string, treeId: string) =>
  runAnalysis(session, requestId, treeId, null, "saved_views", (client, scope) =>
    listSavedViews(client, scope, session.user_id),
  );

export const saveView = (
  session: AnalysisSession,
  requestId: string,
  treeId: string,
  name: string,
  definition: AnalysisQueryDefinition,
) =>
  runAnalysis(session, requestId, treeId, null, "save_view", (client, scope) =>
    createSavedView(client, scope, session.user_id, name, definition),
  );

export const changeSavedView = (
  session: AnalysisSession,
  requestId: string,
  treeId: string,
  viewId: string,
  patch: { name?: string; definition?: AnalysisQueryDefinition },
) =>
  runAnalysis(session, requestId, treeId, null, "update_view", async (client, scope) => {
    const updated = await updateSavedView(client, scope, session.user_id, viewId, patch);
    if (!updated) throw new ApiError("ANALYSIS_VIEW_NOT_FOUND", 404);
    return updated;
  });

export const removeSavedView = (
  session: AnalysisSession,
  requestId: string,
  treeId: string,
  viewId: string,
) =>
  runAnalysis(session, requestId, treeId, null, "delete_view", async (client, scope) => {
    const deleted = await deleteSavedView(client, scope, session.user_id, viewId);
    if (!deleted.rowCount) throw new ApiError("ANALYSIS_VIEW_NOT_FOUND", 404);
    return { ok: true };
  });
