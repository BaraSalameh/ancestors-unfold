import { randomInt } from "node:crypto";
import type { PoolClient } from "pg";
import { transaction } from "@/shared/server/database";
import {
  ownershipTransferCodeMail,
  ownershipTransferRequestedMail,
  sendMail,
} from "@/shared/server/email";
import { jsonResponse as json } from "@/shared/http/response";
import { ApiError, parseBody, schemas } from "@/server/security";
import { requireTreeOwner } from "./authorization";
import { ownershipTransferCodeHash } from "./collaboration-crypto";
import type { CollaborationSession } from "./types";

interface OwnershipTransfer {
  tree_id: string;
  current_owner_user_id: string;
  proposed_owner_user_id: string;
  previous_owner_branch_id: string | null;
  keep_previous_owner_read_only: boolean;
  verified_at: string | null;
  expires_at: string;
}

export async function handleOwnershipTransferRequest(
  request: Request,
  url: URL,
  session: CollaborationSession,
  requestId: string,
): Promise<Response | undefined> {
  const transfers = url.pathname.match(/^\/api\/trees\/([0-9a-f-]+)\/ownership-transfers$/);
  if (transfers && request.method === "GET") return listTransfers(transfers[1], session, requestId);
  if (transfers && request.method === "POST")
    return createTransfer(request, transfers[1], session, requestId);
  const resend = url.pathname.match(/^\/api\/ownership-transfers\/([0-9a-f-]+)\/resend-code$/);
  if (resend && request.method === "POST") return resendCode(resend[1], session, requestId);
  const verify = url.pathname.match(/^\/api\/ownership-transfers\/([0-9a-f-]+)\/verify$/);
  if (verify && request.method === "POST")
    return verifyTransfer(request, verify[1], session, requestId);
  const action = url.pathname.match(
    /^\/api\/ownership-transfers\/([0-9a-f-]+)\/(accept|reject|cancel)$/,
  );
  if (action && request.method === "POST")
    return performTransferAction(action[1], action[2], session, requestId);
  return undefined;
}

async function listTransfers(
  treeId: string,
  session: CollaborationSession,
  requestId: string,
): Promise<Response> {
  const pending = await transaction(session.user_id, session.id, requestId, async (client) => {
    await client.query(
      `UPDATE app.ownership_transfers SET status='expired',updated_at=now()
           WHERE tree_id=$1 AND status='pending' AND expires_at<=now()`,
      [treeId],
    );
    return client.query(
      `SELECT x.id,x.tree_id,t.name_en tree_name_en,t.name_ar tree_name_ar,
             x.current_owner_user_id,x.proposed_owner_user_id,
             owner.full_name_en current_owner_name_en,
             owner.full_name_ar current_owner_name_ar,
             proposed.full_name_en proposed_owner_name_en,
             proposed.full_name_ar proposed_owner_name_ar,
             x.previous_owner_branch_id branch_id,
             b.name_en branch_name_en,b.name_ar branch_name_ar,
             (x.verified_at IS NOT NULL) verified,x.status,
             x.verification_expires_at,x.expires_at,x.created_at
           FROM app.ownership_transfers x
           JOIN app.family_trees t ON t.id=x.tree_id AND t.deleted_at IS NULL
           JOIN app.users owner ON owner.id=x.current_owner_user_id
           JOIN app.users proposed ON proposed.id=x.proposed_owner_user_id
           JOIN app.subfamilies b
             ON b.tree_id=x.tree_id AND b.id=x.previous_owner_branch_id
           WHERE x.tree_id=$1 AND x.status='pending'
             AND $2 IN (x.current_owner_user_id,x.proposed_owner_user_id)`,
      [treeId, session.user_id],
    );
  });
  return json(pending.rows[0] ?? null);
}

