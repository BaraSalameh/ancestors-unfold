import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import type { SnapshotInput } from "@/server/security";

type SnapshotMember = NonNullable<SnapshotInput["members"]>[number];

interface SpousePair {
  a: string;
  b: string;
  divorced: boolean;
  order: number;
}

export async function writeSnapshotRelationships(
  client: PoolClient,
  treeId: string,
  userId: string,
  snapshot: SnapshotInput,
  editablePayloadMembers: SnapshotMember[],
  isBranchEditor: boolean,
  mutableMembers: Set<string>,
  editableIds: Set<string>,
  map: Map<string, string>,
  sfMap: Map<string, string>,
): Promise<void> {
  await clearSnapshotRelationships(client, treeId, isBranchEditor, mutableMembers);
  await writeParentRelationships(
    client,
    treeId,
    userId,
    editablePayloadMembers,
    isBranchEditor,
    mutableMembers,
    editableIds,
    map,
  );
  const pairs = snapshotSpousePairs(editablePayloadMembers, map);
  await writeSpouseRelationships(client, treeId, userId, pairs, isBranchEditor);
  await linkSnapshotSubfamilies(client, snapshot, isBranchEditor, map, sfMap);
  await writeExternalChildren(client, treeId, editablePayloadMembers, map);
}

async function clearSnapshotRelationships(
  client: PoolClient,
  treeId: string,
  isBranchEditor: boolean,
  mutableMembers: Set<string>,
): Promise<void> {
  await client.query(
    isBranchEditor
      ? `UPDATE app.unions SET deleted_at=now() WHERE tree_id=$1 AND deleted_at IS NULL
           AND id IN (
             SELECT union_id FROM app.union_partners GROUP BY union_id
             HAVING bool_and(member_id=ANY($2::uuid[]))
           )`
      : "UPDATE app.unions SET deleted_at=now() WHERE tree_id=$1 AND deleted_at IS NULL",
    isBranchEditor ? [treeId, [...mutableMembers]] : [treeId],
  );
  await client.query(
    isBranchEditor
      ? `UPDATE app.external_children SET deleted_at=now()
           WHERE tree_id=$1 AND deleted_at IS NULL AND mother_id=ANY($2::uuid[])`
      : "UPDATE app.external_children SET deleted_at=now() WHERE tree_id=$1 AND deleted_at IS NULL",
    isBranchEditor ? [treeId, [...mutableMembers]] : [treeId],
  );
  await client.query(
    isBranchEditor
      ? `UPDATE app.parent_child_relationships SET deleted_at=now()
           WHERE tree_id=$1 AND deleted_at IS NULL
             AND child_id=ANY($2::uuid[]) AND parent_id=ANY($2::uuid[])`
      : "UPDATE app.parent_child_relationships SET deleted_at=now() WHERE tree_id=$1 AND deleted_at IS NULL",
    isBranchEditor ? [treeId, [...mutableMembers]] : [treeId],
  );
}

async function writeParentRelationships(
  client: PoolClient,
  treeId: string,
  userId: string,
  members: SnapshotMember[],
  isBranchEditor: boolean,
  mutableMembers: Set<string>,
  editableIds: Set<string>,
  map: Map<string, string>,
): Promise<void> {
  if (!isBranchEditor) {
    const rows = members.flatMap((member) =>
      (
        [
          ["father", member.father_id],
          ["mother", member.mother_id],
        ] as const
      ).flatMap(([role, parentId]) => {
        const child = map.get(member.id);
        const parent = parentId ? map.get(parentId) : undefined;
        return child && parent ? [{ child_id: child, parent_id: parent, role }] : [];
      }),
    );
    if (rows.length)
      await client.query(
        `INSERT INTO app.parent_child_relationships(
           tree_id,child_id,parent_id,parent_role,created_by
         )
         SELECT $1,child_id,parent_id,role,$3
         FROM jsonb_to_recordset($2::jsonb) AS input(
           child_id uuid,parent_id uuid,role app.parent_role
         )`,
        [treeId, JSON.stringify(rows), userId],
      );
    return;
  }
  for (const m of members)
    for (const [role, key] of [
      ["father", "father_id"],
      ["mother", "mother_id"],
    ] as const)
      if (
        m[key] &&
        map.get(m[key]) &&
        (!isBranchEditor || mutableMembers.has(m[key]) || editableIds.has(m[key]))
      )
        await client.query(
          `INSERT INTO app.parent_child_relationships(tree_id,child_id,parent_id,parent_role,created_by) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING`,
          [treeId, map.get(m.id), map.get(m[key]), role, userId],
        );
}

