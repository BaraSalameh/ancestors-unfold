import { transaction } from "@/shared/server/database";
import { ApiError } from "@/server/security";
import { matchingActivityActionTypes } from "../domain/activity-search";
import {
  activityGroups,
  activityPageFromGroups,
  type ActivityDatabaseRow,
  type ActivityCursor,
} from "./activity-projection";

type ActivitySession = { id: string; user_id: string };

interface ActivityPageInput {
  treeId: string;
  limit: number;
  cursor: ActivityCursor | null;
  query: string;
  locale: "en" | "ar";
}

function activityPattern(query: string, locale: "en" | "ar") {
  if (!query) return null;
  return `%${query
    .toLocaleLowerCase(locale)
    .replaceAll("\\", "\\\\")
    .replaceAll("%", "\\%")
    .replaceAll("_", "\\_")}%`;
}

async function readActivityBatch(
  client: import("pg").PoolClient,
  input: ActivityPageInput,
  cursor: ActivityCursor | null,
) {
  return client.query<ActivityDatabaseRow>(
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
      input.treeId,
      cursor?.createdAt ?? null,
      cursor?.id ?? null,
      activityPattern(input.query, input.locale),
      matchingActivityActionTypes(input.query, input.locale),
    ],
  );
}

export async function readActivityPage(
  session: ActivitySession,
  requestId: string,
  input: ActivityPageInput,
) {
  const groups = await transaction(session.user_id, session.id, requestId, async (client) => {
    const visible = await client.query("SELECT app.can_view_tree($1) allowed", [input.treeId]);
    if (!visible.rows[0]?.allowed) throw new ApiError("FORBIDDEN", 403);
    const rows: ActivityDatabaseRow[] = [];
    let cursor = input.cursor;
    let exhausted = false;
    do {
      const batch = await readActivityBatch(client, input, cursor);
      rows.push(...batch.rows);
      exhausted = batch.rows.length < 250;
      const last = batch.rows.at(-1);
      if (last) cursor = { createdAt: last.created_at, id: last.id };
      else exhausted = true;
    } while (!exhausted && activityGroups(rows).length <= input.limit);
    return activityGroups(rows);
  });
  return activityPageFromGroups(groups, input.limit);
}
