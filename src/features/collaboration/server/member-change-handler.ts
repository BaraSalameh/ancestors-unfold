import { transaction } from "@/shared/server/database";
import { jsonResponse as json } from "@/shared/http/response";
import { ApiError, parseBody, schemas } from "@/server/security";
import type { CollaborationSession } from "./types";

export async function handleMemberChangeRequest(
  request: Request,
  url: URL,
  session: CollaborationSession,
  requestId: string,
): Promise<Response | undefined> {
  const changes = url.pathname.match(/^\/api\/trees\/([0-9a-f-]+)\/change-requests$/);
  if (changes && request.method === "POST") {
    const body = await parseBody(request, schemas.changeRequest);
    const row = await transaction(session.user_id, session.id, requestId, async (client) => {
      const grant = await client.query(
        `SELECT 1 FROM app.branch_grants WHERE tree_id=$1 AND user_id=$2
         AND root_subfamily_id=$3 AND role='branch_editor' AND revoked_at IS NULL`,
        [changes[1], session.user_id, body.branchId],
      );
      if (!grant.rowCount) throw new ApiError("FORBIDDEN", 403);
      return (
        await client.query(
          `INSERT INTO app.member_change_requests(
            tree_id,branch_id,member_id,requested_by,proposed_changes
          ) VALUES($1,$2,$3,$4,$5::jsonb) RETURNING *`,
          [
            changes[1],
            body.branchId,
            body.memberId,
            session.user_id,
            JSON.stringify(body.proposedChanges),
          ],
        )
      ).rows[0];
    });
    return json(row, 201);
  }
  const scopedMember = url.pathname.match(/^\/api\/trees\/([0-9a-f-]+)\/scoped-members$/);
  if (scopedMember && request.method === "PATCH") {
    const body = await parseBody(request, schemas.scopedMember);
    const row = await transaction(session.user_id, session.id, requestId, async (client) => {
      const allowed = await client.query("SELECT app.can_edit_member($1,$2) allowed", [
        scopedMember[1],
        body.memberId,
      ]);
      if (!allowed.rows[0]?.allowed) throw new ApiError("PROTECTED_MEMBER", 403);
      return (
        await client.query(
          `UPDATE app.family_members SET
            name_en=COALESCE($3,name_en),name_ar=COALESCE($4,name_ar),
            notes=COALESCE($5,notes),birth_date=COALESCE($6::date,birth_date),
            death_date=COALESCE($7::date,death_date),updated_by=$2,updated_at=now()
           WHERE tree_id=$1 AND id=$8 AND deleted_at IS NULL RETURNING *`,
          [
            scopedMember[1],
            session.user_id,
            body.name_en,
            body.name_ar,
            body.notes,
            body.birth_date,
            body.death_date,
            body.memberId,
          ],
        )
      ).rows[0];
    });
    return json(row);
  }
  return undefined;
}
