/* eslint-disable max-lines -- Snapshot reconciliation is kept in one transactional repository to preserve authorization and version invariants. */
import { randomUUID } from "node:crypto";
import { query, transaction } from "@/shared/server/database";
import { ApiError, type SnapshotInput } from "@/server/security";

type SessionContext = { id: string; user_id: string };

type QueryRunner = {
  query: <T extends Record<string, unknown>>(
    text: string,
    values?: unknown[],
  ) => Promise<{ rows: T[]; rowCount: number | null }>;
};

type PartnerRow = {
  union_id: string;
  status: string;
  member_id: string;
  display_order: number;
};
type MemberRow = Record<string, unknown> & { id: string };
type ExternalRow = Record<string, unknown> & { mother_id: string };

export async function loadRenderableSnapshot(
  runner: QueryRunner,
  treeId: string,
  version: number,
  includePrivate: boolean,
) {
  const members = await runner.query<MemberRow>(
    `SELECT m.id,coalesce(m.name_en, '') name_en,coalesce(m.name_ar, '') name_ar,
      m.gender,m.birth_date::text birth_date,m.death_date::text death_date,
      m.citizen_status,m.image_url,m.image_public_id,m.image_asset_id,m.notes,m.is_unknown,m.subfamily_id,
      m.pos_x,m.pos_y,m.decade_pos_x,m.decade_pos_y,m.created_at,m.updated_at,
      f.parent_id father_id,mo.parent_id mother_id FROM app.family_members m
    LEFT JOIN app.parent_child_relationships f ON f.child_id=m.id AND f.parent_role='father' AND f.deleted_at IS NULL
    LEFT JOIN app.parent_child_relationships mo ON mo.child_id=m.id AND mo.parent_role='mother' AND mo.deleted_at IS NULL
    WHERE m.tree_id=$1 AND m.deleted_at IS NULL`,
    [treeId],
  );
  const subfamilies = await runner.query<Record<string, unknown>>(
    `SELECT id,name_en,name_ar,linked_male_id,parent_subfamily_id,notes,color,created_at,updated_at
    FROM app.subfamilies WHERE tree_id=$1 AND deleted_at IS NULL`,
    [treeId],
  );
  const partners = await runner.query<PartnerRow>(
    `SELECT u.id union_id,u.status,p.member_id,p.display_order FROM app.unions u
    JOIN app.union_partners p ON p.union_id=u.id
    WHERE u.tree_id=$1 AND u.deleted_at IS NULL ORDER BY u.display_order,p.display_order`,
    [treeId],
  );
  const external = includePrivate
    ? await runner.query<ExternalRow>(
        "SELECT * FROM app.external_children WHERE tree_id=$1 AND deleted_at IS NULL",
        [treeId],
      )
    : { rows: [] as ExternalRow[], rowCount: 0 };
  const byUnion = new Map<string, PartnerRow[]>();
  for (const partner of partners.rows)
    byUnion.set(partner.union_id, [...(byUnion.get(partner.union_id) ?? []), partner]);
  const spouseMap = new Map<string, string[]>(),
    divorceMap = new Map<string, string[]>();
  for (const unionPartners of byUnion.values())
    if (unionPartners.length === 2)
      for (const [member, spouse] of [
        [unionPartners[0], unionPartners[1]],
        [unionPartners[1], unionPartners[0]],
      ]) {
        spouseMap.set(member.member_id, [
          ...(spouseMap.get(member.member_id) ?? []),
          spouse.member_id,
        ]);
        if (member.status === "divorced")
          divorceMap.set(member.member_id, [
            ...(divorceMap.get(member.member_id) ?? []),
            spouse.member_id,
          ]);
      }
  return {
    version,
    access_scope: includePrivate ? ("tree" as const) : ("preview" as const),
    // The DTO projection intentionally normalizes nullable database fields at this boundary.
    // eslint-disable-next-line complexity
    members: members.rows.map((member) => ({
      id: member.id,
      name_en: member.name_en ?? "",
      name_ar: member.name_ar ?? "",
      gender: member.gender,
      birth_date: member.birth_date ?? undefined,
      death_date: member.death_date ?? undefined,
      citizen_status: member.citizen_status ?? undefined,
      image_url: member.image_url ?? undefined,
      ...(includePrivate
        ? {
            image_public_id: member.image_public_id ?? undefined,
            image_asset_id: member.image_asset_id ?? undefined,
          }
        : {}),
      ...(includePrivate ? { notes: member.notes ?? undefined } : {}),
      father_id: member.father_id ?? undefined,
      mother_id: member.mother_id ?? undefined,
      spouse_id: spouseMap.get(member.id)?.[0],
      spouse_ids: spouseMap.get(member.id),
      divorced_from: divorceMap.get(member.id),
      is_unknown: member.is_unknown || undefined,
      ...(includePrivate
        ? {
            external_children: external.rows
              .filter((child) => child.mother_id === member.id)
              .map((child) => ({
                id: child.id,
                name: child.name,
                other_parent_name: child.other_parent_name ?? undefined,
                birth_year: child.birth_year == null ? undefined : String(child.birth_year),
                notes: child.notes ?? undefined,
              })),
          }
        : {}),
      subfamily_id: member.subfamily_id ?? undefined,
      pos_x: member.pos_x ?? undefined,
      pos_y: member.pos_y ?? undefined,
      decade_pos_x: member.decade_pos_x ?? undefined,
      decade_pos_y: member.decade_pos_y ?? undefined,
      created_at: member.created_at,
      updated_at: member.updated_at,
    })),
    subfamilies: subfamilies.rows.map((subfamily) => ({
      id: subfamily.id,
      name_en: subfamily.name_en,
      name_ar: subfamily.name_ar ?? "",
      linked_male_id: subfamily.linked_male_id ?? undefined,
      parent_subfamily_id: subfamily.parent_subfamily_id ?? undefined,
      ...(includePrivate ? { notes: subfamily.notes ?? undefined } : {}),
      color: subfamily.color ?? undefined,
      created_at: subfamily.created_at,
      updated_at: subfamily.updated_at,
    })),
  };
}

