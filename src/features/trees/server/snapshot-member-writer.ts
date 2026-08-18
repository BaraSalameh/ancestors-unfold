import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import type { SnapshotInput } from "@/server/security";

type SnapshotMember = NonNullable<SnapshotInput["members"]>[number];

interface SnapshotEntityMaps {
  memberIds: Map<string, string>;
  subfamilyIds: Map<string, string>;
}

export async function writeSnapshotMembers(
  client: PoolClient,
  treeId: string,
  userId: string,
  batchId: string,
  snapshot: SnapshotInput,
  editablePayloadMembers: SnapshotMember[],
  isBranchEditor: boolean,
  branchRootId: string | null,
  existingMemberIds: Set<string>,
  allowedMembers: Set<string>,
  editableIds: Set<string>,
  sourceMemberIds: ReadonlyMap<string, string> = new Map(),
  sourceBranchIds: ReadonlyMap<string, string> = new Map(),
): Promise<SnapshotEntityMaps> {
  const { memberIds, subfamilyIds } = await prepareSnapshotMembers(
    client,
    treeId,
    batchId,
    snapshot,
    isBranchEditor,
    sourceBranchIds,
  );
  await upsertSnapshotMembers(
    client,
    treeId,
    userId,
    batchId,
    editablePayloadMembers,
    isBranchEditor,
    branchRootId,
    existingMemberIds,
    memberIds,
    subfamilyIds,
    sourceMemberIds,
  );
  if (isBranchEditor)
    await attachNewBranchMembers(
      client,
      treeId,
      userId,
      branchRootId,
      editablePayloadMembers,
      allowedMembers,
      editableIds,
    );
  return { memberIds, subfamilyIds };
}

// Snapshot preparation branches across full-tree and scoped editor persistence rules.
async function prepareSnapshotMembers(
  client: PoolClient,
  treeId: string,
  batchId: string,
  snapshot: SnapshotInput,
  isBranchEditor: boolean,
  sourceBranchIds: ReadonlyMap<string, string>,
): Promise<SnapshotEntityMaps> {
  const memberIds = new Map<string, string>(),
    subfamilyIds = new Map<string, string>();
  for (const member of snapshot.members ?? []) memberIds.set(member.id, member.id);
  for (const subfamily of snapshot.subfamilies ?? []) subfamilyIds.set(subfamily.id, subfamily.id);
  if (!isBranchEditor)
    await client.query(
      "UPDATE app.family_members SET subfamily_id=NULL WHERE tree_id=$1 AND deleted_at IS NULL",
      [treeId],
    );
  if (!isBranchEditor)
    await client.query(
      "UPDATE app.subfamilies SET parent_subfamily_id=NULL,deleted_at=now() WHERE tree_id=$1 AND deleted_at IS NULL",
      [treeId],
    );
  if (!isBranchEditor)
    await client.query(
      "UPDATE app.family_members SET deleted_at=now() WHERE tree_id=$1 AND deleted_at IS NULL",
      [treeId],
    );
  const branchRows = (isBranchEditor ? [] : (snapshot.subfamilies ?? [])).map((branch) => {
    const id = /^[0-9a-f]{8}-/.test(branch.id) ? branch.id : randomUUID();
    subfamilyIds.set(branch.id, id);
    return {
      id,
      source_id: sourceBranchIds.get(branch.id) ?? branch.id,
      name_en: branch.name_en,
      name_ar: branch.name_ar || null,
      notes: branch.notes || null,
    };
  });
  if (branchRows.length) {
    await client.query(
      `INSERT INTO app.subfamilies(id,tree_id,name_en,name_ar,notes)
       SELECT id,$2,name_en,name_ar,notes
       FROM jsonb_to_recordset($1::jsonb) AS input(
         id uuid,source_id text,name_en text,name_ar text,notes text
       )
       ON CONFLICT(id) DO UPDATE SET name_en=excluded.name_en,name_ar=excluded.name_ar,
         notes=excluded.notes,deleted_at=NULL`,
      [JSON.stringify(branchRows), treeId],
    );
    await client.query(
      `INSERT INTO app.import_id_map(import_batch_id,entity_type,source_id,target_id,status)
       SELECT $2,'subfamily',source_id,id,'mapped'
       FROM jsonb_to_recordset($1::jsonb) AS input(
         id uuid,source_id text,name_en text,name_ar text,notes text
       ) ON CONFLICT DO NOTHING`,
      [JSON.stringify(branchRows), batchId],
    );
  }
  return { memberIds, subfamilyIds };
}

