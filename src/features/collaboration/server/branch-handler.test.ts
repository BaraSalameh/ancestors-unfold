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
});
