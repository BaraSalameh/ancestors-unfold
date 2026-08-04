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
vi.mock("@/shared/server/email", () => ({
  branchDeactivationCodeMail: vi.fn(),
  sendMail: vi.fn(),
}));
vi.mock("./authorization", () => ({ requireTreeOwner: vi.fn() }));

import { branchDeactivationCodeHash } from "./collaboration-crypto";
import { handleBranchDeactivationRequest } from "./branch-deactivation-handler";

const treeId = "10000000-0000-4000-8000-000000000001";
const branchId = "20000000-0000-4000-8000-000000000002";
const challengeId = "30000000-0000-4000-8000-000000000003";
const session = {
  id: "session",
  user_id: "40000000-0000-4000-8000-000000000004",
  email: "owner@example.com",
};

describe("verified branch deactivation", () => {
  beforeEach(() => query.mockReset());

  it("deactivates and reconciles without deleting genealogy", async () => {
    const code = "012345";
    query.mockImplementation(async (text?: string) => {
      const statement = String(text ?? "");
      if (statement.includes("FROM app.branch_deactivation_challenges"))
        return {
          rowCount: 1,
          rows: [
            {
              tree_id: treeId,
              branch_id: branchId,
              verification_code_hash: branchDeactivationCodeHash(challengeId, code),
              expires_at: new Date(Date.now() + 60_000).toISOString(),
            },
          ],
        };
      if (statement.includes("SELECT version FROM app.family_trees"))
        return { rowCount: 1, rows: [{ version: 4 }] };
      if (statement.includes("SELECT b.name_en,b.name_ar"))
        return {
          rowCount: 1,
          rows: [
            {
              name_en: "North",
              name_ar: null,
              contributor_user_id: null,
              contributor_name_en: null,
              contributor_name_ar: null,
            },
          ],
        };
      if (statement.includes("UPDATE app.family_trees SET version"))
        return { rowCount: 1, rows: [{ version: 5 }] };
      return { rowCount: 0, rows: [] };
    });
    const request = new Request(
      `http://localhost/api/branch-deactivation-requests/${challengeId}/confirm`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          confirmation: "DELETE",
          code,
          expectedVersion: 4,
          batchId: "50000000-0000-4000-8000-000000000005",
        }),
      },
    );

    const response = await handleBranchDeactivationRequest(
      request,
      new URL(request.url),
      session,
      "60000000-0000-4000-8000-000000000006",
    );
    expect(response?.status).toBe(200);
    const statements = query.mock.calls.map(([text]) => String(text));
    expect(statements.some((text) => text.includes("status='inactive'"))).toBe(true);
    expect(statements.some((text) => text.includes("reconcile_branch_structure"))).toBe(true);
    expect(statements.some((text) => text.includes("DELETE FROM app.family_members"))).toBe(false);
    expect(statements.some((text) => text.includes("DELETE FROM app.parent_child"))).toBe(false);
    expect(statements.some((text) => text.includes("store_tree_snapshot"))).toBe(true);
  });
});
