import { describe, expect, it } from "vitest";
import type { FamilyMember } from "@/features/members";
import {
  canvasCapabilities,
  canvasRectBetween,
  canvasRectsIntersect,
  canvasWheelIntent,
  chronologicalBandForYear,
  chronologicalPeriodOrDefault,
  isChronologicalPeriod,
  hasCanvasDragStarted,
  hierarchyPositions,
  isDoublePanePress,
  strictDecadeOrder,
} from "./canvas-preview";

describe("chronological periods", () => {
  it("accepts custom URL periods and defaults missing or invalid values to ten years", () => {
    expect(chronologicalPeriodOrDefault("1")).toBe(1);
    expect(chronologicalPeriodOrDefault(37)).toBe(37);
    expect(chronologicalPeriodOrDefault("50")).toBe(50);
    expect(chronologicalPeriodOrDefault(undefined)).toBe(10);
    expect(chronologicalPeriodOrDefault("0")).toBe(10);
    expect(chronologicalPeriodOrDefault("51")).toBe(10);
    expect(chronologicalPeriodOrDefault("2.5")).toBe(10);
    expect(isChronologicalPeriod(12)).toBe(true);
  });

  it.each([
    [1975, 5, { start: 1975, end: 1979 }],
    [1979, 10, { start: 1970, end: 1979 }],
    [1980, 10, { start: 1980, end: 1989 }],
    [1979, 15, { start: 1965, end: 1979 }],
    [1980, 15, { start: 1980, end: 1994 }],
    [1999, 20, { start: 1980, end: 1999 }],
    [1999, 7, { start: 1995, end: 2001 }],
  ] as const)("groups %i into a %i-year fixed calendar band", (year, period, expected) => {
    expect(chronologicalBandForYear(year, period)).toEqual(expected);
  });
});

const member = (id: string, patch: Partial<FamilyMember> = {}): FamilyMember =>
  ({
    id,
    name_en: id,
    name_ar: id,
    gender: "male",
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    ...patch,
  }) as FamilyMember;

describe("canvas preview capabilities", () => {
  it("keeps the chronological preview read-only even with edit access", () => {
    expect(canvasCapabilities(true, "chronological")).toEqual({
      canMutate: false,
      canDrag: false,
      canConnect: false,
      canSelect: true,
      canAutoLayout: false,
    });
  });

  it("allows mutations only in the editable lineage canvas", () => {
    expect(canvasCapabilities(true, "lineage").canMutate).toBe(true);
    expect(canvasCapabilities(false, "chronological").canMutate).toBe(false);
    expect(canvasCapabilities(false, "lineage").canMutate).toBe(false);
  });

  it("allows temporary selection in every read-only preview", () => {
    expect(canvasCapabilities(false, "lineage").canSelect).toBe(true);
    expect(canvasCapabilities(false, "chronological").canSelect).toBe(true);
  });
});

describe("canvas pointer intent", () => {
  it("zooms for coarse mouse wheels and modifier-driven pinch gestures", () => {
    expect(canvasWheelIntent({ deltaX: 0, deltaY: 100, deltaMode: 0 })).toBe("zoom");
    expect(canvasWheelIntent({ deltaX: 0, deltaY: 3, deltaMode: 1 })).toBe("zoom");
    expect(canvasWheelIntent({ deltaX: 0, deltaY: 8, deltaMode: 0, ctrlKey: true })).toBe("zoom");
  });

  it("pans for fine-grained trackpad motion", () => {
    expect(canvasWheelIntent({ deltaX: 3.5, deltaY: 8, deltaMode: 0 })).toBe("pan");
    expect(canvasWheelIntent({ deltaX: 0, deltaY: 12.5, deltaMode: 0 })).toBe("pan");
  });
});

describe("canvas marquee geometry", () => {
  it("arms only a nearby second press inside the timing threshold", () => {
    const previous = { x: 10, y: 20, at: 1_000 };
    expect(isDoublePanePress(previous, { x: 14, y: 23, at: 1_350 })).toBe(true);
    expect(isDoublePanePress(previous, { x: 14, y: 23, at: 1_351 })).toBe(false);
    expect(isDoublePanePress(previous, { x: 17, y: 20, at: 1_200 })).toBe(false);
    expect(isDoublePanePress(null, { x: 10, y: 20, at: 1_200 })).toBe(false);
  });

  it("normalizes rectangles dragged in any direction", () => {
    expect(canvasRectBetween({ x: 20, y: 30 }, { x: 5, y: 10 })).toEqual({
      x: 5,
      y: 10,
      width: 15,
      height: 20,
    });
  });

  it("starts marquee selection only after the drag threshold", () => {
    expect(hasCanvasDragStarted({ x: 0, y: 0 }, { x: 2, y: 3 })).toBe(false);
    expect(hasCanvasDragStarted({ x: 0, y: 0 }, { x: 4, y: 0 })).toBe(true);
  });

  it("selects partially intersecting cards and excludes separated cards", () => {
    const marquee = { x: 10, y: 10, width: 30, height: 30 };
    expect(canvasRectsIntersect(marquee, { x: 35, y: 35, width: 20, height: 20 })).toBe(true);
    expect(canvasRectsIntersect(marquee, { x: 41, y: 10, width: 20, height: 20 })).toBe(false);
  });
});

describe("family hierarchy positions", () => {
  it("places parents above children and siblings without overlap", () => {
    const members = [
      member("parent"),
      member("younger", { father_id: "parent", birth_date: "2000-01-01" }),
      member("older", { father_id: "parent", birth_date: "1990-01-01" }),
    ];
    const positions = hierarchyPositions(members, new Set(members.map(({ id }) => id)));
    expect(positions.get("parent")!.y).toBeLessThan(positions.get("younger")!.y);
    expect(positions.get("younger")!.x).toBeLessThan(positions.get("older")!.x);
    expect(
      Math.abs(positions.get("younger")!.x - positions.get("older")!.x),
    ).toBeGreaterThanOrEqual(300);
  });

  it("separates independent root families deterministically", () => {
    const members = [member("root-b"), member("root-a")];
    const visible = new Set(members.map(({ id }) => id));
    expect(hierarchyPositions(members, visible)).toEqual(hierarchyPositions(members, visible));
    expect(hierarchyPositions(members, visible).get("root-a")!.x).toBeLessThan(
      hierarchyPositions(members, visible).get("root-b")!.x,
    );
  });
});

describe("strict decade ordering", () => {
  it("uses birth year and id as deterministic fallbacks", () => {
    const members = [
      member("b", { birth_date: "2000-01-01" }),
      member("a", { birth_date: "2000-01-01" }),
      member("newest", { birth_date: "2005-01-01" }),
    ];
    expect(strictDecadeOrder(members).map(({ id }) => id)).toEqual(["newest", "a", "b"]);
  });
});
