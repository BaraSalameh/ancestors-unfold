import { useCallback, type MutableRefObject, type RefObject } from "react";
import { getViewportForBounds, type Node, type ReactFlowInstance, type Viewport } from "reactflow";
import { canvasNodeBounds } from "../domain/canvas-node-bounds";
import { NODE_H, NODE_W } from "./family-tree-layout";

export function useTreeCenter({
  canvasRef,
  nodes,
  setViewport,
  viewportRef,
}: {
  canvasRef: RefObject<HTMLDivElement | null>;
  nodes: Node[];
  setViewport: ReactFlowInstance["setViewport"];
  viewportRef: MutableRefObject<Viewport>;
}) {
  return useCallback(() => {
    const bounds = canvasNodeBounds(nodes, { width: NODE_W, height: NODE_H });
    const canvas = canvasRef.current?.getBoundingClientRect();
    if (!bounds || !canvas?.width || !canvas.height) return;
    const viewport = getViewportForBounds(bounds, canvas.width, canvas.height, 0.1, 2, 0.2);
    viewportRef.current = viewport;
    void setViewport(viewport, { duration: 400 });
  }, [canvasRef, nodes, setViewport, viewportRef]);
}
