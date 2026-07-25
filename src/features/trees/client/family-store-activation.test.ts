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

  it("restores the server snapshot after a forbidden save instead of retrying stale state", async () => {
    vi.useFakeTimers();
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
      subfamilies: [],
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

    familyStore.update("member", { name_en: "Rejected local name" });
    await vi.advanceTimersByTimeAsync(250);
    await vi.waitFor(() => expect(readSnapshot).toHaveBeenCalledTimes(2));
    await vi.waitFor(() => expect(familyStore.getLoadState()).toBe("ready"));

    expect(familyStore.get("member")?.name_en).toBe("Server name");
    expect(saveSnapshot).toHaveBeenCalledTimes(1);
    expect(familyStore.getPersistenceState().dirty).toBe(false);
    vi.useRealTimers();
  });
});
