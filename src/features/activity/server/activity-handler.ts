import { jsonResponse as json } from "@/shared/http/response";
import { activityRequestLimit } from "../domain/activity-policy";
import { decodeActivityCursor } from "./activity-projection";
import { readActivityPage } from "./activity-service";

type ActivitySession = { id: string; user_id: string };

export async function handleActivityRequest(
  request: Request,
  url: URL,
  session: ActivitySession,
  requestId: string,
): Promise<Response | undefined> {
  const activity = url.pathname.match(/^\/api\/trees\/([0-9a-f-]+)\/activity$/);
  if (activity && request.method === "GET") {
    const limit = activityRequestLimit(url.searchParams.get("limit"));
    const cursor = decodeActivityCursor(url.searchParams.get("cursor"));
    const query = (url.searchParams.get("query") ?? "").trim().slice(0, 100);
    const locale = url.searchParams.get("locale") === "ar" ? "ar" : "en";
    return json(
      await readActivityPage(session, requestId, {
        treeId: activity[1],
        limit,
        cursor,
        query,
        locale,
      }),
    );
  }
  return undefined;
}
