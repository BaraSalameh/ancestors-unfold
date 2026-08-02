import { transaction } from "@/shared/server/database";
import { jsonResponse as json } from "@/shared/http/response";
import { collaborationTokenHash } from "./collaboration-crypto";

export async function validatePublicInvitation(request: Request) {
  const encodedToken = new URL(request.url).pathname.match(/^\/api\/invitations\/([^/]+)$/)?.[1];
  if (!encodedToken || request.method !== "GET") return undefined;
  let token: string;
  try {
    token = decodeURIComponent(encodedToken);
  } catch {
    return json({ valid: false, code: "INVALID_INVITATION" }, 404, {
      "cache-control": "no-store",
    });
  }
  const result = await transaction(null, null, crypto.randomUUID(), async (client) =>
    client.query(`SELECT * FROM app.public_invitation($1)`, [collaborationTokenHash(token)]),
  );
  return result.rowCount
    ? json({ valid: true, ...result.rows[0] }, 200, { "cache-control": "no-store" })
    : json({ valid: false, code: "INVALID_INVITATION" }, 404, {
        "cache-control": "no-store",
      });
}
