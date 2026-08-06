import type { PoolClient } from "pg";
import { describe, expect, it, vi } from "vitest";
import type { SnapshotInput } from "@/server/security";
import {
  requireFamilyCsvImportManager,
  validateFamilyCsvAppend,
  validateSourceMappings,
} from "./family-csv-import-protection";

const snapshot = {
  expectedVersion: 1,
  members: [
    {
      id: "00000000-0000-4000-8000-000000000001",
      name_en: "Owner",
      name_ar: "",
      gender: "male",
      citizen_status: "resident",
      created_at: "2026-08-01T00:00:00.000Z",
      updated_at: "2026-08-01T00:00:00.000Z",
    },
  ],
  subfamilies: [
    {
      id: "00000000-0000-4000-8000-000000000002",
      name_en: "Branch",
      name_ar: "",
      linked_male_id: "00000000-0000-4000-8000-000000000001",
      created_at: "2026-08-01T00:00:00.000Z",
      updated_at: "2026-08-01T00:00:00.000Z",
    },
  ],
} satisfies SnapshotInput;

describe("family CSV import protection", () => {
  it("requires an owner or administrator membership", async () => {
    const client = { query: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }) };
    await expect(
      requireFamilyCsvImportManager(client as unknown as PoolClient, "tree", "editor"),
    ).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });
  });

  it("requires imports to retain every active member and branch", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({
        rows: [{ id: snapshot.members[0].id }],
        rowCount: 1,
      })
      .mockResolvedValueOnce({ rows: [{ id: snapshot.subfamilies[0].id }], rowCount: 1 });
    await expect(
      validateFamilyCsvAppend({ query } as unknown as PoolClient, "tree", snapshot),
    ).resolves.toBeUndefined();
  });

  it("rejects replacement of any current member or branch", async () => {
    const memberQuery = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ id: snapshot.members[0].id }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 });
    await expect(
      validateFamilyCsvAppend({ query: memberQuery } as unknown as PoolClient, "tree", {
        ...snapshot,
        members: [],
      }),
    ).rejects.toMatchObject({ code: "IMPORT_MUST_APPEND" });

    const branchQuery = vi
      .fn()
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [{ id: snapshot.subfamilies[0].id }], rowCount: 1 });
    await expect(
      validateFamilyCsvAppend({ query: branchQuery } as unknown as PoolClient, "tree", {
        ...snapshot,
        subfamilies: [],
      }),
    ).rejects.toMatchObject({ code: "IMPORT_MUST_APPEND" });
  });

  it("accepts only one-to-one source mappings targeting the draft", () => {
    expect(() =>
      validateSourceMappings(
        snapshot,
        new Map([[snapshot.members[0].id, "source-member"]]),
        new Map([[snapshot.subfamilies[0].id, "source-branch"]]),
      ),
    ).not.toThrow();
    expect(() =>
      validateSourceMappings(
        snapshot,
        new Map([[crypto.randomUUID(), "source-member"]]),
        new Map(),
      ),
    ).toThrow("INVALID_IMPORT_MAPPING");
    expect(() => validateSourceMappings(snapshot, new Map(), new Map())).toThrow(
      "INVALID_IMPORT_MAPPING",
    );
  });
});
