import { describe, expect, it } from "vitest";
import {
  CANVAS_NAVIGATION_ZOOM_STEP,
  CANVAS_NAVIGATION_MAP_WIDTH,
  branchesWidgetVisible,
  registeredMembersLabelKey,
} from "./canvas-widgets";

describe("canvas widgets", () => {
  it("shows branches to managers and in both read-only preview layouts", () => {
    expect(branchesWidgetVisible(true, false)).toBe(true);
    expect(branchesWidgetVisible(false, true)).toBe(true);
    expect(branchesWidgetVisible(false, false)).toBe(false);
  });

  it("selects localized singular and plural member-count wording", () => {
    expect(registeredMembersLabelKey(1)).toBe("registered_members_one");
    expect(registeredMembersLabelKey(0)).toBe("registered_members_many");
    expect(registeredMembersLabelKey(679)).toBe("registered_members_many");
  });

  it("uses a gentle minimap wheel step", () => {
    expect(CANVAS_NAVIGATION_ZOOM_STEP).toBe(2);
    expect(CANVAS_NAVIGATION_MAP_WIDTH).toBeTypeOf("number");
  });
});
