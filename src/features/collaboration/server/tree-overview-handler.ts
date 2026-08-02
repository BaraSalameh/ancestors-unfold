import { transaction } from "@/shared/server/database";
import { jsonResponse as json } from "@/shared/http/response";
import { ApiError } from "@/server/security";
import { authenticitySql } from "./authenticity-query";
import { currentTreeForSession } from "./current-tree-repository";
import type { CollaborationSession } from "./types";
import { serverConfig } from "@/shared/server/config";

export async function handleTreeOverviewRequest(
  request: Request,
  url: URL,
  session: CollaborationSession,
  requestId: string,
): Promise<Response | undefined> {
  if (url.pathname === "/api/tree/current" && request.method === "GET") {
    const result = await currentTreeForSession(session, requestId);
    return result.rowCount
      ? json({ ...result.rows[0], analysis_enabled: serverConfig.ANALYSIS_ENABLED })
      : json({ code: "TREE_UNAVAILABLE" }, 404);
  }
  const stats = url.pathname.match(/^\/api\/trees\/([0-9a-f-]+)\/statistics$/);
  if (stats && request.method === "GET") {
    const result = await transaction(session.user_id, session.id, requestId, async (client) => {
      const visible = await client.query("SELECT app.can_view_tree($1) allowed", [stats[1]]);
      if (!visible.rows[0]?.allowed) throw new ApiError("FORBIDDEN", 403);
      return client.query(
        `SELECT a.*,t.created_at tree_created_at,
          u.full_name_en owner_name_en,u.full_name_ar owner_name_ar
         FROM (${authenticitySql}) a
         JOIN app.family_trees t ON t.id=a.id JOIN app.users u ON u.id=t.owner_user_id`,
        [stats[1]],
      );
    });
    return json(result.rows[0]);
  }
  const branches = url.pathname.match(/^\/api\/trees\/([0-9a-f-]+)\/branches$/);
  if (!branches || request.method !== "GET") return undefined;
  const result = await transaction(session.user_id, session.id, requestId, async (client) => {
    const visible = await client.query("SELECT app.can_view_tree($1) allowed", [branches[1]]);
    if (!visible.rows[0]?.allowed) throw new ApiError("FORBIDDEN", 403);
    const owner = await client.query(
      `SELECT 1 FROM app.tree_memberships
       WHERE tree_id=$1 AND user_id=$2 AND role='owner' AND revoked_at IS NULL`,
      [branches[1], session.user_id],
    );
    return client.query(
      `SELECT b.id,b.name_en,b.name_ar,b.linked_male_id root_family_member_id,b.status,
        g.user_id contributor_user_id,u.full_name_en contributor_name_en,u.full_name_ar contributor_name_ar
       FROM app.subfamilies b LEFT JOIN app.branch_grants g
        ON g.tree_id=b.tree_id AND g.root_subfamily_id=b.id AND g.role='branch_editor' AND g.revoked_at IS NULL
       LEFT JOIN app.users u ON u.id=g.user_id
       WHERE b.tree_id=$1 AND b.deleted_at IS NULL
         AND ($2::boolean OR g.user_id=$3)
       ORDER BY b.created_at`,
      [branches[1], Boolean(owner.rowCount), session.user_id],
    );
  });
  return json(result.rows);
}
