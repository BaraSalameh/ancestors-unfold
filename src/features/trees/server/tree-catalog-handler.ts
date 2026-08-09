import { jsonResponse as json } from "@/shared/http/response";
import { transaction } from "@/shared/server/database";
import type { Session } from "@/features/auth/server";

export async function handleTreeCatalogRequest(
  request: Request,
  url: URL,
  session: Session,
  requestId: string,
) {
  if (url.pathname === "/api/trees" && request.method === "POST")
    return json({ code: "SINGLE_TREE_ACCOUNT" }, 405);
  if (url.pathname !== "/api/trees" || request.method !== "GET") return null;
  const result = await transaction(session.user_id, session.id, requestId, (client) =>
    client.query(`WITH RECURSIVE visible_trees AS (
      SELECT t.id FROM app.family_trees t WHERE t.deleted_at IS NULL AND app.can_view_tree(t.id)
    ), visible_members AS (
      SELECT m.id,m.tree_id FROM app.family_members m JOIN visible_trees t ON t.id=m.tree_id
      WHERE m.deleted_at IS NULL
    ), roots AS (
      SELECT m.tree_id,m.id FROM visible_members m
      WHERE NOT EXISTS (
        SELECT 1 FROM app.parent_child_relationships relationship
        WHERE relationship.tree_id=m.tree_id AND relationship.child_id=m.id
          AND relationship.deleted_at IS NULL
      )
    ), lineage AS (
      SELECT root.tree_id,root.id,1 AS depth,ARRAY[root.id] AS path FROM roots root
      UNION ALL
      SELECT l.tree_id,child.id,l.depth+1,l.path || child.id FROM lineage l
      JOIN app.parent_child_relationships relationship ON relationship.tree_id=l.tree_id
        AND relationship.parent_id=l.id AND relationship.deleted_at IS NULL
      JOIN visible_members child ON child.tree_id=relationship.tree_id
        AND child.id=relationship.child_id WHERE NOT child.id=ANY(l.path)
    ), tree_stats AS (
      SELECT m.tree_id,count(*)::integer AS members,
        coalesce((SELECT max(l.depth) FROM lineage l WHERE l.tree_id=m.tree_id),0)::integer generations
      FROM visible_members m GROUP BY m.tree_id
    ) SELECT t.id,t.name_en,t.name_ar,t.updated_at,
      coalesce(s.members,0)::integer members,coalesce(s.generations,0)::integer generations
      FROM visible_trees visible JOIN app.family_trees t ON t.id=visible.id
      LEFT JOIN tree_stats s ON s.tree_id=t.id ORDER BY t.updated_at DESC`),
  );
  return json(result.rows);
}
