/* eslint-disable max-lines -- Collaboration routes share transactional authorization helpers during API modularization. */
import { createHash, createHmac, randomBytes, randomInt } from "node:crypto";
import type { PoolClient } from "pg";
import { transaction } from "@/server/infrastructure/database";
import {
  contributorInvitationMail,
  ownershipTransferCodeMail,
  sendMail,
} from "@/server/infrastructure/email";
import { jsonResponse as json } from "@/server/http/response";
import { ApiError, parseBody, schemas } from "@/server/security";

type Session = { id: string; user_id: string; email: string };
const sha256 = (value: string) => createHash("sha256").update(value).digest();
const normalizeEmail = (value: string) => value.trim().toLowerCase();
const transferCodeHash = (code: string) => {
  const secret =
    process.env.EMAIL_CODE_SECRET ??
    ((process.env.AUTH_TOKEN_DELIVERY ?? "console") === "console"
      ? "ancestors-unfold-console-development-only"
      : undefined);
  if (!secret || secret.length < 16) throw new Error("MAIL_NOT_CONFIGURED");
  return createHmac("sha256", secret).update(`ownership:${code}`).digest();
};

export async function provisionOwnedTree(
  client: PoolClient,
  user: {
    id: string;
    full_name_en: string;
    full_name_ar: string;
    email: string;
    profile_gender: "male" | "female" | "unspecified";
  },
) {
  const existing = await client.query("SELECT 1 FROM app.tree_memberships WHERE user_id=$1", [
    user.id,
  ]);
  if (existing.rowCount) return;
  const tree = (
    await client.query<{ id: string }>(
      `INSERT INTO app.family_trees(owner_user_id,name_en,name_ar)
       VALUES($1,$2,$3) RETURNING id`,
      [user.id, `${user.full_name_en}'s Family Tree`, `شجرة عائلة ${user.full_name_ar}`],
    )
  ).rows[0];
  await client.query(
    `INSERT INTO app.tree_memberships(tree_id,user_id,role)
     VALUES($1,$2,'owner')`,
    [tree.id, user.id],
  );
  const member = (
    await client.query<{ id: string }>(
      `INSERT INTO app.family_members(
        tree_id,name_en,name_ar,gender,linked_user_id,position_label,created_by,updated_by
      ) VALUES($1,$2,$3,$4,$5,'Tree owner',$5,$5) RETURNING id`,
      [tree.id, user.full_name_en, user.full_name_ar, user.profile_gender, user.id],
    )
  ).rows[0];
  await client.query(
    `UPDATE app.tree_memberships SET family_member_id=$3
     WHERE tree_id=$1 AND user_id=$2`,
    [tree.id, user.id, member.id],
  );
  await client.query(
    `INSERT INTO app.tree_activity(tree_id,actor_user_id,action_type,target_type,target_id)
     VALUES($1,$2,'tree_created','family_tree',$1)`,
    [tree.id, user.id],
  );
  await client.query(
    `UPDATE app.contributor_invitations SET status='invalidated',updated_at=now()
     WHERE invited_email=$1 AND status='pending'`,
    [user.email],
  );
}