async function createTransfer(
  request: Request,
  treeId: string,
  session: CollaborationSession,
  requestId: string,
): Promise<Response> {
  const body = await parseBody(request, schemas.transferRequest);
  const code = randomInt(0, 1_000_000).toString().padStart(6, "0");
  const transfer = await transaction(session.user_id, session.id, requestId, async (client) => {
    await requireTreeOwner(client, treeId, session.user_id);
    const existing = await client.query(
      `SELECT 1 FROM app.ownership_transfers
         WHERE tree_id=$1 AND status='pending' AND expires_at>now() FOR UPDATE`,
      [treeId],
    );
    if (existing.rowCount) throw new ApiError("TRANSFER_ALREADY_PENDING", 409);
    await client.query(
      `UPDATE app.ownership_transfers SET status='expired',updated_at=now()
         WHERE tree_id=$1 AND status='pending' AND expires_at<=now()`,
      [treeId],
    );
    const eligible = await client.query<{
      branch_id: string;
      full_name_en: string;
      full_name_ar: string;
    }>(
      `SELECT g.root_subfamily_id branch_id,u.full_name_en,u.full_name_ar
         FROM app.tree_memberships m JOIN app.users u ON u.id=m.user_id
         JOIN app.branch_grants g ON g.user_id=m.user_id AND g.tree_id=m.tree_id
         JOIN app.subfamilies b ON b.tree_id=g.tree_id AND b.id=g.root_subfamily_id
         WHERE m.tree_id=$1 AND m.user_id=$2 AND m.affiliation_status='active'
           AND m.role<>'owner' AND m.revoked_at IS NULL
           AND g.role='branch_editor' AND g.revoked_at IS NULL
           AND (g.expires_at IS NULL OR g.expires_at>now())
           AND b.status='active' AND b.deleted_at IS NULL AND u.status='active'
         FOR UPDATE OF m,g`,
      [treeId, body.proposedOwnerUserId],
    );
    if (eligible.rowCount !== 1) throw new ApiError("TRANSFER_TARGET_INELIGIBLE", 409);
    const subject = eligible.rows[0];
    const created = (
      await client.query<{ id: string; status: string; expires_at: string }>(
        `INSERT INTO app.ownership_transfers(
            tree_id,current_owner_user_id,proposed_owner_user_id,previous_owner_branch_id,
            keep_previous_owner_read_only,verification_code_hash,verification_expires_at,
            expires_at,reason
          ) VALUES($1,$2,$3,$4,false,$5,now()+interval '15 minutes',
            now()+interval '24 hours',$6)
          RETURNING id,status,expires_at`,
        [
          treeId,
          session.user_id,
          body.proposedOwnerUserId,
          subject.branch_id,
          ownershipTransferCodeHash(code),
          body.reason || null,
        ],
      )
    ).rows[0];
    await client.query(
      `INSERT INTO app.tree_activity(
           tree_id,actor_user_id,subject_user_id,subject_name_en,subject_name_ar,
           action_type,target_type,target_id
         ) VALUES($1,$2,$3,$4,$5,'ownership_transfer_requested','ownership_transfer',$6)`,
      [
        treeId,
        session.user_id,
        body.proposedOwnerUserId,
        subject.full_name_en,
        subject.full_name_ar,
        created.id,
      ],
    );
    return created;
  });
  await sendMail(ownershipTransferCodeMail(session.email, code));
  return json({ id: transfer.id, status: transfer.status, expires_at: transfer.expires_at }, 201);
}

async function resendCode(
  transferId: string,
  session: CollaborationSession,
  requestId: string,
): Promise<Response> {
  const code = randomInt(0, 1_000_000).toString().padStart(6, "0");
  const resent = await transaction(session.user_id, session.id, requestId, async (client) => {
    const updated = await client.query<{ verification_expires_at: string }>(
      `UPDATE app.ownership_transfers
         SET verification_code_hash=$3,
           verification_expires_at=LEAST(expires_at,now()+interval '15 minutes'),updated_at=now()
         WHERE id=$1 AND current_owner_user_id=$2 AND status='pending'
           AND verified_at IS NULL AND expires_at>now()
         RETURNING verification_expires_at`,
      [transferId, session.user_id, ownershipTransferCodeHash(code)],
    );
    if (!updated.rowCount) throw new ApiError("TRANSFER_UNAVAILABLE", 409);
    return updated.rows[0];
  });
  await sendMail(ownershipTransferCodeMail(session.email, code));
  return json(resent);
}

