import type { PoolClient } from "pg";
import { describe, expect, it, vi } from "vitest";
import type { AnalysisScope } from "../domain/types";
import { deleteSavedView, listSavedViews, updateSavedView } from "./saved-views-repository";

const contributorScope: AnalysisScope = {
  kind: "tree",
  treeId: "00000000-0000-4000-8000-000000000001",
  treeNameEn: "Family",
  treeNameAr: null,
  branchId: null,
  branchNameEn: null,
  branchNameAr: null,
  role: "contributor",
};

describe("shared analysis saved views", () => {
  it("lists the tree-wide collection and computes contributor management rights", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [], rowCount: 0 });

    await listSavedViews(
      { query } as unknown as PoolClient,
      contributorScope,
      "00000000-0000-4000-8000-000000000002",
    );

    expect(String(query.mock.calls[0][0])).not.toContain("AND user_id=$2");
    expect(query.mock.calls[0][1]).toEqual([
      contributorScope.treeId,
      "00000000-0000-4000-8000-000000000002",
      false,
    ]);
  });

  it("only grants repository-level update and delete overrides to owners", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [], rowCount: 0 });
    const ownerScope = { ...contributorScope, role: "owner" as const };
    const userId = "00000000-0000-4000-8000-000000000002";
    const viewId = "00000000-0000-4000-8000-000000000003";

    await updateSavedView({ query } as unknown as PoolClient, ownerScope, userId, viewId, {
      name: "Shared",
    });
    await deleteSavedView({ query } as unknown as PoolClient, contributorScope, userId, viewId);

    expect(query.mock.calls[0][1]).toEqual([
      contributorScope.treeId,
      userId,
      viewId,
      "Shared",
      null,
      true,
    ]);
    expect(query.mock.calls[1][1]).toEqual([contributorScope.treeId, userId, viewId, false]);
  });
});
