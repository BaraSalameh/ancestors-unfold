import { randomBytes } from "node:crypto";
import type { PoolClient } from "pg";
import { currentTreeForSession } from "@/features/collaboration/server";
import { databaseConfigured, query } from "@/shared/server/database";
import { requestIp } from "@/server/security";
import { hashSessionToken } from "./auth-crypto";
import { sessionTokenFrom } from "./auth-cookies";

export type Session = {
  id: string;
  user_id: string;
  email: string;
  full_name_en: string;
  full_name_ar: string;
  profile_gender: "male" | "female" | "unspecified";
  show_google_welcome: boolean;
};

export async function authenticate(request: Request): Promise<Session | null> {
  const token = sessionTokenFrom(request);
  if (!token || !databaseConfigured) return null;
  const result = await query<Session>(
    `SELECT s.id,s.user_id,u.email,u.full_name_en,u.full_name_ar,u.profile_gender,
      s.show_google_welcome FROM app.sessions s
    JOIN app.users u ON u.id=s.user_id LEFT JOIN app.password_credentials p ON p.user_id=u.id
    WHERE s.token_hash=$1 AND s.revoked_at IS NULL AND s.idle_expires_at>now() AND s.absolute_expires_at>now()
      AND u.status='active' AND (p.user_id IS NULL OR p.credential_version=s.credential_version)`,
    [hashSessionToken(token)],
  );
  return result.rows[0] ?? null;
}

const userDto = (session: Session) => ({
  id: session.user_id,
  email: session.email,
  fullNameEn: session.full_name_en,
  fullNameAr: session.full_name_ar,
  gender: session.profile_gender,
});

export async function authSessionDto(session: Session, requestId: string) {
  const current = await currentTreeForSession(
    { id: session.id || null, user_id: session.user_id },
    requestId,
  );
  const tree = current.rows[0];
  return {
    user: userDto(session),
    createdAt: new Date().toISOString(),
    currentTree: tree
      ? { id: tree.id, nameEn: tree.name_en, nameAr: tree.name_ar, role: tree.role }
      : null,
  };
}

export async function createSession(
  client: PoolClient,
  userId: string,
  version: number,
  request: Request,
  showGoogleWelcome = false,
) {
  const token = randomBytes(32).toString("base64url");
  const idleHours = Number(process.env.SESSION_IDLE_HOURS ?? 24);
  const absoluteDays = Number(process.env.SESSION_ABSOLUTE_DAYS ?? 30);
  await client.query(
    `INSERT INTO app.sessions(user_id,token_hash,credential_version,idle_expires_at,absolute_expires_at,ip_address,user_agent,show_google_welcome)
    VALUES($1,$2,$3,now()+($4||' hours')::interval,now()+($5||' days')::interval,$6,$7,$8)`,
    [
      userId,
      hashSessionToken(token),
      version,
      idleHours,
      absoluteDays,
      requestIp(request),
      request.headers.get("user-agent")?.slice(0, 1000),
      showGoogleWelcome,
    ],
  );
  return { token, maxAge: absoluteDays * 86400 };
}
