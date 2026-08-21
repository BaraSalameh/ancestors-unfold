import { timingSafeEqual } from "node:crypto";
import type { PoolClient } from "pg";
import { ApiError } from "@/server/security";
import { deleteContributorIdentity } from "./account-deletion";
import { beginTreeMutation, finishTreeMutation } from "./branch-handler";
import { branchDeactivationCodeHash } from "./collaboration-crypto";

type Challenge = {
  tree_id: string;
  branch_id: string;
  branch_ids: string[] | null;
  verification_code_hash: Buffer;
  expires_at: string;
};

type DeactivatedBranch = {
  id: string;
  name_en: string;
  name_ar: string | null;
  contributor_user_id: string | null;
  contributor_name_en: string | null;
  contributor_name_ar: string | null;
};

async function verifiedChallenge(
  client: PoolClient,
  challengeId: string,
  ownerId: string,
  code: string,
) {
  const challenge = (
    await client.query<Challenge>(
      `SELECT tree_id,branch_id,branch_ids,verification_code_hash,expires_at
       FROM app.branch_deactivation_challenges
       WHERE id=$1 AND owner_user_id=$2 AND consumed_at IS NULL AND cancelled_at IS NULL
       FOR UPDATE`,
      [challengeId, ownerId],
    )
  ).rows[0];
  const received = branchDeactivationCodeHash(challengeId, code);
  const invalid =
    !challenge ||
    new Date(challenge.expires_at).getTime() <= Date.now() ||
    challenge.verification_code_hash.length !== received.length ||
    !timingSafeEqual(challenge.verification_code_hash, received);
  if (invalid) throw new ApiError("INVALID_OR_EXPIRED_CODE", 400);
  return { challenge, received };
}

async function activeBranches(client: PoolClient, treeId: string, branchIds: string[]) {
  const result = await client.query<DeactivatedBranch>(
    `SELECT b.id,b.name_en,b.name_ar,g.user_id contributor_user_id,
            COALESCE(f.name_en,u.full_name_en) contributor_name_en,
            COALESCE(f.name_ar,u.full_name_ar) contributor_name_ar
     FROM app.subfamilies b
     LEFT JOIN app.branch_grants g ON g.tree_id=b.tree_id AND g.root_subfamily_id=b.id
       AND g.role='branch_editor' AND g.revoked_at IS NULL
     LEFT JOIN app.users u ON u.id=g.user_id AND u.status='active'
     LEFT JOIN app.tree_memberships m ON m.tree_id=b.tree_id AND m.user_id=g.user_id
       AND m.revoked_at IS NULL
     LEFT JOIN app.family_members f ON f.id=m.family_member_id
     WHERE b.tree_id=$1 AND b.id=ANY($2::uuid[])
       AND b.status='active' AND b.deleted_at IS NULL
     FOR UPDATE OF b`,
    [treeId, branchIds],
  );
  if (result.rowCount !== branchIds.length) throw new ApiError("BRANCH_UNAVAILABLE", 404);
  return result.rows;
}

async function authorizeContributorDeletion(
  client: PoolClient,
  treeId: string,
  branchIds: string[],
  contributorIds: Iterable<string>,
) {
  for (const contributorId of contributorIds) {
    await client.query(
      `SELECT 1 FROM app.branch_grants g
       JOIN app.tree_memberships m ON m.tree_id=g.tree_id AND m.user_id=g.user_id
       WHERE g.tree_id=$1 AND g.root_subfamily_id=ANY($2::uuid[]) AND g.user_id=$3
         AND g.revoked_at IS NULL AND m.revoked_at IS NULL FOR UPDATE OF g,m`,
      [treeId, branchIds, contributorId],
    );
    const allowed = await client.query<{ allowed: boolean }>(
      "SELECT app.owner_can_delete_contributor($1,$2) allowed",
      [treeId, contributorId],
    );
    if (!allowed.rows[0]?.allowed) throw new ApiError("CONTRIBUTOR_ACCOUNT_DELETE_CONFLICT", 409);
  }
}

async function removeContributors(
  client: PoolClient,
  treeId: string,
  ownerId: string,
  branches: DeactivatedBranch[],
  contributorIds: Iterable<string>,
) {
  for (const branch of branches) {
    if (!branch.contributor_user_id) continue;
    await client.query(
      `INSERT INTO app.tree_activity(
         tree_id,branch_id,actor_user_id,subject_user_id,subject_name_en,subject_name_ar,
         action_type,target_type,target_id
       ) VALUES($1,$2,$3,$4,$5,$6,'contributor_removed','user',$4)`,
      [
        treeId,
        branch.id,
        ownerId,
        branch.contributor_user_id,
        branch.contributor_name_en,
        branch.contributor_name_ar,
      ],
    );
  }
  for (const contributorId of contributorIds)
    await deleteContributorIdentity(client, contributorId, ownerId);
}

async function deactivateBranches(
  client: PoolClient,
  treeId: string,
  branchIds: string[],
  ownerId: string,
) {
  await client.query(
    `UPDATE app.subfamilies SET status='inactive',linked_male_id=NULL,
       parent_subfamily_id=NULL,version=version+1,updated_at=now()
     WHERE tree_id=$1 AND id=ANY($2::uuid[])`,
    [treeId, branchIds],
  );
  await client.query(
    `UPDATE app.contributor_invitations SET status='cancelled',updated_at=now()
     WHERE tree_id=$1 AND branch_id=ANY($2::uuid[]) AND status='pending'`,
    [treeId, branchIds],
  );
  await client.query(
    `UPDATE app.branch_grants SET revoked_at=now(),revoked_by=$3
     WHERE tree_id=$1 AND root_subfamily_id=ANY($2::uuid[]) AND revoked_at IS NULL`,
    [treeId, branchIds, ownerId],
  );
  await client.query("SELECT app.reconcile_branch_structure($1)", [treeId]);
  await client.query(
    `INSERT INTO app.tree_activity(
       tree_id,branch_id,actor_user_id,action_type,target_type,target_id,
       target_name_en,target_name_ar
     ) SELECT $1,branch.id,$2,'branch_deactivated','branch',branch.id,
              branch.name_en,branch.name_ar
       FROM app.subfamilies branch WHERE branch.tree_id=$1 AND branch.id=ANY($3::uuid[])`,
    [treeId, ownerId, branchIds],
  );
}

export async function confirmBranchDeactivation(
  client: PoolClient,
  challengeId: string,
  ownerId: string,
  body: { code: string; expectedVersion: number; batchId: string },
) {
  const { challenge, received } = await verifiedChallenge(client, challengeId, ownerId, body.code);
  await beginTreeMutation(client, challenge.tree_id, ownerId, body.expectedVersion, body.batchId);
  const branchIds = challenge.branch_ids ?? [challenge.branch_id];
  const branches = await activeBranches(client, challenge.tree_id, branchIds);
  const contributors = new Set(
    branches.flatMap(({ contributor_user_id }) =>
      contributor_user_id ? [contributor_user_id] : [],
    ),
  );
  await authorizeContributorDeletion(client, challenge.tree_id, branchIds, contributors);
  await removeContributors(client, challenge.tree_id, ownerId, branches, contributors);
  await deactivateBranches(client, challenge.tree_id, branchIds, ownerId);
  await client.query(
    `UPDATE app.branch_deactivation_challenges
     SET consumed_at=now(),verification_code_hash=$2,updated_at=now() WHERE id=$1`,
    [challengeId, received],
  );
  return finishTreeMutation(client, challenge.tree_id, body.expectedVersion, body.batchId);
}
