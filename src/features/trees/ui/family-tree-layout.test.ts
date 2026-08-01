import { describe, expect, it, vi } from "vitest";
import type { FamilyMember } from "@/features/members";
import { layout } from "./family-tree-layout";

const member = (id: string, extra: Partial<FamilyMember> = {}): FamilyMember => ({
  id,
  name_en: id,
  name_ar: "",
  gender: "male",
  created_at: "2026-08-01T00:00:00.000Z",
  updated_at: "2026-08-01T00:00:00.000Z",
  ...extra,
});

const callbacks = {
  onOpen: vi.fn(),
  onAddParent: vi.fn(),
  onAddChild: vi.fn(),
  onRequestRemove: vi.fn(),
};

describe("family tree layout", () => {
  it("projects parent relationships and preserves manual family-level positions", () => {
    const members = [
      member("parent", { pos_x: 120, pos_y: 80 }),
      member("child", { gender: "female", father_id: "parent" }),
    ];

    const result = layout(
      members,
      new Set(),
      callbacks.onOpen,
      callbacks.onAddParent,
      callbacks.onAddChild,
      callbacks.onRequestRemove,
      "child",
      true,
    );

    expect(result.nodes.find(({ id }) => id === "parent")?.position).toEqual({ x: 120, y: 80 });
    expect(result.nodes.find(({ id }) => id === "child")?.data.highlighted).toBe(true);
    expect(result.edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ source: "parent", target: "child", type: "relationship" }),
      ]),
    );
  });

  it("hides descendants of collapsed members", () => {
    const result = layout(
      [member("parent"), member("child", { father_id: "parent" })],
      new Set(["parent"]),
      callbacks.onOpen,
      callbacks.onAddParent,
      callbacks.onAddChild,
      callbacks.onRequestRemove,
      null,
      false,
    );

    expect(result.nodes.map(({ id }) => id)).toEqual(["parent"]);
    expect(result.edges).toEqual([]);
  });
});
