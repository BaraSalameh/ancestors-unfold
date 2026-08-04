import type { PoolClient } from "pg";
import { transaction } from "@/shared/server/database";
import { jsonResponse as json } from "@/shared/http/response";
import { ApiError, parseBody, schemas } from "@/server/security";
import { requireTreeOwner } from "./authorization";
import type { CollaborationSession } from "./types";

export async function beginTreeMutation(
  client: PoolClient,
  treeId: string,
  userId: string,
  expectedVersion: number,
  batchId: string,
) {
  await requireTreeOwner(client, treeId, userId);
  const locked = await client.query<{ version: number }>(
    "SELECT version FROM app.family_trees WHERE id=$1 AND deleted_at IS NULL FOR UPDATE",
    [treeId],
  );
  if (!locked.rowCount) throw new ApiError("NOT_FOUND", 404);
  if (Number(locked.rows[0].version) !== expectedVersion)
    throw new ApiError("VERSION_CONFLICT", 409);
  await client.query("SELECT set_config('app.correlation_id',$1,true)", [batchId]);
}

export async function finishTreeMutation(
  client: PoolClient,
  treeId: string,
  expectedVersion: number,
  batchId: string,
) {
  const updated = await client.query<{ version: number }>(
    "UPDATE app.family_trees SET version=version+1 WHERE id=$1 RETURNING version",
    [treeId],
  );
  const version = Number(updated.rows[0].version);
  await client.query("SELECT app.store_tree_snapshot($1::uuid,$2::bigint,$3::bigint,$4::uuid)", [
    treeId,
    version,
    expectedVersion,
    batchId,
  ]);
  return version;
}

async function requireBranchRoot(client: PoolClient, treeId: string, memberId: string) {
  const root = await client.query(
    `SELECT 1 FROM app.family_members
     WHERE tree_id=$1 AND id=$2 AND gender='male' AND is_unknown=false AND deleted_at IS NULL`,
    [treeId, memberId],
  );
  if (!root.rowCount) throw new ApiError("MEMBER_UNAVAILABLE", 404);
}

async function createBranch(
  request: Request,
  treeId: string,
  session: CollaborationSession,
  requestId: string,
) {
  const body = await parseBody(request, schemas.branch);
  const result = await transaction(session.user_id, session.id, requestId, async (client) => {
    await beginTreeMutation(client, treeId, session.user_id, body.expectedVersion, body.batchId);
    await requireBranchRoot(client, treeId, body.rootFamilyMemberId);
    const created = (
      await client.query(
        `INSERT INTO app.subfamilies(
          tree_id,name_en,name_ar,linked_male_id,status
        ) VALUES($1,$2,$3,$4,$5) RETURNING *`,
        [treeId, body.name_en, body.name_ar || null, body.rootFamilyMemberId, body.status],
      )
    ).rows[0];
    await client.query("SELECT app.reconcile_branch_structure($1)", [treeId]);
    await client.query(
      `INSERT INTO app.tree_activity(
         tree_id,branch_id,actor_user_id,action_type,target_type,target_id,
         target_name_en,target_name_ar
       ) VALUES($1,$2,$3,'branch_created','branch',$2,$4,$5)`,
      [treeId, created.id, session.user_id, created.name_en, created.name_ar],
    );
    const version = await finishTreeMutation(client, treeId, body.expectedVersion, body.batchId);
    return { ...created, version };
  });
  return json(result, 201);
}

async function updateBranch(
  request: Request,
  treeId: string,
  branchId: string,
  session: CollaborationSession,
  requestId: string,
) {
  const body = await parseBody(request, schemas.branchUpdate);
  const result = await transaction(session.user_id, session.id, requestId, async (client) => {
    await beginTreeMutation(client, treeId, session.user_id, body.expectedVersion, body.batchId);
    const rootProvided = Object.hasOwn(body, "rootFamilyMemberId");
    if (rootProvided) await requireBranchRoot(client, treeId, body.rootFamilyMemberId!);
    const updated = (
      await client.query(
        `UPDATE app.subfamilies SET
          name_en=COALESCE($3,name_en),name_ar=CASE WHEN $4 THEN $5 ELSE name_ar END,
          linked_male_id=CASE WHEN $6 THEN $7 ELSE linked_male_id END,
          status=COALESCE($8::app.branch_status,status),version=version+1,updated_at=now()
         WHERE tree_id=$1 AND id=$2 AND deleted_at IS NULL RETURNING *`,
        [
          treeId,
          branchId,
          body.name_en ?? null,
          Object.hasOwn(body, "name_ar"),
          body.name_ar ?? null,
          rootProvided,
          body.rootFamilyMemberId ?? null,
          body.status ?? null,
        ],
      )
    ).rows[0];
    if (!updated) throw new ApiError("BRANCH_UNAVAILABLE", 404);
    await client.query("SELECT app.reconcile_branch_structure($1)", [treeId]);
    await client.query(
      `INSERT INTO app.tree_activity(
         tree_id,branch_id,actor_user_id,action_type,target_type,target_id,
         target_name_en,target_name_ar
       ) VALUES(
         $1,$2,$3,
         CASE WHEN $6='active' THEN 'branch_activated'
              ELSE 'branch_updated' END,
         'branch',$2,$4,$5
       )`,
      [treeId, branchId, session.user_id, updated.name_en, updated.name_ar, body.status ?? null],
    );
    const version = await finishTreeMutation(client, treeId, body.expectedVersion, body.batchId);
    return { ...updated, version };
  });
  return json(result);
}

