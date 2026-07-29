/* eslint-disable max-lines -- Collaboration routes share transactional authorization helpers during API modularization. */
import {
  createHash,
  createHmac,
  randomBytes,
  randomInt,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import type { PoolClient } from "pg";
import { transaction } from "@/shared/server/database";
import {
  contributorInvitationMail,
  contributorRemovalCodeMail,
  ownershipTransferCodeMail,
  ownershipTransferRequestedMail,
  sendMail,
} from "@/shared/server/email";
import { jsonResponse as json } from "@/shared/http/response";
import { ApiError, parseBody, schemas } from "@/server/security";
import { matchingActivityActionTypes } from "../domain/activity-search";
import { activityRequestLimit } from "../domain/policy";
import { deleteContributorIdentity } from "./account-deletion";

type Session = { id: string; user_id: string; email: string };
type ActivityDatabaseRow = {
  id: string;
  action_type: string;
  actor_user_id: string | null;
  actor_name_en: string | null;
  actor_name_ar: string | null;
  subject_user_id: string | null;
  subject_name_en: string | null;
  subject_name_ar: string | null;
  target_type: string;
  target_id: string | null;
  target_name_en: string | null;
  target_name_ar: string | null;
  branch_id: string | null;
  branch_name_en: string | null;
  branch_name_ar: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
};
type ActivityCursor = { createdAt: string; id: string };
type ActivityGroup = { item: Record<string, unknown>; endCursor: ActivityCursor };

const activityPerson = (userId: string | null, nameEn: string | null, nameAr: string | null) =>
  nameEn && nameAr ? { userId, nameEn, nameAr } : null;

// eslint-disable-next-line complexity -- Group construction handles optional actor, target, branch, and session fields.
const activityGroups = (rows: ActivityDatabaseRow[]): ActivityGroup[] => {
  const projected: ActivityGroup[] = [];
  for (const row of rows) {
    const previous = projected.at(-1);
    const version = Number(row.metadata.version);
    const canGroup =
      row.action_type === "tree_updated" &&
      previous?.item.actionType === "tree_updated" &&
      (previous.item.actor as { userId: string | null } | null)?.userId === row.actor_user_id &&
      previous.item.branchId === row.branch_id &&
      new Date(previous.item.createdAt as string).getTime() - new Date(row.created_at).getTime() <=
        15 * 60_000;
    if (canGroup) {
      const editingSession = previous.item.editingSession as {
        firstVersion: number;
        lastVersion: number;
        snapshotCount: number;
        endedAt: string;
      };
      editingSession.firstVersion = Number.isFinite(version)
        ? Math.min(editingSession.firstVersion, version)
        : editingSession.firstVersion;
      editingSession.snapshotCount += 1;
      previous.endCursor = { createdAt: row.created_at, id: row.id };
      continue;
    }
    projected.push({
      item: {
        id: row.id,
        actionType: row.action_type,
        actor: activityPerson(row.actor_user_id, row.actor_name_en, row.actor_name_ar),
        subject: activityPerson(row.subject_user_id, row.subject_name_en, row.subject_name_ar),
        target: {
          type: row.target_type,
          id: row.target_id,
          nameEn: row.target_name_en ?? (row.target_type === "branch" ? row.branch_name_en : null),
          nameAr: row.target_name_ar ?? (row.target_type === "branch" ? row.branch_name_ar : null),
        },
        branchId: row.branch_id,
        branch:
          row.branch_name_en || row.branch_name_ar
            ? { nameEn: row.branch_name_en, nameAr: row.branch_name_ar }
            : null,
        createdAt: row.created_at,
        editingSession:
          row.action_type === "tree_updated"
            ? {
                firstVersion: version,
                lastVersion: version,
                snapshotCount: 1,
                endedAt: row.created_at,
              }
            : null,
      },
      endCursor: { createdAt: row.created_at, id: row.id },
    });
  }
  return projected;
};

export function projectActivity(rows: ActivityDatabaseRow[], limit: number) {
  return activityGroups(rows)
    .slice(0, limit)
    .map(({ item }) => item);
}

const encodeActivityCursor = (cursor: ActivityCursor) =>
  Buffer.from(JSON.stringify(cursor)).toString("base64url");

const decodeActivityCursor = (value: string | null): ActivityCursor | null => {
  if (!value) return null;
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as ActivityCursor;
    if (
      typeof parsed.createdAt !== "string" ||
      !Number.isFinite(Date.parse(parsed.createdAt)) ||
      typeof parsed.id !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(parsed.id)
    )
      throw new Error("invalid cursor");
    return parsed;
  } catch {
    throw new ApiError("INVALID_CURSOR", 400);
  }
};

