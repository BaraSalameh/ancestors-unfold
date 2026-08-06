import { describe, expect, it, vi } from "vitest";
import type { SnapshotInput } from "@/server/security";
import { enforceSnapshotBranchRoots } from "./snapshot-branch-root-policy";

const member = {
  id: "root",
  name_en: "Root",
  name_ar: "",
  gender: "male" as const,
  citizen_status: "resident" as const,
  created_at: "2026-08-06T00:00:00.000Z",
  updated_at: "2026-08-06T00:00:00.000Z",
};
const branch = {
  id: "branch",
  name_en: "Branch",
  name_ar: "",
  linked_male_id: "root",
  created_at: "2026-08-06T00:00:00.000Z",
  updated_at: "2026-08-06T00:00:00.000Z",
};
const client = () => ({
  query: vi.fn().mockResolvedValue({ rows: [{ id: "branch", linked_male_id: "root" }] }),
});

describe("snapshot branch-root deletion policy", () => {
  it("blocks deleting a retained branch root", async () => {
    const snapshot: SnapshotInput = { expectedVersion: 1, members: [], subfamilies: [branch] };
    await expect(
      enforceSnapshotBranchRoots(client() as never, "tree", snapshot, null),
    ).rejects.toMatchObject({ code: "BRANCH_ROOT_DELETE_BLOCKED", status: 409 });
  });

  it("allows deleting a non-root member assigned to a contributor", async () => {
    const snapshot: SnapshotInput = {
      expectedVersion: 1,
      members: [member],
      subfamilies: [branch],
    };
    await expect(
      enforceSnapshotBranchRoots(client() as never, "tree", snapshot, null),
    ).resolves.toBeUndefined();
  });

  it("allows an owner to remove the branch first but keeps it required for a branch editor", async () => {
    const snapshot: SnapshotInput = { expectedVersion: 1, members: [], subfamilies: [] };
    await expect(
      enforceSnapshotBranchRoots(client() as never, "tree", snapshot, null),
    ).resolves.toBeUndefined();
    await expect(
      enforceSnapshotBranchRoots(client() as never, "tree", snapshot, "branch"),
    ).rejects.toMatchObject({ code: "BRANCH_ROOT_DELETE_BLOCKED" });
  });

  it("rejects a submitted branch whose proposed root is female", async () => {
    const snapshot: SnapshotInput = {
      expectedVersion: 1,
      members: [member, { ...member, id: "replacement", gender: "female" }],
      subfamilies: [{ ...branch, linked_male_id: "replacement" }],
    };
    await expect(
      enforceSnapshotBranchRoots(client() as never, "tree", snapshot, null),
    ).rejects.toMatchObject({ code: "MEMBER_UNAVAILABLE", status: 409 });
  });

  it("rejects a submitted branch whose proposed root is missing", async () => {
    const snapshot: SnapshotInput = {
      expectedVersion: 1,
      members: [member],
      subfamilies: [{ ...branch, linked_male_id: "missing" }],
    };
    await expect(
      enforceSnapshotBranchRoots(client() as never, "tree", snapshot, null),
    ).rejects.toMatchObject({ code: "MEMBER_UNAVAILABLE", status: 409 });
  });

  it("allows replacing a branch root with another submitted male", async () => {
    const snapshot: SnapshotInput = {
      expectedVersion: 1,
      members: [{ ...member, id: "replacement" }],
      subfamilies: [{ ...branch, linked_male_id: "replacement" }],
    };
    await expect(
      enforceSnapshotBranchRoots(client() as never, "tree", snapshot, null),
    ).resolves.toBeUndefined();
  });
});
