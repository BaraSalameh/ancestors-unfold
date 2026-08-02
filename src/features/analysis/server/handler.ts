import type { Session } from "@/features/auth/server";
import { parseBody, ApiError } from "@/server/security";
import { jsonResponse } from "@/shared/http/response";
import { serverConfig } from "@/shared/server/config";
import {
  analysisExportSchema,
  analysisReportSchema,
  memberPageSchema,
  savedViewCreateSchema,
  savedViewUpdateSchema,
} from "../domain/schemas";
import {
  analysisCatalog,
  analysisExport,
  analysisMemberPage,
  analysisReport,
  analysisSummary,
  changeSavedView,
  removeSavedView,
  savedViews,
  saveView,
} from "./service";

const treePath =
  /^\/api\/trees\/([0-9a-f-]+)\/analysis(?:\/(catalog|summary|query|members|export|views))?$/;
const viewPath = /^\/api\/trees\/([0-9a-f-]+)\/analysis\/views\/([0-9a-f-]+)$/;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const json = (value: unknown, status = 200) =>
  jsonResponse(value, status, { "cache-control": "private, no-store" });

function requestedBranch(url: URL) {
  const branchId = url.searchParams.get("branchId");
  if (branchId && !uuid.test(branchId)) throw new ApiError("INVALID_INPUT", 400);
  return branchId;
}

export async function handleAnalysisRequest(
  request: Request,
  url: URL,
  session: Session,
  requestId: string,
): Promise<Response | undefined> {
  if (!serverConfig.ANALYSIS_ENABLED) return undefined;
  const view = url.pathname.match(viewPath);
  if (view) {
    if (!uuid.test(view[1]) || !uuid.test(view[2])) throw new ApiError("INVALID_INPUT", 400);
    return handleSavedViewRequest(request, session, requestId, view[1], view[2]);
  }

  const route = url.pathname.match(treePath);
  if (!route) return undefined;
  const [, treeId, action = "summary"] = route;
  if (!uuid.test(treeId)) throw new ApiError("INVALID_INPUT", 400);
  const branchId = requestedBranch(url);
  return handleTreeAnalysisRequest(request, session, requestId, treeId, action, branchId);
}

async function handleSavedViewRequest(
  request: Request,
  session: Session,
  requestId: string,
  treeId: string,
  viewId: string,
) {
  if (request.method === "PATCH") {
    const body = await parseBody(request, savedViewUpdateSchema);
    return json(await changeSavedView(session, requestId, treeId, viewId, body));
  }
  if (request.method === "DELETE")
    return json(await removeSavedView(session, requestId, treeId, viewId));
  return undefined;
}

async function exportResponse(
  request: Request,
  session: Session,
  requestId: string,
  treeId: string,
  branchId: string | null,
) {
  const input = await parseBody(request, analysisExportSchema);
  const exported = await analysisExport(session, requestId, treeId, branchId, input);
  return new Response(exported.body, {
    headers: {
      "content-type": exported.contentType,
      "content-disposition": `attachment; filename="family-analysis.${exported.extension}"`,
      "cache-control": "private, no-store",
    },
  });
}

async function handleTreeAnalysisRequest(
  request: Request,
  session: Session,
  requestId: string,
  treeId: string,
  action: string,
  branchId: string | null,
): Promise<Response | undefined> {
  if (action === "catalog" && request.method === "GET")
    return json(await analysisCatalog(session, requestId, treeId));
  if (action === "summary" && request.method === "GET")
    return json(await analysisSummary(session, requestId, treeId, branchId));
  if (action === "query" && request.method === "POST") {
    const input = await parseBody(request, analysisReportSchema);
    return json(await analysisReport(session, requestId, treeId, branchId, input.report));
  }
  if (action === "members" && request.method === "POST") {
    const input = await parseBody(request, memberPageSchema);
    return json(await analysisMemberPage(session, requestId, treeId, branchId, input));
  }
  if (action === "export" && request.method === "POST")
    return exportResponse(request, session, requestId, treeId, branchId);
  if (action !== "views") return undefined;
  if (request.method === "GET") return json(await savedViews(session, requestId, treeId));
  if (request.method === "POST") {
    const body = await parseBody(request, savedViewCreateSchema);
    return json(await saveView(session, requestId, treeId, body.name, body.definition), 201);
  }
  return undefined;
}
