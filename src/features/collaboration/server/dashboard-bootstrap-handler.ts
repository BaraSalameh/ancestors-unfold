import { jsonResponse as json } from "@/shared/http/response";
import { readDashboardBootstrap } from "./dashboard-bootstrap-service";
import type { CollaborationSession } from "./types";

export async function handleDashboardBootstrapRequest(
  request: Request,
  session: CollaborationSession,
  requestId: string,
): Promise<Response | undefined> {
  const url = new URL(request.url);
  if (url.pathname !== "/api/dashboard/bootstrap" || request.method !== "GET") return undefined;
  const locale = url.searchParams.get("locale") === "ar" ? "ar" : "en";
  return json(await readDashboardBootstrap(session, requestId, locale));
}
