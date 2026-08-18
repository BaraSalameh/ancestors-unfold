import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import type { SnapshotDeltaInput } from "@/server/snapshot-delta-schema";
import { ApiError } from "@/server/security";
import { transaction } from "@/shared/server/database";
import type { SessionContext } from "./snapshot-reader";
import {
  authorizeSnapshotWrite,
  completedSnapshotWrite,
  lockSnapshotVersion,
} from "./snapshot-write-preparation";
import { validateSnapshotImages } from "./snapshot-image-validation";
import {
  authorizeDeltaScope,
  rejectProtectedDeletes,
  validateDeltaBranches,
  validateDeltaReferences,
} from "./snapshot-delta-validation";

type DeltaMember = SnapshotDeltaInput["upsertMembers"][number];

export async function applySnapshotDelta(
  session: SessionContext,
  requestId: string,
  treeId: string,
  delta: SnapshotDeltaInput,
) {
  return transaction(session.user_id, session.id, requestId, async (client) => {
    const access = await authorizeSnapshotWrite(client, treeId, session.user_id);
    const completed = await completedSnapshotWrite(client, treeId, delta.batchId);
    if (completed) return completed;
    await client.query("SELECT set_config('app.correlation_id',$1,true)", [delta.batchId]);
    const expectedVersion = await lockSnapshotVersion(client, treeId, delta.expectedVersion);
    await authorizeDeltaScope(client, treeId, session.user_id, delta, access);
    await validateDeltaReferences(client, treeId, delta);
    await validateDeltaBranches(client, treeId, delta);
    await validateSnapshotImages(client, treeId, delta.upsertMembers);
    await rejectProtectedDeletes(client, treeId, delta.deleteMemberIds, delta.deleteSubfamilyIds);
    await upsertBranches(client, treeId, delta, access.branchRootId);
    await upsertDeltaMembers(client, treeId, session.user_id, delta, access.branchRootId);
    await linkDeltaBranches(client, delta);
    await reconcileTouchedRelationships(client, treeId, session.user_id, delta);
    await softDeleteEntities(client, treeId, delta);
    await client.query("SELECT app.reconcile_branch_structure($1)", [treeId]);
    const updated = await client.query<{ version: number }>(
      "UPDATE app.family_trees SET version=version+1 WHERE id=$1 RETURNING version",
      [treeId],
    );
    await client.query("SELECT app.store_tree_snapshot($1::uuid,$2::bigint,$3::bigint,$4::uuid)", [
      treeId,
      updated.rows[0].version,
      expectedVersion,
      delta.batchId,
    ]);
    return {
      batchId: delta.batchId,
      mapped: delta.upsertMembers.length + delta.upsertSubfamilies.length,
      reconciled: true as const,
      version: updated.rows[0].version,
    };
  });
}

async function upsertBranches(
  client: PoolClient,
  treeId: string,
  delta: SnapshotDeltaInput,
  branchRootId: string | null,
) {
  if (!delta.upsertSubfamilies.length) return;
  if (branchRootId) throw new ApiError("FORBIDDEN", 403);
  await client.query(
    `INSERT INTO app.subfamilies(
       id,tree_id,name_en,name_ar,linked_male_id,parent_subfamily_id,status,notes
     )
     SELECT input.id,$1::uuid,input.name_en,nullif(input.name_ar,''),NULL,NULL,
            coalesce(input.status,'active'::app.branch_status),
            nullif(input.notes,'')
     FROM jsonb_to_recordset($2::jsonb) AS input(
       id uuid,name_en text,name_ar text,linked_male_id uuid,parent_subfamily_id uuid,
       status app.branch_status,notes text
     )
     ON CONFLICT(id) DO UPDATE SET
       name_en=excluded.name_en,name_ar=excluded.name_ar,
       status=excluded.status,notes=excluded.notes,updated_at=now(),deleted_at=NULL`,
    [treeId, JSON.stringify(delta.upsertSubfamilies)],
  );
}

async function linkDeltaBranches(client: PoolClient, delta: SnapshotDeltaInput) {
  if (!delta.upsertSubfamilies.length) return;
  await client.query(
    `UPDATE app.subfamilies branch SET
       linked_male_id=input.linked_male_id,
       parent_subfamily_id=input.parent_subfamily_id,
       updated_at=now()
     FROM jsonb_to_recordset($1::jsonb) AS input(
       id uuid,linked_male_id uuid,parent_subfamily_id uuid
     )
     WHERE branch.id=input.id`,
    [JSON.stringify(delta.upsertSubfamilies)],
  );
}

