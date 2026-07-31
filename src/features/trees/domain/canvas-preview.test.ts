import { describe, expect, it } from "vitest";
import type { FamilyMember } from "@/features/members";
import { canvasCapabilities, hierarchyPositions, strictDecadeOrder } from "./canvas-preview";

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
      canSelect: false,
      canAutoLayout: false,
    });
  });

  it("allows mutations only in the editable lineage canvas", () => {
    expect(canvasCapabilities(true, "lineage").canMutate).toBe(true);
    expect(canvasCapabilities(false, "chronological").canMutate).toBe(false);
    expect(canvasCapabilities(false, "lineage").canMutate).toBe(false);
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
