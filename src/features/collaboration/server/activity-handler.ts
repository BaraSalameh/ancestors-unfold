import { transaction } from "@/shared/server/database";
import { jsonResponse as json } from "@/shared/http/response";
import { ApiError } from "@/server/security";
import { matchingActivityActionTypes } from "../domain/activity-search";
import { activityRequestLimit } from "../domain/policy";
import {
  activityGroups,
  activityPageFromGroups,
  decodeActivityCursor,
  type ActivityDatabaseRow,
} from "./activity-projection";
import type { CollaborationSession } from "./types";

export async function handleActivityRequest(
  request: Request,
  url: URL,
  session: CollaborationSession,
  requestId: string,
): Promise<Response | undefined> {
  const activity = url.pathname.match(/^\/api\/trees\/([0-9a-f-]+)\/activity$/);
  if (activity && request.method === "GET") {
    const limit = activityRequestLimit(url.searchParams.get("limit"));
    const cursor = decodeActivityCursor(url.searchParams.get("cursor"));
    const queryText = (url.searchParams.get("query") ?? "").trim().slice(0, 100);
    const locale = url.searchParams.get("locale") === "ar" ? "ar" : "en";
    const actionTypes = matchingActivityActionTypes(queryText, locale);
    const pattern = queryText
      ? `%${queryText
          .toLocaleLowerCase(locale)
          .replaceAll("\\", "\\\\")
          .replaceAll("%", "\\%")
          .replaceAll("_", "\\_")}%`
      : null;
    const result = await transaction(session.user_id, session.id, requestId, async (client) => {
      const visible = await client.query("SELECT app.can_view_tree($1) allowed", [activity[1]]);
      if (!visible.rows[0]?.allowed) throw new ApiError("FORBIDDEN", 403);
      const rows: ActivityDatabaseRow[] = [];
      let fetchCursor = cursor;
      let exhausted = false;
      do {
        const batch = await client.query<ActivityDatabaseRow>(
          `SELECT a.id,a.action_type,a.actor_user_id,a.actor_name_en,a.actor_name_ar,
             a.subject_user_id,a.subject_name_en,a.subject_name_ar,
             a.target_type,a.target_id,a.target_name_en,a.target_name_ar,
             a.branch_id,b.name_en branch_name_en,b.name_ar branch_name_ar,
             a.metadata,a.created_at
           FROM app.tree_activity a
           LEFT JOIN app.subfamilies b ON b.id=a.branch_id AND b.tree_id=a.tree_id
           WHERE a.tree_id=$1
             AND ($2::timestamptz IS NULL OR (a.created_at,a.id)<($2::timestamptz,$3::uuid))
             AND (
               $4::text IS NULL
               OR lower(
                 COALESCE(a.actor_name_en,'')||' '||COALESCE(a.actor_name_ar,'')||' '||
                 COALESCE(a.subject_name_en,'')||' '||COALESCE(a.subject_name_ar,'')
               ) LIKE $4 ESCAPE '\\'
               OR a.action_type=ANY($5::text[])
             )
           ORDER BY a.created_at DESC,a.id DESC LIMIT 250`,
          [
            activity[1],
            fetchCursor?.createdAt ?? null,
            fetchCursor?.id ?? null,
            pattern,
            actionTypes,
          ],
        );
        rows.push(...batch.rows);
        exhausted = batch.rows.length < 250;
        const last = batch.rows.at(-1);
        if (last) fetchCursor = { createdAt: last.created_at, id: last.id };
        if (!last) exhausted = true;
      } while (!exhausted && activityGroups(rows).length <= limit);
      return activityGroups(rows);
    });
    return json(activityPageFromGroups(result, limit));
  }
  return undefined;
}