async function verifyTransfer(
  request: Request,
  transferId: string,
  session: CollaborationSession,
  requestId: string,
): Promise<Response> {
  const body = await parseBody(request, schemas.transferCode);
  const result = await transaction(session.user_id, session.id, requestId, async (client) => {
    const candidate = await client.query<{
      verification_expires_at: string | null;
      expires_at: string;
    }>(
      `SELECT verification_expires_at,expires_at
         FROM app.ownership_transfers
         WHERE id=$1 AND current_owner_user_id=$2 AND status='pending'`,
      [transferId, session.user_id],
    );
    if (
      candidate.rowCount &&
      (!candidate.rows[0].verification_expires_at ||
        new Date(candidate.rows[0].verification_expires_at).getTime() <= Date.now() ||
        new Date(candidate.rows[0].expires_at).getTime() <= Date.now())
    )
      throw new ApiError("TRANSFER_VERIFICATION_EXPIRED", 409);
    const updated = await client.query<{
      id: string;
      tree_id: string;
      proposed_email: string;
      tree_name: string;
      owner_name: string;
    }>(
      `UPDATE app.ownership_transfers SET verified_at=now(),verification_code_hash=NULL,updated_at=now()
         WHERE id=$1 AND current_owner_user_id=$2 AND status='pending' AND expires_at>now()
           AND verification_expires_at>now() AND verification_code_hash=$3
         RETURNING id,tree_id,
           (SELECT email FROM app.users WHERE id=proposed_owner_user_id) proposed_email,
           (SELECT COALESCE(name_en,name_ar) FROM app.family_trees WHERE id=tree_id) tree_name,
           (SELECT full_name_en FROM app.users WHERE id=current_owner_user_id) owner_name`,
      [transferId, session.user_id, ownershipTransferCodeHash(body.code)],
    );
    if (updated.rowCount)
      await client.query(
        `INSERT INTO app.tree_activity(
             tree_id,actor_user_id,action_type,target_type,target_id
           ) VALUES($1,$2,'ownership_transfer_verified','ownership_transfer',$3)`,
        [updated.rows[0].tree_id, session.user_id, updated.rows[0].id],
      );
    return updated;
  });
  if (!result.rowCount) return json({ code: "INVALID_OR_EXPIRED_CODE" }, 400);
  await sendMail(
    ownershipTransferRequestedMail(
      result.rows[0].proposed_email,
      result.rows[0].tree_name,
      result.rows[0].owner_name,
    ),
  );
  return json({ ok: true });
}

async function performTransferAction(
  transferId: string,
  action: string,
  session: CollaborationSession,
  requestId: string,
): Promise<Response> {
  await transaction(session.user_id, session.id, requestId, async (client) => {
    const transfer = (
      await client.query<OwnershipTransfer>(
        `SELECT * FROM app.ownership_transfers
           WHERE id=$1 AND status='pending' FOR UPDATE`,
        [transferId],
      )
    ).rows[0];
    if (!transfer) throw new ApiError("TRANSFER_UNAVAILABLE", 409);
    if (new Date(transfer.expires_at).getTime() <= Date.now())
      throw new ApiError("TRANSFER_EXPIRED", 409);
    if (action === "cancel") {
      if (session.user_id !== transfer.current_owner_user_id) throw new ApiError("FORBIDDEN", 403);
      await client.query(
        "UPDATE app.ownership_transfers SET status='cancelled',updated_at=now() WHERE id=$1",
        [transferId],
      );
      await client.query(
        `INSERT INTO app.tree_activity(
             tree_id,actor_user_id,subject_user_id,action_type,target_type,target_id
           ) VALUES($1,$2,$3,'ownership_transfer_cancelled','ownership_transfer',$4)`,
        [transfer.tree_id, session.user_id, transfer.proposed_owner_user_id, transferId],
      );
      return;
    }
    if (session.user_id !== transfer.proposed_owner_user_id) throw new ApiError("FORBIDDEN", 403);
    if (action === "reject") {
      await client.query(
        "UPDATE app.ownership_transfers SET status='rejected',updated_at=now() WHERE id=$1",
        [transferId],
      );
      await client.query(
        `INSERT INTO app.tree_activity(
             tree_id,actor_user_id,subject_user_id,action_type,target_type,target_id
           ) VALUES($1,$2,$3,'ownership_transfer_rejected','ownership_transfer',$4)`,
        [transfer.tree_id, session.user_id, transfer.current_owner_user_id, transferId],
      );
      return;
    }
    await acceptTransfer(client, transferId, transfer, session.user_id);
  });
  return json({ ok: true });
}

