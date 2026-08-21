import { randomInt, randomUUID } from "node:crypto";
import { transaction } from "@/shared/server/database";
import { branchDeactivationCodeMail, sendMail } from "@/shared/server/email";
import { jsonResponse as json } from "@/shared/http/response";
import { ApiError, enforceRateLimit, parseBody, schemas } from "@/server/security";
import { requireTreeOwner } from "./authorization";
import { branchDeactivationCodeHash } from "./collaboration-crypto";
import { confirmBranchDeactivation } from "./branch-deactivation-transaction";
import type { CollaborationSession } from "./types";

export async function handleBranchDeactivationRequest(
  request: Request,
  url: URL,
  session: CollaborationSession,
  requestId: string,
): Promise<Response | undefined> {
  const createBulk = url.pathname.match(
    /^\/api\/trees\/([0-9a-f-]+)\/branches\/deactivation-requests$/,
  );
  if (createBulk && request.method === "POST")
    return requestDeactivation(request, createBulk[1], undefined, session, requestId);
  const create = url.pathname.match(
    /^\/api\/trees\/([0-9a-f-]+)\/branches\/([0-9a-f-]+)\/deactivation-requests$/,
  );
  if (create && request.method === "POST")
    return requestDeactivation(request, create[1], create[2], session, requestId);
  const confirm = url.pathname.match(
    /^\/api\/branch-deactivation-requests\/([0-9a-f-]+)\/confirm$/,
  );
  if (confirm && request.method === "POST")
    return confirmDeactivation(request, confirm[1], session, requestId);
  return undefined;
}

async function requestDeactivation(
  request: Request,
  treeId: string,
  branchId: string | undefined,
  session: CollaborationSession,
  requestId: string,
) {
  let branchIds: string[];
  if (branchId) {
    await parseBody(request, schemas.branchDeactivationRequest);
    branchIds = [branchId];
  } else branchIds = (await parseBody(request, schemas.branchBulkDeactivationRequest)).branchIds;
  await enforceRateLimit(
    request,
    "email_verification",
    `branch-deactivation:${session.user_id}:${treeId}`,
    5,
    30,
  );
  const challengeId = randomUUID();
  const code = randomInt(0, 1_000_000).toString().padStart(6, "0");
  const created = await transaction(session.user_id, session.id, requestId, async (client) => {
    await requireTreeOwner(client, treeId, session.user_id);
    const branches = await client.query<{
      branch_name_en: string | null;
      branch_name_ar: string | null;
      tree_name_en: string | null;
      tree_name_ar: string | null;
    }>(
      `SELECT b.name_en branch_name_en,b.name_ar branch_name_ar,
                t.name_en tree_name_en,t.name_ar tree_name_ar
         FROM app.subfamilies b JOIN app.family_trees t ON t.id=b.tree_id
         WHERE b.tree_id=$1 AND b.id=ANY($2::uuid[])
           AND b.status='active' AND b.deleted_at IS NULL
         FOR UPDATE OF b`,
      [treeId, branchIds],
    );
    if (branches.rowCount !== branchIds.length) throw new ApiError("BRANCH_UNAVAILABLE", 404);
    await client.query(
      `UPDATE app.branch_deactivation_challenges SET cancelled_at=now(),updated_at=now()
       WHERE tree_id=$1 AND owner_user_id=$2
         AND consumed_at IS NULL AND cancelled_at IS NULL`,
      [treeId, session.user_id],
    );
    const challenge = (
      await client.query<{ id: string; expires_at: string }>(
        `INSERT INTO app.branch_deactivation_challenges(
           id,tree_id,branch_id,branch_ids,owner_user_id,verification_code_hash,expires_at
         ) VALUES($1,$2,$3,$4,$5,$6,now()+interval '15 minutes') RETURNING id,expires_at`,
        [
          challengeId,
          treeId,
          branchIds[0],
          branchIds,
          session.user_id,
          branchDeactivationCodeHash(challengeId, code),
        ],
      )
    ).rows[0];
    return { ...challenge, branches: branches.rows };
  });
  const first = created.branches[0];
  await sendMail(
    branchDeactivationCodeMail(
      session.email,
      code,
      created.branches
        .map(({ branch_name_en }) => branch_name_en)
        .filter(Boolean)
        .join(", "),
      created.branches
        .map(({ branch_name_ar }) => branch_name_ar)
        .filter(Boolean)
        .join("، "),
      first.tree_name_en,
      first.tree_name_ar,
    ),
  );
  return json({ id: created.id, expires_at: created.expires_at }, 201);
}

async function confirmDeactivation(
  request: Request,
  challengeId: string,
  session: CollaborationSession,
  requestId: string,
) {
  const body = await parseBody(request, schemas.branchDeactivationConfirm);
  const result = await transaction(session.user_id, session.id, requestId, async (client) => {
    const version = await confirmBranchDeactivation(client, challengeId, session.user_id, body);
    return { ok: true, version };
  });
  return json(result);
}
