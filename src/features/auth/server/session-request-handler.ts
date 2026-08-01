import { jsonResponse as json } from "@/shared/http/response";
import { query } from "@/shared/server/database";
import { sessionCookie } from "./auth-cookies";
import { authSessionDto, type Session } from "./session-service";

export async function handleCurrentSessionRequest(
  request: Request,
  url: URL,
  session: Session | null,
  requestId: string,
): Promise<Response | null> {
  if (url.pathname !== "/api/auth/session" || request.method !== "GET") return null;
  return session ? json(await authSessionDto(session, requestId)) : json(null);
}

export async function handleAuthenticatedSessionRequest(
  request: Request,
  url: URL,
  session: Session,
): Promise<Response | null> {
  if (url.pathname === "/api/auth/logout" && request.method === "POST") {
    await query("UPDATE app.sessions SET revoked_at=now(),revocation_reason='logout' WHERE id=$1", [
      session.id,
    ]);
    return json({ ok: true }, 200, { "set-cookie": sessionCookie("", 0) });
  }
  if (url.pathname === "/api/auth/sessions" && request.method === "GET") {
    const result = await query(
      `SELECT id,created_at,last_seen_at,idle_expires_at,absolute_expires_at,revoked_at,ip_address,user_agent
       FROM app.sessions WHERE user_id=$1 ORDER BY created_at DESC`,
      [session.user_id],
    );
    return json(result.rows);
  }
  const revoked = url.pathname.match(/^\/api\/auth\/sessions\/([0-9a-f-]+)$/);
  if (!revoked || request.method !== "DELETE") return null;
  await query(
    "UPDATE app.sessions SET revoked_at=now(),revocation_reason='user_revoked' WHERE id=$1 AND user_id=$2 AND revoked_at IS NULL",
    [revoked[1], session.user_id],
  );
  return json({ ok: true });
}