async function acceptTransfer(
  client: PoolClient,
  transferId: string,
  transfer: OwnershipTransfer,
  actorUserId: string,
): Promise<void> {
  if (!transfer.verified_at) throw new ApiError("TRANSFER_NOT_VERIFIED", 409);
  const currentState = await client.query(
    `SELECT 1
       FROM app.family_trees t
       JOIN app.tree_memberships owner
         ON owner.tree_id=t.id AND owner.user_id=t.owner_user_id
       JOIN app.tree_memberships proposed
         ON proposed.tree_id=t.id AND proposed.user_id=$3
       JOIN app.users u ON u.id=proposed.user_id
       JOIN app.branch_grants g
         ON g.tree_id=t.id AND g.user_id=proposed.user_id
           AND g.root_subfamily_id=$4
       JOIN app.subfamilies b ON b.tree_id=g.tree_id AND b.id=g.root_subfamily_id
       WHERE t.id=$1 AND t.owner_user_id=$2 AND t.deleted_at IS NULL
         AND owner.role='owner' AND owner.affiliation_status='active'
         AND owner.revoked_at IS NULL
         AND proposed.role<>'owner' AND proposed.affiliation_status='active'
         AND proposed.revoked_at IS NULL AND u.status='active'
         AND g.role='branch_editor' AND g.revoked_at IS NULL
         AND (g.expires_at IS NULL OR g.expires_at>now())
         AND b.status='active' AND b.deleted_at IS NULL
       FOR UPDATE OF t,owner,proposed,g,b`,
    [
      transfer.tree_id,
      transfer.current_owner_user_id,
      transfer.proposed_owner_user_id,
      transfer.previous_owner_branch_id,
    ],
  );
  if (!currentState.rowCount) throw new ApiError("TRANSFER_STATE_CHANGED", 409);
  await client.query("SET CONSTRAINTS ALL DEFERRED");
  await client.query(
    `UPDATE app.tree_memberships SET role='viewer',affiliation_status='active'
       WHERE tree_id=$1 AND user_id=$2`,
    [transfer.tree_id, transfer.current_owner_user_id],
  );
  await client.query(
    "UPDATE app.tree_memberships SET role='owner',affiliation_status='active' WHERE tree_id=$1 AND user_id=$2",
    [transfer.tree_id, transfer.proposed_owner_user_id],
  );
  await client.query("UPDATE app.family_trees SET owner_user_id=$2 WHERE id=$1", [
    transfer.tree_id,
    transfer.proposed_owner_user_id,
  ]);
  await client.query(
    "UPDATE app.branch_grants SET revoked_at=now(),revoked_by=$3 WHERE tree_id=$1 AND user_id=$2 AND revoked_at IS NULL",
    [transfer.tree_id, transfer.proposed_owner_user_id, actorUserId],
  );
  await client.query(
    `INSERT INTO app.branch_grants(user_id,tree_id,root_subfamily_id,role,granted_by)
       VALUES($1,$2,$3,'branch_editor',$4)`,
    [
      transfer.current_owner_user_id,
      transfer.tree_id,
      transfer.previous_owner_branch_id,
      transfer.proposed_owner_user_id,
    ],
  );
  await client.query(
    `UPDATE app.ownership_transfers SET status='accepted',accepted_at=now(),updated_at=now()
       WHERE id=$1`,
    [transferId],
  );
  await client.query(
    `INSERT INTO app.ownership_history(
       tree_id,previous_owner_user_id,new_owner_user_id,initiated_by,accepted_at,reason
     ) SELECT tree_id,current_owner_user_id,proposed_owner_user_id,current_owner_user_id,now(),reason
       FROM app.ownership_transfers WHERE id=$1`,
    [transferId],
  );
  await client.query(
    `INSERT INTO app.tree_activity(
       tree_id,actor_user_id,subject_user_id,action_type,target_type,target_id
     ) VALUES($1,$2,$3,'ownership_transfer_accepted','ownership_transfer',$4)`,
    [transfer.tree_id, actorUserId, transfer.current_owner_user_id, transferId],
  );
}