export async function acceptRegistrationInvitation(
  client: PoolClient,
  user: {
    id: string;
    full_name_en: string;
    full_name_ar: string;
    email: string;
    profile_gender: "male" | "female" | "unspecified";
  },
  invitationId: string,
) {
  const invitation = (
    await client.query<{
      id: string;
      tree_id: string;
      branch_id: string;
      existing_family_member_id: string | null;
      position_label: string | null;
    }>(
      `SELECT i.id,i.tree_id,i.branch_id,i.existing_family_member_id,i.position_label
       FROM app.contributor_invitations i
       WHERE i.id=$1 AND i.invited_email=$2 AND i.status='pending' AND i.expires_at>now()
       FOR UPDATE OF i`,
      [invitationId, user.email],
    )
  ).rows[0];
  if (!invitation) throw new ApiError("INVALID_INVITATION", 409);
  const occupied = await client.query(
    `SELECT 1 FROM app.branch_grants WHERE tree_id=$1 AND root_subfamily_id=$2
     AND role='branch_editor' AND revoked_at IS NULL FOR UPDATE`,
    [invitation.tree_id, invitation.branch_id],
  );
  if (occupied.rowCount) throw new ApiError("BRANCH_ALREADY_ASSIGNED", 409);
  const memberId = invitation.existing_family_member_id;
  if (!memberId) throw new ApiError("FAMILY_MEMBER_UNAVAILABLE", 409);
  await client.query(
    `INSERT INTO app.tree_memberships(
      tree_id,user_id,role,invited_by,affiliation_status
    ) SELECT tree_id,$2,'viewer',inviter_user_id,'active'
      FROM app.contributor_invitations WHERE id=$1`,
    [invitation.id, user.id],
  );
  const branchAvailable = await client.query(
    `SELECT 1 FROM app.subfamilies WHERE id=$1 AND tree_id=$2
     AND status='active' AND deleted_at IS NULL`,
    [invitation.branch_id, invitation.tree_id],
  );
  if (!branchAvailable.rowCount) throw new ApiError("BRANCH_UNAVAILABLE", 409);
  await client.query(
    `INSERT INTO app.branch_grants(
      user_id,tree_id,root_subfamily_id,role,granted_by
    ) SELECT $2,tree_id,branch_id,'branch_editor',inviter_user_id
      FROM app.contributor_invitations WHERE id=$1`,
    [invitation.id, user.id],
  );
  if (memberId) {
    const linked = await client.query(
      `UPDATE app.family_members SET linked_user_id=$2,name_en=$4,name_ar=$5,gender=$6,
        updated_by=$2,updated_at=now(),version=version+1
       WHERE id=$1 AND tree_id=$3 AND linked_user_id IS NULL AND deleted_at IS NULL RETURNING id`,
      [
        memberId,
        user.id,
        invitation.tree_id,
        user.full_name_en,
        user.full_name_ar,
        user.profile_gender,
      ],
    );
    if (!linked.rowCount) throw new ApiError("FAMILY_MEMBER_UNAVAILABLE", 409);
  }
  await client.query(
    `UPDATE app.tree_memberships SET family_member_id=$3
     WHERE tree_id=$1 AND user_id=$2`,
    [invitation.tree_id, user.id, memberId],
  );
  await client.query(
    `UPDATE app.contributor_invitations
     SET status='accepted',accepted_at=now(),updated_at=now() WHERE id=$1`,
    [invitation.id],
  );
  await client.query(
    `INSERT INTO app.tree_activity(
      tree_id,branch_id,actor_user_id,action_type,target_type,target_id
    ) VALUES($1,$2,$3,'invitation_accepted','user',$3)`,
    [invitation.tree_id, invitation.branch_id, user.id],
  );
}

async function requireOwner(client: PoolClient, treeId: string, userId: string) {
  const result = await client.query(
    `SELECT 1 FROM app.tree_memberships WHERE tree_id=$1 AND user_id=$2
     AND role='owner' AND affiliation_status='active' AND revoked_at IS NULL`,
    [treeId, userId],
  );
  if (!result.rowCount) throw new ApiError("FORBIDDEN", 403);
}

