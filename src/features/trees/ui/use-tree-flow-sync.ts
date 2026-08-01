import { useEffect, type MutableRefObject } from "react";
import type { Edge, Node, ReactFlowInstance } from "reactflow";
import { familyStore } from "../client/family-store";
import { routeParentEdges } from "../domain/route-edges";
import type { ChronologicalPeriod, TreePreviewType } from "../domain/canvas-preview";

interface Params {
  cancelMarquee: () => void;
  canEdit: boolean;
  chronologicalPeriod: ChronologicalPeriod;
  clearCanvasSelection: () => void;
  didFit: MutableRefObject<boolean>;
  edges: Edge[];
  fitView: ReactFlowInstance["fitView"];
  initialEdges: Edge[];
  initialNodes: Node[];
  nodes: Node[];
  previousChronologicalPeriod: MutableRefObject<ChronologicalPeriod>;
  previousPreviewType: MutableRefObject<TreePreviewType>;
  previewType: TreePreviewType;
  replacePositionsOnNextLayout: MutableRefObject<boolean>;
  setEdges: React.Dispatch<React.SetStateAction<Edge[]>>;
  setNodes: React.Dispatch<React.SetStateAction<Node[]>>;
  visibleNodePositions: MutableRefObject<Map<string, { x: number; y: number }>>;
}

export function useTreeFlowSync(params: Params) {
  useInitialGraphSync(params);
  useVisiblePositionSync(params.nodes, params.visibleNodePositions);
  useChronologicalEdgeRouting(params);
  useTreeKeyboardShortcuts(params);
  useEffect(() => {
    params.cancelMarquee();
    return params.cancelMarquee;
    // The hook receives a fresh capability object; only stable callbacks and preview identity matter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.cancelMarquee, params.previewType]);
}

function useInitialGraphSync(params: Params) {
  useEffect(() => {
    const previewChanged = params.previousPreviewType.current !== params.previewType;
    const periodChanged = params.previousChronologicalPeriod.current !== params.chronologicalPeriod;
    params.previousPreviewType.current = params.previewType;
    params.previousChronologicalPeriod.current = params.chronologicalPeriod;
    if (previewChanged || periodChanged) params.didFit.current = false;
    params.setNodes((current) => mergeNodes(params, current, previewChanged));
    params.setEdges((current) => mergeEdges(params, current, previewChanged));
    if (!params.didFit.current && params.initialNodes.length) {
      requestAnimationFrame(() => params.fitView({ padding: 0.2, duration: 300 }));
      params.didFit.current = true;
    }
    // Individual graph inputs are the synchronization contract; the wrapper object is intentionally excluded.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    params.initialNodes,
    params.initialEdges,
    params.previewType,
    params.chronologicalPeriod,
    params.setNodes,
    params.setEdges,
    params.fitView,
  ]);
}

function mergeNodes(params: Params, current: Node[], previewChanged: boolean) {
  const currentById = new Map(current.map((node) => [node.id, node]));
  const replacePositions = params.replacePositionsOnNextLayout.current;
  params.replacePositionsOnNextLayout.current = false;
  if (previewChanged || params.previewType === "chronological") {
    return params.initialNodes.map((node) => ({
      ...node,
      selected: currentById.get(node.id)?.selected ?? false,
    }));
  }
  return params.initialNodes.map((node) => {
    const existing = currentById.get(node.id);
    if (!existing || replacePositions) return node;
    const member = node.data.member as { pos_x?: number; pos_y?: number };
    const persisted = typeof member.pos_x === "number" && typeof member.pos_y === "number";
    return { ...node, position: persisted ? node.position : existing.position };
  });
}

function mergeEdges(params: Params, current: Edge[], previewChanged: boolean) {
  if (previewChanged || params.previewType === "chronological") {
    const selected = new Set(current.filter((edge) => edge.selected).map((edge) => edge.id));
    return params.initialEdges.map((edge) => ({ ...edge, selected: selected.has(edge.id) }));
  }
  const currentById = new Map(current.map((edge) => [edge.id, edge]));
  return params.initialEdges.map((edge) => {
    const existing = currentById.get(edge.id);
    return existing ? { ...edge, data: { ...edge.data, ...existing.data } } : edge;
  });
}

function useVisiblePositionSync(
  nodes: Node[],
  positions: MutableRefObject<Map<string, { x: number; y: number }>>,
) {
  useEffect(() => {
    positions.current = new Map(
      nodes.map((node) => [node.id, { x: node.position.x, y: node.position.y }]),
    );
  }, [nodes, positions]);
}

function useChronologicalEdgeRouting(params: Params) {
  useEffect(() => {
    if (params.previewType !== "chronological") return;
    params.setEdges((current) => routeParentEdges(params.nodes, current, true));
    // Only graph identity and preview mode trigger route projection.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.nodes, params.previewType, params.setEdges]);
}

function useTreeKeyboardShortcuts(params: Params) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target?.isContentEditable ||
        ["INPUT", "TEXTAREA", "SELECT"].includes(target?.tagName ?? "")
      )
        return;
      if (event.key === "Escape") {
        params.cancelMarquee();
        params.clearCanvasSelection();
        return;
      }
      if (!(event.ctrlKey || event.metaKey) || !params.canEdit) return;
      const key = event.key.toLowerCase();
      if (key === "z" && !event.shiftKey) {
        event.preventDefault();
        familyStore.undo();
      } else if (key === "y" || (key === "z" && event.shiftKey)) {
        event.preventDefault();
        familyStore.redo();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // Keyboard listeners depend only on the exposed stable commands and edit capability.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.cancelMarquee, params.canEdit, params.clearCanvasSelection]);
}
