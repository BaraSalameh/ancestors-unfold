import type { PoolClient } from "pg";
import { describe, expect, it, vi } from "vitest";
import { analysisBranches, resolveAnalysisScope } from "./scope";

const treeId = "00000000-0000-4000-8000-000000000001";
const userId = "00000000-0000-4000-8000-000000000002";
const branchId = "00000000-0000-4000-8000-000000000003";

const contributorAccess = {
  allowed: true,
  is_owner: false,
  tree_name_en: "Family",
  tree_name_ar: "العائلة",
};

describe("analysis scope", () => {
  it("gives contributors whole-tree scope when no branch is requested", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [contributorAccess], rowCount: 1 });

    const scope = await resolveAnalysisScope(
      { query } as unknown as PoolClient,
      treeId,
      userId,
      null,
    );

    expect(scope).toMatchObject({ kind: "tree", branchId: null, role: "contributor" });
    expect(String(query.mock.calls[0][0])).toContain("app.can_analyze_tree");
    expect(query).toHaveBeenCalledTimes(1);
  });

  it("allows contributors to select any branch in their tree", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [contributorAccess], rowCount: 1 })
      .mockResolvedValueOnce({
        rows: [{ id: branchId, name_en: "Other branch", name_ar: "فرع آخر" }],
        rowCount: 1,
      });

    const scope = await resolveAnalysisScope(
      { query } as unknown as PoolClient,
      treeId,
      userId,
      branchId,
    );

    expect(scope).toMatchObject({ kind: "branch", branchId, role: "contributor" });
  });

  it("rejects users who are not active analysis collaborators", async () => {
    const query = vi.fn().mockResolvedValue({
      rows: [{ ...contributorAccess, allowed: false }],
      rowCount: 1,
    });

    await expect(
      resolveAnalysisScope({ query } as unknown as PoolClient, treeId, userId, null),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("returns the complete branch catalog regardless of collaborator role", async () => {
    const rows = [
      { id: branchId, name_en: "First", name_ar: null },
      { id: "00000000-0000-4000-8000-000000000004", name_en: "Second", name_ar: null },
    ];
    const query = vi.fn().mockResolvedValue({ rows, rowCount: rows.length });

    await expect(
      analysisBranches({ query } as unknown as PoolClient, {
        kind: "tree",
        treeId,
        treeNameEn: "Family",
        treeNameAr: null,
        branchId: null,
        branchNameEn: null,
        branchNameAr: null,
        role: "contributor",
      }),
    ).resolves.toEqual(rows);
  });
});
