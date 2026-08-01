import { transaction } from "@/shared/server/database";
import { jsonResponse as json } from "@/shared/http/response";
import { ApiError, parseBody, schemas } from "@/server/security";
import type { CollaborationSession } from "./types";
import { requireTreeOwner } from "./authorization";

export async function handleModerationRequest(
  request: Request,
  url: URL,
  session: CollaborationSession,
  requestId: string,
): Promise<Response | undefined> {
  const complaints = url.pathname.match(/^\/api\/trees\/([0-9a-f-]+)\/complaints$/);
  if (complaints && request.method === "POST") {
    const body = await parseBody(request, schemas.complaint);
    const serious = ["fake_tree", "impersonation", "privacy"].includes(body.category);
    const row = await transaction(session.user_id, session.id, requestId, async (client) => {
      const visible = await client.query("SELECT app.can_view_tree($1) allowed", [complaints[1]]);
      if (!visible.rows[0]?.allowed) throw new ApiError("FORBIDDEN", 403);
      return (
        await client.query(
          `INSERT INTO app.tree_complaints(tree_id,submitted_by,category,description,serious)
           VALUES($1,$2,$3,$4,$5) RETURNING id,status,serious`,
          [complaints[1], session.user_id, body.category, body.description, serious],
        )
      ).rows[0];
    });
    return json(row, 201);
  }
  const complaintReview = url.pathname.match(/^\/api\/complaints\/([0-9a-f-]+)\/review$/);
  if (complaintReview && request.method === "POST") {
    const body = await parseBody(request, schemas.complaintReview);
    await transaction(session.user_id, session.id, requestId, async (client) => {
      const complaint = (
        await client.query<{ tree_id: string }>(
          "SELECT tree_id FROM app.tree_complaints WHERE id=$1",
          [complaintReview[1]],
        )
      ).rows[0];
      if (!complaint) throw new ApiError("NOT_FOUND", 404);
      await requireTreeOwner(client, complaint.tree_id, session.user_id);
      await client.query(
        `UPDATE app.tree_complaints SET status=$2,resolution_note=$3,
          serious=COALESCE($4,serious),reviewed_by=$5,resolved_at=now()
         WHERE id=$1 AND status='open'`,
        [complaintReview[1], body.status, body.resolutionNote, body.serious, session.user_id],
      );
    });
    return json({ ok: true });
  }
  return undefined;
}