async function upsertSnapshotMembers(
  client: PoolClient,
  treeId: string,
  userId: string,
  batchId: string,
  editablePayloadMembers: SnapshotMember[],
  isBranchEditor: boolean,
  branchRootId: string | null,
  existingMemberIds: Set<string>,
  memberIds: Map<string, string>,
  subfamilyIds: Map<string, string>,
  sourceMemberIds: ReadonlyMap<string, string>,
): Promise<void> {
  if (!isBranchEditor) {
    await bulkUpsertSnapshotMembers(
      client,
      treeId,
      userId,
      batchId,
      editablePayloadMembers,
      memberIds,
      subfamilyIds,
      sourceMemberIds,
    );
    return;
  }
  for (const m of editablePayloadMembers) {
    const id = /^[0-9a-f]{8}-/.test(m.id) ? m.id : randomUUID();
    memberIds.set(m.id, id);
    const values = snapshotMemberValues(
      m,
      id,
      treeId,
      userId,
      subfamilyIds,
      isBranchEditor,
      branchRootId,
    );
    if (isBranchEditor && existingMemberIds.has(m.id))
      await client.query(
        `UPDATE app.family_members SET name_en=$3,name_ar=$4,gender=$5,birth_date=$6,
            death_date=$7,is_deceased=$8,citizen_status=$9,image_url=$10,image_public_id=$11,image_asset_id=$12,
            notes=$13,is_unknown=$14,pos_x=$15,pos_y=$16,
            updated_by=$17,updated_at=now(),version=version+1
           WHERE id=$1 AND tree_id=$2 AND deleted_at IS NULL`,
        [...values.slice(0, 16), userId],
      );
    else
      await client.query(
        `INSERT INTO app.family_members(id,tree_id,name_en,name_ar,gender,birth_date,death_date,is_deceased,citizen_status,image_url,image_public_id,image_asset_id,notes,is_unknown,pos_x,pos_y,subfamily_id,created_by,updated_by)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$18) ON CONFLICT(id) DO UPDATE SET name_en=excluded.name_en,name_ar=excluded.name_ar,gender=excluded.gender,birth_date=excluded.birth_date,death_date=excluded.death_date,is_deceased=excluded.is_deceased,citizen_status=excluded.citizen_status,image_url=excluded.image_url,image_public_id=excluded.image_public_id,image_asset_id=excluded.image_asset_id,notes=excluded.notes,is_unknown=excluded.is_unknown,pos_x=excluded.pos_x,pos_y=excluded.pos_y,updated_by=excluded.updated_by,updated_at=now(),version=app.family_members.version+1,deleted_at=NULL`,
        values,
      );
    await client.query(
      `UPDATE app.users u SET profile_gender=$2,updated_at=now()
         FROM app.family_members fm
         WHERE fm.id=$1 AND fm.linked_user_id=u.id AND u.profile_gender<>$2`,
      [id, m.gender],
    );
    await client.query(
      `INSERT INTO app.import_id_map(import_batch_id,entity_type,source_id,target_id,status) VALUES($1,'member',$2,$3,'mapped') ON CONFLICT DO NOTHING`,
      [batchId, sourceMemberIds.get(m.id) ?? m.id, id],
    );
  }
}

