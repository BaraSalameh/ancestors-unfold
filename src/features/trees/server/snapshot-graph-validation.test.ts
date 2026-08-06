import { describe, expect, it, vi } from "vitest";
import type { SnapshotInput } from "@/server/security";
import { validateBranchEditorRoot, validateSnapshotBranchRoots } from "./snapshot-graph-validation";

const snapshot = (gender: "male" | "female", includeMember = true): SnapshotInput => ({
  expectedVersion: 1,
  members: includeMember
    ? [
        {
          id: "member",
          name_en: "Member",
          name_ar: "",
          gender,
          citizen_status: "resident",
          created_at: "2026-08-06T00:00:00.000Z",
          updated_at: "2026-08-06T00:00:00.000Z",
        },
      ]
    : [],
  subfamilies: [
    {
      id: "branch",
      name_en: "Branch",
      name_ar: "",
      linked_male_id: "member",
      created_at: "2026-08-06T00:00:00.000Z",
      updated_at: "2026-08-06T00:00:00.000Z",
    },
  ],
});

describe("snapshot branch-root validation", () => {
  it("accepts an active male member in the submitted graph", () => {
    expect(() => validateSnapshotBranchRoots(snapshot("male"))).not.toThrow();
  });

  it.each([snapshot("male", false), snapshot("female")])(
    "rejects a missing or non-male linked member",
    (candidate) => {
      expect(() => validateSnapshotBranchRoots(candidate)).toThrow(
        expect.objectContaining({ code: "INVALID_SUBFAMILY_ROOT", status: 422 }),
      );
    },
  );

  it("prevents a branch editor from removing the assigned branch root", async () => {
    const client = {
      query: vi.fn().mockResolvedValue({ rows: [{ linked_male_id: "member" }] }),
    };
    await expect(
      validateBranchEditorRoot(client as never, "tree", "branch", snapshot("male", false)),
    ).rejects.toMatchObject({ code: "BRANCH_ROOT_REQUIRED", status: 422 });
    await expect(
      validateBranchEditorRoot(client as never, "tree", "branch", snapshot("male")),
    ).resolves.toBeUndefined();
  });
});
