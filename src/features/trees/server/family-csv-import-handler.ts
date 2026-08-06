import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import type { Session } from "@/features/auth/server";
import { reconcileMemberImages } from "@/features/members/server";
import { enforceRateLimit, parseBody, ApiError } from "@/server/security";
import { familyCsvApplySchema, familyCsvPreviewSchema } from "@/server/schemas";
import { jsonResponse as json } from "@/shared/http/response";
import { query, transaction } from "@/shared/server/database";
import {
  parseFamilyCsv,
  remapFamilyCsvPreview,
  validateFamilyImportGraph,
  familyCsvBranchConflictIssues,
} from "../domain/family-csv-import";
import { importSnapshot } from "./snapshot-repository";
import { requireFamilyCsvImportManager } from "./family-csv-import-protection";
import { loadTreeBranches } from "./snapshot-branch-uniqueness";

async function recordImportAttempt(request: Request, session: Session) {
  const rate = await enforceRateLimit(
    request,
    "family_csv_import",
    `${session.user_id}:family_csv_import`,
    20,
    15,
  );
  await query(
    `INSERT INTO app.auth_attempts(user_id,attempt_type,identifier_hash,ip_address,succeeded)
     VALUES($1,'family_csv_import',$2,$3,true)`,
    [session.user_id, rate.hash, rate.ip],
  );
}

async function previewContext(client: PoolClient, treeId: string, userId: string) {
  await requireFamilyCsvImportManager(client, treeId, userId);
  const tree = await client.query<{ version: number }>(
    "SELECT version FROM app.family_trees WHERE id=$1 AND deleted_at IS NULL",
    [treeId],
  );
  if (!tree.rowCount) throw new ApiError("NOT_FOUND", 404);
  return {
    currentBranches: await loadTreeBranches(client, treeId),
    expectedVersion: tree.rows[0].version,
    mappingRequirements: {
      linkedMembers: [],
      grantedBranches: [],
    },
  };
}

export async function handleFamilyCsvImportRequest(
  request: Request,
  url: URL,
  session: Session,
  requestId: string,
): Promise<Response | null> {
  const preview = url.pathname.match(/^\/api\/trees\/([0-9a-f-]+)\/imports\/csv\/preview$/);
  const apply = url.pathname.match(/^\/api\/trees\/([0-9a-f-]+)\/imports\/csv$/);
  if ((!preview && !apply) || request.method !== "POST") return null;
  const treeId = (preview ?? apply)![1];
  await recordImportAttempt(request, session);

  if (preview) {
    const body = await parseBody(request, familyCsvPreviewSchema, 15 * 1024 * 1024);
    const context = await transaction(session.user_id, session.id, requestId, (client) =>
      previewContext(client, treeId, session.user_id),
    );
    const parsed = parseFamilyCsv(body.csv);
    if (!parsed.ok) return json({ code: "INVALID_FAMILY_CSV", issues: parsed.issues }, 422);
    const branchIssues = familyCsvBranchConflictIssues(context.currentBranches, [
      ...context.currentBranches,
      ...parsed.preview.subfamilies,
    ]);
    if (branchIssues.length) return json({ code: "INVALID_FAMILY_CSV", issues: branchIssues }, 422);
    const { currentBranches: _currentBranches, ...publicContext } = context;
    return json({ ...remapFamilyCsvPreview(parsed.preview, randomUUID), ...publicContext });
  }

  const body = await parseBody(request, familyCsvApplySchema, 15 * 1024 * 1024);
  const snapshot = {
    batchId: body.batchId,
    expectedVersion: body.expectedVersion,
    members: body.members.map((member) => ({
      ...member,
      citizen_status: member.citizen_status ?? "resident",
    })),
    subfamilies: body.subfamilies.map((branch) => ({ ...branch, attachments: [] })),
  };
  const graphIssues = validateFamilyImportGraph(snapshot.members, snapshot.subfamilies);
  if (graphIssues.length)
    return json({ code: "INVALID_FAMILY_IMPORT", issues: graphIssues.slice(0, 500) }, 422);
  const sourceMemberIds = new Map(
    body.sourceMemberIds.map(({ targetId, sourceId }) => [targetId, sourceId]),
  );
  const sourceBranchIds = new Map(
    body.sourceBranchIds.map(({ targetId, sourceId }) => [targetId, sourceId]),
  );
  const result = await importSnapshot(session, requestId, treeId, snapshot, {
    familyCsv: { sourceMemberIds, sourceBranchIds },
  });
  await reconcileMemberImages(session, requestId, treeId);
  return json(result);
}
