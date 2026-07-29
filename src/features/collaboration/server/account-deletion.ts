import type { PoolClient } from "pg";

export async function deleteContributorIdentity(
  client: PoolClient,
  userId: string,
  revokedBy: string,
): Promise<void> {
  await client.query("UPDATE app.family_members SET linked_user_id=NULL WHERE linked_user_id=$1", [
    userId,
  ]);
  await client.query(
    `UPDATE app.branch_grants SET revoked_at=now(),revoked_by=$2
     WHERE user_id=$1 AND revoked_at IS NULL`,
    [userId, revokedBy],
  );
  await client.query(
    `UPDATE app.tree_memberships SET family_member_id=NULL,
       affiliation_status='removed',revoked_at=now(),revoked_by=$2
     WHERE user_id=$1 AND role<>'owner' AND revoked_at IS NULL`,
    [userId, revokedBy],
  );
  await client.query(
    `UPDATE app.ownership_transfers SET status='cancelled',updated_at=now()
     WHERE proposed_owner_user_id=$1 AND status='pending'`,
    [userId],
  );
  await client.query(
    `UPDATE app.sessions SET revoked_at=now(),revocation_reason='account_deleted'
     WHERE user_id=$1 AND revoked_at IS NULL`,
    [userId],
  );
  await client.query(
    `UPDATE app.email_verification_tokens SET invalidated_at=now()
     WHERE user_id=$1 AND consumed_at IS NULL AND invalidated_at IS NULL`,
    [userId],
  );
  await client.query(
    `UPDATE app.password_reset_tokens SET invalidated_at=now()
     WHERE user_id=$1 AND consumed_at IS NULL AND invalidated_at IS NULL`,
    [userId],
  );
  await client.query("DELETE FROM app.password_credentials WHERE user_id=$1", [userId]);
  await client.query("DELETE FROM app.oauth_accounts WHERE user_id=$1", [userId]);
  await client.query("DELETE FROM app.totp_credentials WHERE user_id=$1", [userId]);
  await client.query(
    `UPDATE app.users SET
       email='deleted+'||id::text||'@invalid.local',
       full_name_en='Deleted User',
       full_name_ar='مستخدم محذوف',
       status='deleted',deleted_at=now(),updated_at=now()
     WHERE id=$1`,
    [userId],
  );
}
