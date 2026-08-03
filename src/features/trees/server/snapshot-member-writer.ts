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
): Promise<SnapshotEntityMaps> {
  const { memberIds, subfamilyIds } = await prepareSnapshotMembers(
    client,
    treeId,
    snapshot,
    isBranchEditor,
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

async function prepareSnapshotMembers(
  client: PoolClient,
  treeId: string,
  snapshot: SnapshotInput,
  isBranchEditor: boolean,
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
  for (const sf of isBranchEditor ? [] : (snapshot.subfamilies ?? [])) {
    const id = /^[0-9a-f]{8}-/.test(sf.id) ? sf.id : randomUUID();
    subfamilyIds.set(sf.id, id);
    await client.query(
      `INSERT INTO app.subfamilies(id,tree_id,name_en,name_ar,notes,color) VALUES($1,$2,$3,$4,$5,$6)
        ON CONFLICT(id) DO UPDATE SET name_en=excluded.name_en,name_ar=excluded.name_ar,notes=excluded.notes,color=excluded.color,deleted_at=NULL`,
      [id, treeId, sf.name_en, sf.name_ar || null, sf.notes || null, sf.color || null],
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
): Promise<void> {
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
            notes=$13,is_unknown=$14,pos_x=$15,pos_y=$16,decade_pos_x=$17,decade_pos_y=$18,
            updated_by=$19,updated_at=now(),version=version+1
           WHERE id=$1 AND tree_id=$2 AND deleted_at IS NULL`,
        [...values.slice(0, 18), userId],
      );
    else
      await client.query(
        `INSERT INTO app.family_members(id,tree_id,name_en,name_ar,gender,birth_date,death_date,is_deceased,citizen_status,image_url,image_public_id,image_asset_id,notes,is_unknown,pos_x,pos_y,decade_pos_x,decade_pos_y,subfamily_id,created_by,updated_by)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$20) ON CONFLICT(id) DO UPDATE SET name_en=excluded.name_en,name_ar=excluded.name_ar,gender=excluded.gender,birth_date=excluded.birth_date,death_date=excluded.death_date,is_deceased=excluded.is_deceased,citizen_status=excluded.citizen_status,image_url=excluded.image_url,image_public_id=excluded.image_public_id,image_asset_id=excluded.image_asset_id,notes=excluded.notes,is_unknown=excluded.is_unknown,pos_x=excluded.pos_x,pos_y=excluded.pos_y,decade_pos_x=excluded.decade_pos_x,decade_pos_y=excluded.decade_pos_y,updated_by=excluded.updated_by,updated_at=now(),version=app.family_members.version+1,deleted_at=NULL`,
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
      [batchId, m.id, id],
    );
  }
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
    member.decade_pos_x ?? null,
    member.decade_pos_y ?? null,
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
