import { describe, expect, it, vi } from "vitest";
import { copyTreePreviewUrl, treePreviewUrl } from "./dashboard-share";

describe("dashboard share preview", () => {
  it("builds the authenticated preview URL", () => {
    expect(treePreviewUrl("tree id", "https://ancestors.test")).toBe(
      "https://ancestors.test/tree/tree%20id?mode=preview",
    );
  });

  it("copies the preview URL", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    await expect(
      copyTreePreviewUrl("tree-id", "https://ancestors.test", { writeText }),
    ).resolves.toBe("https://ancestors.test/tree/tree-id?mode=preview");
    expect(writeText).toHaveBeenCalledWith("https://ancestors.test/tree/tree-id?mode=preview");
  });

  it("passes clipboard failures to the caller", async () => {
    const error = new Error("clipboard denied");
    const writeText = vi.fn().mockRejectedValue(error);
    await expect(
      copyTreePreviewUrl("tree-id", "https://ancestors.test", { writeText }),
    ).rejects.toBe(error);
  });
});
