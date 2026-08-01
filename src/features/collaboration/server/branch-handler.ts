import { transaction } from "@/shared/server/database";
import { jsonResponse as json } from "@/shared/http/response";
import { ApiError, parseBody, schemas } from "@/server/security";
import { requireTreeOwner } from "./authorization";
import type { CollaborationSession } from "./types";

async function createBranch(
  request: Request,
  treeId: string,
  session: CollaborationSession,
  requestId: string,
) {
  const body = await parseBody(request, schemas.branch);
  const result = await transaction(session.user_id, session.id, requestId, async (client) => {
    await requireTreeOwner(client, treeId, session.user_id);
    const created = (
      await client.query(
        `INSERT INTO app.subfamilies(
          tree_id,name_en,name_ar,linked_male_id,parent_subfamily_id,position_label,status
        ) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
        [
          treeId,
          body.name_en,
          body.name_ar || null,
          body.rootFamilyMemberId || null,
          body.parentBranchId || null,
          body.positionLabel || null,
          body.status,
        ],
      )
    ).rows[0];
    await client.query(
      `INSERT INTO app.tree_activity(
         tree_id,branch_id,actor_user_id,action_type,target_type,target_id,
         target_name_en,target_name_ar
       ) VALUES($1,$2,$3,'branch_created','branch',$2,$4,$5)`,
      [treeId, created.id, session.user_id, created.name_en, created.name_ar],
    );
    return created;
  });
  return json(result, 201);
}

async function updateBranch(
  request: Request,
  treeId: string,
  branchId: string,
  session: CollaborationSession,
  requestId: string,
) {
  const body = await parseBody(request, schemas.branchUpdate);
  const result = await transaction(session.user_id, session.id, requestId, async (client) => {
    await requireTreeOwner(client, treeId, session.user_id);
    const updated = (
      await client.query(
        `UPDATE app.subfamilies SET
          name_en=COALESCE($3,name_en),name_ar=COALESCE($4,name_ar),
          position_label=COALESCE($5,position_label),
          status=COALESCE($6::app.branch_status,status),updated_at=now()
         WHERE tree_id=$1 AND id=$2 AND deleted_at IS NULL RETURNING *`,
        [treeId, branchId, body.name_en, body.name_ar, body.positionLabel, body.status],
      )
    ).rows[0];
    if (!updated) throw new ApiError("BRANCH_UNAVAILABLE", 404);
    if (body.status === "inactive") {
      await client.query(
        `UPDATE app.contributor_invitations SET status='cancelled',updated_at=now()
         WHERE tree_id=$1 AND branch_id=$2 AND status='pending'`,
        [treeId, branchId],
      );
      await client.query(
        `UPDATE app.branch_grants SET revoked_at=now(),revoked_by=$3
         WHERE tree_id=$1 AND root_subfamily_id=$2 AND revoked_at IS NULL`,
        [treeId, branchId, session.user_id],
      );
    }
    await client.query(
      `INSERT INTO app.tree_activity(
         tree_id,branch_id,actor_user_id,action_type,target_type,target_id,
         target_name_en,target_name_ar
       ) VALUES(
         $1,$2,$3,
         CASE WHEN $6='active' THEN 'branch_activated'
              WHEN $6='inactive' THEN 'branch_deactivated'
              ELSE 'branch_updated' END,
         'branch',$2,$4,$5
       )`,
      [treeId, branchId, session.user_id, updated.name_en, updated.name_ar, body.status ?? null],
    );
    return updated;
  });
  return json(result);
}

export async function handleBranchRequest(
  request: Request,
  url: URL,
  session: CollaborationSession,
  requestId: string,
): Promise<Response | undefined> {
  const collection = url.pathname.match(/^\/api\/trees\/([0-9a-f-]+)\/branches$/);
  if (collection && request.method === "POST") {
    return createBranch(request, collection[1], session, requestId);
  }
  const item = url.pathname.match(/^\/api\/trees\/([0-9a-f-]+)\/branches\/([0-9a-f-]+)$/);
  return item && request.method === "PATCH"
    ? updateBranch(request, item[1], item[2], session, requestId)
    : undefined;
}
