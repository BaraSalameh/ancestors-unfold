import { beforeEach, describe, expect, it, vi } from "vitest";

const query = vi.fn();

vi.mock("@/shared/server/database", () => ({
  transaction: vi.fn(
    async (
      _userId: string,
      _sessionId: string,
      _requestId: string,
      callback: (client: { query: typeof query }) => Promise<unknown>,
    ) => callback({ query }),
  ),
}));

vi.mock("./authorization", () => ({ requireTreeOwner: vi.fn() }));

import { handleBranchRequest } from "./branch-handler";

const treeId = "10000000-0000-4000-8000-000000000001";
const branchId = "20000000-0000-4000-8000-000000000002";
const session = {
  id: "session",
  user_id: "30000000-0000-4000-8000-000000000003",
  email: "owner@example.com",
};

// The mocked transaction sequences cover the complete branch mutation policy in one suite.
// eslint-disable-next-line max-lines-per-function
describe("branch lifecycle handler", () => {
  beforeEach(() => {
    query.mockReset();
  });

  it("rejects direct deactivation because verified confirmation is required", async () => {
    const request = new Request(`http://localhost/api/trees/${treeId}/branches/${branchId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        batchId: "40000000-0000-4000-8000-000000000004",
        expectedVersion: 4,
        status: "inactive",
      }),
    });

    await expect(
      handleBranchRequest(
        request,
        new URL(request.url),
        session,
        "50000000-0000-4000-8000-000000000005",
      ),
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
    expect(query).not.toHaveBeenCalled();
  });

  it("rejects a stale mutation before changing the branch", async () => {
    query.mockResolvedValueOnce({ rowCount: 1, rows: [{ version: 7 }] });
    const request = new Request(`http://localhost/api/trees/${treeId}/branches/${branchId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        batchId: "40000000-0000-4000-8000-000000000004",
        expectedVersion: 4,
        name_en: "Changed",
      }),
    });

    await expect(
      handleBranchRequest(
        request,
        new URL(request.url),
        session,
        "50000000-0000-4000-8000-000000000005",
      ),
    ).rejects.toMatchObject({ code: "VERSION_CONFLICT", status: 409 });
    expect(query).toHaveBeenCalledTimes(1);
  });

  it.each([
    [
      "DUPLICATE_BRANCH_NAME",
      {
        id: branchId,
        name_en: "Main",
        name_ar: "رئيسي",
        linked_male_id: "60000000-0000-4000-8000-000000000006",
      },
    ],
    [
      "DUPLICATE_BRANCH_ROOT",
      {
        id: branchId,
        name_en: "Other",
        name_ar: "آخر",
        linked_male_id: "70000000-0000-4000-8000-000000000007",
      },
    ],
  ])("rejects manual branch creation with %s", async (code, existing) => {
    query
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ version: 4 }] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ allowed: true }] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [existing] });
    const request = new Request(`http://localhost/api/trees/${treeId}/branches`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        batchId: "40000000-0000-4000-8000-000000000004",
        expectedVersion: 4,
        name_en: code === "DUPLICATE_BRANCH_NAME" ? " main " : "New",
        name_ar: "جديد",
        rootFamilyMemberId:
          code === "DUPLICATE_BRANCH_ROOT"
            ? "70000000-0000-4000-8000-000000000007"
            : "80000000-0000-4000-8000-000000000008",
        status: "active",
      }),
    });

    await expect(
      handleBranchRequest(
        request,
        new URL(request.url),
        session,
        "50000000-0000-4000-8000-000000000005",
      ),
    ).rejects.toMatchObject({ code, status: 409 });
    expect(query).toHaveBeenCalledTimes(4);
    expect(query.mock.calls[3][1]).toEqual([treeId]);
  });

  it("rejects editing a branch into a duplicate name", async () => {
    query
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ version: 4 }] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [] })
      .mockResolvedValueOnce({
        rowCount: 2,
        rows: [
          { id: branchId, name_en: "Main", name_ar: null, linked_male_id: null },
          {
            id: "60000000-0000-4000-8000-000000000006",
            name_en: "Other",
            name_ar: null,
            linked_male_id: null,
          },
        ],
      });
    const request = new Request(`http://localhost/api/trees/${treeId}/branches/${branchId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        batchId: "40000000-0000-4000-8000-000000000004",
        expectedVersion: 4,
        name_en: " other ",
      }),
    });

    await expect(
      handleBranchRequest(
        request,
        new URL(request.url),
        session,
        "50000000-0000-4000-8000-000000000005",
      ),
    ).rejects.toMatchObject({ code: "DUPLICATE_BRANCH_NAME", status: 409 });
    expect(query).toHaveBeenCalledTimes(3);
  });

  it("deletes an inactive unreferenced branch using the ownership-transfer column", async () => {
    query
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ version: 4 }] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [] })
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ name_en: "Duplicate", name_ar: null, status: "inactive", linked_male_id: null }],
      })
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ blocked: false }] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ version: 5 }] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [] });
    const request = new Request(`http://localhost/api/trees/${treeId}/branches/${branchId}`, {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        batchId: "40000000-0000-4000-8000-000000000004",
        expectedVersion: 4,
      }),
    });

    const response = await handleBranchRequest(
      request,
      new URL(request.url),
      session,
      "50000000-0000-4000-8000-000000000005",
    );

    expect(response?.status).toBe(200);
    expect(await response?.json()).toMatchObject({ deleted: true, version: 5 });
    expect(query.mock.calls[3][0]).toContain("previous_owner_branch_id=$2");
    expect(query.mock.calls[3][0]).not.toContain(
      "ownership_transfers WHERE tree_id=$1 AND branch_id",
    );
  });
});
