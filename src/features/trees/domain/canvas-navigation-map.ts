import type { Node } from "reactflow";

const NODE_WIDTH = 260;
const NODE_HEIGHT = 150;

export interface CanvasMapTransform {
  minX: number;
  minY: number;
  offsetX: number;
  offsetY: number;
  scale: number;
}

export function canvasMapTransform(
  nodes: readonly Pick<Node, "position" | "width" | "height">[],
  width: number,
  height: number,
): CanvasMapTransform | undefined {
  if (nodes.length === 0 || width <= 0 || height <= 0) return undefined;
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const node of nodes) {
    minX = Math.min(minX, node.position.x);
    minY = Math.min(minY, node.position.y);
    maxX = Math.max(maxX, node.position.x + (node.width ?? NODE_WIDTH));
    maxY = Math.max(maxY, node.position.y + (node.height ?? NODE_HEIGHT));
  }
  const padding = 12;
  const scale = Math.min(
    (width - padding * 2) / Math.max(1, maxX - minX),
    (height - padding * 2) / Math.max(1, maxY - minY),
  );
  return {
    minX,
    minY,
    scale,
    offsetX: (width - (maxX - minX) * scale) / 2,
    offsetY: (height - (maxY - minY) * scale) / 2,
  };
}
