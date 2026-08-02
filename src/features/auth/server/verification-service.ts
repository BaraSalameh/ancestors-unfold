import { randomUUID } from "node:crypto";
import { ApiError } from "@/server/security";
import { query, transaction } from "@/shared/server/database";
import { sendMail, verificationMail } from "@/shared/server/email";
import { hashEmailCode, newEmailCode } from "./auth-crypto";

export async function issueVerificationCode(
  userId: string,
  email: string,
  purpose: "registration" | "email_change" | "account_deletion",
  pendingEmail: string | null,
  ip: string | null,
) {
  const code = newEmailCode();
  const token = await transaction(userId, null, randomUUID(), async (client) => {
    const recent = await client.query(
      "SELECT 1 FROM app.email_verification_tokens WHERE user_id=$1 AND purpose=$2 AND last_sent_at>now()-interval '60 seconds' AND consumed_at IS NULL AND invalidated_at IS NULL",
      [userId, purpose],
    );
    if (recent.rowCount) throw new ApiError("RESEND_TOO_SOON", 429);
    await client.query(
      "UPDATE app.email_verification_tokens SET invalidated_at=now() WHERE user_id=$1 AND purpose=$2 AND consumed_at IS NULL AND invalidated_at IS NULL",
      [userId, purpose],
    );
    const inserted = await client.query<{ expires_at: string }>(
      "INSERT INTO app.email_verification_tokens(user_id,token_hash,requested_ip,expires_at,purpose,pending_email,last_sent_at) VALUES($1,$2,$3,now()+interval '15 minutes',$4,$5,now()) RETURNING expires_at",
      [userId, hashEmailCode(code), ip, purpose, pendingEmail],
    );
    return inserted.rows[0];
  });
  try {
    await sendMail(verificationMail(email, code, purpose));
  } catch (error) {
    await query(
      "UPDATE app.email_verification_tokens SET invalidated_at=now() WHERE user_id=$1 AND purpose=$2 AND consumed_at IS NULL AND invalidated_at IS NULL",
      [userId, purpose],
    );
    throw error;
  }
  return token;
}