export async function readPublicSnapshot(treeId: string) {
  const tree = await query<{ version: number }>(
    "SELECT version FROM app.family_trees WHERE id=$1 AND deleted_at IS NULL",
    [treeId],
  );
  if (!tree.rowCount) throw new ApiError("NOT_FOUND", 404);
  return loadRenderableSnapshot({ query }, treeId, tree.rows[0].version, false);
}

export function filterSnapshotMembers<T extends Awaited<ReturnType<typeof loadRenderableSnapshot>>>(
  snapshot: T,
  visibleIds: ReadonlySet<string>,
): T {
  const members = snapshot.members
    .filter((member) => visibleIds.has(member.id))
    .map((member) => ({
      ...member,
      father_id:
        member.father_id && visibleIds.has(String(member.father_id)) ? member.father_id : undefined,
      mother_id:
        member.mother_id && visibleIds.has(String(member.mother_id)) ? member.mother_id : undefined,
      spouse_id:
        member.spouse_id && visibleIds.has(String(member.spouse_id)) ? member.spouse_id : undefined,
      spouse_ids: member.spouse_ids?.filter((id) => visibleIds.has(id)),
      divorced_from: member.divorced_from?.filter((id) => visibleIds.has(id)),
    }));
  return { ...snapshot, members } as T;
}

