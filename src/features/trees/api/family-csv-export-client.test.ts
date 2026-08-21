import { afterEach, describe, expect, it, vi } from "vitest";
import { downloadFamilyCsv } from "./family-csv-export-client";

describe("family CSV download", () => {
  afterEach(() => vi.restoreAllMocks());

  it("downloads the endpoint response with a sanitized tree filename", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("csv")),
    );
    vi.stubGlobal("URL", {
      createObjectURL: vi.fn(() => "blob:csv"),
      revokeObjectURL: vi.fn(),
    });
    const click = vi.fn();
    const link = { href: "", download: "", click };
    vi.stubGlobal("document", { createElement: vi.fn(() => link) });

    await downloadFamilyCsv("tree-id", 'My / Family: "Tree"');

    expect(fetch).toHaveBeenCalledWith("/api/trees/tree-id/exports/csv", {
      credentials: "include",
    });
    expect(link.download).toBe("family-tree-My-Family-Tree.csv");
    expect(click).toHaveBeenCalledOnce();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:csv");
  });
});