const authenticitySql = `
  WITH cfg AS (
    SELECT * FROM app.authenticity_config ORDER BY version DESC LIMIT 1
  ), stats AS (
    SELECT t.id,
      count(DISTINCT g.user_id) FILTER (
        WHERE g.role='branch_editor' AND g.revoked_at IS NULL AND b.status='active'
          AND u.status='active' AND u.email_verified_at IS NOT NULL
      )::integer active_contributors,
      count(DISTINCT g.root_subfamily_id) FILTER (
        WHERE g.role='branch_editor' AND g.revoked_at IS NULL AND b.status='active'
          AND u.status='active'
      )::integer managed_branches,
      count(DISTINCT b.id) FILTER (WHERE b.deleted_at IS NULL)::integer total_branches,
      count(DISTINCT m.id) FILTER (WHERE m.deleted_at IS NULL)::integer total_members,
      count(DISTINCT c.id) FILTER (
        WHERE c.status='open' AND c.serious
      )::integer serious_complaints,
      GREATEST(
        max(a.created_at),
        (SELECT max(e.occurred_at) FROM audit.events e WHERE e.tree_id=t.id)
      ) last_contribution_at
    FROM app.family_trees t
    LEFT JOIN app.subfamilies b ON b.tree_id=t.id
    LEFT JOIN app.branch_grants g ON g.tree_id=t.id AND g.root_subfamily_id=b.id
    LEFT JOIN app.users u ON u.id=g.user_id
    LEFT JOIN app.family_members m ON m.tree_id=t.id
    LEFT JOIN app.tree_complaints c ON c.tree_id=t.id
    LEFT JOIN app.tree_activity a ON a.tree_id=t.id
    WHERE t.id=$1 GROUP BY t.id
  ) SELECT s.*,
    CASE
      WHEN s.serious_complaints>0 AND cfg.serious_complaint_downgrade THEN 'under_review'
      WHEN s.active_contributors>=cfg.established_contributors
       AND s.managed_branches>=cfg.established_branches
       AND ft.created_at<=now()-(cfg.established_min_days||' days')::interval
       AND s.last_contribution_at>=now()-(cfg.recent_activity_days||' days')::interval
        THEN 'established'
      WHEN s.active_contributors>=cfg.backed_contributors
       AND s.managed_branches>=cfg.backed_branches THEN 'family_backed'
      WHEN s.active_contributors>=cfg.growing_contributors
       AND s.managed_branches>=cfg.growing_branches THEN 'growing'
      ELSE 'new'
    END authenticity_level
  FROM stats s JOIN app.family_trees ft ON ft.id=s.id CROSS JOIN cfg`;

export async function validatePublicInvitation(request: Request) {
  const token = new URL(request.url).pathname.match(/^\/api\/invitations\/([^/]+)$/)?.[1];
  if (!token || request.method !== "GET") return undefined;
  const result = await transaction(null, null, crypto.randomUUID(), async (client) =>
    client.query(`SELECT * FROM app.public_invitation($1)`, [sha256(token)]),
  );
  return result.rowCount
    ? json({ valid: true, ...result.rows[0] })
    : json({ valid: false, code: "INVALID_INVITATION" }, 404);
}

