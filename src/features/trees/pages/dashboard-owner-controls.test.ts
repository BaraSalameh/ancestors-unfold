import { describe, expect, it } from "vitest";
import { canUseOwnerTreeControls } from "./dashboard-owner-controls";

describe("dashboard owner controls", () => {
  it("allows the tree owner to rename and share", () => {
    expect(canUseOwnerTreeControls("owner")).toBe(true);
  });

  it("hides rename and share controls from every non-owner role", () => {
    expect(canUseOwnerTreeControls("contributor")).toBe(false);
  });
});