export async function upsertDeltaMembers(
  client: PoolClient,
  treeId: string,
  userId: string,
  delta: SnapshotDeltaInput,
  branchRootId: string | null,
) {
  if (!delta.upsertMembers.length) return;
  await client.query(
    `INSERT INTO app.family_members(
       id,tree_id,name_en,name_ar,gender,birth_date,death_date,is_deceased,citizen_status,
       image_url,image_public_id,image_asset_id,notes,is_unknown,pos_x,pos_y,subfamily_id,
       created_by,updated_by
     )
     SELECT input.id,$1::uuid,input.name_en,input.name_ar,input.gender,input.birth_date,input.death_date,
            coalesce(input.is_deceased,input.death_date IS NOT NULL),
            coalesce(input.citizen_status,'resident'::app.citizen_status),input.image_url,
            input.image_public_id,input.image_asset_id,input.notes,coalesce(input.is_unknown,false),
            input.pos_x,input.pos_y,coalesce(input.subfamily_id,$4::uuid),$3::uuid,$3::uuid
     FROM jsonb_to_recordset($2::jsonb) AS input(
       id uuid,name_en text,name_ar text,gender app.gender,birth_date date,death_date date,
       is_deceased boolean,citizen_status app.citizen_status,image_url text,image_public_id text,
       image_asset_id text,notes text,is_unknown boolean,pos_x double precision,
       pos_y double precision,subfamily_id uuid
     )
     ON CONFLICT(id) DO UPDATE SET
       name_en=excluded.name_en,name_ar=excluded.name_ar,gender=excluded.gender,
       birth_date=excluded.birth_date,death_date=excluded.death_date,
       is_deceased=excluded.is_deceased,citizen_status=excluded.citizen_status,
       image_url=excluded.image_url,image_public_id=excluded.image_public_id,
       image_asset_id=excluded.image_asset_id,notes=excluded.notes,is_unknown=excluded.is_unknown,
       pos_x=excluded.pos_x,pos_y=excluded.pos_y,subfamily_id=excluded.subfamily_id,
       updated_by=excluded.updated_by,updated_at=now(),version=app.family_members.version+1,
       deleted_at=NULL`,
    [treeId, JSON.stringify(delta.upsertMembers), userId, branchRootId],
  );
  await client.query(
    `UPDATE app.users account SET profile_gender=member.gender,updated_at=now()
     FROM app.family_members member
     WHERE member.tree_id=$1 AND member.id=ANY($2::uuid[])
       AND member.linked_user_id=account.id AND account.profile_gender<>member.gender`,
    [treeId, delta.upsertMembers.map(({ id }) => id)],
  );
}

async function reconcileTouchedRelationships(
  client: PoolClient,
  treeId: string,
  userId: string,
  delta: SnapshotDeltaInput,
) {
  const touchedIds = [...delta.upsertMembers.map(({ id }) => id), ...delta.deleteMemberIds];
  if (!touchedIds.length) return;
  await reconcileTouchedParentRelationships(
    client,
    treeId,
    userId,
    delta.upsertMembers,
    delta.deleteMemberIds,
  );
  await reconcileUnions(client, treeId, userId, touchedIds, delta.upsertMembers);
  await reconcileExternalChildren(client, treeId, delta.upsertMembers);
}

