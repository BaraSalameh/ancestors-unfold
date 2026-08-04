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
  await writeSpouseRelationships(client, treeId, userId, pairs);
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
  for (const [order, m] of members.entries())
    for (const spouse of [
      ...(m.spouse_ids ?? []),
      ...(m.spouse_id ? [m.spouse_id] : []),
      ...(m.divorced_from ?? []),
    ]) {
      if (!map.get(spouse) || spouse === m.id) continue;
      const ids = [map.get(m.id)!, map.get(spouse)!].sort(),
        key = ids.join(":");
      pairs.set(key, {
        a: ids[0],
        b: ids[1],
        divorced: (m.divorced_from ?? []).includes(spouse) || (pairs.get(key)?.divorced ?? false),
        order,
      });
    }
  return pairs;
}

async function writeSpouseRelationships(
  client: PoolClient,
  treeId: string,
  userId: string,
  pairs: Map<string, SpousePair>,
): Promise<void> {
  for (const pair of pairs.values()) {
    const existing = await client.query(
      `SELECT u.id FROM app.unions u JOIN app.union_partners a ON a.union_id=u.id AND a.member_id=$2 JOIN app.union_partners b ON b.union_id=u.id AND b.member_id=$3 WHERE u.tree_id=$1 AND u.deleted_at IS NULL`,
      [treeId, pair.a, pair.b],
    );
    if (existing.rowCount) {
      await client.query("UPDATE app.unions SET status=$2 WHERE id=$1", [
        existing.rows[0].id,
        pair.divorced ? "divorced" : "current",
      ]);
      continue;
    }
    const union = await client.query(
      "INSERT INTO app.unions(tree_id,status,display_order,created_by,updated_by) VALUES($1,$2,$3,$4,$4) RETURNING id",
      [treeId, pair.divorced ? "divorced" : "current", pair.order, userId],
    );
    await client.query(
      "INSERT INTO app.union_partners(union_id,tree_id,member_id,display_order) VALUES($1,$2,$3,0),($1,$2,$4,1)",
      [union.rows[0].id, treeId, pair.a, pair.b],
    );
  }
}

async function linkSnapshotSubfamilies(
  client: PoolClient,
  snapshot: SnapshotInput,
  isBranchEditor: boolean,
  map: Map<string, string>,
  sfMap: Map<string, string>,
): Promise<void> {
  for (const sf of isBranchEditor ? [] : (snapshot.subfamilies ?? []))
    await client.query("UPDATE app.subfamilies SET linked_male_id=$1 WHERE id=$2", [
      sf.linked_male_id ? (map.get(sf.linked_male_id) ?? null) : null,
      sfMap.get(sf.id),
    ]);
}

async function writeExternalChildren(
  client: PoolClient,
  treeId: string,
  members: SnapshotMember[],
  map: Map<string, string>,
): Promise<void> {
  for (const m of members) {
    for (const x of m.external_children ?? [])
      await client.query(
        `INSERT INTO app.external_children(tree_id,mother_id,name,other_parent_name,birth_year,notes)
        SELECT $1,$2,$3,$4,$5,$6 WHERE NOT EXISTS(SELECT 1 FROM app.external_children WHERE tree_id=$1 AND mother_id=$2 AND name=$3 AND deleted_at IS NULL)`,
        [
          treeId,
          map.get(m.id),
          x.name,
          x.other_parent_name || null,
          x.birth_year ? Number(x.birth_year) : null,
          x.notes || null,
        ],
      );
  }
}