export async function readSnapshot(s: SessionContext, rid: string, treeId: string) {
  return transaction(s.user_id, s.id, rid, async (c) => {
    const tree = await c.query<{ version: number }>(
      `SELECT t.version FROM app.family_trees t JOIN app.tree_memberships m ON m.tree_id=t.id AND m.user_id=$2 AND m.revoked_at IS NULL WHERE t.id=$1 AND t.deleted_at IS NULL
      UNION SELECT t.version FROM app.family_trees t JOIN app.branch_grants g ON g.tree_id=t.id AND g.user_id=$2 AND g.revoked_at IS NULL WHERE t.id=$1 AND t.deleted_at IS NULL`,
      [treeId, s.user_id],
    );
    if (!tree.rowCount) throw new Error("FORBIDDEN");
    const snapshot = await loadRenderableSnapshot(c, treeId, tree.rows[0].version, true);
    const fullAccess = await c.query(
      `SELECT 1 FROM app.family_trees t
       WHERE t.id=$1 AND (
         t.owner_user_id=$2 OR EXISTS (
           SELECT 1 FROM app.tree_memberships m
           WHERE m.tree_id=t.id AND m.user_id=$2
             AND m.role IN ('owner','administrator','editor') AND m.revoked_at IS NULL
         )
       )`,
      [treeId, s.user_id],
    );
    if (fullAccess.rowCount) return snapshot;
    const branchMembers = await c.query<{ id: string }>(
      "SELECT member_id id FROM app.branch_members($1,$2)",
      [treeId, s.user_id],
    );
    const ownedDrafts = await c.query<{ id: string }>(
      `SELECT id FROM app.family_members
       WHERE tree_id=$1 AND created_by=$2 AND deleted_at IS NULL
         AND app.is_unattached_member(tree_id,id)`,
      [treeId, s.user_id],
    );
    return {
      ...filterSnapshotMembers(
        snapshot,
        new Set([...branchMembers.rows, ...ownedDrafts.rows].map(({ id }) => id)),
      ),
      access_scope: "branch" as const,
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
    const membershipAccess = await c.query(
      `SELECT 1 FROM app.family_trees t
       WHERE t.id=$1 AND t.deleted_at IS NULL AND (
         t.owner_user_id=$2 OR EXISTS (
           SELECT 1 FROM app.tree_memberships m
           WHERE m.tree_id=t.id AND m.user_id=$2
             AND m.role IN ('owner','administrator','editor') AND m.revoked_at IS NULL
         )
       )`,
      [treeId, s.user_id],
    );
    const branchAccess = membershipAccess.rowCount
      ? null
      : await c.query<{ root_subfamily_id: string }>(
          `SELECT root_subfamily_id FROM app.branch_grants
           WHERE tree_id=$1 AND user_id=$2 AND role='branch_editor'
             AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at>now())`,
          [treeId, s.user_id],
        );
    if (!membershipAccess.rowCount && !branchAccess?.rowCount) throw new Error("FORBIDDEN");
    const isBranchEditor = !membershipAccess.rowCount;
    const batch = b.batchId || randomUUID();
    const priorBatch = await c.query<{ version: number }>(
      "SELECT app.saved_snapshot_version($1::uuid,$2::uuid) version",
      [treeId, batch],
    );
    if (priorBatch.rows[0]?.version)
      return {
        batchId: batch,
        mapped: 0,
        reconciled: true,
        version: Number(priorBatch.rows[0].version),
      };
    await c.query("SELECT set_config('app.correlation_id',$1,true)", [batch]);
    const allowedMembers = new Set<string>();
    if (isBranchEditor) {
      const members = await c.query<{ id: string }>(
        "SELECT member_id id FROM app.branch_members($1,$2)",
        [treeId, s.user_id],
      );
      members.rows.forEach(({ id }) => allowedMembers.add(id));
    }
    const expectedVersion = Number(b.expectedVersion);
    if (!Number.isInteger(expectedVersion) || expectedVersion < 1)
      throw new ApiError("VERSION_REQUIRED", 428);
    const locked = await c.query<{ version: number }>(
      "SELECT version FROM app.family_trees WHERE id=$1 AND deleted_at IS NULL FOR UPDATE",
      [treeId],
    );
    if (!locked.rowCount) throw new ApiError("NOT_FOUND", 404);
    if (locked.rows[0].version !== expectedVersion) throw new ApiError("VERSION_CONFLICT", 409);
    const existingMembers = isBranchEditor
      ? await c.query<{ id: string }>(
          "SELECT id FROM app.family_members WHERE tree_id=$1 AND deleted_at IS NULL",
          [treeId],
        )
      : null;
    const existingMemberIds = new Set(existingMembers?.rows.map(({ id }) => id) ?? []);
    const mutableMembers = new Set(allowedMembers);
    if (isBranchEditor) {
      const ownedDrafts = await c.query<{ id: string }>(
        `SELECT id FROM app.family_members
         WHERE tree_id=$1 AND created_by=$2 AND deleted_at IS NULL
           AND app.is_unattached_member(tree_id,id)`,
        [treeId, s.user_id],
      );
      ownedDrafts.rows.forEach(({ id }) => mutableMembers.add(id));
    }
    const editablePayloadMembers = isBranchEditor
      ? (b.members ?? []).filter(
          (member) => mutableMembers.has(member.id) || !existingMemberIds.has(member.id),
        )
      : (b.members ?? []);
    const uploadedImages = editablePayloadMembers.filter(
      (member) => member.image_asset_id || member.image_public_id,
    );
    if (
      uploadedImages.some(
        (member) => !member.image_asset_id || !member.image_public_id || !member.image_url,
      )
    )
      throw new ApiError("INVALID_MEMBER_IMAGE", 400);
    if (uploadedImages.length) {
      const owned = await c.query<{
        asset_id: string;
        public_id: string;
        secure_url: string;
      }>(
        `SELECT asset_id,public_id,secure_url FROM app.cloudinary_assets
         WHERE tree_id=$1 AND asset_id=ANY($2::text[])`,
        [treeId, uploadedImages.map((member) => member.image_asset_id)],
      );
      const valid = new Map(owned.rows.map((asset) => [asset.asset_id, asset]));
      if (
        uploadedImages.some((member) => {
          const asset = valid.get(member.image_asset_id!);
          return (
            !asset ||
            asset.public_id !== member.image_public_id ||
            asset.secure_url !== member.image_url
          );
        })
      )
        throw new ApiError("INVALID_MEMBER_IMAGE", 400);
    }
    const editableIds = new Set(editablePayloadMembers.map(({ id }) => id));
    if (isBranchEditor) {
      const existingRelations = await c.query<{
        relation_type: string;
        left_id: string;
        right_id: string;
        relation_role: string;
      }>(
        `SELECT 'parent' relation_type,child_id left_id,parent_id right_id,parent_role::text relation_role
         FROM app.parent_child_relationships
         WHERE tree_id=$1 AND deleted_at IS NULL
         UNION ALL
         SELECT 'spouse',least(a.member_id,b.member_id),greatest(a.member_id,b.member_id),u.status::text
         FROM app.union_partners a
         JOIN app.union_partners b ON b.union_id=a.union_id AND a.member_id<b.member_id
         JOIN app.unions u ON u.id=a.union_id AND u.deleted_at IS NULL
         WHERE a.tree_id=$1`,
        [treeId],
      );
      const relationKeys = new Set(
        existingRelations.rows.map(
          ({ relation_type, left_id, right_id, relation_role }) =>
            `${relation_type}:${left_id}:${right_id}:${relation_role}`,
        ),
      );
      for (const member of editablePayloadMembers) {
        for (const [role, relatedId] of [
          ["father", member.father_id],
          ["mother", member.mother_id],
        ] as const)
          if (
            relatedId &&
            existingMemberIds.has(relatedId) &&
            !mutableMembers.has(relatedId) &&
            !relationKeys.has(`parent:${member.id}:${relatedId}:${role}`)
          )
            throw new Error("FORBIDDEN");
        for (const relatedId of [
          member.spouse_id,
          ...(member.spouse_ids ?? []),
          ...(member.divorced_from ?? []),
        ])
          if (relatedId && existingMemberIds.has(relatedId) && !mutableMembers.has(relatedId)) {
            const [left, right] = [member.id, relatedId].sort();
            const status = (member.divorced_from ?? []).includes(relatedId)
              ? "divorced"
              : "current";
            if (!relationKeys.has(`spouse:${left}:${right}:${status}`))
              throw new Error("FORBIDDEN");
          }
      }

      const payloadIds = new Set((b.members ?? []).map(({ id }) => id));
      const deletedIds = [...mutableMembers].filter((id) => !payloadIds.has(id));
      if (deletedIds.length) {
        await c.query(
          "UPDATE app.family_members SET deleted_at=now(),updated_by=$3 WHERE tree_id=$1 AND id=ANY($2::uuid[])",
          [treeId, deletedIds, s.user_id],
        );
        await c.query(
          `UPDATE app.parent_child_relationships SET deleted_at=now()
           WHERE tree_id=$1 AND deleted_at IS NULL
             AND (parent_id=ANY($2::uuid[]) OR child_id=ANY($2::uuid[]))`,
          [treeId, deletedIds],
        );
        await c.query(
          `UPDATE app.unions SET deleted_at=now()
           WHERE tree_id=$1 AND deleted_at IS NULL
             AND id IN (
               SELECT union_id FROM app.union_partners WHERE member_id=ANY($2::uuid[])
             )`,
          [treeId, deletedIds],
        );
      }
    }
    const map = new Map<string, string>(),
      sfMap = new Map<string, string>();
    for (const member of b.members ?? []) map.set(member.id, member.id);
    for (const subfamily of b.subfamilies ?? []) sfMap.set(subfamily.id, subfamily.id);
    if (!isBranchEditor)
      await c.query(
        "UPDATE app.family_members SET subfamily_id=NULL WHERE tree_id=$1 AND deleted_at IS NULL",
        [treeId],
      );
    if (!isBranchEditor)
      await c.query(
        "UPDATE app.subfamilies SET parent_subfamily_id=NULL,deleted_at=now() WHERE tree_id=$1 AND deleted_at IS NULL",
        [treeId],
      );
    if (!isBranchEditor)
      await c.query(
        "UPDATE app.family_members SET deleted_at=now() WHERE tree_id=$1 AND deleted_at IS NULL",
        [treeId],
      );
    for (const sf of isBranchEditor ? [] : (b.subfamilies ?? [])) {
      const id = /^[0-9a-f]{8}-/.test(sf.id) ? sf.id : randomUUID();
      sfMap.set(sf.id, id);
      await c.query(
        `INSERT INTO app.subfamilies(id,tree_id,name_en,name_ar,notes,color) VALUES($1,$2,$3,$4,$5,$6)
        ON CONFLICT(id) DO UPDATE SET name_en=excluded.name_en,name_ar=excluded.name_ar,notes=excluded.notes,color=excluded.color,deleted_at=NULL`,
        [id, treeId, sf.name_en, sf.name_ar || null, sf.notes || null, sf.color || null],
      );
    }
    for (const m of editablePayloadMembers) {
      const id = /^[0-9a-f]{8}-/.test(m.id) ? m.id : randomUUID();
      map.set(m.id, id);
      const values = [
        id,
        treeId,
        m.name_en || null,
        m.name_ar || null,
        m.gender,
        m.birth_date || null,
        m.death_date || null,
        m.citizen_status || null,
        m.image_url || null,
        m.image_public_id || null,
        m.image_asset_id || null,
        m.notes || null,
        !!m.is_unknown,
        m.pos_x ?? null,
        m.pos_y ?? null,
        m.decade_pos_x ?? null,
        m.decade_pos_y ?? null,
        m.subfamily_id
          ? (sfMap.get(m.subfamily_id) ?? null)
          : isBranchEditor
            ? branchAccess!.rows[0].root_subfamily_id
            : null,
        s.user_id,
      ];
      if (isBranchEditor && existingMemberIds.has(m.id))
        await c.query(
          `UPDATE app.family_members SET name_en=$3,name_ar=$4,gender=$5,birth_date=$6,
            death_date=$7,citizen_status=$8,image_url=$9,image_public_id=$10,image_asset_id=$11,
            notes=$12,is_unknown=$13,pos_x=$14,pos_y=$15,decade_pos_x=$16,decade_pos_y=$17,
            updated_by=$18,updated_at=now(),version=version+1
           WHERE id=$1 AND tree_id=$2 AND deleted_at IS NULL`,
          [...values.slice(0, 17), s.user_id],
        );
      else
        await c.query(
          `INSERT INTO app.family_members(id,tree_id,name_en,name_ar,gender,birth_date,death_date,citizen_status,image_url,image_public_id,image_asset_id,notes,is_unknown,pos_x,pos_y,decade_pos_x,decade_pos_y,subfamily_id,created_by,updated_by)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$19) ON CONFLICT(id) DO UPDATE SET name_en=excluded.name_en,name_ar=excluded.name_ar,gender=excluded.gender,birth_date=excluded.birth_date,death_date=excluded.death_date,citizen_status=excluded.citizen_status,image_url=excluded.image_url,image_public_id=excluded.image_public_id,image_asset_id=excluded.image_asset_id,notes=excluded.notes,is_unknown=excluded.is_unknown,pos_x=excluded.pos_x,pos_y=excluded.pos_y,decade_pos_x=excluded.decade_pos_x,decade_pos_y=excluded.decade_pos_y,updated_by=excluded.updated_by,updated_at=now(),version=app.family_members.version+1,deleted_at=NULL`,
          values,
        );
      await c.query(
        `UPDATE app.users u SET profile_gender=$2,updated_at=now()
         FROM app.family_members fm
         WHERE fm.id=$1 AND fm.linked_user_id=u.id AND u.profile_gender<>$2`,
        [id, m.gender],
      );
      await c.query(
        `INSERT INTO app.import_id_map(import_batch_id,entity_type,source_id,target_id,status) VALUES($1,'member',$2,$3,'mapped') ON CONFLICT DO NOTHING`,
        [batch, m.id, id],
      );
    }
    if (isBranchEditor) {
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
        await c.query(
          `UPDATE app.family_members SET subfamily_id=$1,updated_by=$3,updated_at=now()
           WHERE tree_id=$2 AND id=ANY($4::uuid[])`,
          [branchAccess!.rows[0].root_subfamily_id, treeId, s.user_id, newlyAttached],
        );
    }
    await c.query(
      isBranchEditor
        ? `UPDATE app.unions SET deleted_at=now() WHERE tree_id=$1 AND deleted_at IS NULL
           AND id IN (
             SELECT union_id FROM app.union_partners GROUP BY union_id
             HAVING bool_and(member_id=ANY($2::uuid[]))
           )`
        : "UPDATE app.unions SET deleted_at=now() WHERE tree_id=$1 AND deleted_at IS NULL",
      isBranchEditor ? [treeId, [...mutableMembers]] : [treeId],
    );
    await c.query(
      isBranchEditor
        ? `UPDATE app.external_children SET deleted_at=now()
           WHERE tree_id=$1 AND deleted_at IS NULL AND mother_id=ANY($2::uuid[])`
        : "UPDATE app.external_children SET deleted_at=now() WHERE tree_id=$1 AND deleted_at IS NULL",
      isBranchEditor ? [treeId, [...mutableMembers]] : [treeId],
    );
    await c.query(
      isBranchEditor
        ? `UPDATE app.parent_child_relationships SET deleted_at=now()
           WHERE tree_id=$1 AND deleted_at IS NULL
             AND child_id=ANY($2::uuid[]) AND parent_id=ANY($2::uuid[])`
        : "UPDATE app.parent_child_relationships SET deleted_at=now() WHERE tree_id=$1 AND deleted_at IS NULL",
      isBranchEditor ? [treeId, [...mutableMembers]] : [treeId],
    );
    for (const m of editablePayloadMembers)
      for (const [role, key] of [
        ["father", "father_id"],
        ["mother", "mother_id"],
      ] as const)
        if (
          m[key] &&
          map.get(m[key]) &&
          (!isBranchEditor || mutableMembers.has(m[key]) || editableIds.has(m[key]))
        )
          await c.query(
            `INSERT INTO app.parent_child_relationships(tree_id,child_id,parent_id,parent_role,created_by) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING`,
            [treeId, map.get(m.id), map.get(m[key]), role, s.user_id],
          );
    const pairs = new Map<string, { a: string; b: string; divorced: boolean; order: number }>();
    for (const [order, m] of editablePayloadMembers.entries())
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
    for (const sf of isBranchEditor ? [] : (b.subfamilies ?? []))
      await c.query(
        "UPDATE app.subfamilies SET parent_subfamily_id=$1,linked_male_id=$2 WHERE id=$3",
        [
          sf.parent_subfamily_id ? (sfMap.get(sf.parent_subfamily_id) ?? null) : null,
          sf.linked_male_id ? (map.get(sf.linked_male_id) ?? null) : null,
          sfMap.get(sf.id),
        ],
      );
    for (const m of editablePayloadMembers) {
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
    await c.query("SELECT app.store_tree_snapshot($1::uuid,$2::bigint,$3::bigint,$4::uuid)", [
      treeId,
      updated.rows[0].version,
      expectedVersion,
      batch,
    ]);
    return {
      batchId: batch,
      mapped: map.size + sfMap.size,
      reconciled: true,
      version: updated.rows[0].version,
    };
  });
}