const activityPageFromGroups = (groups: ActivityGroup[], limit: number) => {
  const pageGroups = groups.slice(0, limit);
  return {
    items: pageGroups.map(({ item }) => item),
    nextCursor:
      groups.length > limit
        ? encodeActivityCursor(pageGroups[pageGroups.length - 1].endCursor)
        : null,
  };
};

export function projectActivityPage(rows: ActivityDatabaseRow[], limit: number) {
  return activityPageFromGroups(activityGroups(rows), limit);
}
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
const contributorRemovalCodeHash = (challengeId: string, code: string) => {
  const secret =
    process.env.EMAIL_CODE_SECRET ??
    ((process.env.AUTH_TOKEN_DELIVERY ?? "console") === "console"
      ? "ancestors-unfold-console-development-only"
      : undefined);
  if (!secret || secret.length < 16) throw new Error("MAIL_NOT_CONFIGURED");
  return createHmac("sha256", secret).update(`contributor-removal:${challengeId}:${code}`).digest();
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
    `INSERT INTO app.tree_activity(
       tree_id,actor_user_id,action_type,target_type,target_id,target_name_en,target_name_ar
     )
     SELECT id,$2,'tree_created','family_tree',id,name_en,name_ar
     FROM app.family_trees WHERE id=$1`,
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
    const linked = await client.query<{ gender: "male" | "female" | "unspecified" }>(
      `UPDATE app.family_members SET linked_user_id=$2,
        updated_by=$2,updated_at=now(),version=version+1
       WHERE id=$1 AND tree_id=$3 AND linked_user_id IS NULL AND deleted_at IS NULL
       RETURNING gender`,
      [memberId, user.id, invitation.tree_id],
    );
    if (!linked.rowCount) throw new ApiError("FAMILY_MEMBER_UNAVAILABLE", 409);
    await client.query("UPDATE app.users SET profile_gender=$2,updated_at=now() WHERE id=$1", [
      user.id,
      linked.rows[0].gender,
    ]);
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
      tree_id,branch_id,actor_user_id,subject_user_id,action_type,target_type,target_id
    ) VALUES($1,$2,$3,$3,'invitation_accepted','user',$3)`,
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
  ), scored AS (
  SELECT s.*,
    CASE
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
    END earned_authenticity_level,
    cfg.growing_contributors,cfg.growing_branches,
    cfg.backed_contributors,cfg.backed_branches,
    cfg.established_contributors,cfg.established_branches,
    cfg.established_min_days,cfg.recent_activity_days,
    floor(extract(epoch FROM (now()-ft.created_at))/86400)::integer tree_age_days,
    COALESCE(
      s.last_contribution_at>=now()-(cfg.recent_activity_days||' days')::interval,
      false
    ) recent_activity_met,
    cfg.serious_complaint_downgrade
  FROM stats s JOIN app.family_trees ft ON ft.id=s.id CROSS JOIN cfg
  ) SELECT scored.*,
    CASE
      WHEN serious_complaints>0 AND serious_complaint_downgrade THEN 'under_review'
      ELSE earned_authenticity_level
    END authenticity_level
  FROM scored`;

