import type { PoolClient } from "pg";
import type { Session } from "@/features/auth/server";
import type { FamilyMember, SubFamily } from "@/features/members/domain";
import { ApiError } from "@/server/security";
import { transaction } from "@/shared/server/database";
import { exportFamilyCsv } from "../domain/family-csv-export";
import { loadRenderableSnapshot } from "./snapshot-reader";

async function ownerSnapshot(client: PoolClient, treeId: string, userId: string) {
  const tree = await client.query<{ version: number; owner_user_id: string }>(
    `SELECT version,owner_user_id FROM app.family_trees
     WHERE id=$1 AND deleted_at IS NULL`,
    [treeId],
  );
  if (!tree.rowCount) throw new ApiError("NOT_FOUND", 404);
  if (tree.rows[0].owner_user_id !== userId) throw new ApiError("FORBIDDEN", 403);
  return loadRenderableSnapshot(client, treeId, tree.rows[0].version, true);
}

export async function handleFamilyCsvExportRequest(
  request: Request,
  url: URL,
  session: Session,
  requestId: string,
): Promise<Response | null> {
  const match = url.pathname.match(/^\/api\/trees\/([0-9a-f-]+)\/exports\/csv$/);
  if (!match || request.method !== "GET") return null;
  const snapshot = await transaction(session.user_id, session.id, requestId, (client) =>
    ownerSnapshot(client, match[1], session.user_id),
  );
  return new Response(
    exportFamilyCsv(snapshot.members as FamilyMember[], snapshot.subfamilies as SubFamily[]),
    {
      headers: {
        "cache-control": "private, no-store",
        "content-disposition": 'attachment; filename="family-tree.csv"',
        "content-type": "text/csv; charset=utf-8",
      },
    },
  );
}
