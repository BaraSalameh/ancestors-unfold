import { randomUUID } from "node:crypto";
import { transaction } from "@/server/infrastructure/database";
import { ApiError, type SnapshotInput } from "@/server/security";

type SessionContext = { id: string; user_id: string };

export async function readSnapshot(s: SessionContext, rid: string, treeId: string) {
  return transaction(s.user_id, s.id, rid, async (c) => {
    const tree = await c.query<{ version: number }>(
      `SELECT t.version FROM app.family_trees t JOIN app.tree_memberships m ON m.tree_id=t.id AND m.user_id=$2 AND m.revoked_at IS NULL WHERE t.id=$1 AND t.deleted_at IS NULL
      UNION SELECT t.version FROM app.family_trees t JOIN app.branch_grants g ON g.tree_id=t.id AND g.user_id=$2 AND g.revoked_at IS NULL WHERE t.id=$1 AND t.deleted_at IS NULL`,
      [treeId, s.user_id],
    );
    if (!tree.rowCount) throw new Error("FORBIDDEN");
    const members = await c.query(
      `SELECT m.*,
        coalesce(m.name_en, '') name_en,
        coalesce(m.name_ar, '') name_ar,
        f.parent_id father_id,mo.parent_id mother_id FROM app.family_members m
      LEFT JOIN app.parent_child_relationships f ON f.child_id=m.id AND f.parent_role='father' AND f.deleted_at IS NULL
      LEFT JOIN app.parent_child_relationships mo ON mo.child_id=m.id AND mo.parent_role='mother' AND mo.deleted_at IS NULL
      WHERE m.tree_id=$1 AND m.deleted_at IS NULL`,
      [treeId],
    );
    const subfamilies = await c.query(
      "SELECT * FROM app.subfamilies WHERE tree_id=$1 AND deleted_at IS NULL",
      [treeId],
    );
    const external = await c.query(
      "SELECT * FROM app.external_children WHERE tree_id=$1 AND deleted_at IS NULL",
      [treeId],
    );
    type PartnerRow = {
      union_id: string;
      status: string;
      member_id: string;
      display_order: number;
    };
    type MemberRow = Record<string, unknown> & { id: string };
    type ExternalRow = Record<string, unknown> & { mother_id: string };
    const partners = await c.query<PartnerRow>(
      `SELECT u.id union_id,u.status,p.member_id,p.display_order FROM app.unions u JOIN app.union_partners p ON p.union_id=u.id WHERE u.tree_id=$1 AND u.deleted_at IS NULL ORDER BY u.display_order,p.display_order`,
      [treeId],
    );
    const byUnion = new Map<string, PartnerRow[]>();
    for (const p of partners.rows) byUnion.set(p.union_id, [...(byUnion.get(p.union_id) ?? []), p]);
    const spouseMap = new Map<string, string[]>(),
      divorceMap = new Map<string, string[]>();
    for (const ps of byUnion.values())
      if (ps.length === 2)
        for (const [a, b] of [
          [ps[0], ps[1]],
          [ps[1], ps[0]],
        ]) {
          spouseMap.set(a.member_id, [...(spouseMap.get(a.member_id) ?? []), b.member_id]);
          if (a.status === "divorced")
            divorceMap.set(a.member_id, [...(divorceMap.get(a.member_id) ?? []), b.member_id]);
        }
    return {
      version: tree.rows[0].version,
      members: (members.rows as MemberRow[]).map((m) => ({
        id: m.id,
        name_en: m.name_en ?? "",
        name_ar: m.name_ar ?? "",
        gender: m.gender,
        birth_date: m.birth_date ?? undefined,
        death_date: m.death_date ?? undefined,
        citizen_status: m.citizen_status ?? undefined,
        notes: m.notes ?? undefined,
        father_id: m.father_id ?? undefined,
        mother_id: m.mother_id ?? undefined,
        spouse_id: spouseMap.get(m.id)?.[0],
        spouse_ids: spouseMap.get(m.id),
        divorced_from: divorceMap.get(m.id),
        is_unknown: m.is_unknown || undefined,
        external_children: (external.rows as ExternalRow[])
          .filter((x) => x.mother_id === m.id)
          .map((x) => ({
            id: x.id,
            name: x.name,
            other_parent_name: x.other_parent_name ?? undefined,
            birth_year: x.birth_year == null ? undefined : String(x.birth_year),
            notes: x.notes ?? undefined,
          })),
        subfamily_id: m.subfamily_id ?? undefined,
        pos_x: m.pos_x ?? undefined,
        pos_y: m.pos_y ?? undefined,
        created_at: m.created_at,
        updated_at: m.updated_at,
      })),
      subfamilies: (subfamilies.rows as Array<Record<string, unknown>>).map((sf) => ({
        id: sf.id,
        name_en: sf.name_en,
        name_ar: sf.name_ar ?? "",
        linked_male_id: sf.linked_male_id ?? undefined,
        parent_subfamily_id: sf.parent_subfamily_id ?? undefined,
        notes: sf.notes ?? undefined,
        color: sf.color ?? undefined,
        created_at: sf.created_at,
        updated_at: sf.updated_at,
      })),
    };
  });
}

