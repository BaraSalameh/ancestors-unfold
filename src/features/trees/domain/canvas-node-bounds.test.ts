import { describe, expect, it } from "vitest";
import type { Node } from "reactflow";
import { canvasNodeBounds } from "./canvas-node-bounds";

describe("canvasNodeBounds", () => {
  it("includes every disconnected root and uses measured node dimensions", () => {
    const nodes = [
      { id: "left", position: { x: -500, y: 120 }, width: 180, height: 90 },
      { id: "right", position: { x: 700, y: -200 }, width: 240, height: 160 },
    ] as Node[];

    expect(canvasNodeBounds(nodes, { width: 200, height: 100 })).toEqual({
      x: -500,
      y: -200,
      width: 1_440,
      height: 410,
    });
  });

  it("uses card fallbacks before React Flow has measured a node", () => {
    expect(
      canvasNodeBounds([{ id: "root", position: { x: 20, y: 30 } } as Node], {
        width: 280,
        height: 140,
      }),
    ).toEqual({ x: 20, y: 30, width: 280, height: 140 });
  });
});
