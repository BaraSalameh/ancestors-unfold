import { databaseConfigured, query } from "@/server/infrastructure/database";
import { jsonResponse } from "@/server/http/response";

export async function handleOperationsRequest(request: Request): Promise<Response | undefined> {
  const { pathname } = new URL(request.url);
  if (pathname === "/api/health") return jsonResponse({ status: "ok" });
  if (pathname !== "/api/ready") return undefined;
  if (!databaseConfigured) {
    return jsonResponse({ status: "not_ready", reason: "DATABASE_URL is not configured" }, 503);
  }
  const result = await query<{ count: string }>(
    "SELECT count(*)::text count FROM public.schema_migrations",
  );
  const required = Number(process.env.REQUIRED_MIGRATIONS ?? 12);
  const applied = Number(result.rows[0]?.count ?? 0);
  return applied >= required
    ? jsonResponse({ status: "ready", migrations: applied })
    : jsonResponse({ status: "not_ready", reason: "migrations missing", required, applied }, 503);
}
