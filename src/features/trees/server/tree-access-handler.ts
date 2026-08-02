import type { Session } from "@/features/auth/server";
import { parseBody, schemas } from "@/server/security";
import { jsonResponse as json } from "@/shared/http/response";
import { transaction } from "@/shared/server/database";

export async function handleTreeAccessRequest(
  request: Request,
  url: URL,
  session: Session,
  requestId: string,
) {
  const grants = url.pathname.match(/^\/api\/trees\/([0-9a-f-]+)\/branch-grants$/);
  if (grants) return handleGrants(request, grants[1], session, requestId);
  const contacts = url.pathname.match(
    /^\/api\/trees\/([0-9a-f-]+)\/members\/([0-9a-f-]+)\/contacts$/,
  );
  if (contacts) return handleContacts(request, contacts[1], contacts[2], session, requestId);
  return null;
}

async function handleGrants(request: Request, treeId: string, session: Session, requestId: string) {
  if (request.method === "GET") {
    const result = await transaction(session.user_id, session.id, requestId, async (client) => {
      await requireGrantManager(client, treeId, session.user_id);
      return client.query(
        "SELECT id,user_id,root_subfamily_id,role,can_read_contacts,can_write_contacts,granted_at,expires_at FROM app.branch_grants WHERE tree_id=$1 AND revoked_at IS NULL",
        [treeId],
      );
    });
    return json(result.rows);
  }
  if (request.method !== "POST") return null;
  const body = await parseBody(request, schemas.branchGrant);
  const result = await transaction(session.user_id, session.id, requestId, async (client) => {
    await requireGrantManager(client, treeId, session.user_id);
    return (
      await client.query(
        `INSERT INTO app.branch_grants(user_id,tree_id,root_subfamily_id,role,can_read_contacts,can_write_contacts,granted_by,expires_at)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
        [
          body.userId,
          treeId,
          body.rootSubfamilyId,
          body.role,
          body.canReadContacts,
          body.canWriteContacts,
          session.user_id,
          body.expiresAt ?? null,
        ],
      )
    ).rows[0];
  });
  return json(result, 201);
}

async function requireGrantManager(
  client: { query: (text: string, values?: unknown[]) => Promise<{ rowCount: number | null }> },
  treeId: string,
  userId: string,
) {
  const allowed = await client.query(
    "SELECT 1 FROM app.tree_memberships WHERE tree_id=$1 AND user_id=$2 AND role IN ('owner','administrator') AND revoked_at IS NULL",
    [treeId, userId],
  );
  if (!allowed.rowCount) throw new Error("FORBIDDEN");
}

async function handleContacts(
  request: Request,
  treeId: string,
  memberId: string,
  session: Session,
  requestId: string,
) {
  if (request.method === "GET") {
    const result = await transaction(session.user_id, session.id, requestId, async (client) => {
      const allowed = await client.query<{ allowed: boolean }>(
        "SELECT app.can_read_contacts($1,$2) allowed",
        [treeId, memberId],
      );
      if (!allowed.rows[0]?.allowed) throw new Error("FORBIDDEN");
      return client.query(
        "SELECT id,contact_type,display_value,label,address,is_primary,verified_at FROM app.member_contacts WHERE tree_id=$1 AND member_id=$2 AND deleted_at IS NULL",
        [treeId, memberId],
      );
    });
    return json(result.rows);
  }
  if (request.method !== "POST") return null;
  const body = await parseBody(request, schemas.contact);
  const result = await transaction(session.user_id, session.id, requestId, async (client) => {
    const allowed = await client.query<{ allowed: boolean }>(
      "SELECT app.can_write_contacts($1,$2) allowed",
      [treeId, memberId],
    );
    if (!allowed.rows[0]?.allowed) throw new Error("FORBIDDEN");
    return (
      await client.query(
        `INSERT INTO app.member_contacts(tree_id,member_id,contact_type,normalized_value,display_value,label,address,is_primary,created_by,updated_by)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$9)
         RETURNING id,contact_type,display_value,label,address,is_primary`,
        [
          treeId,
          memberId,
          body.contactType,
          body.normalizedValue ?? null,
          body.displayValue,
          body.label ?? null,
          body.address ?? null,
          body.isPrimary,
          session.user_id,
        ],
      )
    ).rows[0];
  });
  return json(result, 201);
}
