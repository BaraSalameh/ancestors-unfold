import { ApiError } from "@/server/security";
import { query, transaction } from "@/shared/server/database";

export type SessionContext = { id: string; user_id: string };

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

function relationshipMaps(rows: PartnerRow[]) {
  const byUnion = new Map<string, PartnerRow[]>();
  for (const partner of rows)
    byUnion.set(partner.union_id, [...(byUnion.get(partner.union_id) ?? []), partner]);
  const spouseMap = new Map<string, string[]>();
  const divorceMap = new Map<string, string[]>();
  for (const partners of byUnion.values()) {
    if (partners.length !== 2) continue;
    for (const [member, spouse] of [
      [partners[0], partners[1]],
      [partners[1], partners[0]],
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
  }
  return { spouseMap, divorceMap };
}

function privateMemberFields(member: MemberRow, externalRows: ExternalRow[]) {
  return {
    image_public_id: member.image_public_id ?? undefined,
    image_asset_id: member.image_asset_id ?? undefined,
    notes: member.notes ?? undefined,
    external_children: externalRows
      .filter((child) => child.mother_id === member.id)
      .map((child) => ({
        id: child.id,
        name: child.name,
        other_parent_name: child.other_parent_name ?? undefined,
        birth_year: child.birth_year == null ? undefined : String(child.birth_year),
        notes: child.notes ?? undefined,
      })),
  };
}

function memberIdentityFields(member: MemberRow) {
  return {
    id: member.id,
    name_en: member.name_en ?? "",
    name_ar: member.name_ar ?? "",
    gender: member.gender,
    birth_date: member.birth_date ?? undefined,
    death_date: member.death_date ?? undefined,
    is_deceased: member.is_deceased ?? Boolean(member.death_date),
    citizen_status: member.citizen_status ?? undefined,
    image_url: member.image_url ?? undefined,
    is_unknown: member.is_unknown || undefined,
    subfamily_id: member.subfamily_id ?? undefined,
  };
}

function memberPositionFields(member: MemberRow) {
  return {
    pos_x: member.pos_x ?? undefined,
    pos_y: member.pos_y ?? undefined,
    decade_pos_x: member.decade_pos_x ?? undefined,
    decade_pos_y: member.decade_pos_y ?? undefined,
    created_at: member.created_at,
    updated_at: member.updated_at,
  };
}

function projectMember(
  member: MemberRow,
  includePrivate: boolean,
  externalRows: ExternalRow[],
  spouseMap: ReadonlyMap<string, string[]>,
  divorceMap: ReadonlyMap<string, string[]>,
) {
  return {
    ...memberIdentityFields(member),
    ...(includePrivate ? privateMemberFields(member, externalRows) : {}),
    father_id: member.father_id ?? undefined,
    mother_id: member.mother_id ?? undefined,
    spouse_id: spouseMap.get(member.id)?.[0],
    spouse_ids: spouseMap.get(member.id),
    divorced_from: divorceMap.get(member.id),
    ...memberPositionFields(member),
  };
}

export async function loadRenderableSnapshot(
  runner: QueryRunner,
  treeId: string,
  version: number,
  includePrivate: boolean,
) {
  const members = await runner.query<MemberRow>(
    `SELECT m.id,coalesce(m.name_en, '') name_en,coalesce(m.name_ar, '') name_ar,
      m.gender,m.birth_date::text birth_date,m.death_date::text death_date,m.is_deceased,
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
  const { spouseMap, divorceMap } = relationshipMaps(partners.rows);
  return {
    version,
    access_scope: includePrivate ? ("tree" as const) : ("preview" as const),
    members: members.rows.map((member) =>
      projectMember(member, includePrivate, external.rows, spouseMap, divorceMap),
    ),
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

export async function readSnapshot(session: SessionContext, requestId: string, treeId: string) {
  return transaction(session.user_id, session.id, requestId, async (client) => {
    const tree = await client.query<{ version: number }>(
      `SELECT t.version FROM app.family_trees t JOIN app.tree_memberships m ON m.tree_id=t.id AND m.user_id=$2 AND m.revoked_at IS NULL WHERE t.id=$1 AND t.deleted_at IS NULL
      UNION SELECT t.version FROM app.family_trees t JOIN app.branch_grants g ON g.tree_id=t.id AND g.user_id=$2 AND g.revoked_at IS NULL WHERE t.id=$1 AND t.deleted_at IS NULL`,
      [treeId, session.user_id],
    );
    if (!tree.rowCount) throw new Error("FORBIDDEN");
    const snapshot = await loadRenderableSnapshot(client, treeId, tree.rows[0].version, true);
    const fullAccess = await client.query(
      `SELECT 1 FROM app.family_trees t
       WHERE t.id=$1 AND (t.owner_user_id=$2 OR EXISTS (
         SELECT 1 FROM app.tree_memberships m WHERE m.tree_id=t.id AND m.user_id=$2
           AND m.role IN ('owner','administrator','editor') AND m.revoked_at IS NULL))`,
      [treeId, session.user_id],
    );
    if (fullAccess.rowCount) return snapshot;
    const branchMembers = await client.query<{ id: string }>(
      "SELECT member_id id FROM app.branch_members($1,$2)",
      [treeId, session.user_id],
    );
    const ownedDrafts = await client.query<{ id: string }>(
      `SELECT id FROM app.family_members WHERE tree_id=$1 AND created_by=$2 AND deleted_at IS NULL
       AND app.is_unattached_member(tree_id,id)`,
      [treeId, session.user_id],
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