// Snapshot replacement is deliberately one serialized transaction to preserve version and RLS semantics.
// eslint-disable-next-line max-lines-per-function
export async function importSnapshot(
  s: SessionContext,
  rid: string,
  treeId: string,
  b: SnapshotInput,
) {
  // Keeping the complete reconciliation in this callback guarantees rollback on any failed entity write.
  // eslint-disable-next-line max-lines-per-function, complexity
  return transaction(s.user_id, s.id, rid, async (c) => {
    const access = await c.query(
      "SELECT 1 FROM app.tree_memberships WHERE tree_id=$1 AND user_id=$2 AND role IN ('owner','administrator','editor') AND revoked_at IS NULL",
      [treeId, s.user_id],
    );
    if (!access.rowCount) throw new Error("FORBIDDEN");
    const expectedVersion = Number(b.expectedVersion);
    if (!Number.isInteger(expectedVersion) || expectedVersion < 1)
      throw new ApiError("VERSION_REQUIRED", 428);
    const locked = await c.query<{ version: number }>(
      "SELECT version FROM app.family_trees WHERE id=$1 AND deleted_at IS NULL FOR UPDATE",
      [treeId],
    );
    if (!locked.rowCount) throw new ApiError("NOT_FOUND", 404);
    if (locked.rows[0].version !== expectedVersion) throw new ApiError("VERSION_CONFLICT", 409);
    const batch = b.batchId || randomUUID(),
      map = new Map<string, string>(),
      sfMap = new Map<string, string>();
    await c.query(
      "UPDATE app.family_members SET subfamily_id=NULL WHERE tree_id=$1 AND deleted_at IS NULL",
      [treeId],
    );
    await c.query(
      "UPDATE app.parent_child_relationships SET deleted_at=now() WHERE tree_id=$1 AND deleted_at IS NULL",
      [treeId],
    );
    await c.query(
      "UPDATE app.unions SET deleted_at=now() WHERE tree_id=$1 AND deleted_at IS NULL",
      [treeId],
    );
    await c.query(
      "UPDATE app.external_children SET deleted_at=now() WHERE tree_id=$1 AND deleted_at IS NULL",
      [treeId],
    );
    await c.query(
      "UPDATE app.subfamilies SET parent_subfamily_id=NULL,deleted_at=now() WHERE tree_id=$1 AND deleted_at IS NULL",
      [treeId],
    );
    await c.query(
      "UPDATE app.family_members SET deleted_at=now() WHERE tree_id=$1 AND deleted_at IS NULL",
      [treeId],
    );
    for (const sf of b.subfamilies ?? []) {
      const id = /^[0-9a-f]{8}-/.test(sf.id) ? sf.id : randomUUID();
      sfMap.set(sf.id, id);
      await c.query(
        `INSERT INTO app.subfamilies(id,tree_id,name_en,name_ar,notes,color) VALUES($1,$2,$3,$4,$5,$6)
        ON CONFLICT(id) DO UPDATE SET name_en=excluded.name_en,name_ar=excluded.name_ar,notes=excluded.notes,color=excluded.color,deleted_at=NULL`,
        [id, treeId, sf.name_en, sf.name_ar || null, sf.notes || null, sf.color || null],
      );
    }
    for (const m of b.members ?? []) {
      const id = /^[0-9a-f]{8}-/.test(m.id) ? m.id : randomUUID();
      map.set(m.id, id);
      await c.query(
        `INSERT INTO app.family_members(id,tree_id,name_en,name_ar,gender,birth_date,death_date,citizen_status,notes,is_unknown,pos_x,pos_y,created_by,updated_by)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$13) ON CONFLICT(id) DO UPDATE SET name_en=excluded.name_en,name_ar=excluded.name_ar,birth_date=excluded.birth_date,death_date=excluded.death_date,citizen_status=excluded.citizen_status,notes=excluded.notes,is_unknown=excluded.is_unknown,pos_x=excluded.pos_x,pos_y=excluded.pos_y,deleted_at=NULL`,
        [
          id,
          treeId,
          m.name_en || null,
          m.name_ar || null,
          m.gender,
          m.birth_date || null,
          m.death_date || null,
          m.citizen_status || null,
          m.notes || null,
          !!m.is_unknown,
          m.pos_x ?? null,
          m.pos_y ?? null,
          s.user_id,
        ],
      );
      await c.query(
        `INSERT INTO app.import_id_map(import_batch_id,entity_type,source_id,target_id,status) VALUES($1,'member',$2,$3,'mapped') ON CONFLICT DO NOTHING`,
        [batch, m.id, id],
      );
    }
    for (const m of b.members ?? [])
      for (const [role, key] of [
        ["father", "father_id"],
        ["mother", "mother_id"],
      ] as const)
        if (m[key] && map.get(m[key]))
          await c.query(
            `INSERT INTO app.parent_child_relationships(tree_id,child_id,parent_id,parent_role,created_by) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING`,
            [treeId, map.get(m.id), map.get(m[key]), role, s.user_id],
          );
    const pairs = new Map<string, { a: string; b: string; divorced: boolean; order: number }>();
    for (const [order, m] of (b.members ?? []).entries())
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
    for (const pair of pairs.values()) {
      const existing = await c.query(
        `SELECT u.id FROM app.unions u JOIN app.union_partners a ON a.union_id=u.id AND a.member_id=$2 JOIN app.union_partners b ON b.union_id=u.id AND b.member_id=$3 WHERE u.tree_id=$1 AND u.deleted_at IS NULL`,
        [treeId, pair.a, pair.b],
      );
      if (existing.rowCount) {
        await c.query("UPDATE app.unions SET status=$2 WHERE id=$1", [
          existing.rows[0].id,
          pair.divorced ? "divorced" : "current",
        ]);
        continue;
      }
      const union = await c.query(
        "INSERT INTO app.unions(tree_id,status,display_order,created_by,updated_by) VALUES($1,$2,$3,$4,$4) RETURNING id",
        [treeId, pair.divorced ? "divorced" : "current", pair.order, s.user_id],
      );
      await c.query(
        "INSERT INTO app.union_partners(union_id,tree_id,member_id,display_order) VALUES($1,$2,$3,0),($1,$2,$4,1)",
        [union.rows[0].id, treeId, pair.a, pair.b],
      );
    }
    for (const sf of b.subfamilies ?? [])
      await c.query(
        "UPDATE app.subfamilies SET parent_subfamily_id=$1,linked_male_id=$2 WHERE id=$3",
        [
          sf.parent_subfamily_id ? (sfMap.get(sf.parent_subfamily_id) ?? null) : null,
          sf.linked_male_id ? (map.get(sf.linked_male_id) ?? null) : null,
          sfMap.get(sf.id),
        ],
      );
    for (const m of b.members ?? []) {
      if (m.subfamily_id && sfMap.get(m.subfamily_id))
        await c.query("UPDATE app.family_members SET subfamily_id=$1 WHERE id=$2", [
          sfMap.get(m.subfamily_id),
          map.get(m.id),
        ]);
      for (const x of m.external_children ?? [])
        await c.query(
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
    const updated = await c.query<{ version: number }>(
      "UPDATE app.family_trees SET version=version+1 WHERE id=$1 RETURNING version",
      [treeId],
    );
    return {
      batchId: batch,
      mapped: map.size + sfMap.size,
      reconciled: true,
      version: updated.rows[0].version,
    };
  });
}