async function bulkUpsertSnapshotMembers(
  client: PoolClient,
  treeId: string,
  userId: string,
  batchId: string,
  members: SnapshotMember[],
  memberIds: Map<string, string>,
  subfamilyIds: Map<string, string>,
  sourceMemberIds: ReadonlyMap<string, string>,
) {
  const rows = members.map((member) => {
    const id = /^[0-9a-f]{8}-/.test(member.id) ? member.id : randomUUID();
    memberIds.set(member.id, id);
    return {
      ...member,
      id,
      source_id: sourceMemberIds.get(member.id) ?? member.id,
      subfamily_id: member.subfamily_id ? (subfamilyIds.get(member.subfamily_id) ?? null) : null,
      is_deceased: member.is_deceased ?? Boolean(member.death_date),
      citizen_status: member.citizen_status ?? "resident",
    };
  });
  if (!rows.length) return;
  const serialized = JSON.stringify(rows);
  await client.query(
    `INSERT INTO app.family_members(
       id,tree_id,name_en,name_ar,gender,birth_date,death_date,is_deceased,citizen_status,
       image_url,image_public_id,image_asset_id,notes,is_unknown,pos_x,pos_y,subfamily_id,
       created_by,updated_by
     )
     SELECT input.id,$2,input.name_en,input.name_ar,input.gender,input.birth_date,input.death_date,
            input.is_deceased,input.citizen_status,input.image_url,input.image_public_id,
            input.image_asset_id,input.notes,coalesce(input.is_unknown,false),input.pos_x,input.pos_y,
            input.subfamily_id,$3,$3
     FROM jsonb_to_recordset($1::jsonb) AS input(
       id uuid,source_id text,name_en text,name_ar text,gender app.gender,birth_date date,
       death_date date,is_deceased boolean,citizen_status app.citizen_status,image_url text,
       image_public_id text,image_asset_id text,notes text,is_unknown boolean,
       pos_x double precision,pos_y double precision,subfamily_id uuid
     )
     ON CONFLICT(id) DO UPDATE SET name_en=excluded.name_en,name_ar=excluded.name_ar,
       gender=excluded.gender,birth_date=excluded.birth_date,death_date=excluded.death_date,
       is_deceased=excluded.is_deceased,citizen_status=excluded.citizen_status,
       image_url=excluded.image_url,image_public_id=excluded.image_public_id,
       image_asset_id=excluded.image_asset_id,notes=excluded.notes,is_unknown=excluded.is_unknown,
       pos_x=excluded.pos_x,pos_y=excluded.pos_y,subfamily_id=excluded.subfamily_id,
       updated_by=excluded.updated_by,updated_at=now(),version=app.family_members.version+1,
       deleted_at=NULL`,
    [serialized, treeId, userId],
  );
  await client.query(
    `UPDATE app.users account SET profile_gender=member.gender,updated_at=now()
     FROM app.family_members member
     WHERE member.tree_id=$1 AND member.id=ANY($2::uuid[])
       AND member.linked_user_id=account.id AND account.profile_gender<>member.gender`,
    [treeId, rows.map(({ id }) => id)],
  );
  await client.query(
    `INSERT INTO app.import_id_map(import_batch_id,entity_type,source_id,target_id,status)
     SELECT $2,'member',source_id,id,'mapped'
     FROM jsonb_to_recordset($1::jsonb) AS input(id uuid,source_id text)
     ON CONFLICT DO NOTHING`,
    [serialized, batchId],
  );
}

function snapshotMemberValues(
  member: SnapshotMember,
  id: string,
  treeId: string,
  userId: string,
  subfamilyIds: Map<string, string>,
  isBranchEditor: boolean,
  branchRootId: string | null,
): unknown[] {
  const isDeceased = member.is_deceased ?? Boolean(member.death_date);
  return [
    id,
    treeId,
    emptyToNull(member.name_en),
    emptyToNull(member.name_ar),
    member.gender,
    emptyToNull(member.birth_date),
    emptyToNull(member.death_date),
    isDeceased,
    emptyToNull(member.citizen_status),
    emptyToNull(member.image_url),
    emptyToNull(member.image_public_id),
    emptyToNull(member.image_asset_id),
    emptyToNull(member.notes),
    !!member.is_unknown,
    member.pos_x ?? null,
    member.pos_y ?? null,
    member.subfamily_id
      ? (subfamilyIds.get(member.subfamily_id) ?? null)
      : isBranchEditor
        ? branchRootId
        : null,
    userId,
  ];
}

function emptyToNull<T>(value: T | null | undefined): T | null {
  return value || null;
}

async function attachNewBranchMembers(
  client: PoolClient,
  treeId: string,
  userId: string,
  branchRootId: string | null,
  editablePayloadMembers: SnapshotMember[],
  allowedMembers: Set<string>,
  editableIds: Set<string>,
): Promise<void> {
  const attachedIds = new Set(allowedMembers);
  let changed = true;
  while (changed) {
    changed = false;
    for (const member of editablePayloadMembers)
      for (const relatedId of [
        member.father_id,
        member.mother_id,
        member.spouse_id,
        ...(member.spouse_ids ?? []),
      ])
        if (
          relatedId &&
          ((attachedIds.has(member.id) && !attachedIds.has(relatedId)) ||
            (attachedIds.has(relatedId) && !attachedIds.has(member.id)))
        ) {
          attachedIds.add(member.id);
          attachedIds.add(relatedId);
          changed = true;
        }
  }
  const newlyAttached = [...attachedIds].filter(
    (id) => editableIds.has(id) && !allowedMembers.has(id),
  );
  if (newlyAttached.length)
    await client.query(
      `UPDATE app.family_members SET subfamily_id=$1,updated_by=$3,updated_at=now()
           WHERE tree_id=$2 AND id=ANY($4::uuid[])`,
      [branchRootId, treeId, userId, newlyAttached],
    );
}
