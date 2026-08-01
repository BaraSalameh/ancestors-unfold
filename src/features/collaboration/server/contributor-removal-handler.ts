import { randomInt, randomUUID, timingSafeEqual } from "node:crypto";
import { transaction } from "@/shared/server/database";
import { contributorRemovalCodeMail, sendMail } from "@/shared/server/email";
import { jsonResponse as json } from "@/shared/http/response";
import { ApiError, parseBody, schemas } from "@/server/security";
import { deleteContributorIdentity } from "./account-deletion";
import { requireTreeOwner } from "./authorization";
import { contributorRemovalCodeHash } from "./collaboration-crypto";
import type { CollaborationSession } from "./types";

export async function handleContributorRemovalRequest(
  request: Request,
  url: URL,
  session: CollaborationSession,
  requestId: string,
): Promise<Response | undefined> {
  const removalRequest = url.pathname.match(
    /^\/api\/trees\/([0-9a-f-]+)\/contributors\/([0-9a-f-]+)\/removal-requests$/,
  );
  if (removalRequest && request.method === "POST")
    return requestRemoval(removalRequest[1], removalRequest[2], session, requestId);
  const confirmation = url.pathname.match(
    /^\/api\/contributor-removal-requests\/([0-9a-f-]+)\/confirm$/,
  );
  if (confirmation && request.method === "POST")
    return confirmRemoval(request, confirmation[1], session, requestId);
  const legacyRemoval = url.pathname.match(
    /^\/api\/trees\/([0-9a-f-]+)\/contributors\/([0-9a-f-]+)\/remove$/,
  );
  if (legacyRemoval && request.method === "POST")
    throw new ApiError("CONTRIBUTOR_REMOVAL_VERIFICATION_REQUIRED", 409);
  return undefined;
}

async function requestRemoval(
  treeId: string,
  contributorId: string,
  session: CollaborationSession,
  requestId: string,
): Promise<Response> {
  const challengeId = randomUUID();
  const code = randomInt(0, 1_000_000).toString().padStart(6, "0");
  const requested = await transaction(session.user_id, session.id, requestId, async (client) => {
    await requireTreeOwner(client, treeId, session.user_id);
    const contributor = (
      await client.query<{
        name_en: string;
        name_ar: string;
        tree_name: string;
      }>(
        `SELECT COALESCE(f.name_en,u.full_name_en) name_en,
                COALESCE(f.name_ar,u.full_name_ar) name_ar,
                COALESCE(t.name_en,t.name_ar) tree_name
             FROM app.tree_memberships m
             JOIN app.users u ON u.id=m.user_id AND u.status='active'
             JOIN app.family_trees t ON t.id=m.tree_id AND t.deleted_at IS NULL
             JOIN app.branch_grants g ON g.tree_id=m.tree_id AND g.user_id=m.user_id
               AND g.role='branch_editor' AND g.revoked_at IS NULL
               AND (g.expires_at IS NULL OR g.expires_at>now())
             JOIN app.subfamilies b ON b.tree_id=g.tree_id AND b.id=g.root_subfamily_id
               AND b.status='active' AND b.deleted_at IS NULL
             LEFT JOIN app.family_members f ON f.id=m.family_member_id
             WHERE m.tree_id=$1 AND m.user_id=$2 AND m.role<>'owner'
               AND m.affiliation_status='active' AND m.revoked_at IS NULL
             FOR UPDATE OF m,g`,
        [treeId, contributorId],
      )
    ).rows[0];
    if (!contributor) throw new ApiError("CONTRIBUTOR_UNAVAILABLE", 409);
    await client.query(
      `UPDATE app.contributor_removal_challenges
           SET cancelled_at=now(),updated_at=now()
           WHERE tree_id=$1 AND owner_user_id=$2 AND contributor_user_id=$3
             AND consumed_at IS NULL AND cancelled_at IS NULL`,
      [treeId, session.user_id, contributorId],
    );
    const challenge = (
      await client.query<{ id: string; expires_at: string }>(
        `INSERT INTO app.contributor_removal_challenges(
               id,tree_id,owner_user_id,contributor_user_id,verification_code_hash,expires_at
             ) VALUES($1,$2,$3,$4,$5,now()+interval '15 minutes')
             RETURNING id,expires_at`,
        [
          challengeId,
          treeId,
          session.user_id,
          contributorId,
          contributorRemovalCodeHash(challengeId, code),
        ],
      )
    ).rows[0];
    return { ...challenge, contributor };
  });
  await sendMail(
    contributorRemovalCodeMail(
      session.email,
      code,
      requested.contributor.name_en,
      requested.contributor.tree_name,
    ),
  );
  return json({ id: requested.id, expires_at: requested.expires_at }, 201);
}

