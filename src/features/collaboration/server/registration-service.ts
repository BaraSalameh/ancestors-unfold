import type { PoolClient } from "pg";
import { ApiError } from "@/server/security";

export async function provisionOwnedTree(
  client: PoolClient,
  user: {
    id: string;
    full_name_en: string;
    full_name_ar: string;
    email: string;
    profile_gender: "male" | "female" | "unspecified";
  },
) {
  const existing = await client.query("SELECT 1 FROM app.tree_memberships WHERE user_id=$1", [
    user.id,
  ]);
  if (existing.rowCount) return;
  const tree = (
    await client.query<{ id: string }>(
      `INSERT INTO app.family_trees(owner_user_id,name_en,name_ar)
       VALUES($1,$2,$3) RETURNING id`,
      [user.id, `${user.full_name_en}'s Family Tree`, `شجرة عائلة ${user.full_name_ar}`],
    )
  ).rows[0];
  await client.query(
    `INSERT INTO app.tree_memberships(tree_id,user_id,role)
     VALUES($1,$2,'owner')`,
    [tree.id, user.id],
  );
  const member = (
    await client.query<{ id: string }>(
      `INSERT INTO app.family_members(
        tree_id,name_en,name_ar,gender,linked_user_id,position_label,created_by,updated_by
      ) VALUES($1,$2,$3,$4,$5,'Tree owner',$5,$5) RETURNING id`,
      [tree.id, user.full_name_en, user.full_name_ar, user.profile_gender, user.id],
    )
  ).rows[0];
  await client.query(
    `UPDATE app.tree_memberships SET family_member_id=$3
     WHERE tree_id=$1 AND user_id=$2`,
    [tree.id, user.id, member.id],
  );
  await client.query(
    `INSERT INTO app.tree_activity(
       tree_id,actor_user_id,action_type,target_type,target_id,target_name_en,target_name_ar
     )
     SELECT id,$2,'tree_created','family_tree',id,name_en,name_ar
     FROM app.family_trees WHERE id=$1`,
    [tree.id, user.id],
  );
  await client.query(
    `UPDATE app.contributor_invitations SET status='invalidated',updated_at=now()
     WHERE invited_email=$1 AND status='pending'`,
    [user.email],
  );
}

export async function acceptRegistrationInvitation(
  client: PoolClient,
  user: {
    id: string;
    full_name_en: string;
    full_name_ar: string;
    email: string;
    profile_gender: "male" | "female" | "unspecified";
  },
  invitationId: string,
) {
  const invitation = (
    await client.query<{
      id: string;
      tree_id: string;
      branch_id: string;
      existing_family_member_id: string | null;
      position_label: string | null;
    }>(
      `SELECT i.id,i.tree_id,i.branch_id,i.existing_family_member_id,i.position_label
       FROM app.contributor_invitations i
       WHERE i.id=$1 AND i.invited_email=$2 AND i.status='pending' AND i.expires_at>now()
       FOR UPDATE OF i`,
      [invitationId, user.email],
    )
  ).rows[0];
  if (!invitation) throw new ApiError("INVALID_INVITATION", 409);
  const occupied = await client.query(
    `SELECT 1 FROM app.branch_grants WHERE tree_id=$1 AND root_subfamily_id=$2
     AND role='branch_editor' AND revoked_at IS NULL FOR UPDATE`,
    [invitation.tree_id, invitation.branch_id],
  );
  if (occupied.rowCount) throw new ApiError("BRANCH_ALREADY_ASSIGNED", 409);
  const memberId = invitation.existing_family_member_id;
  if (!memberId) throw new ApiError("FAMILY_MEMBER_UNAVAILABLE", 409);
  await client.query(
    `INSERT INTO app.tree_memberships(
      tree_id,user_id,role,invited_by,affiliation_status
    ) SELECT tree_id,$2,'viewer',inviter_user_id,'active'
      FROM app.contributor_invitations WHERE id=$1`,
    [invitation.id, user.id],
  );
  const branchAvailable = await client.query(
    `SELECT 1 FROM app.subfamilies WHERE id=$1 AND tree_id=$2
     AND status='active' AND deleted_at IS NULL`,
    [invitation.branch_id, invitation.tree_id],
  );
  if (!branchAvailable.rowCount) throw new ApiError("BRANCH_UNAVAILABLE", 409);
  await client.query(
    `INSERT INTO app.branch_grants(
      user_id,tree_id,root_subfamily_id,role,granted_by
    ) SELECT $2,tree_id,branch_id,'branch_editor',inviter_user_id
      FROM app.contributor_invitations WHERE id=$1`,
    [invitation.id, user.id],
  );
  if (memberId) {
    const linked = await client.query<{ gender: "male" | "female" | "unspecified" }>(
      `UPDATE app.family_members SET linked_user_id=$2,
        updated_by=$2,updated_at=now(),version=version+1
       WHERE id=$1 AND tree_id=$3 AND linked_user_id IS NULL AND deleted_at IS NULL
       RETURNING gender`,
      [memberId, user.id, invitation.tree_id],
    );
    if (!linked.rowCount) throw new ApiError("FAMILY_MEMBER_UNAVAILABLE", 409);
    await client.query("UPDATE app.users SET profile_gender=$2,updated_at=now() WHERE id=$1", [
      user.id,
      linked.rows[0].gender,
    ]);
  }
  await client.query(
    `UPDATE app.tree_memberships SET family_member_id=$3
     WHERE tree_id=$1 AND user_id=$2`,
    [invitation.tree_id, user.id, memberId],
  );
  await client.query(
    `UPDATE app.contributor_invitations
     SET status='accepted',accepted_at=now(),updated_at=now() WHERE id=$1`,
    [invitation.id],
  );
  await client.query(
    `INSERT INTO app.tree_activity(
      tree_id,branch_id,actor_user_id,subject_user_id,action_type,target_type,target_id
    ) VALUES($1,$2,$3,$3,'invitation_accepted','user',$3)`,
    [invitation.tree_id, invitation.branch_id, user.id],
  );
}