export async function validatePublicInvitation(request: Request) {
  const encodedToken = new URL(request.url).pathname.match(/^\/api\/invitations\/([^/]+)$/)?.[1];
  if (!encodedToken || request.method !== "GET") return undefined;
  let token: string;
  try {
    token = decodeURIComponent(encodedToken);
  } catch {
    return json({ valid: false, code: "INVALID_INVITATION" }, 404, { "cache-control": "no-store" });
  }
  const result = await transaction(null, null, crypto.randomUUID(), async (client) =>
    client.query(`SELECT * FROM app.public_invitation($1)`, [sha256(token)]),
  );
  return result.rowCount
    ? json({ valid: true, ...result.rows[0] }, 200, { "cache-control": "no-store" })
    : json({ valid: false, code: "INVALID_INVITATION" }, 404, { "cache-control": "no-store" });
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
        `SELECT t.id,t.name_en,t.name_ar,t.created_at,
          CASE WHEN m.role='owner' THEN 'owner'
               WHEN g.id IS NOT NULL THEN 'contributor'
               ELSE m.role::text END role,
          m.affiliation_status,m.family_member_id,
          g.root_subfamily_id assigned_branch_id
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
      const owner = await client.query(
        `SELECT 1 FROM app.tree_memberships
         WHERE tree_id=$1 AND user_id=$2 AND role='owner' AND revoked_at IS NULL`,
        [branches[1], session.user_id],
      );
      return client.query(
        `SELECT b.id,b.name_en,b.name_ar,b.linked_male_id root_family_member_id,b.status,
          g.user_id contributor_user_id,u.full_name_en contributor_name_en,u.full_name_ar contributor_name_ar
         FROM app.subfamilies b LEFT JOIN app.branch_grants g
          ON g.tree_id=b.tree_id AND g.root_subfamily_id=b.id AND g.role='branch_editor' AND g.revoked_at IS NULL
         LEFT JOIN app.users u ON u.id=g.user_id
         WHERE b.tree_id=$1 AND b.deleted_at IS NULL
           AND ($2::boolean OR g.user_id=$3)
         ORDER BY b.created_at`,
        [branches[1], Boolean(owner.rowCount), session.user_id],
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
        `INSERT INTO app.tree_activity(
           tree_id,branch_id,actor_user_id,action_type,target_type,target_id,
           target_name_en,target_name_ar
         ) VALUES($1,$2,$3,'branch_created','branch',$2,$4,$5)`,
        [branches[1], created.id, session.user_id, created.name_en, created.name_ar],
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
      await client.query(
        `INSERT INTO app.tree_activity(
           tree_id,branch_id,actor_user_id,action_type,target_type,target_id,
           target_name_en,target_name_ar
         ) VALUES(
           $1,$2,$3,
           CASE
             WHEN $6='active' THEN 'branch_activated'
             WHEN $6='inactive' THEN 'branch_deactivated'
             ELSE 'branch_updated'
           END,
           'branch',$2,$4,$5
         )`,
        [
          branchUpdate[1],
          branchUpdate[2],
          session.user_id,
          updated.name_en,
          updated.name_ar,
          body.status ?? null,
        ],
      );
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
        `INSERT INTO app.tree_activity(
           tree_id,branch_id,actor_user_id,action_type,target_type,target_id,
           subject_name_en,subject_name_ar,target_name_en,target_name_ar
         ) VALUES($1,$2,$3,'invitation_sent','invitation',$4,$5,$6,$7,$8)`,
        [
          invitations[1],
          body.branchId,
          session.user_id,
          row.id,
          member.name_en,
          member.name_ar,
          branch.name_en,
          null,
        ],
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
        await client.query<{
          tree_id: string;
          branch_id: string;
          invited_name_en: string;
          invited_name_ar: string;
        }>(
          `SELECT tree_id,branch_id,invited_name_en,invited_name_ar
           FROM app.contributor_invitations WHERE id=$1`,
          [cancelInvitation[1]],
        )
      ).rows[0];
      if (!invitation) throw new ApiError("NOT_FOUND", 404);
      await requireOwner(client, invitation.tree_id, session.user_id);
      const cancelled = await client.query(
        `UPDATE app.contributor_invitations SET status='cancelled',updated_at=now()
         WHERE id=$1 AND status='pending' RETURNING id`,
        [cancelInvitation[1]],
      );
      if (!cancelled.rowCount) throw new ApiError("INVALID_INVITATION", 409);
      await client.query(
        `INSERT INTO app.tree_activity(
           tree_id,branch_id,actor_user_id,action_type,target_type,target_id,
           subject_name_en,subject_name_ar
         ) VALUES($1,$2,$3,'invitation_cancelled','invitation',$4,$5,$6)`,
        [
          invitation.tree_id,
          invitation.branch_id,
          session.user_id,
          cancelInvitation[1],
          invitation.invited_name_en,
          invitation.invited_name_ar,
        ],
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
          invited_name_en: string;
          invited_name_ar: string;
          updated_at: string;
        }>(
          `SELECT i.tree_id,i.branch_id,i.invited_email,i.invited_name_en,
              i.invited_name_ar,i.updated_at,
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
            tree_id,branch_id,actor_user_id,action_type,target_type,target_id,
            subject_name_en,subject_name_ar,target_name_en
          ) VALUES($1,$2,$3,'invitation_resent','invitation',$4,$5,$6,$7)`,
        [
          row.tree_id,
          row.branch_id,
          session.user_id,
          resendInvitation[1],
          row.invited_name_en,
          row.invited_name_ar,
          row.branch_name,
        ],
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
  const requestContributorRemoval = url.pathname.match(
    /^\/api\/trees\/([0-9a-f-]+)\/contributors\/([0-9a-f-]+)\/removal-requests$/,
  );
  if (requestContributorRemoval && request.method === "POST") {
    const challengeId = randomUUID();
    const code = randomInt(0, 1_000_000).toString().padStart(6, "0");
    const requested = await transaction(session.user_id, session.id, requestId, async (client) => {
      await requireOwner(client, requestContributorRemoval[1], session.user_id);
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
          [requestContributorRemoval[1], requestContributorRemoval[2]],
        )
      ).rows[0];
      if (!contributor) throw new ApiError("CONTRIBUTOR_UNAVAILABLE", 409);
      await client.query(
        `UPDATE app.contributor_removal_challenges
           SET cancelled_at=now(),updated_at=now()
           WHERE tree_id=$1 AND owner_user_id=$2 AND contributor_user_id=$3
             AND consumed_at IS NULL AND cancelled_at IS NULL`,
        [requestContributorRemoval[1], session.user_id, requestContributorRemoval[2]],
      );
      const challenge = (
        await client.query<{ id: string; expires_at: string }>(
          `INSERT INTO app.contributor_removal_challenges(
               id,tree_id,owner_user_id,contributor_user_id,verification_code_hash,expires_at
             ) VALUES($1,$2,$3,$4,$5,now()+interval '15 minutes')
             RETURNING id,expires_at`,
          [
            challengeId,
            requestContributorRemoval[1],
            session.user_id,
            requestContributorRemoval[2],
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
  const confirmContributorRemoval = url.pathname.match(
    /^\/api\/contributor-removal-requests\/([0-9a-f-]+)\/confirm$/,
  );
  if (confirmContributorRemoval && request.method === "POST") {
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
          [confirmContributorRemoval[1], session.user_id],
        )
      ).rows[0];
      if (
        !challenge ||
        new Date(challenge.expires_at).getTime() <= Date.now() ||
        !timingSafeEqual(
          challenge.verification_code_hash,
          contributorRemovalCodeHash(confirmContributorRemoval[1], body.code),
        )
      )
        throw new ApiError("INVALID_OR_EXPIRED_CODE", 400);
      await requireOwner(client, challenge.tree_id, session.user_id);
      const deletable = await client.query<{ allowed: boolean }>(
        "SELECT app.owner_can_delete_contributor($1,$2) allowed",
        [challenge.tree_id, challenge.contributor_user_id],
      );
      if (!deletable.rows[0]?.allowed)
        throw new ApiError("CONTRIBUTOR_ACCOUNT_DELETE_CONFLICT", 409);
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
        [
          confirmContributorRemoval[1],
          contributorRemovalCodeHash(confirmContributorRemoval[1], body.code),
        ],
      );
    });
    return json({ ok: true });
  }
  const removeContributor = url.pathname.match(
    /^\/api\/trees\/([0-9a-f-]+)\/contributors\/([0-9a-f-]+)\/remove$/,
  );
  if (removeContributor && request.method === "POST")
    throw new ApiError("CONTRIBUTOR_REMOVAL_VERIFICATION_REQUIRED", 409);
  const transfers = url.pathname.match(/^\/api\/trees\/([0-9a-f-]+)\/ownership-transfers$/);
  if (transfers && request.method === "GET") {
    const pending = await transaction(session.user_id, session.id, requestId, async (client) => {
      await client.query(
        `UPDATE app.ownership_transfers SET status='expired',updated_at=now()
           WHERE tree_id=$1 AND status='pending' AND expires_at<=now()`,
        [transfers[1]],
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
        [transfers[1], session.user_id],
      );
    });
    return json(pending.rows[0] ?? null);
  }
  if (transfers && request.method === "POST") {
    const body = await parseBody(request, schemas.transferRequest);
    const code = randomInt(0, 1_000_000).toString().padStart(6, "0");
    const transfer = await transaction(session.user_id, session.id, requestId, async (client) => {
      await requireOwner(client, transfers[1], session.user_id);
      const existing = await client.query(
        `SELECT 1 FROM app.ownership_transfers
         WHERE tree_id=$1 AND status='pending' AND expires_at>now() FOR UPDATE`,
        [transfers[1]],
      );
      if (existing.rowCount) throw new ApiError("TRANSFER_ALREADY_PENDING", 409);
      await client.query(
        `UPDATE app.ownership_transfers SET status='expired',updated_at=now()
         WHERE tree_id=$1 AND status='pending' AND expires_at<=now()`,
        [transfers[1]],
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
        [transfers[1], body.proposedOwnerUserId],
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
            transfers[1],
            session.user_id,
            body.proposedOwnerUserId,
            subject.branch_id,
            transferCodeHash(code),
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
          transfers[1],
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
  const resendTransferCode = url.pathname.match(
    /^\/api\/ownership-transfers\/([0-9a-f-]+)\/resend-code$/,
  );
  if (resendTransferCode && request.method === "POST") {
    const code = randomInt(0, 1_000_000).toString().padStart(6, "0");
    const resent = await transaction(session.user_id, session.id, requestId, async (client) => {
      const updated = await client.query<{ verification_expires_at: string }>(
        `UPDATE app.ownership_transfers
         SET verification_code_hash=$3,
           verification_expires_at=LEAST(expires_at,now()+interval '15 minutes'),updated_at=now()
         WHERE id=$1 AND current_owner_user_id=$2 AND status='pending'
           AND verified_at IS NULL AND expires_at>now()
         RETURNING verification_expires_at`,
        [resendTransferCode[1], session.user_id, transferCodeHash(code)],
      );
      if (!updated.rowCount) throw new ApiError("TRANSFER_UNAVAILABLE", 409);
      return updated.rows[0];
    });
    await sendMail(ownershipTransferCodeMail(session.email, code));
    return json(resent);
  }
  const verifyTransfer = url.pathname.match(/^\/api\/ownership-transfers\/([0-9a-f-]+)\/verify$/);
  if (verifyTransfer && request.method === "POST") {
    const body = await parseBody(request, schemas.transferCode);
    const result = await transaction(session.user_id, session.id, requestId, async (client) => {
      const candidate = await client.query<{
        verification_expires_at: string | null;
        expires_at: string;
      }>(
        `SELECT verification_expires_at,expires_at
         FROM app.ownership_transfers
         WHERE id=$1 AND current_owner_user_id=$2 AND status='pending'`,
        [verifyTransfer[1], session.user_id],
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
        [verifyTransfer[1], session.user_id, transferCodeHash(body.code)],
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
          verified_at: string | null;
          expires_at: string;
        }>(
          `SELECT * FROM app.ownership_transfers
           WHERE id=$1 AND status='pending' FOR UPDATE`,
          [transferId],
        )
      ).rows[0];
      if (!transfer) throw new ApiError("TRANSFER_UNAVAILABLE", 409);
      if (new Date(transfer.expires_at).getTime() <= Date.now())
        throw new ApiError("TRANSFER_EXPIRED", 409);
      if (action === "cancel") {
        if (session.user_id !== transfer.current_owner_user_id)
          throw new ApiError("FORBIDDEN", 403);
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
        [transfer.tree_id, transfer.proposed_owner_user_id, session.user_id],
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
        [transfer.tree_id, session.user_id, transfer.current_owner_user_id, transferId],
      );
    });
    return json({ ok: true });
  }
  const activity = url.pathname.match(/^\/api\/trees\/([0-9a-f-]+)\/activity$/);
  if (activity && request.method === "GET") {
    const limit = activityRequestLimit(url.searchParams.get("limit"));
    const cursor = decodeActivityCursor(url.searchParams.get("cursor"));
    const queryText = (url.searchParams.get("query") ?? "").trim().slice(0, 100);
    const locale = url.searchParams.get("locale") === "ar" ? "ar" : "en";
    const actionTypes = matchingActivityActionTypes(queryText, locale);
    const pattern = queryText
      ? `%${queryText
          .toLocaleLowerCase(locale)
          .replaceAll("\\", "\\\\")
          .replaceAll("%", "\\%")
          .replaceAll("_", "\\_")}%`
      : null;
    const result = await transaction(session.user_id, session.id, requestId, async (client) => {
      const visible = await client.query("SELECT app.can_view_tree($1) allowed", [activity[1]]);
      if (!visible.rows[0]?.allowed) throw new ApiError("FORBIDDEN", 403);
      const rows: ActivityDatabaseRow[] = [];
      let fetchCursor = cursor;
      let exhausted = false;
      do {
        const batch = await client.query<ActivityDatabaseRow>(
          `SELECT a.id,a.action_type,a.actor_user_id,a.actor_name_en,a.actor_name_ar,
             a.subject_user_id,a.subject_name_en,a.subject_name_ar,
             a.target_type,a.target_id,a.target_name_en,a.target_name_ar,
             a.branch_id,b.name_en branch_name_en,b.name_ar branch_name_ar,
             a.metadata,a.created_at
           FROM app.tree_activity a
           LEFT JOIN app.subfamilies b ON b.id=a.branch_id AND b.tree_id=a.tree_id
           WHERE a.tree_id=$1
             AND ($2::timestamptz IS NULL OR (a.created_at,a.id)<($2::timestamptz,$3::uuid))
             AND (
               $4::text IS NULL
               OR lower(
                 COALESCE(a.actor_name_en,'')||' '||COALESCE(a.actor_name_ar,'')||' '||
                 COALESCE(a.subject_name_en,'')||' '||COALESCE(a.subject_name_ar,'')
               ) LIKE $4 ESCAPE '\\'
               OR a.action_type=ANY($5::text[])
             )
           ORDER BY a.created_at DESC,a.id DESC LIMIT 250`,
          [
            activity[1],
            fetchCursor?.createdAt ?? null,
            fetchCursor?.id ?? null,
            pattern,
            actionTypes,
          ],
        );
        rows.push(...batch.rows);
        exhausted = batch.rows.length < 250;
        const last = batch.rows.at(-1);
        if (last) fetchCursor = { createdAt: last.created_at, id: last.id };
        if (!last) exhausted = true;
      } while (!exhausted && activityGroups(rows).length <= limit);
      return activityGroups(rows);
    });
    return json(activityPageFromGroups(result, limit));
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
