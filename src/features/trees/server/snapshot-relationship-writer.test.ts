import type { PoolClient } from "pg";
import { describe, expect, it, vi } from "vitest";
import type { SnapshotInput } from "@/server/security";
import { writeSnapshotRelationships } from "./snapshot-relationship-writer";

describe("snapshot relationship writes", () => {
  it("writes full-tree spouse pairs without per-pair lookups", async () => {
    const query = vi.fn(async (_text: string, _values?: unknown[]) => ({ rows: [], rowCount: 0 }));
    const timestamps = {
      created_at: "2026-08-02T00:00:00.000Z",
      updated_at: "2026-08-02T00:00:00.000Z",
    };
    const members = [
      {
        id: "member-a",
        name_en: "A",
        name_ar: "",
        gender: "male",
        citizen_status: "resident",
        spouse_id: "member-b",
        ...timestamps,
      },
      {
        id: "member-b",
        name_en: "B",
        name_ar: "",
        gender: "female",
        citizen_status: "resident",
        ...timestamps,
      },
    ] satisfies NonNullable<SnapshotInput["members"]>;

    await writeSnapshotRelationships(
      { query } as unknown as PoolClient,
      "tree-1",
      "user-1",
      { expectedVersion: 1, members, subfamilies: [] },
      members,
      false,
      new Set(),
      new Set(members.map(({ id }) => id)),
      new Map(members.map(({ id }) => [id, id])),
      new Map(),
    );

    expect(query.mock.calls.some(([text]) => text.startsWith("SELECT u.id"))).toBe(false);
    expect(
      query.mock.calls.filter(([text]) => text.startsWith("INSERT INTO app.unions")),
    ).toHaveLength(1);
  });

  it("persists the husband's spouse order even when wife rows appear first", async () => {
    const query = vi.fn(async (text: string, _values?: unknown[]) => {
      const isUnionInsert = text.startsWith("INSERT INTO app.unions");
      return {
        rows: isUnionInsert ? [{ id: crypto.randomUUID() }] : [],
        rowCount: isUnionInsert ? 1 : 0,
      };
    });
    const timestamps = {
      created_at: "2026-08-02T00:00:00.000Z",
      updated_at: "2026-08-02T00:00:00.000Z",
    };
    const members = [
      {
        id: "wife-one",
        name_en: "Wife one",
        name_ar: "",
        gender: "female" as const,
        citizen_status: "resident" as const,
        spouse_id: "husband",
        ...timestamps,
      },
      {
        id: "wife-two",
        name_en: "Wife two",
        name_ar: "",
        gender: "female" as const,
        citizen_status: "resident" as const,
        spouse_id: "husband",
        ...timestamps,
      },
      {
        id: "husband",
        name_en: "Husband",
        name_ar: "",
        gender: "male" as const,
        citizen_status: "resident" as const,
        spouse_ids: ["wife-two", "wife-one"],
        spouse_id: "wife-two",
        ...timestamps,
      },
    ] satisfies NonNullable<SnapshotInput["members"]>;

    await writeSnapshotRelationships(
      { query } as unknown as PoolClient,
      "tree-1",
      "user-1",
      { expectedVersion: 1, members, subfamilies: [] },
      members,
      false,
      new Set(),
      new Set(members.map(({ id }) => id)),
      new Map(members.map(({ id }) => [id, id])),
      new Map(),
    );

    const unionInsert = query.mock.calls.find(([text]) =>
      text.startsWith("INSERT INTO app.unions"),
    );
    const unionOrders = JSON.parse(String(unionInsert?.[1]?.[2])).map(
      ({ display_order }: { display_order: number }) => display_order,
    );
    expect(unionOrders).toEqual([203, 202]);
  });
});
