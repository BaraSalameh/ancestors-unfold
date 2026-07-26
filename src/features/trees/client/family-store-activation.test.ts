import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.doUnmock("../api/tree-client");
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("family store activation", () => {
  it("does not load a snapshot until a real tree is activated and deduplicates activation", async () => {
    const readSnapshot = vi.fn(
      () =>
        new Promise<{
          version: number;
          access_scope: "tree";
          members: [];
          subfamilies: [];
        }>(() => undefined),
    );
    vi.doMock("../api/tree-client", () => ({
      treeClient: {
        readSnapshot,
        readPublicSnapshot: vi.fn(),
        saveSnapshot: vi.fn(),
        deleteTree: vi.fn(),
      },
    }));
    vi.stubGlobal("window", {});

    const { familyStore } = await import("./family-store");
    expect(readSnapshot).not.toHaveBeenCalled();

    familyStore.activateTree("tree-id", "edit");
    expect(readSnapshot).toHaveBeenCalledTimes(1);
    expect(readSnapshot).toHaveBeenCalledWith("tree-id");

    familyStore.activateTree("tree-id", "edit");
    expect(readSnapshot).toHaveBeenCalledTimes(1);
  });

  it("keeps a rejected explicit update as a local draft", async () => {
    const { ApiClientError } = await import("@/shared/api/client");
    const serverMember = {
      id: "member",
      name_en: "Server name",
      name_ar: "",
      gender: "male" as const,
      created_at: "2026-07-24T00:00:00.000Z",
      updated_at: "2026-07-24T00:00:00.000Z",
    };
    const readSnapshot = vi.fn().mockResolvedValue({
      version: 4,
      access_scope: "tree",
      members: [serverMember],
      subfamilies: [
        {
          id: "subfamily",
          name_en: "Branch",
          name_ar: "",
          created_at: "2026-07-24T00:00:00.000Z",
          updated_at: "2026-07-24T00:00:00.000Z",
        },
      ],
    });
    const saveSnapshot = vi.fn().mockRejectedValue(new ApiClientError("FORBIDDEN", 403));
    vi.doMock("../api/tree-client", () => ({
      treeClient: {
        readSnapshot,
        readPublicSnapshot: vi.fn(),
        saveSnapshot,
        deleteTree: vi.fn(),
      },
    }));
    vi.stubGlobal("window", {});

    const { familyStore } = await import("./family-store");
    familyStore.activateTree("tree-id", "edit");
    await vi.waitFor(() => expect(familyStore.getLoadState()).toBe("ready"));
    expect(familyStore.getPersistenceState().dirty).toBe(false);

    familyStore.update("member", { name_en: "Rejected local name" });
    expect(saveSnapshot).not.toHaveBeenCalled();
    await expect(familyStore.updateSnapshot()).rejects.toMatchObject({ code: "FORBIDDEN" });

    expect(familyStore.get("member")?.name_en).toBe("Rejected local name");
    expect(saveSnapshot).toHaveBeenCalledTimes(1);
    expect(readSnapshot).toHaveBeenCalledTimes(1);
    expect(familyStore.getPersistenceState().dirty).toBe(true);
  });

  it("uses a stable batch for retries and marks a successful draft saved", async () => {
    const { ApiClientError } = await import("@/shared/api/client");
    const member = {
      id: "member",
      name_en: "Before",
      name_ar: "",
      gender: "male" as const,
      created_at: "2026-07-24T00:00:00.000Z",
      updated_at: "2026-07-24T00:00:00.000Z",
    };
    const saveSnapshot = vi
      .fn()
      .mockRejectedValueOnce(new ApiClientError("SAVE_FAILED", 503))
      .mockResolvedValueOnce({ version: 5 });
    vi.doMock("../api/tree-client", () => ({
      treeClient: {
        readSnapshot: vi.fn().mockResolvedValue({
          version: 4,
          access_scope: "tree",
          members: [member],
          subfamilies: [],
        }),
        readPublicSnapshot: vi.fn(),
        saveSnapshot,
        deleteTree: vi.fn(),
      },
    }));
    vi.stubGlobal("window", {});

    const { familyStore } = await import("./family-store");
    familyStore.activateTree("tree-id", "edit");
    await vi.waitFor(() => expect(familyStore.getLoadState()).toBe("ready"));
    familyStore.update("member", { name_en: "After" });

    await expect(familyStore.updateSnapshot()).rejects.toMatchObject({ code: "SAVE_FAILED" });
    await familyStore.updateSnapshot();

    expect(saveSnapshot).toHaveBeenCalledTimes(2);
    expect(saveSnapshot.mock.calls[0][1].batchId).toBe(saveSnapshot.mock.calls[1][1].batchId);
    expect(familyStore.getPersistenceState()).toMatchObject({
      dirty: false,
      saving: false,
      error: null,
    });
    expect(familyStore.canUndo()).toBe(false);
  });

  it("returns to saved when a draft is reverted locally", async () => {
    const member = {
      id: "member",
      name_en: "Original",
      name_ar: "",
      gender: "male" as const,
      created_at: "2026-07-24T00:00:00.000Z",
      updated_at: "2026-07-24T00:00:00.000Z",
    };
    const saveSnapshot = vi.fn();
    vi.doMock("../api/tree-client", () => ({
      treeClient: {
        readSnapshot: vi.fn().mockResolvedValue({
          version: 4,
          access_scope: "tree",
          members: [member],
          subfamilies: [],
        }),
        readPublicSnapshot: vi.fn(),
        saveSnapshot,
        deleteTree: vi.fn(),
      },
    }));
    vi.stubGlobal("window", {});

    const { familyStore } = await import("./family-store");
    familyStore.activateTree("tree-id", "edit");
    await vi.waitFor(() => expect(familyStore.getLoadState()).toBe("ready"));
    familyStore.update("member", { name_en: "Changed" });
    expect(familyStore.getPersistenceState().dirty).toBe(true);
    familyStore.undo();

    expect(familyStore.getPersistenceState().dirty).toBe(false);
    expect(saveSnapshot).not.toHaveBeenCalled();
  });

  it("restores card-level relationship edits from a draft checkpoint", async () => {
    const members = [
      {
        id: "member",
        name_en: "Member",
        name_ar: "",
        gender: "male" as const,
        created_at: "2026-07-24T00:00:00.000Z",
        updated_at: "2026-07-24T00:00:00.000Z",
      },
      {
        id: "spouse",
        name_en: "Spouse",
        name_ar: "",
        gender: "female" as const,
        created_at: "2026-07-24T00:00:00.000Z",
        updated_at: "2026-07-24T00:00:00.000Z",
      },
    ];
    vi.doMock("../api/tree-client", () => ({
      treeClient: {
        readSnapshot: vi.fn().mockResolvedValue({
          version: 4,
          access_scope: "tree",
          members,
          subfamilies: [],
        }),
        readPublicSnapshot: vi.fn(),
        saveSnapshot: vi.fn(),
        deleteTree: vi.fn(),
      },
    }));
    vi.stubGlobal("window", {});

    const { familyStore } = await import("./family-store");
    familyStore.activateTree("tree-id", "edit");
    await vi.waitFor(() => expect(familyStore.getLoadState()).toBe("ready"));
    const checkpoint = familyStore.createDraftCheckpoint();
    familyStore.addSpouse("member", "spouse");
    expect(familyStore.get("member")?.spouse_ids).toContain("spouse");

    familyStore.restoreDraftCheckpoint(checkpoint);

    expect(familyStore.get("member")?.spouse_ids).toBeUndefined();
    expect(familyStore.getPersistenceState().dirty).toBe(false);
  });
});