export async function reconcileTouchedParentRelationships(
  client: PoolClient,
  treeId: string,
  userId: string,
  members: DeltaMember[],
  deleteMemberIds: string[],
) {
  const upsertIds = members.map(({ id }) => id);
  if (upsertIds.length)
    await client.query(
      `UPDATE app.parent_child_relationships SET deleted_at=now()
       WHERE tree_id=$1 AND deleted_at IS NULL AND child_id=ANY($2::uuid[])`,
      [treeId, upsertIds],
    );
  if (deleteMemberIds.length)
    await client.query(
      `UPDATE app.parent_child_relationships SET deleted_at=now()
       WHERE tree_id=$1 AND deleted_at IS NULL
         AND (child_id=ANY($2::uuid[]) OR parent_id=ANY($2::uuid[]))`,
      [treeId, deleteMemberIds],
    );
  if (members.length)
    await client.query(
      `INSERT INTO app.parent_child_relationships(
         tree_id,child_id,parent_id,parent_role,created_by
       )
       SELECT $1::uuid,input.id,input.father_id,'father'::app.parent_role,$3::uuid
       FROM jsonb_to_recordset($2::jsonb) AS input(id uuid,father_id uuid,mother_id uuid)
       WHERE input.father_id IS NOT NULL
       UNION ALL
       SELECT $1::uuid,input.id,input.mother_id,'mother'::app.parent_role,$3::uuid
       FROM jsonb_to_recordset($2::jsonb) AS input(id uuid,father_id uuid,mother_id uuid)
       WHERE input.mother_id IS NOT NULL`,
      [treeId, JSON.stringify(members), userId],
    );
}

// Pair normalization intentionally handles reciprocal, ordered, and divorced relationship forms.
// eslint-disable-next-line complexity
function desiredSpousePairs(members: DeltaMember[]) {
  const pairs = new Map<
    string,
    {
      candidate_id: string;
      a: string;
      b: string;
      status: string;
      order: number;
      authoritative: boolean;
    }
  >();
  for (const [memberOrder, member] of members.entries())
    for (const [spouseOrder, spouseId] of [
      ...(member.spouse_ids ?? []),
      ...(member.spouse_id ? [member.spouse_id] : []),
      ...(member.divorced_from ?? []),
    ].entries()) {
      if (spouseId === member.id) continue;
      const [a, b] = [member.id, spouseId].sort();
      const key = `${a}:${b}`;
      const existing = pairs.get(key);
      const authoritative = member.gender === "male";
      const candidateOrder = memberOrder * 101 + spouseOrder;
      pairs.set(key, {
        candidate_id: existing?.candidate_id ?? randomUUID(),
        a,
        b,
        status:
          existing?.status === "divorced" || member.divorced_from?.includes(spouseId)
            ? "divorced"
            : "current",
        order:
          authoritative && !existing?.authoritative
            ? candidateOrder
            : existing?.authoritative && !authoritative
              ? existing.order
              : Math.min(existing?.order ?? Number.MAX_SAFE_INTEGER, candidateOrder),
        authoritative: authoritative || (existing?.authoritative ?? false),
      });
    }
  return [...pairs.values()];
}

async function reconcileUnions(
  client: PoolClient,
  treeId: string,
  userId: string,
  touchedIds: string[],
  members: DeltaMember[],
) {
  const desired = desiredSpousePairs(members);
  await client.query(
    `CREATE TEMP TABLE delta_desired_unions(
       candidate_id uuid PRIMARY KEY,a uuid NOT NULL,b uuid NOT NULL,
       status app.union_status NOT NULL,display_order integer NOT NULL,
       authoritative boolean NOT NULL,existing_id uuid
     ) ON COMMIT DROP`,
  );
  if (desired.length)
    await client.query(
      `INSERT INTO pg_temp.delta_desired_unions(
         candidate_id,a,b,status,display_order,authoritative
       )
       SELECT candidate_id,a,b,status,display_order,authoritative
       FROM jsonb_to_recordset($1::jsonb) AS input(
         candidate_id uuid,a uuid,b uuid,status app.union_status,display_order integer,
         authoritative boolean
       )`,
      [JSON.stringify(desired)],
    );
  await client.query(
    `WITH existing_pairs AS (
       SELECT union_record.id,
              (array_agg(partner.member_id ORDER BY partner.member_id))[1] a,
              (array_agg(partner.member_id ORDER BY partner.member_id))[2] b
       FROM app.unions union_record
       JOIN app.union_partners partner ON partner.union_id=union_record.id
       WHERE union_record.tree_id=$1 AND union_record.deleted_at IS NULL
       GROUP BY union_record.id HAVING count(*)=2
     )
     UPDATE pg_temp.delta_desired_unions desired SET existing_id=existing.id
     FROM existing_pairs existing WHERE desired.a=existing.a AND desired.b=existing.b`,
    [treeId],
  );
  await client.query(
    `UPDATE app.unions union_record SET
       status=desired.status,
       display_order=CASE WHEN desired.authoritative
         THEN desired.display_order ELSE union_record.display_order END,
       updated_by=$2,updated_at=now()
     FROM pg_temp.delta_desired_unions desired
     WHERE union_record.id=desired.existing_id AND union_record.tree_id=$1`,
    [treeId, userId],
  );
  await client.query(
    `UPDATE app.unions union_record SET deleted_at=now(),updated_by=$3,updated_at=now()
     WHERE union_record.tree_id=$1 AND union_record.deleted_at IS NULL
       AND EXISTS (
         SELECT 1 FROM app.union_partners partner
         WHERE partner.union_id=union_record.id AND partner.member_id=ANY($2::uuid[])
       )
       AND NOT EXISTS (
         SELECT 1 FROM pg_temp.delta_desired_unions desired
         WHERE desired.existing_id=union_record.id
       )`,
    [treeId, touchedIds, userId],
  );
  await client.query(
    `INSERT INTO app.unions(id,tree_id,status,display_order,created_by,updated_by)
     SELECT candidate_id,$1::uuid,status,display_order,$2::uuid,$2::uuid
     FROM pg_temp.delta_desired_unions WHERE existing_id IS NULL`,
    [treeId, userId],
  );
  await client.query(
    `INSERT INTO app.union_partners(union_id,tree_id,member_id,display_order)
     SELECT candidate_id,$1::uuid,a,0 FROM pg_temp.delta_desired_unions WHERE existing_id IS NULL
     UNION ALL
     SELECT candidate_id,$1::uuid,b,1 FROM pg_temp.delta_desired_unions WHERE existing_id IS NULL`,
    [treeId],
  );
}

