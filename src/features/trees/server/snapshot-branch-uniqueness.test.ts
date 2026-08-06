import { describe, expect, it, vi } from "vitest";
import type { PoolClient } from "pg";
import { enforceSnapshotBranchUniqueness } from "./snapshot-branch-uniqueness";

const current = [
  { id: "one", name_en: "Legacy", name_ar: "قديم", linked_male_id: "root-one" },
  { id: "two", name_en: "legacy", name_ar: "قديم", linked_male_id: "root-two" },
];

const client = () =>
  ({
    query: vi.fn().mockResolvedValue({ rows: current, rowCount: current.length }),
  }) as unknown as PoolClient;

describe("snapshot branch uniqueness", () => {
  it("grandfathers unchanged duplicate branches", async () => {
    const database = client();
    await expect(
      enforceSnapshotBranchUniqueness(database, "tree", {
        expectedVersion: 1,
        members: [],
        subfamilies: current.map((branch) => ({
          ...branch,
          name_ar: branch.name_ar,
          created_at: "2026-08-01T00:00:00.000Z",
          updated_at: "2026-08-01T00:00:00.000Z",
        })),
      }),
    ).resolves.toBeUndefined();
    const query = vi.mocked(database.query);
    expect(query.mock.calls[0][0]).toContain("tree_id=$1 AND deleted_at IS NULL");
    expect(query.mock.calls[0][0]).not.toContain("status='active'");
    expect(query.mock.calls[0][1]).toEqual(["tree"]);
  });

  it("rejects new same-tree name and root conflicts", async () => {
    const base = current.map((branch) => ({
      ...branch,
      name_ar: branch.name_ar,
      created_at: "2026-08-01T00:00:00.000Z",
      updated_at: "2026-08-01T00:00:00.000Z",
    }));
    await expect(
      enforceSnapshotBranchUniqueness(client(), "tree", {
        expectedVersion: 1,
        members: [],
        subfamilies: [...base, { ...base[0], id: "three", name_en: " LEGACY ", name_ar: "مختلف" }],
      }),
    ).rejects.toMatchObject({ code: "DUPLICATE_BRANCH_NAME", status: 409 });
    await expect(
      enforceSnapshotBranchUniqueness(client(), "tree", {
        expectedVersion: 1,
        members: [],
        subfamilies: [
          ...base,
          { ...base[0], id: "three", name_en: "New", name_ar: "جديد", linked_male_id: "root-one" },
        ],
      }),
    ).rejects.toMatchObject({ code: "DUPLICATE_BRANCH_ROOT", status: 409 });
  });
});
