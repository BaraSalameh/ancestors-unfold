import { randomInt, randomUUID, timingSafeEqual } from "node:crypto";
import { transaction } from "@/shared/server/database";
import { branchDeactivationCodeMail, sendMail } from "@/shared/server/email";
import { jsonResponse as json } from "@/shared/http/response";
import { ApiError, enforceRateLimit, parseBody, schemas } from "@/server/security";
import { deleteContributorIdentity } from "./account-deletion";
import { requireTreeOwner } from "./authorization";
import { beginTreeMutation, finishTreeMutation } from "./branch-handler";
import { branchDeactivationCodeHash } from "./collaboration-crypto";
import type { CollaborationSession } from "./types";

export async function handleBranchDeactivationRequest(
  request: Request,
  url: URL,
  session: CollaborationSession,
  requestId: string,
): Promise<Response | undefined> {
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
  branchId: string,
  session: CollaborationSession,
  requestId: string,
) {
  await parseBody(request, schemas.branchDeactivationRequest);
  await enforceRateLimit(
    request,
    "email_verification",
    `branch-deactivation:${session.user_id}:${branchId}`,
    5,
    30,
  );
  const challengeId = randomUUID();
  const code = randomInt(0, 1_000_000).toString().padStart(6, "0");
  const created = await transaction(session.user_id, session.id, requestId, async (client) => {
    await requireTreeOwner(client, treeId, session.user_id);
    const branch = (
      await client.query<{
        branch_name_en: string | null;
        branch_name_ar: string | null;
        tree_name_en: string | null;
        tree_name_ar: string | null;
      }>(
        `SELECT b.name_en branch_name_en,b.name_ar branch_name_ar,
                t.name_en tree_name_en,t.name_ar tree_name_ar
         FROM app.subfamilies b JOIN app.family_trees t ON t.id=b.tree_id
         WHERE b.tree_id=$1 AND b.id=$2 AND b.status='active' AND b.deleted_at IS NULL
         FOR UPDATE OF b`,
        [treeId, branchId],
      )
    ).rows[0];
    if (!branch) throw new ApiError("BRANCH_UNAVAILABLE", 404);
    await client.query(
      `UPDATE app.branch_deactivation_challenges SET cancelled_at=now(),updated_at=now()
       WHERE tree_id=$1 AND branch_id=$2 AND owner_user_id=$3
         AND consumed_at IS NULL AND cancelled_at IS NULL`,
      [treeId, branchId, session.user_id],
    );
    const challenge = (
      await client.query<{ id: string; expires_at: string }>(
        `INSERT INTO app.branch_deactivation_challenges(
           id,tree_id,branch_id,owner_user_id,verification_code_hash,expires_at
         ) VALUES($1,$2,$3,$4,$5,now()+interval '15 minutes') RETURNING id,expires_at`,
        [
          challengeId,
          treeId,
          branchId,
          session.user_id,
          branchDeactivationCodeHash(challengeId, code),
        ],
      )
    ).rows[0];
    return { ...challenge, ...branch };
  });
  await sendMail(
    branchDeactivationCodeMail(
      session.email,
      code,
      created.branch_name_en,
      created.branch_name_ar,
      created.tree_name_en,
      created.tree_name_ar,
    ),
  );
  return json({ id: created.id, expires_at: created.expires_at }, 201);
}