async function reconcileExternalChildren(
  client: PoolClient,
  treeId: string,
  members: DeltaMember[],
) {
  if (!members.length) return;
  const motherIds = members.map(({ id }) => id);
  await client.query(
    `UPDATE app.external_children SET deleted_at=now()
     WHERE tree_id=$1 AND mother_id=ANY($2::uuid[]) AND deleted_at IS NULL`,
    [treeId, motherIds],
  );
  const rows = members.flatMap((member) =>
    (member.external_children ?? []).map((child) => ({
      mother_id: member.id,
      name: child.name,
      other_parent_name: child.other_parent_name,
      birth_year: child.birth_year ? Number(child.birth_year) : null,
      notes: child.notes,
    })),
  );
  if (!rows.length) return;
  await client.query(
    `INSERT INTO app.external_children(
       tree_id,mother_id,name,other_parent_name,birth_year,notes
     )
     SELECT $1::uuid,mother_id,name,other_parent_name,birth_year,notes
     FROM jsonb_to_recordset($2::jsonb) AS input(
       mother_id uuid,name text,other_parent_name text,birth_year smallint,notes text
     )`,
    [treeId, JSON.stringify(rows)],
  );
}

async function softDeleteEntities(client: PoolClient, treeId: string, delta: SnapshotDeltaInput) {
  if (delta.deleteMemberIds.length) {
    await client.query(
      `UPDATE app.external_children SET deleted_at=now()
       WHERE tree_id=$1 AND mother_id=ANY($2::uuid[]) AND deleted_at IS NULL`,
      [treeId, delta.deleteMemberIds],
    );
    await client.query(
      `UPDATE app.family_members SET deleted_at=now(),updated_at=now()
       WHERE tree_id=$1 AND id=ANY($2::uuid[]) AND deleted_at IS NULL`,
      [treeId, delta.deleteMemberIds],
    );
  }
  if (delta.deleteSubfamilyIds.length) {
    await client.query(
      `UPDATE app.family_members SET subfamily_id=NULL,updated_at=now()
       WHERE tree_id=$1 AND subfamily_id=ANY($2::uuid[]) AND deleted_at IS NULL`,
      [treeId, delta.deleteSubfamilyIds],
    );
    await client.query(
      `UPDATE app.subfamilies SET parent_subfamily_id=NULL,updated_at=now()
       WHERE tree_id=$1 AND parent_subfamily_id=ANY($2::uuid[]) AND deleted_at IS NULL`,
      [treeId, delta.deleteSubfamilyIds],
    );
    await client.query(
      `UPDATE app.subfamilies SET deleted_at=now(),updated_at=now()
       WHERE tree_id=$1 AND id=ANY($2::uuid[]) AND deleted_at IS NULL`,
      [treeId, delta.deleteSubfamilyIds],
    );
  }
}
