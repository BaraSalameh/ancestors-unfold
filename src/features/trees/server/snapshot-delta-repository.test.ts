import type { PoolClient } from "pg";
import { describe, expect, it, vi } from "vitest";
import type { SnapshotDeltaInput } from "@/server/snapshot-delta-schema";
import {
  reconcileTouchedParentRelationships,
  upsertDeltaMembers,
} from "./snapshot-delta-repository";

describe("snapshot delta SQL typing", () => {
  it("casts tree and actor parameters before inserting an updated member", async () => {
    const query = vi.fn(async (_text: string, _values?: unknown[]) => ({
      rows: [],
      rowCount: 0,
    }));
    const delta = {
      upsertMembers: [
        {
          id: "00000000-0000-4000-8000-000000000001",
          name_en: "Updated member",
          name_ar: "عضو محدث",
          gender: "male",
          citizen_status: "resident",
        },
      ],
    } as SnapshotDeltaInput;

    await upsertDeltaMembers(
      { query } as unknown as PoolClient,
      "00000000-0000-4000-8000-000000000002",
      "00000000-0000-4000-8000-000000000003",
      delta,
      null,
    );

    const insert = String(query.mock.calls[0]?.[0]);
    expect(insert).toContain("input.id,$1::uuid");
    expect(insert).toContain("$3::uuid,$3::uuid");
  });

  it("replaces only the edited member's parent links and preserves descendant links", async () => {
    const query = vi.fn(async (_text: string, _values?: unknown[]) => ({
      rows: [],
      rowCount: 0,
    }));
    const member = {
      id: "00000000-0000-4000-8000-000000000001",
      name_en: "Edited parent",
      name_ar: "والد محدث",
      gender: "male",
      citizen_status: "resident",
    } as SnapshotDeltaInput["upsertMembers"][number];

    await reconcileTouchedParentRelationships(
      { query } as unknown as PoolClient,
      "00000000-0000-4000-8000-000000000002",
      "00000000-0000-4000-8000-000000000003",
      [member],
      [],
    );

    const relationshipDelete = String(query.mock.calls[0]?.[0]);
    expect(relationshipDelete).toContain("child_id=ANY($2::uuid[])");
    expect(relationshipDelete).not.toContain("parent_id=ANY($2::uuid[])");
  });

  it("removes both incoming and outgoing parent links when deleting a member", async () => {
    const query = vi.fn(async (_text: string, _values?: unknown[]) => ({
      rows: [],
      rowCount: 0,
    }));

    await reconcileTouchedParentRelationships(
      { query } as unknown as PoolClient,
      "00000000-0000-4000-8000-000000000002",
      "00000000-0000-4000-8000-000000000003",
      [],
      ["00000000-0000-4000-8000-000000000001"],
    );

    const relationshipDelete = String(query.mock.calls[0]?.[0]);
    expect(relationshipDelete).toContain("child_id=ANY($2::uuid[])");
    expect(relationshipDelete).toContain("parent_id=ANY($2::uuid[])");
  });
});
