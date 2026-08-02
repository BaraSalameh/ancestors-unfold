import type { Session } from "@/features/auth/server";
import { ApiError, parseBody, schemas } from "@/server/security";
import { jsonResponse as json } from "@/shared/http/response";
import { transaction } from "@/shared/server/database";
import { canUpdateTreeMetadata, descriptionPatchValue } from "../domain/tree-metadata-policy";

export async function handleTreeMetadataRequest(
  request: Request,
  url: URL,
  session: Session,
  requestId: string,
) {
  const match = url.pathname.match(/^\/api\/trees\/([0-9a-f-]+)$/);
  if (!match) return null;
  if (request.method === "PATCH") return updateMetadata(request, match[1], session, requestId);
  if (request.method === "DELETE") return deleteTree(match[1], session, requestId);
  return null;
}

async function updateMetadata(
  request: Request,
  treeId: string,
  session: Session,
  requestId: string,
) {
  const body = await parseBody(request, schemas.tree);
  const result = await transaction(session.user_id, session.id, requestId, async (client) => {
    const membership = await client.query<{ role: string }>(
      "SELECT role FROM app.tree_memberships WHERE tree_id=$1 AND user_id=$2 AND revoked_at IS NULL",
      [treeId, session.user_id],
    );
    if (!canUpdateTreeMetadata(membership.rows[0]?.role)) throw new Error("FORBIDDEN");
    const descriptionEn = descriptionPatchValue(body.description_en);
    const descriptionAr = descriptionPatchValue(body.description_ar);
    const updated = (
      await client.query(
        `UPDATE app.family_trees SET name_en=$2,name_ar=$3,
         description_en=CASE WHEN $6 THEN $4 ELSE description_en END,
         description_ar=CASE WHEN $7 THEN $5 ELSE description_ar END
         WHERE id=$1 RETURNING *`,
        [
          treeId,
          body.name_en,
          body.name_ar || null,
          descriptionEn.value,
          descriptionAr.value,
          descriptionEn.supplied,
          descriptionAr.supplied,
        ],
      )
    ).rows[0];
    await client.query(
      `INSERT INTO app.tree_activity(tree_id,actor_user_id,action_type,target_type,target_id,target_name_en,target_name_ar)
       VALUES($1,$2,'tree_metadata_updated','family_tree',$1,$3,$4)`,
      [treeId, session.user_id, updated.name_en, updated.name_ar],
    );
    return updated;
  });
  return json(result);
}

async function deleteTree(treeId: string, session: Session, requestId: string) {
  await transaction(session.user_id, session.id, requestId, async (client) => {
    const allowed = await client.query(
      "SELECT 1 FROM app.tree_memberships WHERE tree_id=$1 AND user_id=$2 AND role='owner' AND revoked_at IS NULL",
      [treeId, session.user_id],
    );
    if (!allowed.rowCount) throw new Error("FORBIDDEN");
    const contributors = await client.query(
      `SELECT 1 FROM app.branch_grants WHERE tree_id=$1 AND role='branch_editor'
       AND revoked_at IS NULL LIMIT 1`,
      [treeId],
    );
    if (contributors.rowCount) throw new ApiError("TREE_HAS_CONTRIBUTORS", 409);
    await client.query("UPDATE app.family_trees SET deleted_at=now() WHERE id=$1", [treeId]);
  });
  return json({ ok: true });
}
