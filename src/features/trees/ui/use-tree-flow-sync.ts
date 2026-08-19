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
  const { cancelMarquee, initialNodes, previewType, visibleNodePositions } = params;
  useInitialGraphSync(params);
  useVisiblePositionSync(initialNodes, visibleNodePositions);
  useChronologicalEdgeRouting(params);
  useTreeKeyboardShortcuts(params);
  useEffect(() => {
    cancelMarquee();
    return cancelMarquee;
  }, [cancelMarquee, previewType]);
}

function useInitialGraphSync(params: Params) {
  const {
    chronologicalPeriod,
    didFit,
    fitView,
    initialEdges,
    initialNodes,
    previousChronologicalPeriod,
    previousPreviewType,
    previewType,
    replacePositionsOnNextLayout,
    setEdges,
    setNodes,
  } = params;
  useEffect(() => {
    const previewChanged = previousPreviewType.current !== previewType;
    const periodChanged = previousChronologicalPeriod.current !== chronologicalPeriod;
    previousPreviewType.current = previewType;
    previousChronologicalPeriod.current = chronologicalPeriod;
    if (previewChanged || periodChanged) didFit.current = false;
    setNodes((current) =>
      mergeNodes(
        { initialNodes, previewType, replacePositionsOnNextLayout },
        current,
        previewChanged,
      ),
    );
    setEdges((current) => mergeEdges({ initialEdges, previewType }, current, previewChanged));
    if (!didFit.current && initialNodes.length) {
      requestAnimationFrame(() => fitView({ padding: 0.2, duration: 300 }));
      didFit.current = true;
    }
  }, [
    chronologicalPeriod,
    didFit,
    fitView,
    initialEdges,
    initialNodes,
    previousChronologicalPeriod,
    previousPreviewType,
    previewType,
    replacePositionsOnNextLayout,
    setEdges,
    setNodes,
  ]);
}

function mergeNodes(
  params: Pick<Params, "initialNodes" | "previewType" | "replacePositionsOnNextLayout">,
  current: Node[],
  previewChanged: boolean,
) {
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

function mergeEdges(
  params: Pick<Params, "initialEdges" | "previewType">,
  current: Edge[],
  previewChanged: boolean,
) {
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
  const { nodes, previewType, setEdges } = params;
  useEffect(() => {
    if (previewType !== "chronological") return;
    setEdges((current) => routeParentEdges(nodes, current, true));
  }, [nodes, previewType, setEdges]);
}

function useTreeKeyboardShortcuts(params: Params) {
  const { cancelMarquee, canEdit, clearCanvasSelection } = params;
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target?.isContentEditable ||
        ["INPUT", "TEXTAREA", "SELECT"].includes(target?.tagName ?? "")
      )
        return;
      if (event.key === "Escape") {
        cancelMarquee();
        clearCanvasSelection();
        return;
      }
      if (!(event.ctrlKey || event.metaKey) || !canEdit) return;
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
  }, [cancelMarquee, canEdit, clearCanvasSelection]);
}