async function confirmRemoval(
  request: Request,
  challengeId: string,
  session: CollaborationSession,
  requestId: string,
): Promise<Response> {
  const body = await parseBody(request, schemas.contributorRemovalCode);
  await transaction(session.user_id, session.id, requestId, async (client) => {
    const challenge = (
      await client.query<{
        tree_id: string;
        contributor_user_id: string;
        verification_code_hash: Buffer;
        expires_at: string;
      }>(
        `SELECT tree_id,contributor_user_id,verification_code_hash,expires_at
           FROM app.contributor_removal_challenges
           WHERE id=$1 AND owner_user_id=$2 AND consumed_at IS NULL AND cancelled_at IS NULL
           FOR UPDATE`,
        [challengeId, session.user_id],
      )
    ).rows[0];
    if (
      !challenge ||
      new Date(challenge.expires_at).getTime() <= Date.now() ||
      !timingSafeEqual(
        challenge.verification_code_hash,
        contributorRemovalCodeHash(challengeId, body.code),
      )
    )
      throw new ApiError("INVALID_OR_EXPIRED_CODE", 400);
    await requireTreeOwner(client, challenge.tree_id, session.user_id);
    const deletable = await client.query<{ allowed: boolean }>(
      "SELECT app.owner_can_delete_contributor($1,$2) allowed",
      [challenge.tree_id, challenge.contributor_user_id],
    );
    if (!deletable.rows[0]?.allowed) throw new ApiError("CONTRIBUTOR_ACCOUNT_DELETE_CONFLICT", 409);
    const contributor = (
      await client.query<{
        name_en: string;
        name_ar: string;
        branch_id: string;
      }>(
        `SELECT COALESCE(f.name_en,u.full_name_en) name_en,
              COALESCE(f.name_ar,u.full_name_ar) name_ar,
              g.root_subfamily_id branch_id
           FROM app.tree_memberships m
           JOIN app.users u ON u.id=m.user_id AND u.status='active'
           JOIN app.branch_grants g ON g.tree_id=m.tree_id AND g.user_id=m.user_id
             AND g.role='branch_editor' AND g.revoked_at IS NULL
             AND (g.expires_at IS NULL OR g.expires_at>now())
           JOIN app.subfamilies b ON b.tree_id=g.tree_id AND b.id=g.root_subfamily_id
             AND b.status='active' AND b.deleted_at IS NULL
           LEFT JOIN app.family_members f ON f.id=m.family_member_id
           WHERE m.tree_id=$1 AND m.user_id=$2 AND m.role<>'owner'
             AND m.affiliation_status='active' AND m.revoked_at IS NULL
           FOR UPDATE OF m,g`,
        [challenge.tree_id, challenge.contributor_user_id],
      )
    ).rows[0];
    if (!contributor) throw new ApiError("CONTRIBUTOR_UNAVAILABLE", 409);
    await client.query(
      `INSERT INTO app.tree_activity(
           tree_id,branch_id,actor_user_id,subject_user_id,subject_name_en,subject_name_ar,
           action_type,target_type,target_id
         ) VALUES($1,$2,$3,$4,$5,$6,'contributor_removed','user',$4)`,
      [
        challenge.tree_id,
        contributor.branch_id,
        session.user_id,
        challenge.contributor_user_id,
        contributor.name_en,
        contributor.name_ar,
      ],
    );
    await deleteContributorIdentity(client, challenge.contributor_user_id, session.user_id);
    await client.query(
      `UPDATE app.contributor_removal_challenges
         SET consumed_at=now(),verification_code_hash=$2,updated_at=now()
         WHERE id=$1`,
      [challengeId, contributorRemovalCodeHash(challengeId, body.code)],
    );
  });
  return json({ ok: true });
}
