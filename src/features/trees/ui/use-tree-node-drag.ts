import { useCallback, useRef, type Dispatch, type SetStateAction } from "react";
import type { Edge, Node } from "reactflow";
import { familyStore } from "../client/family-store";
import { routeParentEdges } from "../domain/route-edges";
import type { TreePreviewType } from "../domain/canvas-preview";

interface NodeDragOptions {
  canEdit: boolean;
  nodes: Node[];
  previewType: TreePreviewType;
  setEdges: Dispatch<SetStateAction<Edge[]>>;
  setNodes: Dispatch<SetStateAction<Node[]>>;
}

const draggedSelection = (lead: Node, dragged: Node[]): Node[] => [
  ...new Map([lead, ...dragged].map((node) => [node.id, node])).values(),
];

function rerouteDraggedEdges(
  nodes: Node[],
  edges: Edge[],
  draggedIds: Set<string>,
  chronological: boolean,
): Edge[] {
  const affectedFamilies = new Set(
    edges
      .filter((edge) => draggedIds.has(edge.source) || draggedIds.has(edge.target))
      .map((edge) => (edge.data as { familyKey?: string } | undefined)?.familyKey)
      .filter((key): key is string => !!key),
  );
  const rerouted = new Map(
    routeParentEdges(nodes, edges, chronological).map((edge) => [edge.id, edge]),
  );
  return edges.map((edge) =>
    draggedIds.has(edge.source) ||
    draggedIds.has(edge.target) ||
    affectedFamilies.has((edge.data as { familyKey?: string } | undefined)?.familyKey ?? "")
      ? (rerouted.get(edge.id) ?? edge)
      : edge,
  );
}

export function useTreeNodeDrag({
  canEdit,
  nodes,
  previewType,
  setEdges,
  setNodes,
}: NodeDragOptions) {
  const startPositions = useRef(new Map<string, { x: number; y: number }>());
  const onNodeDragStart = useCallback((_event: unknown, node: Node, dragged: Node[]) => {
    startPositions.current = new Map(
      draggedSelection(node, dragged).map((item) => [
        item.id,
        { x: item.position.x, y: item.position.y },
      ]),
    );
  }, []);

  const onNodeDrag = useCallback(
    (_event: unknown, lead: Node, dragged: Node[]) => {
      const selection = draggedSelection(lead, dragged);
      const draggedById = new Map(selection.map((node) => [node.id, node]));
      const draggedIds = new Set(draggedById.keys());
      const nextNodes = nodes.map((node) => draggedById.get(node.id) ?? node);
      setEdges((edges) =>
        rerouteDraggedEdges(nextNodes, edges, draggedIds, previewType === "chronological"),
      );
    },
    [nodes, previewType, setEdges],
  );

  const onNodeDragStop = useCallback(
    (_event: unknown, lead: Node, dragged: Node[]) => {
      if (!canEdit || lead.type !== "member") return;
      const selection = draggedSelection(lead, dragged);
      const starts = startPositions.current;
      startPositions.current = new Map();
      const leadStart = starts.get(lead.id);
      if (
        leadStart &&
        Math.hypot(lead.position.x - leadStart.x, lead.position.y - leadStart.y) < 4
      ) {
        setNodes((current) =>
          current.map((node) => {
            const start = starts.get(node.id);
            return start ? { ...node, position: start } : node;
          }),
        );
        return;
      }
      const positions = new Map(
        selection
          .filter(({ type }) => type === "member")
          .map((node) => [node.id, { x: node.position.x, y: node.position.y }]),
      );
      if (previewType === "lineage") familyStore.setPositions(positions);
    },
    [canEdit, previewType, setNodes],
  );

  return { onNodeDragStart, onNodeDrag, onNodeDragStop };
}
