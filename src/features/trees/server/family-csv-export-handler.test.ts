import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/server/security";
import type { Session } from "@/features/auth/server";

const database = vi.hoisted(() => ({
  tree: { version: 4, owner_user_id: "owner" } as
    { version: number; owner_user_id: string } | undefined,
  transaction: vi.fn(),
}));

vi.mock("@/shared/server/database", () => ({
  transaction: database.transaction,
}));

import { handleFamilyCsvExportRequest } from "./family-csv-export-handler";

const session = { id: "session", user_id: "owner" } as Session;

function client() {
  return {
    query: vi.fn(async (text: string) => {
      if (text.includes("FROM app.family_trees"))
        return { rows: database.tree ? [database.tree] : [], rowCount: database.tree ? 1 : 0 };
      return { rows: [], rowCount: 0 };
    }),
  };
}

describe("family CSV export endpoint", () => {
  beforeEach(() => {
    database.tree = { version: 4, owner_user_id: "owner" };
    database.transaction.mockReset();
    database.transaction.mockImplementation(async (_userId, _sessionId, _requestId, callback) =>
      callback(client()),
    );
  });

  it("returns an owner-only private CSV download", async () => {
    const response = await handleFamilyCsvExportRequest(
      new Request("https://example.test/api/trees/dead-beef/exports/csv"),
      new URL("https://example.test/api/trees/dead-beef/exports/csv"),
      session,
      "request",
    );

    expect(response?.status).toBe(200);
    expect(response?.headers.get("content-type")).toBe("text/csv; charset=utf-8");
    expect(response?.headers.get("cache-control")).toBe("private, no-store");
    const bytes = new Uint8Array(await response!.arrayBuffer());
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    expect(new TextDecoder().decode(bytes)).toMatch(/^member_ref,/);
  });

  it("rejects contributors", async () => {
    await expect(
      handleFamilyCsvExportRequest(
        new Request("https://example.test/api/trees/dead-beef/exports/csv"),
        new URL("https://example.test/api/trees/dead-beef/exports/csv"),
        { ...session, user_id: "contributor" },
        "request",
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 } satisfies Partial<ApiError>);
  });

  it("returns not found for a missing tree", async () => {
    database.tree = undefined;
    await expect(
      handleFamilyCsvExportRequest(
        new Request("https://example.test/api/trees/bad-feed/exports/csv"),
        new URL("https://example.test/api/trees/bad-feed/exports/csv"),
        session,
        "request",
      ),
    ).rejects.toMatchObject({ code: "NOT_FOUND", status: 404 } satisfies Partial<ApiError>);
  });
});
