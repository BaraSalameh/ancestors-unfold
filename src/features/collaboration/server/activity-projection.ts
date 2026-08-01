import { ApiError } from "@/server/security";

export type ActivityDatabaseRow = {
  id: string;
  action_type: string;
  actor_user_id: string | null;
  actor_name_en: string | null;
  actor_name_ar: string | null;
  subject_user_id: string | null;
  subject_name_en: string | null;
  subject_name_ar: string | null;
  target_type: string;
  target_id: string | null;
  target_name_en: string | null;
  target_name_ar: string | null;
  branch_id: string | null;
  branch_name_en: string | null;
  branch_name_ar: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
};
type ActivityCursor = { createdAt: string; id: string };
type ActivityGroup = { item: Record<string, unknown>; endCursor: ActivityCursor };

const activityPerson = (userId: string | null, nameEn: string | null, nameAr: string | null) =>
  nameEn && nameAr ? { userId, nameEn, nameAr } : null;

function canJoinEditingSession(row: ActivityDatabaseRow, previous: ActivityGroup | undefined) {
  if (row.action_type !== "tree_updated" || previous?.item.actionType !== "tree_updated")
    return false;
  const actor = previous.item.actor as { userId: string | null } | null;
  const elapsed =
    new Date(previous.item.createdAt as string).getTime() - new Date(row.created_at).getTime();
  return (
    actor?.userId === row.actor_user_id &&
    previous.item.branchId === row.branch_id &&
    elapsed <= 15 * 60_000
  );
}

function activityGroupFor(row: ActivityDatabaseRow, version: number): ActivityGroup {
  const branchTarget = row.target_type === "branch";
  return {
    item: {
      id: row.id,
      actionType: row.action_type,
      actor: activityPerson(row.actor_user_id, row.actor_name_en, row.actor_name_ar),
      subject: activityPerson(row.subject_user_id, row.subject_name_en, row.subject_name_ar),
      target: {
        type: row.target_type,
        id: row.target_id,
        nameEn: row.target_name_en ?? (branchTarget ? row.branch_name_en : null),
        nameAr: row.target_name_ar ?? (branchTarget ? row.branch_name_ar : null),
      },
      branchId: row.branch_id,
      branch:
        row.branch_name_en || row.branch_name_ar
          ? { nameEn: row.branch_name_en, nameAr: row.branch_name_ar }
          : null,
      createdAt: row.created_at,
      editingSession:
        row.action_type === "tree_updated"
          ? {
              firstVersion: version,
              lastVersion: version,
              snapshotCount: 1,
              endedAt: row.created_at,
            }
          : null,
    },
    endCursor: { createdAt: row.created_at, id: row.id },
  };
}

export const activityGroups = (rows: ActivityDatabaseRow[]): ActivityGroup[] => {
  const projected: ActivityGroup[] = [];
  for (const row of rows) {
    const previous = projected.at(-1);
    const version = Number(row.metadata.version);
    if (canJoinEditingSession(row, previous)) {
      const editingSession = previous!.item.editingSession as {
        firstVersion: number;
        lastVersion: number;
        snapshotCount: number;
        endedAt: string;
      };
      editingSession.firstVersion = Number.isFinite(version)
        ? Math.min(editingSession.firstVersion, version)
        : editingSession.firstVersion;
      editingSession.snapshotCount += 1;
      previous!.endCursor = { createdAt: row.created_at, id: row.id };
      continue;
    }
    projected.push(activityGroupFor(row, version));
  }
  return projected;
};

export function projectActivity(rows: ActivityDatabaseRow[], limit: number) {
  return activityGroups(rows)
    .slice(0, limit)
    .map(({ item }) => item);
}

const encodeActivityCursor = (cursor: ActivityCursor) =>
  Buffer.from(JSON.stringify(cursor)).toString("base64url");

export const decodeActivityCursor = (value: string | null): ActivityCursor | null => {
  if (!value) return null;
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as ActivityCursor;
    if (
      typeof parsed.createdAt !== "string" ||
      !Number.isFinite(Date.parse(parsed.createdAt)) ||
      typeof parsed.id !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(parsed.id)
    )
      throw new Error("invalid cursor");
    return parsed;
  } catch {
    throw new ApiError("INVALID_CURSOR", 400);
  }
};

export const activityPageFromGroups = (groups: ActivityGroup[], limit: number) => {
  const pageGroups = groups.slice(0, limit);
  return {
    items: pageGroups.map(({ item }) => item),
    nextCursor:
      groups.length > limit
        ? encodeActivityCursor(pageGroups[pageGroups.length - 1].endCursor)
        : null,
  };
};

export function projectActivityPage(rows: ActivityDatabaseRow[], limit: number) {
  return activityPageFromGroups(activityGroups(rows), limit);
}