function snapshotSpousePairs(
  members: SnapshotMember[],
  map: Map<string, string>,
): Map<string, SpousePair> {
  const pairs = new Map<string, { a: string; b: string; divorced: boolean; order: number }>();
  for (const [memberOrder, m] of members.entries())
    for (const [spouseOrder, spouse] of [
      ...(m.spouse_ids ?? []),
      ...(m.spouse_id ? [m.spouse_id] : []),
      ...(m.divorced_from ?? []),
    ].entries()) {
      if (!map.get(spouse) || spouse === m.id) continue;
      const ids = [map.get(m.id)!, map.get(spouse)!].sort(),
        key = ids.join(":"),
        existing = pairs.get(key),
        candidateOrder =
          (m.gender === "male" ? 0 : members.length * 101) + memberOrder * 101 + spouseOrder;
      pairs.set(key, {
        a: ids[0],
        b: ids[1],
        divorced: (m.divorced_from ?? []).includes(spouse) || (existing?.divorced ?? false),
        order: Math.min(existing?.order ?? candidateOrder, candidateOrder),
      });
    }
  return pairs;
}

async function writeSpouseRelationships(
  client: PoolClient,
  treeId: string,
  userId: string,
  pairs: Map<string, SpousePair>,
  isBranchEditor: boolean,
): Promise<void> {
  if (isBranchEditor) {
    for (const pair of pairs.values()) {
      const existing = await client.query<{ id: string }>(
        `SELECT union_record.id FROM app.unions union_record
         JOIN app.union_partners first_partner
           ON first_partner.union_id=union_record.id AND first_partner.member_id=$2
         JOIN app.union_partners second_partner
           ON second_partner.union_id=union_record.id AND second_partner.member_id=$3
         WHERE union_record.tree_id=$1 AND union_record.deleted_at IS NULL`,
        [treeId, pair.a, pair.b],
      );
      if (existing.rowCount) {
        await client.query("UPDATE app.unions SET status=$2 WHERE id=$1", [
          existing.rows[0].id,
          pair.divorced ? "divorced" : "current",
        ]);
        continue;
      }
      const id = randomUUID();
      await client.query(
        `INSERT INTO app.unions(
           id,tree_id,status,display_order,created_by,updated_by
         ) VALUES($1,$2,$3,$4,$5,$5)`,
        [id, treeId, pair.divorced ? "divorced" : "current", pair.order, userId],
      );
      await client.query(
        `INSERT INTO app.union_partners(
           union_id,tree_id,member_id,display_order
         ) VALUES($1,$2,$3,0),($1,$2,$4,1)`,
        [id, treeId, pair.a, pair.b],
      );
    }
    return;
  }
  const rows = [...pairs.values()].map((pair) => ({
    id: randomUUID(),
    a: pair.a,
    b: pair.b,
    status: pair.divorced ? "divorced" : "current",
    display_order: pair.order,
  }));
  if (!rows.length) return;
  const serialized = JSON.stringify(rows);
  await client.query(
    `INSERT INTO app.unions(id,tree_id,status,display_order,created_by,updated_by)
     SELECT id,$1,status,display_order,$2,$2
     FROM jsonb_to_recordset($3::jsonb) AS input(
       id uuid,a uuid,b uuid,status app.union_status,display_order integer
     )`,
    [treeId, userId, serialized],
  );
  await client.query(
    `INSERT INTO app.union_partners(union_id,tree_id,member_id,display_order)
     SELECT id,$1,a,0
     FROM jsonb_to_recordset($2::jsonb) AS input(id uuid,a uuid,b uuid)
     UNION ALL
     SELECT id,$1,b,1
     FROM jsonb_to_recordset($2::jsonb) AS input(id uuid,a uuid,b uuid)`,
    [treeId, serialized],
  );
}

async function linkSnapshotSubfamilies(
  client: PoolClient,
  snapshot: SnapshotInput,
  isBranchEditor: boolean,
  map: Map<string, string>,
  sfMap: Map<string, string>,
): Promise<void> {
  const rows = (isBranchEditor ? [] : (snapshot.subfamilies ?? [])).map((branch) => ({
    id: sfMap.get(branch.id),
    linked_male_id: branch.linked_male_id ? (map.get(branch.linked_male_id) ?? null) : null,
  }));
  if (rows.length)
    await client.query(
      `UPDATE app.subfamilies branch SET linked_male_id=input.linked_male_id
       FROM jsonb_to_recordset($1::jsonb) AS input(id uuid,linked_male_id uuid)
       WHERE branch.id=input.id`,
      [JSON.stringify(rows)],
    );
}

async function writeExternalChildren(
  client: PoolClient,
  treeId: string,
  members: SnapshotMember[],
  map: Map<string, string>,
): Promise<void> {
  const rows = members.flatMap((member) =>
    (member.external_children ?? []).map((child) => ({
      mother_id: map.get(member.id),
      name: child.name,
      other_parent_name: child.other_parent_name || null,
      birth_year: child.birth_year ? Number(child.birth_year) : null,
      notes: child.notes || null,
    })),
  );
  if (rows.length)
    await client.query(
      `INSERT INTO app.external_children(
         tree_id,mother_id,name,other_parent_name,birth_year,notes
       )
       SELECT $1,mother_id,name,other_parent_name,birth_year,notes
       FROM jsonb_to_recordset($2::jsonb) AS input(
         mother_id uuid,name text,other_parent_name text,birth_year smallint,notes text
       )`,
      [treeId, JSON.stringify(rows)],
    );
}
