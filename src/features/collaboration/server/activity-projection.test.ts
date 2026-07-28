import { describe, expect, it } from "vitest";
import { projectActivity, projectActivityPage } from "./handler";

const activityRow = (version: number, createdAt: string) => ({
  id: `activity-${version}`,
  action_type: "tree_updated",
  actor_user_id: "actor-1",
  actor_name_en: "Editor",
  actor_name_ar: "محرر",
  subject_user_id: null,
  subject_name_en: null,
  subject_name_ar: null,
  target_type: "family_tree",
  target_id: "tree-1",
  target_name_en: "Tree",
  target_name_ar: "شجرة",
  branch_id: "branch-1",
  branch_name_en: "Branch",
  branch_name_ar: "فرع",
  metadata: { version },
  created_at: createdAt,
});

describe("projectActivity", () => {
  it("groups consecutive snapshots from one editing session", () => {
    const result = projectActivity(
      [activityRow(12, "2026-07-28T10:10:00.000Z"), activityRow(11, "2026-07-28T10:00:00.000Z")],
      100,
    );

    expect(result).toHaveLength(1);
    expect(result[0].editingSession).toEqual({
      firstVersion: 11,
      lastVersion: 12,
      snapshotCount: 2,
      endedAt: "2026-07-28T10:10:00.000Z",
    });
  });

  it("separates editing sessions after a fifteen-minute gap", () => {
    const result = projectActivity(
      [activityRow(12, "2026-07-28T10:20:01.000Z"), activityRow(11, "2026-07-28T10:00:00.000Z")],
      100,
    );

    expect(result).toHaveLength(2);
  });

  it("places the cursor after the complete final editing session", () => {
    const rows = [
      activityRow(14, "2026-07-28T11:00:00.000Z"),
      activityRow(13, "2026-07-28T10:30:00.000Z"),
      activityRow(12, "2026-07-28T10:25:00.000Z"),
      activityRow(11, "2026-07-28T10:00:00.000Z"),
    ];
    const firstPage = projectActivityPage(rows, 2);
    const cursor = JSON.parse(
      Buffer.from(firstPage.nextCursor ?? "", "base64url").toString("utf8"),
    ) as { id: string };
    const secondPage = projectActivityPage(rows.slice(3), 2);

    expect(firstPage.items.map((item) => item.id)).toEqual(["activity-14", "activity-13"]);
    expect(cursor.id).toBe("activity-12");
    expect(secondPage.items.map((item) => item.id)).toEqual(["activity-11"]);
    expect(secondPage.nextCursor).toBeNull();
  });
});
