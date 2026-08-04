import type { PoolClient } from "pg";
import { ApiError, type SnapshotInput } from "@/server/security";

type ProtectedMember = { id: string; gender: "male" | "female" | null };

export async function requireFamilyCsvImportManager(
  client: PoolClient,
  treeId: string,
  userId: string,
) {
  const access = await client.query(
    `SELECT 1 FROM app.family_trees tree
     LEFT JOIN app.tree_memberships membership
       ON membership.tree_id=tree.id AND membership.user_id=$2 AND membership.revoked_at IS NULL
     WHERE tree.id=$1 AND tree.deleted_at IS NULL
       AND (tree.owner_user_id=$2 OR membership.role IN ('owner','administrator'))`,
    [treeId, userId],
  );
  if (!access.rowCount) throw new ApiError("FORBIDDEN", 403);
}

export async function validateProtectedFamilyCsvImport(
  client: PoolClient,
  treeId: string,
  snapshot: SnapshotInput,
) {
  const protectedMembers = await client.query<ProtectedMember>(
    `SELECT membership.family_member_id id,user_account.profile_gender gender
     FROM app.tree_memberships membership
     JOIN app.users user_account ON user_account.id=membership.user_id
     WHERE membership.tree_id=$1 AND membership.family_member_id IS NOT NULL
       AND membership.revoked_at IS NULL
       AND membership.affiliation_status IN ('active','read_only')`,
    [treeId],
  );
  const members = new Map((snapshot.members ?? []).map((member) => [member.id, member]));
  for (const protectedMember of protectedMembers.rows) {
    const imported = members.get(protectedMember.id);
    if (!imported) throw new ApiError("IMPORT_LINKED_MEMBER_REQUIRED", 422);
    if (protectedMember.gender && imported.gender !== protectedMember.gender)
      throw new ApiError("IMPORT_LINKED_MEMBER_GENDER", 422);
  }

  const protectedBranches = await client.query<{ id: string }>(
    `SELECT DISTINCT grant_record.root_subfamily_id id
     FROM app.branch_grants grant_record
     WHERE grant_record.tree_id=$1 AND grant_record.revoked_at IS NULL
       AND (grant_record.expires_at IS NULL OR grant_record.expires_at>now())`,
    [treeId],
  );
  const branches = new Set((snapshot.subfamilies ?? []).map(({ id }) => id));
  for (const branch of protectedBranches.rows)
    if (!branches.has(branch.id)) throw new ApiError("IMPORT_GRANTED_BRANCH_REQUIRED", 422);
}

export function validateSourceMappings(
  snapshot: SnapshotInput,
  memberMappings: ReadonlyMap<string, string>,
  branchMappings: ReadonlyMap<string, string>,
) {
  const memberIds = new Set((snapshot.members ?? []).map(({ id }) => id));
  const branchIds = new Set((snapshot.subfamilies ?? []).map(({ id }) => id));
  const validate = (ids: ReadonlySet<string>, mappings: ReadonlyMap<string, string>) => {
    if (ids.size !== mappings.size) throw new ApiError("INVALID_IMPORT_MAPPING", 422);
    const sources = new Set<string>();
    for (const [target, source] of mappings) {
      if (!ids.has(target) || sources.has(source))
        throw new ApiError("INVALID_IMPORT_MAPPING", 422);
      sources.add(source);
    }
    for (const id of ids) if (!mappings.has(id)) throw new ApiError("INVALID_IMPORT_MAPPING", 422);
  };
  validate(memberIds, memberMappings);
  validate(branchIds, branchMappings);
}