// The complete destructive workflow stays in one serialized transaction.
// eslint-disable-next-line max-lines-per-function
async function confirmDeactivation(
  request: Request,
  challengeId: string,
  session: CollaborationSession,
  requestId: string,
) {
  const body = await parseBody(request, schemas.branchDeactivationConfirm);
  const result = await transaction(session.user_id, session.id, requestId, async (client) => {
    const challenge = (
      await client.query<{
        tree_id: string;
        branch_id: string;
        verification_code_hash: Buffer;
        expires_at: string;
      }>(
        `SELECT tree_id,branch_id,verification_code_hash,expires_at
         FROM app.branch_deactivation_challenges
         WHERE id=$1 AND owner_user_id=$2 AND consumed_at IS NULL AND cancelled_at IS NULL
         FOR UPDATE`,
        [challengeId, session.user_id],
      )
    ).rows[0];
    const received = branchDeactivationCodeHash(challengeId, body.code);
    if (
      !challenge ||
      new Date(challenge.expires_at).getTime() <= Date.now() ||
      challenge.verification_code_hash.length !== received.length ||
      !timingSafeEqual(challenge.verification_code_hash, received)
    )
      throw new ApiError("INVALID_OR_EXPIRED_CODE", 400);
    await beginTreeMutation(
      client,
      challenge.tree_id,
      session.user_id,
      body.expectedVersion,
      body.batchId,
    );
    const branch = (
      await client.query<{
        name_en: string;
        name_ar: string | null;
        contributor_user_id: string | null;
        contributor_name_en: string | null;
        contributor_name_ar: string | null;
      }>(
        `SELECT b.name_en,b.name_ar,g.user_id contributor_user_id,
                COALESCE(f.name_en,u.full_name_en) contributor_name_en,
                COALESCE(f.name_ar,u.full_name_ar) contributor_name_ar
         FROM app.subfamilies b
         LEFT JOIN app.branch_grants g ON g.tree_id=b.tree_id AND g.root_subfamily_id=b.id
           AND g.role='branch_editor' AND g.revoked_at IS NULL
         LEFT JOIN app.users u ON u.id=g.user_id AND u.status='active'
         LEFT JOIN app.tree_memberships m ON m.tree_id=b.tree_id AND m.user_id=g.user_id
           AND m.revoked_at IS NULL
         LEFT JOIN app.family_members f ON f.id=m.family_member_id
         WHERE b.tree_id=$1 AND b.id=$2 AND b.status='active' AND b.deleted_at IS NULL
         FOR UPDATE OF b`,
        [challenge.tree_id, challenge.branch_id],
      )
    ).rows[0];
    if (!branch) throw new ApiError("BRANCH_UNAVAILABLE", 404);
    if (branch.contributor_user_id) {
      await client.query(
        `SELECT 1 FROM app.branch_grants g
         JOIN app.tree_memberships m ON m.tree_id=g.tree_id AND m.user_id=g.user_id
         WHERE g.tree_id=$1 AND g.root_subfamily_id=$2 AND g.user_id=$3
           AND g.revoked_at IS NULL AND m.revoked_at IS NULL FOR UPDATE OF g,m`,
        [challenge.tree_id, challenge.branch_id, branch.contributor_user_id],
      );
      const allowed = await client.query<{ allowed: boolean }>(
        "SELECT app.owner_can_delete_contributor($1,$2) allowed",
        [challenge.tree_id, branch.contributor_user_id],
      );
      if (!allowed.rows[0]?.allowed) throw new ApiError("CONTRIBUTOR_ACCOUNT_DELETE_CONFLICT", 409);
      await client.query(
        `INSERT INTO app.tree_activity(
           tree_id,branch_id,actor_user_id,subject_user_id,subject_name_en,subject_name_ar,
           action_type,target_type,target_id
         ) VALUES($1,$2,$3,$4,$5,$6,'contributor_removed','user',$4)`,
        [
          challenge.tree_id,
          challenge.branch_id,
          session.user_id,
          branch.contributor_user_id,
          branch.contributor_name_en,
          branch.contributor_name_ar,
        ],
      );
      await deleteContributorIdentity(client, branch.contributor_user_id, session.user_id);
    }
    await client.query(
      `UPDATE app.subfamilies SET status='inactive',linked_male_id=NULL,
         parent_subfamily_id=NULL,version=version+1,updated_at=now()
       WHERE tree_id=$1 AND id=$2`,
      [challenge.tree_id, challenge.branch_id],
    );
    await client.query(
      `UPDATE app.contributor_invitations SET status='cancelled',updated_at=now()
       WHERE tree_id=$1 AND branch_id=$2 AND status='pending'`,
      [challenge.tree_id, challenge.branch_id],
    );
    await client.query(
      `UPDATE app.branch_grants SET revoked_at=now(),revoked_by=$3
       WHERE tree_id=$1 AND root_subfamily_id=$2 AND revoked_at IS NULL`,
      [challenge.tree_id, challenge.branch_id, session.user_id],
    );
    await client.query("SELECT app.reconcile_branch_structure($1)", [challenge.tree_id]);
    await client.query(
      `INSERT INTO app.tree_activity(
         tree_id,branch_id,actor_user_id,action_type,target_type,target_id,
         target_name_en,target_name_ar
       ) VALUES($1,$2,$3,'branch_deactivated','branch',$2,$4,$5)`,
      [challenge.tree_id, challenge.branch_id, session.user_id, branch.name_en, branch.name_ar],
    );
    await client.query(
      `UPDATE app.branch_deactivation_challenges
       SET consumed_at=now(),verification_code_hash=$2,updated_at=now() WHERE id=$1`,
      [challengeId, received],
    );
    const version = await finishTreeMutation(
      client,
      challenge.tree_id,
      body.expectedVersion,
      body.batchId,
    );
    return { ok: true, version };
  });
  return json(result);
}
