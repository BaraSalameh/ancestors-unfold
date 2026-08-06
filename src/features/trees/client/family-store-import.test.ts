import { afterEach, describe, expect, it, vi } from "vitest";
import type { FamilyCsvPreviewResponse } from "../api/tree-client";

afterEach(() => {
  vi.doUnmock("../api/tree-client");
  vi.doUnmock("@/features/members/api");
  vi.unstubAllGlobals();
  vi.resetModules();
});

const ownerId = "00000000-0000-4000-8000-000000000001";
const now = "2026-08-01T00:00:00.000Z";

// The store is stateful by design; keeping both phases in one suite verifies the complete lifecycle.
// eslint-disable-next-line max-lines-per-function
describe("family store CSV import draft", () => {
  it("saves edited import drafts through the protected endpoint and preserves mapped IDs", async () => {
    const baselineOwner = {
      id: ownerId,
      name_en: "Current owner",
      name_ar: "",
      gender: "male" as const,
      citizen_status: "resident" as const,
      image_url: "https://example.com/owner.jpg",
      image_asset_id: "asset",
      created_at: now,
      updated_at: now,
    };
    const readSnapshot = vi
      .fn()
      .mockResolvedValueOnce({
        version: 4,
        access_scope: "tree",
        capabilities: { can_import_csv: true },
        members: [baselineOwner],
        subfamilies: [],
      })
      .mockResolvedValueOnce({
        version: 5,
        access_scope: "tree",
        capabilities: { can_import_csv: true },
        members: [{ ...baselineOwner, name_en: "Edited imported owner" }],
        subfamilies: [],
      });
    const applyFamilyCsv = vi.fn().mockResolvedValue({ version: 5 });
    const saveSnapshot = vi.fn();
    vi.doMock("../api/tree-client", () => ({
      treeClient: {
        readSnapshot,
        readPublicSnapshot: vi.fn(),
        saveSnapshot,
        applyFamilyCsv,
        deleteTree: vi.fn(),
      },
    }));
    vi.doMock("@/features/members/api", () => ({
      memberImageClient: { upload: vi.fn(), discard: vi.fn() },
    }));
    vi.stubGlobal("window", {});

    const { familyStore } = await import("./family-store");
    familyStore.activateTree("tree-id", "edit");
    await vi.waitFor(() => expect(familyStore.getLoadState()).toBe("ready"));
    const preview: FamilyCsvPreviewResponse = {
      expectedVersion: 4,
      members: [
        {
          id: "00000000-0000-4000-8000-000000000100",
          name_en: "Imported owner",
          name_ar: "",
          gender: "male",
          citizen_status: "resident",
          created_at: now,
          updated_at: now,
        },
      ],
      subfamilies: [],
      sourceMemberIds: [
        { sourceId: "source-owner", targetId: "00000000-0000-4000-8000-000000000100" },
      ],
      sourceBranchIds: [],
      summary: { members: 1, parentLinks: 0, spouseLinks: 0, branches: 0 },
      warnings: [],
      mappingRequirements: {
        linkedMembers: [
          {
            target_member_id: ownerId,
            name_en: "Current owner",
            name_ar: "",
            gender: "male",
            role: "owner",
          },
        ],
        grantedBranches: [],
      },
    };

    familyStore.stageFamilyCsvImport(preview, {
      linkedMembers: { [ownerId]: "00000000-0000-4000-8000-000000000100" },
      grantedBranches: {},
    });
    expect(familyStore.getPersistenceState()).toMatchObject({ dirty: true, importPending: true });
    expect(familyStore.get(ownerId)).toMatchObject({ image_asset_id: "asset" });

    familyStore.update(ownerId, { name_en: "Edited imported owner", gender: "female" });
    familyStore.remove(ownerId);
    const added = familyStore.add({
      name_en: "Added while editing",
      name_ar: "",
      gender: "female",
      citizen_status: "resident",
    });
    expect(familyStore.get(ownerId)).toMatchObject({
      name_en: "Edited imported owner",
      gender: "male",
    });

    await familyStore.updateSnapshot();

    expect(saveSnapshot).not.toHaveBeenCalled();
    expect(applyFamilyCsv).toHaveBeenCalledWith(
      "tree-id",
      expect.objectContaining({
        expectedVersion: 4,
        members: expect.arrayContaining([
          expect.objectContaining({ id: ownerId, name_en: "Edited imported owner" }),
          expect.objectContaining({ id: added.id, name_en: "Added while editing" }),
        ]),
        sourceMemberIds: [
          { targetId: ownerId, sourceId: "source-owner" },
          { targetId: added.id, sourceId: added.id },
        ],
      }),
    );
    await vi.waitFor(() => expect(familyStore.getPersistenceState().importPending).toBe(false));
  });

  it("refuses to stage over an unrelated dirty draft", async () => {
    vi.doMock("../api/tree-client", () => ({
      treeClient: {
        readSnapshot: vi.fn().mockResolvedValue({
          version: 4,
          access_scope: "tree",
          capabilities: { can_import_csv: true },
          members: [
            {
              id: ownerId,
              name_en: "Owner",
              name_ar: "",
              gender: "male",
              citizen_status: "resident",
              created_at: now,
              updated_at: now,
            },
          ],
          subfamilies: [],
        }),
        readPublicSnapshot: vi.fn(),
        deleteTree: vi.fn(),
      },
    }));
    vi.doMock("@/features/members/api", () => ({
      memberImageClient: { upload: vi.fn(), discard: vi.fn() },
    }));
    vi.stubGlobal("window", {});
    const { familyStore } = await import("./family-store");
    familyStore.activateTree("tree-id", "edit");
    await vi.waitFor(() => expect(familyStore.getLoadState()).toBe("ready"));
    familyStore.update(ownerId, { notes: "unsaved" });
    expect(() =>
      familyStore.stageFamilyCsvImport(
        {
          expectedVersion: 4,
          members: [],
          subfamilies: [],
          sourceMemberIds: [],
          sourceBranchIds: [],
          summary: { members: 0, parentLinks: 0, spouseLinks: 0, branches: 0 },
          warnings: [],
          mappingRequirements: { linkedMembers: [], grantedBranches: [] },
        },
        { linkedMembers: {}, grantedBranches: {} },
      ),
    ).toThrow("UNSAVED_CHANGES");
  });
});
