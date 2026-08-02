import { transaction } from "@/shared/server/database";
import { jsonResponse as json } from "@/shared/http/response";
import { ApiError, parseBody, schemas } from "@/server/security";
import type { CollaborationSession } from "./types";

export async function handleAuthenticityConfigRequest(
  request: Request,
  url: URL,
  session: CollaborationSession,
  requestId: string,
): Promise<Response | undefined> {
  if (url.pathname === "/api/admin/authenticity-config" && request.method === "PATCH") {
    const allowedIds = new Set(
      (process.env.AUTHENTICITY_ADMIN_USER_IDS ?? "").split(",").map((id) => id.trim()),
    );
    if (!allowedIds.has(session.user_id)) throw new ApiError("FORBIDDEN", 403);
    const body = await parseBody(request, schemas.authenticityConfig);
    const row = await transaction(
      session.user_id,
      session.id,
      requestId,
      async (client) =>
        (
          await client.query(
            `INSERT INTO app.authenticity_config(
            version,growing_contributors,growing_branches,backed_contributors,backed_branches,
            established_contributors,established_branches,established_min_days,
            recent_activity_days,serious_complaint_downgrade
          ) SELECT COALESCE(max(version),0)+1,$1,$2,$3,$4,$5,$6,$7,$8,$9
            FROM app.authenticity_config RETURNING *`,
            [
              body.growingContributors,
              body.growingBranches,
              body.backedContributors,
              body.backedBranches,
              body.establishedContributors,
              body.establishedBranches,
              body.establishedMinDays,
              body.recentActivityDays,
              body.seriousComplaintDowngrade,
            ],
          )
        ).rows[0],
    );
    return json(row, 201);
  }
  return undefined;
}
