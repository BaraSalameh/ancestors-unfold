import type { Node, Rect } from "reactflow";

export function canvasNodeBounds(
  nodes: readonly Node[],
  fallback: { width: number; height: number },
): Rect | undefined {
  if (!nodes.length) return undefined;
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const node of nodes) {
    const position = node.positionAbsolute ?? node.position;
    const width = node.width ?? fallback.width;
    const height = node.height ?? fallback.height;
    minX = Math.min(minX, position.x);
    minY = Math.min(minY, position.y);
    maxX = Math.max(maxX, position.x + width);
    maxY = Math.max(maxY, position.y + height);
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}
