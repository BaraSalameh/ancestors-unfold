import { beforeEach, describe, expect, it, vi } from "vitest";

const database = vi.hoisted(() => ({
  query: vi.fn(async (text: string) => {
    if (text.includes("FROM app.family_trees")) return { rows: [{ version: 3 }], rowCount: 1 };
    return { rows: [], rowCount: 0 };
  }),
}));

vi.mock("@/shared/server/database", () => ({
  query: database.query,
  transaction: vi.fn(),
}));

import { readPublicSnapshot } from "./snapshot-reader";

describe("public tree snapshot access", () => {
  beforeEach(() => {
    database.query.mockClear();
  });

  it("only reads trees explicitly marked public", async () => {
    const snapshot = await readPublicSnapshot("tree-id");

    expect(snapshot).toMatchObject({ version: 3, access_scope: "preview" });
    expect(database.query.mock.calls[0]?.[0]).toContain("visibility='public'");
  });
});
