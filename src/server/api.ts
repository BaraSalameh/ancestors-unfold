import { randomUUID } from "node:crypto";
import { query } from "@/shared/server/database";
import { assertSameOrigin } from "./security";
import { logError } from "@/shared/server/logger";
import { jsonResponse as json } from "@/shared/http/response";
import { handleOperationsRequest } from "@/app/server/operations-handler";
import {
  handleCollaborationRequest,
  validatePublicInvitation,
} from "@/features/collaboration/server";
import { handleTreeRequest, readPublicSnapshot } from "@/features/trees/server";
import { cleanupStaleMemberImages } from "@/features/members/server";
import {
  authenticate,
  handleAuthenticatedSessionRequest,
  handleCurrentSessionRequest,
  handleGoogleAuthRequest,
  handleCredentialRequest,
  handleRegistrationRequest,
  handleAccountRequest,
  type Session,
} from "@/features/auth/server";
import { apiErrorResponse } from "./http/api-error-response";
import { handleAnalysisRequest } from "@/features/analysis/server";

export async function handleApi(request: Request): Promise<Response | null> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith("/api/")) return null;
  const requestId = randomUUID();
  try {
    assertSameOrigin(request);
    const publicResponse = await handlePublicApi(request, url, requestId);
    if (publicResponse) return publicResponse;
    const session = await authenticate(request);
    const currentSessionResponse = await handleCurrentSessionRequest(
      request,
      url,
      session,
      requestId,
    );
    if (currentSessionResponse) return currentSessionResponse;
    if (!session) return json({ code: "UNAUTHENTICATED" }, 401);
    const authenticatedResponse = await handleAuthenticatedApi(request, url, session, requestId);
    return authenticatedResponse;
  } catch (error) {
    logError("API request failed", error, {
      requestId,
      method: request.method,
      path: url.pathname,
    });
    return apiErrorResponse(error, url.pathname, requestId);
  }
}

async function handlePublicApi(
  request: Request,
  url: URL,
  requestId: string,
): Promise<Response | undefined> {
  const operationsResponse = await handleOperationsRequest(request);
  if (operationsResponse) return operationsResponse;
  const invitationResponse = await validatePublicInvitation(request);
  if (invitationResponse) return invitationResponse;
  if (url.pathname === "/api/cron/cloudinary-cleanup" && request.method === "GET") {
    const secret = process.env.CRON_SECRET;
    if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`)
      return json({ code: "UNAUTHENTICATED" }, 401);
    return json(await cleanupStaleMemberImages());
  }
  const googleResponse = await handleGoogleAuthRequest(request, url, requestId);
  if (googleResponse) return googleResponse;
  const registrationResponse = await handleRegistrationRequest(request, url, requestId);
  if (registrationResponse) return registrationResponse;
  const credentialResponse = await handleCredentialRequest(request, url, requestId);
  if (credentialResponse) return credentialResponse;
  const preview = url.pathname.match(
    /^\/api\/trees\/([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\/preview$/i,
  );
  if (preview && request.method === "GET") return json(await readPublicSnapshot(preview[1]));
  return undefined;
}

async function handleAuthenticatedApi(
  request: Request,
  url: URL,
  session: Session,
  requestId: string,
): Promise<Response> {
  const collaborationResponse = await handleCollaborationRequest(request, session, requestId);
  if (collaborationResponse) return collaborationResponse;
  const sessionResponse = await handleAuthenticatedSessionRequest(request, url, session);
  if (sessionResponse) return sessionResponse;
  const accountResponse = await handleAccountRequest(request, url, session, requestId);
  if (accountResponse) return accountResponse;
  const analysisResponse = await handleAnalysisRequest(request, url, session, requestId);
  if (analysisResponse) return analysisResponse;
  const treeResponse = await handleTreeRequest(request, url, session, requestId);
  if (treeResponse) return treeResponse;
  if (url.pathname === "/api/migration/status") {
    const result = await query<{ count: string }>(
      "SELECT count(*)::text count FROM app.import_id_map WHERE import_batch_id=$1",
      [url.searchParams.get("batchId")],
    );
    return json({ mapped: Number(result.rows[0]?.count ?? 0) });
  }
  return json({ code: "NOT_FOUND" }, 404);
}
