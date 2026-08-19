import { transaction } from "@/shared/server/database";
import { jsonResponse as json } from "@/shared/http/response";
import { requireTreeOwner } from "./authorization";
import type { CollaborationSession } from "./types";

const escapedPattern = (value: string) =>
  `%${value.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_")}%`;

export async function handleCollaborationSearchRequest(
  request: Request,
  url: URL,
  session: CollaborationSession,
  requestId: string,
): Promise<Response | undefined> {
  const branchSearch = url.pathname.match(/^\/api\/trees\/([0-9a-f-]+)\/available-branches$/);
  const memberSearch = url.pathname.match(/^\/api\/trees\/([0-9a-f-]+)\/invitable-members$/);
  if (request.method !== "GET" || (!branchSearch && !memberSearch)) return undefined;
  const query = url.searchParams.get("q")?.trim() ?? "";
  if (query.length < 2) return json([]);
  const treeId = (branchSearch ?? memberSearch)![1];
  const result = await transaction(session.user_id, session.id, requestId, async (client) => {
    await requireTreeOwner(client, treeId, session.user_id);
    if (branchSearch) {
      return client.query(
        `SELECT b.id,b.name_en,b.name_ar
         FROM app.subfamilies b
         WHERE b.tree_id=$1 AND b.status='active' AND b.deleted_at IS NULL
           AND (b.name_en ILIKE $2 ESCAPE '\\' OR COALESCE(b.name_ar,'') ILIKE $2 ESCAPE '\\')
           AND NOT EXISTS (
             SELECT 1 FROM app.branch_grants g WHERE g.tree_id=b.tree_id
               AND g.root_subfamily_id=b.id AND g.role='branch_editor' AND g.revoked_at IS NULL
           )
           AND NOT EXISTS (
             SELECT 1 FROM app.contributor_invitations i WHERE i.tree_id=b.tree_id
               AND i.branch_id=b.id AND i.status='pending'
           )
         ORDER BY b.name_en,b.name_ar LIMIT 20`,
        [treeId, escapedPattern(query)],
      );
    }
    return client.query(
      `SELECT m.id,m.name_en,m.name_ar,m.gender,
        extract(year FROM m.birth_date)::integer birth_year,
        father.id father_id,father.name_en father_name_en,father.name_ar father_name_ar,
        grandfather.id grandfather_id,grandfather.name_en grandfather_name_en,
        grandfather.name_ar grandfather_name_ar,
        great_grandfather.id great_grandfather_id,
        great_grandfather.name_en great_grandfather_name_en,
        great_grandfather.name_ar great_grandfather_name_ar
       FROM app.family_members m
       LEFT JOIN app.parent_child_relationships father_link
         ON father_link.child_id=m.id AND father_link.parent_role='father'
        AND father_link.deleted_at IS NULL
       LEFT JOIN app.family_members father
         ON father.id=father_link.parent_id AND father.deleted_at IS NULL
       LEFT JOIN app.parent_child_relationships grandfather_link
         ON grandfather_link.child_id=father.id AND grandfather_link.parent_role='father'
        AND grandfather_link.deleted_at IS NULL
       LEFT JOIN app.family_members grandfather
         ON grandfather.id=grandfather_link.parent_id AND grandfather.deleted_at IS NULL
       LEFT JOIN app.parent_child_relationships great_grandfather_link
         ON great_grandfather_link.child_id=grandfather.id
        AND great_grandfather_link.parent_role='father'
        AND great_grandfather_link.deleted_at IS NULL
       LEFT JOIN app.family_members great_grandfather
         ON great_grandfather.id=great_grandfather_link.parent_id
        AND great_grandfather.deleted_at IS NULL
       WHERE m.tree_id=$1 AND m.linked_user_id IS NULL AND m.deleted_at IS NULL
         AND concat_ws(' ',m.name_en,m.name_ar,father.name_en,father.name_ar,
           grandfather.name_en,grandfather.name_ar,
           great_grandfather.name_en,great_grandfather.name_ar,
           extract(year FROM m.birth_date)::text) ILIKE $2 ESCAPE '\\'
         AND NOT EXISTS (
           SELECT 1 FROM app.contributor_invitations i
           WHERE i.tree_id=m.tree_id AND i.existing_family_member_id=m.id AND i.status='pending'
         )
       ORDER BY m.name_en,m.name_ar LIMIT 20`,
      [treeId, escapedPattern(query)],
    );
  });
  return json(result.rows);
}