async function deleteBranch(
  request: Request,
  treeId: string,
  branchId: string,
  session: CollaborationSession,
  requestId: string,
) {
  const body = await parseBody(request, schemas.branchDelete);
  const result = await transaction(session.user_id, session.id, requestId, async (client) => {
    await beginTreeMutation(client, treeId, session.user_id, body.expectedVersion, body.batchId);
    const branch = await client.query<{
      linked_male_id: string | null;
      name_ar: string | null;
      name_en: string;
      status: string;
    }>(
      "SELECT name_en,name_ar,status,linked_male_id FROM app.subfamilies WHERE tree_id=$1 AND id=$2 AND deleted_at IS NULL",
      [treeId, branchId],
    );
    if (!branch.rowCount) throw new ApiError("BRANCH_UNAVAILABLE", 404);
    if (branch.rows[0].status !== "inactive") throw new ApiError("BRANCH_MUST_BE_INACTIVE", 409);
    const blockers = await client.query<{ blocked: boolean }>(
      `SELECT (
        $3::uuid IS NOT NULL OR
        EXISTS(SELECT 1 FROM app.family_members WHERE tree_id=$1 AND subfamily_id=$2 AND deleted_at IS NULL) OR
        EXISTS(SELECT 1 FROM app.subfamilies WHERE tree_id=$1 AND parent_subfamily_id=$2 AND deleted_at IS NULL) OR
        EXISTS(SELECT 1 FROM app.branch_grants WHERE tree_id=$1 AND root_subfamily_id=$2 AND revoked_at IS NULL) OR
        EXISTS(SELECT 1 FROM app.contributor_invitations WHERE tree_id=$1 AND branch_id=$2 AND status='pending') OR
        EXISTS(SELECT 1 FROM app.ownership_transfers WHERE tree_id=$1 AND branch_id=$2 AND status='pending') OR
        EXISTS(SELECT 1 FROM app.subfamily_attachments WHERE tree_id=$1 AND subfamily_id=$2)
      ) blocked`,
      [treeId, branchId, branch.rows[0].linked_male_id],
    );
    if (blockers.rows[0].blocked) throw new ApiError("BRANCH_IN_USE", 409);
    await client.query(
      "UPDATE app.subfamilies SET deleted_at=now(),version=version+1,updated_at=now() WHERE tree_id=$1 AND id=$2",
      [treeId, branchId],
    );
    await client.query(
      `INSERT INTO app.tree_activity(
         tree_id,actor_user_id,action_type,target_type,target_id,target_name_en,target_name_ar
       ) VALUES($1,$2,'branch_deleted','branch',$3,$4,$5)`,
      [treeId, session.user_id, branchId, branch.rows[0].name_en, branch.rows[0].name_ar],
    );
    const version = await finishTreeMutation(client, treeId, body.expectedVersion, body.batchId);
    return { deleted: true, version };
  });
  return json(result);
}

export async function handleBranchRequest(
  request: Request,
  url: URL,
  session: CollaborationSession,
  requestId: string,
): Promise<Response | undefined> {
  const collection = url.pathname.match(/^\/api\/trees\/([0-9a-f-]+)\/branches$/);
  if (collection && request.method === "POST")
    return createBranch(request, collection[1], session, requestId);
  const item = url.pathname.match(/^\/api\/trees\/([0-9a-f-]+)\/branches\/([0-9a-f-]+)$/);
  if (!item) return undefined;
  if (request.method === "PATCH")
    return updateBranch(request, item[1], item[2], session, requestId);
  if (request.method === "DELETE")
    return deleteBranch(request, item[1], item[2], session, requestId);
  return undefined;
}