// Collaboration endpoints are kept behind this module boundary while legacy tree APIs are migrated.
// eslint-disable-next-line complexity, max-lines-per-function
export async function handleCollaborationRequest(
  request: Request,
  session: Session,
  requestId: string,
): Promise<Response | undefined> {
  const url = new URL(request.url);
  if (url.pathname === "/api/tree/current" && request.method === "GET") {
    const result = await transaction(session.user_id, session.id, requestId, (client) =>
      client.query(
        `SELECT t.id,t.name_en,t.name_ar,t.description_en,t.description_ar,t.created_at,
          m.role,m.affiliation_status,m.family_member_id,
          g.root_subfamily_id assigned_branch_id,
          (m.role='owner') is_owner,
          (m.role='owner') can_manage_tree,
          (g.id IS NOT NULL) can_edit_branch
        FROM app.tree_memberships m JOIN app.family_trees t ON t.id=m.tree_id
        LEFT JOIN app.branch_grants g ON g.user_id=m.user_id AND g.tree_id=m.tree_id
          AND g.role='branch_editor' AND g.revoked_at IS NULL
        WHERE m.user_id=$1 AND t.deleted_at IS NULL`,
        [session.user_id],
      ),
    );
    return result.rowCount ? json(result.rows[0]) : json({ code: "TREE_UNAVAILABLE" }, 404);
  }
  const stats = url.pathname.match(/^\/api\/trees\/([0-9a-f-]+)\/statistics$/);
  if (stats && request.method === "GET") {
    const result = await transaction(session.user_id, session.id, requestId, async (client) => {
      const visible = await client.query("SELECT app.can_view_tree($1) allowed", [stats[1]]);
      if (!visible.rows[0]?.allowed) throw new ApiError("FORBIDDEN", 403);
      return client.query(
        `SELECT a.*,t.created_at tree_created_at,
          u.full_name_en owner_name_en,u.full_name_ar owner_name_ar
         FROM (${authenticitySql}) a
         JOIN app.family_trees t ON t.id=a.id JOIN app.users u ON u.id=t.owner_user_id`,
        [stats[1]],
      );
    });
    return json(result.rows[0]);
  }
  const branches = url.pathname.match(/^\/api\/trees\/([0-9a-f-]+)\/branches$/);
  if (branches && request.method === "GET") {
    const result = await transaction(session.user_id, session.id, requestId, async (client) => {
      const visible = await client.query("SELECT app.can_view_tree($1) allowed", [branches[1]]);
      if (!visible.rows[0]?.allowed) throw new ApiError("FORBIDDEN", 403);
      return client.query(
        `SELECT b.id,b.name_en,b.name_ar,b.linked_male_id root_family_member_id,b.status,
          g.user_id contributor_user_id,u.full_name_en contributor_name_en,u.full_name_ar contributor_name_ar
         FROM app.subfamilies b LEFT JOIN app.branch_grants g
          ON g.tree_id=b.tree_id AND g.root_subfamily_id=b.id AND g.role='branch_editor' AND g.revoked_at IS NULL
         LEFT JOIN app.users u ON u.id=g.user_id
         WHERE b.tree_id=$1 AND b.deleted_at IS NULL ORDER BY b.created_at`,
        [branches[1]],
      );
    });
    return json(result.rows);
  }
  const branchSearch = url.pathname.match(/^\/api\/trees\/([0-9a-f-]+)\/available-branches$/);
  if (branchSearch && request.method === "GET") {
    const q = url.searchParams.get("q")?.trim() ?? "";
    if (q.length < 2) return json([]);
    const result = await transaction(session.user_id, session.id, requestId, async (client) => {
      await requireOwner(client, branchSearch[1], session.user_id);
      return client.query(
        `SELECT b.id,b.name_en,b.name_ar
         FROM app.subfamilies b
         WHERE b.tree_id=$1 AND b.status='active' AND b.deleted_at IS NULL
           AND (b.name_en ILIKE $2 ESCAPE '\\' OR COALESCE(b.name_ar,'') ILIKE $2 ESCAPE '\\')
           AND NOT EXISTS (
             SELECT 1 FROM app.branch_grants g WHERE g.tree_id=b.tree_id
               AND g.root_subfamily_id=b.id AND g.role='branch_editor' AND g.revoked_at IS NULL
           )
           AND NOT EXISTS (
             SELECT 1 FROM app.contributor_invitations i WHERE i.tree_id=b.tree_id
               AND i.branch_id=b.id AND i.status='pending'
           )
         ORDER BY b.name_en,b.name_ar LIMIT 20`,
        [
          branchSearch[1],
          `%${q.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_")}%`,
        ],
      );
    });
    return json(result.rows);
  }
  const memberSearch = url.pathname.match(/^\/api\/trees\/([0-9a-f-]+)\/invitable-members$/);
  if (memberSearch && request.method === "GET") {
    const q = url.searchParams.get("q")?.trim() ?? "";
    if (q.length < 2) return json([]);
    const result = await transaction(session.user_id, session.id, requestId, async (client) => {
      await requireOwner(client, memberSearch[1], session.user_id);
      return client.query(
        `SELECT m.id,m.name_en,m.name_ar,m.gender,
          extract(year FROM m.birth_date)::integer birth_year
         FROM app.family_members m
         WHERE m.tree_id=$1 AND m.linked_user_id IS NULL AND m.deleted_at IS NULL
           AND (m.name_en ILIKE $2 ESCAPE '\\' OR m.name_ar ILIKE $2 ESCAPE '\\')
           AND NOT EXISTS (
             SELECT 1 FROM app.contributor_invitations i
             WHERE i.tree_id=m.tree_id AND i.existing_family_member_id=m.id AND i.status='pending'
           )
         ORDER BY m.name_en,m.name_ar LIMIT 20`,
        [
          memberSearch[1],
          `%${q.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_")}%`,
        ],
      );
    });
    return json(result.rows);
  }
  if (branches && request.method === "POST") {
    const body = await parseBody(request, schemas.branch);
    const result = await transaction(session.user_id, session.id, requestId, async (client) => {
      await requireOwner(client, branches[1], session.user_id);
      const created = (
        await client.query(
          `INSERT INTO app.subfamilies(
            tree_id,name_en,name_ar,linked_male_id,parent_subfamily_id,position_label,status
          ) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
          [
            branches[1],
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
        `INSERT INTO app.tree_activity(tree_id,branch_id,actor_user_id,action_type,target_type,target_id)
         VALUES($1,$2,$3,'branch_created','branch',$2)`,
        [branches[1], created.id, session.user_id],
      );
      return created;
    });
    return json(result, 201);
  }
  const branchUpdate = url.pathname.match(/^\/api\/trees\/([0-9a-f-]+)\/branches\/([0-9a-f-]+)$/);
  if (branchUpdate && request.method === "PATCH") {
    const body = await parseBody(request, schemas.branchUpdate);
    const result = await transaction(session.user_id, session.id, requestId, async (client) => {
      await requireOwner(client, branchUpdate[1], session.user_id);
      const updated = (
        await client.query(
          `UPDATE app.subfamilies SET
            name_en=COALESCE($3,name_en),name_ar=COALESCE($4,name_ar),
            position_label=COALESCE($5,position_label),
            status=COALESCE($6::app.branch_status,status),updated_at=now()
           WHERE tree_id=$1 AND id=$2 AND deleted_at IS NULL RETURNING *`,
          [
            branchUpdate[1],
            branchUpdate[2],
            body.name_en,
            body.name_ar,
            body.positionLabel,
            body.status,
          ],
        )
      ).rows[0];
      if (!updated) throw new ApiError("BRANCH_UNAVAILABLE", 404);
      if (body.status === "inactive") {
        await client.query(
          `UPDATE app.contributor_invitations SET status='cancelled',updated_at=now()
           WHERE tree_id=$1 AND branch_id=$2 AND status='pending'`,
          [branchUpdate[1], branchUpdate[2]],
        );
        await client.query(
          `UPDATE app.branch_grants SET revoked_at=now(),revoked_by=$3
           WHERE tree_id=$1 AND root_subfamily_id=$2 AND revoked_at IS NULL`,
          [branchUpdate[1], branchUpdate[2], session.user_id],
        );
      }
      return updated;
    });
    return json(result);
  }
  const invitations = url.pathname.match(/^\/api\/trees\/([0-9a-f-]+)\/invitations$/);
  if (invitations && request.method === "GET") {
    const result = await transaction(session.user_id, session.id, requestId, async (client) => {
      await requireOwner(client, invitations[1], session.user_id);
      return client.query(
        `SELECT i.id,i.invited_name_en,i.invited_name_ar,i.invited_email,i.position_label,
          i.status,i.expires_at,i.created_at,b.name_en branch_name_en,b.name_ar branch_name_ar
         FROM app.contributor_invitations i JOIN app.subfamilies b ON b.id=i.branch_id
         WHERE i.tree_id=$1 ORDER BY i.created_at DESC`,
        [invitations[1]],
      );
    });
    return json(result.rows);
  }
  if (invitations && request.method === "POST") {
    const body = await parseBody(request, schemas.invitation);
    const email = normalizeEmail(body.email);
    const token = randomBytes(32).toString("base64url");
    const created = await transaction(session.user_id, session.id, requestId, async (client) => {
      await requireOwner(client, invitations[1], session.user_id);
      const existing = await client.query("SELECT 1 FROM app.users WHERE email=$1", [email]);
      if (existing.rowCount) throw new ApiError("INVITEE_ALREADY_REGISTERED", 409);
      const branch = (
        await client.query<{ name_en: string; tree_name: string }>(
          `SELECT b.name_en,t.name_en tree_name FROM app.subfamilies b
           JOIN app.family_trees t ON t.id=b.tree_id
           WHERE b.id=$1 AND b.tree_id=$2 AND b.status='active' AND b.deleted_at IS NULL`,
          [body.branchId, invitations[1]],
        )
      ).rows[0];
      if (!branch) throw new ApiError("BRANCH_UNAVAILABLE", 409);
      const assigned = await client.query(
        `SELECT 1 FROM app.branch_grants WHERE tree_id=$1 AND root_subfamily_id=$2
         AND role='branch_editor' AND revoked_at IS NULL`,
        [invitations[1], body.branchId],
      );
      if (assigned.rowCount) throw new ApiError("BRANCH_ALREADY_ASSIGNED", 409);
      const member = (
        await client.query<{ name_en: string; name_ar: string; position_label: string | null }>(
          `SELECT
             COALESCE(NULLIF(name_en,''),name_ar) name_en,
             COALESCE(NULLIF(name_ar,''),name_en) name_ar,
             position_label
           FROM app.family_members
           WHERE id=$1 AND tree_id=$2 AND linked_user_id IS NULL AND deleted_at IS NULL`,
          [body.existingFamilyMemberId, invitations[1]],
        )
      ).rows[0];
      if (!member) throw new ApiError("FAMILY_MEMBER_UNAVAILABLE", 409);
      const row = (
        await client.query(
          `INSERT INTO app.contributor_invitations(
            tree_id,branch_id,inviter_user_id,invited_name_en,invited_name_ar,
            invited_email,position_label,existing_family_member_id,token_hash,expires_at
          ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,now()+interval '7 days') RETURNING *`,
          [
            invitations[1],
            body.branchId,
            session.user_id,
            member.name_en,
            member.name_ar,
            email,
            member.position_label,
            body.existingFamilyMemberId,
            sha256(token),
          ],
        )
      ).rows[0];
      await client.query(
        `INSERT INTO app.tree_activity(tree_id,branch_id,actor_user_id,action_type,target_type,target_id)
         VALUES($1,$2,$3,'invitation_sent','invitation',$4)`,
        [invitations[1], body.branchId, session.user_id, row.id],
      );
      return { row, branch };
    });
    await sendMail(
      contributorInvitationMail(email, token, created.branch.tree_name, created.branch.name_en),
    );
    return json(created.row, 201);
  }
  const cancelInvitation = url.pathname.match(/^\/api\/invitations\/([0-9a-f-]+)\/cancel$/);
  if (cancelInvitation && request.method === "POST") {
    await transaction(session.user_id, session.id, requestId, async (client) => {
      const invitation = (
        await client.query<{ tree_id: string }>(
          "SELECT tree_id FROM app.contributor_invitations WHERE id=$1",
          [cancelInvitation[1]],
        )
      ).rows[0];
      if (!invitation) throw new ApiError("NOT_FOUND", 404);
      await requireOwner(client, invitation.tree_id, session.user_id);
      await client.query(
        `UPDATE app.contributor_invitations SET status='cancelled',updated_at=now()
         WHERE id=$1 AND status='pending'`,
        [cancelInvitation[1]],
      );
      await client.query(
        `INSERT INTO app.tree_activity(tree_id,actor_user_id,action_type,target_type,target_id)
         VALUES($1,$2,'invitation_cancelled','invitation',$3)`,
        [invitation.tree_id, session.user_id, cancelInvitation[1]],
      );
    });
    return json({ ok: true });
  }
  const resendInvitation = url.pathname.match(/^\/api\/invitations\/([0-9a-f-]+)\/resend$/);
  if (resendInvitation && request.method === "POST") {
    const token = randomBytes(32).toString("base64url");
    const invitation = await transaction(session.user_id, session.id, requestId, async (client) => {
      const row = (
        await client.query<{
          tree_id: string;
          branch_id: string;
          invited_email: string;
          tree_name: string;
          branch_name: string;
          updated_at: string;
        }>(
          `SELECT i.tree_id,i.branch_id,i.invited_email,i.updated_at,
              t.name_en tree_name,b.name_en branch_name
             FROM app.contributor_invitations i
             JOIN app.family_trees t ON t.id=i.tree_id
             JOIN app.subfamilies b ON b.id=i.branch_id AND b.tree_id=i.tree_id
             WHERE i.id=$1 AND i.status='pending' AND i.expires_at>now()
             FOR UPDATE OF i`,
          [resendInvitation[1]],
        )
      ).rows[0];
      if (!row) throw new ApiError("INVALID_INVITATION", 409);
      await requireOwner(client, row.tree_id, session.user_id);
      if (new Date(row.updated_at).getTime() > Date.now() - 60_000)
        throw new ApiError("RESEND_TOO_SOON", 429);
      await client.query(
        `UPDATE app.contributor_invitations
           SET token_hash=$2,expires_at=now()+interval '7 days',updated_at=now()
           WHERE id=$1`,
        [resendInvitation[1], sha256(token)],
      );
      await client.query(
        `INSERT INTO app.tree_activity(
            tree_id,branch_id,actor_user_id,action_type,target_type,target_id
          ) VALUES($1,$2,$3,'invitation_resent','invitation',$4)`,
        [row.tree_id, row.branch_id, session.user_id, resendInvitation[1]],
      );
      return row;
    });
    await sendMail(
      contributorInvitationMail(
        invitation.invited_email,
        token,
        invitation.tree_name,
        invitation.branch_name,
      ),
    );
    return json({ ok: true });
  }
  const removeContributor = url.pathname.match(
    /^\/api\/trees\/([0-9a-f-]+)\/contributors\/([0-9a-f-]+)\/remove$/,
  );
  if (removeContributor && request.method === "POST") {
    await transaction(session.user_id, session.id, requestId, async (client) => {
      await requireOwner(client, removeContributor[1], session.user_id);
      await client.query(
        `UPDATE app.branch_grants SET revoked_at=now(),revoked_by=$3
         WHERE tree_id=$1 AND user_id=$2 AND revoked_at IS NULL`,
        [removeContributor[1], removeContributor[2], session.user_id],
      );
      const changed = await client.query(
        `UPDATE app.tree_memberships SET affiliation_status='removed',revoked_at=now(),revoked_by=$3
         WHERE tree_id=$1 AND user_id=$2 AND role<>'owner' AND affiliation_status<>'removed'`,
        [removeContributor[1], removeContributor[2], session.user_id],
      );
      if (!changed.rowCount) throw new ApiError("CONTRIBUTOR_UNAVAILABLE", 409);
      await client.query(
        `UPDATE app.ownership_transfers SET status='cancelled',updated_at=now()
         WHERE tree_id=$1 AND proposed_owner_user_id=$2 AND status='pending'`,
        [removeContributor[1], removeContributor[2]],
      );
    });
    return json({ ok: true });
  }
  const transfers = url.pathname.match(/^\/api\/trees\/([0-9a-f-]+)\/ownership-transfers$/);
  if (transfers && request.method === "POST") {
    const body = await parseBody(request, schemas.transferRequest);
    const code = randomInt(0, 1_000_000).toString().padStart(6, "0");
    const transfer = await transaction(session.user_id, session.id, requestId, async (client) => {
      await requireOwner(client, transfers[1], session.user_id);
      const eligible = await client.query(
        `SELECT 1 FROM app.tree_memberships m JOIN app.users u ON u.id=m.user_id
         JOIN app.branch_grants g ON g.user_id=m.user_id AND g.tree_id=m.tree_id
         WHERE m.tree_id=$1 AND m.user_id=$2 AND m.affiliation_status='active'
           AND g.role='branch_editor' AND g.revoked_at IS NULL AND u.status='active'`,
        [transfers[1], body.proposedOwnerUserId],
      );
      if (!eligible.rowCount) throw new ApiError("TRANSFER_TARGET_INELIGIBLE", 409);
      if (body.previousOwnerBranchId) {
        const available = await client.query(
          `SELECT 1 FROM app.subfamilies b WHERE b.id=$1 AND b.tree_id=$2
           AND b.status='active' AND b.deleted_at IS NULL AND NOT EXISTS (
             SELECT 1 FROM app.branch_grants g WHERE g.tree_id=b.tree_id
               AND g.root_subfamily_id=b.id AND g.role='branch_editor'
               AND g.revoked_at IS NULL AND g.user_id<>$3
           )`,
          [body.previousOwnerBranchId, transfers[1], body.proposedOwnerUserId],
        );
        if (!available.rowCount) throw new ApiError("BRANCH_ALREADY_ASSIGNED", 409);
      }
      return (
        await client.query(
          `INSERT INTO app.ownership_transfers(
            tree_id,current_owner_user_id,proposed_owner_user_id,previous_owner_branch_id,
            keep_previous_owner_read_only,verification_code_hash,expires_at,reason
          ) VALUES($1,$2,$3,$4,$5,$6,now()+interval '24 hours',$7) RETURNING id,status,expires_at`,
          [
            transfers[1],
            session.user_id,
            body.proposedOwnerUserId,
            body.previousOwnerBranchId || null,
            body.keepPreviousOwnerReadOnly,
            transferCodeHash(code),
            body.reason || null,
          ],
        )
      ).rows[0];
    });
    await sendMail(ownershipTransferCodeMail(session.email, code));
    return json(transfer, 201);
  }
  const verifyTransfer = url.pathname.match(/^\/api\/ownership-transfers\/([0-9a-f-]+)\/verify$/);
  if (verifyTransfer && request.method === "POST") {
    const body = await parseBody(request, schemas.transferCode);
    const result = await transaction(session.user_id, session.id, requestId, (client) =>
      client.query(
        `UPDATE app.ownership_transfers SET verified_at=now(),verification_code_hash=NULL,updated_at=now()
         WHERE id=$1 AND current_owner_user_id=$2 AND status='pending' AND expires_at>now()
           AND verification_code_hash=$3 RETURNING id`,
        [verifyTransfer[1], session.user_id, transferCodeHash(body.code)],
      ),
    );
    return result.rowCount ? json({ ok: true }) : json({ code: "INVALID_OR_EXPIRED_CODE" }, 400);
  }
  const transferAction = url.pathname.match(
    /^\/api\/ownership-transfers\/([0-9a-f-]+)\/(accept|reject|cancel)$/,
  );
  if (transferAction && request.method === "POST") {
    const [, transferId, action] = transferAction;
    await transaction(session.user_id, session.id, requestId, async (client) => {
      const transfer = (
        await client.query<{
          tree_id: string;
          current_owner_user_id: string;
          proposed_owner_user_id: string;
          previous_owner_branch_id: string | null;
          keep_previous_owner_read_only: boolean;
        }>(
          `SELECT * FROM app.ownership_transfers
           WHERE id=$1 AND status='pending' AND expires_at>now() FOR UPDATE`,
          [transferId],
        )
      ).rows[0];
      if (!transfer) throw new ApiError("TRANSFER_UNAVAILABLE", 409);
      if (action === "cancel") {
        if (session.user_id !== transfer.current_owner_user_id)
          throw new ApiError("FORBIDDEN", 403);
        await client.query(
          "UPDATE app.ownership_transfers SET status='cancelled',updated_at=now() WHERE id=$1",
          [transferId],
        );
        return;
      }
      if (session.user_id !== transfer.proposed_owner_user_id) throw new ApiError("FORBIDDEN", 403);
      if (action === "reject") {
        await client.query(
          "UPDATE app.ownership_transfers SET status='rejected',updated_at=now() WHERE id=$1",
          [transferId],
        );
        return;
      }
      const verified = await client.query(
        "SELECT 1 FROM app.ownership_transfers WHERE id=$1 AND verified_at IS NOT NULL",
        [transferId],
      );
      if (!verified.rowCount) throw new ApiError("TRANSFER_NOT_VERIFIED", 409);
      await client.query("SET CONSTRAINTS ALL DEFERRED");
      await client.query(
        `UPDATE app.tree_memberships SET role='viewer',
          affiliation_status=$3::app.affiliation_status
         WHERE tree_id=$1 AND user_id=$2`,
        [
          transfer.tree_id,
          transfer.current_owner_user_id,
          transfer.keep_previous_owner_read_only ? "read_only" : "active",
        ],
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
        [transfer.tree_id, transfer.proposed_owner_user_id, session.user_id],
      );
      if (transfer.previous_owner_branch_id)
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
    });
    return json({ ok: true });
  }
  const activity = url.pathname.match(/^\/api\/trees\/([0-9a-f-]+)\/activity$/);
  if (activity && request.method === "GET") {
    const result = await transaction(session.user_id, session.id, requestId, async (client) => {
      const visible = await client.query("SELECT app.can_view_tree($1) allowed", [activity[1]]);
      if (!visible.rows[0]?.allowed) throw new ApiError("FORBIDDEN", 403);
      return client.query(
        `SELECT action_type,target_type,target_id,branch_id,metadata,created_at
         FROM app.tree_activity WHERE tree_id=$1 ORDER BY created_at DESC LIMIT 100`,
        [activity[1]],
      );
    });
    return json(result.rows);
  }
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
      await requireOwner(client, complaint.tree_id, session.user_id);
      await client.query(
        `UPDATE app.tree_complaints SET status=$2,resolution_note=$3,
          serious=COALESCE($4,serious),reviewed_by=$5,resolved_at=now()
         WHERE id=$1 AND status='open'`,
        [complaintReview[1], body.status, body.resolutionNote, body.serious, session.user_id],
      );
    });
    return json({ ok: true });
  }
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
