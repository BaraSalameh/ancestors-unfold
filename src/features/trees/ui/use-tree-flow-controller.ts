import type { MutableRefObject, RefObject } from "react";
import {
  useEdgesState,
  useNodesState,
  type Edge,
  type Node,
  type ReactFlowInstance,
} from "reactflow";
import type { FamilyMember } from "@/features/members";
import type { useI18n } from "@/shared/i18n";
import type { ChronologicalPeriod, TreePreviewType } from "../domain/canvas-preview";
import type { MotherPickerState } from "./use-tree-edge-interactions";
import { useTreeConnection, useTreeEdgeEditing } from "./use-tree-edge-interactions";
import { useCanvasMarquee, useCanvasSelection } from "./use-canvas-marquee";
import { useTreeAutoLayout } from "./use-tree-auto-layout";
import { useTreeFlowSync } from "./use-tree-flow-sync";
import { useTreeNodeDrag } from "./use-tree-node-drag";
import { useTreeKeyboardDelete } from "./use-tree-keyboard-delete";

interface Params {
  canAutoLayout: boolean;
  canEdit: boolean;
  canvasRef: RefObject<HTMLDivElement | null>;
  chronologicalPeriod: ChronologicalPeriod;
  collapsed: Set<string>;
  didFit: MutableRefObject<boolean>;
  fitView: ReactFlowInstance["fitView"];
  highlightId: string | null;
  initialEdges: Edge[];
  initialNodes: Node[];
  lang: ReturnType<typeof useI18n>["lang"];
  onAddChild: (id: string) => void;
  onAddParent: (id: string) => void;
  onOpen: (id: string) => void;
  onRequestRemove: (relationship: { parentId: string; childId: string; motherId?: string }) => void;
  onToggleCollapsed: (id: string) => void;
  preserveDetachedSubtree: (childId: string, role: "father_id" | "mother_id") => void;
  previousChronologicalPeriod: MutableRefObject<ChronologicalPeriod>;
  previousPreviewType: MutableRefObject<TreePreviewType>;
  previewType: TreePreviewType;
  replacePositionsOnNextLayout: MutableRefObject<boolean>;
  screenToFlowPosition: ReactFlowInstance["screenToFlowPosition"];
  setMotherPicker: React.Dispatch<React.SetStateAction<MotherPickerState | null>>;
  t: ReturnType<typeof useI18n>["t"];
  visibleMembers: FamilyMember[];
  visibleNodePositions: MutableRefObject<Map<string, { x: number; y: number }>>;
}

export function useTreeFlowController(params: Params) {
  const [nodes, setNodes, onNodesChange] = useNodesState(params.initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(params.initialEdges);
  const clearCanvasSelection = useCanvasSelection(setNodes, setEdges);
  const marquee = useCanvasMarquee({
    canvasRef: params.canvasRef,
    clearSelection: clearCanvasSelection,
    setNodes,
    screenToFlowPosition: params.screenToFlowPosition,
  });
  useTreeFlowSync({
    cancelMarquee: marquee.cancelMarquee,
    canEdit: params.canEdit,
    chronologicalPeriod: params.chronologicalPeriod,
    clearCanvasSelection,
    didFit: params.didFit,
    edges,
    fitView: params.fitView,
    initialEdges: params.initialEdges,
    initialNodes: params.initialNodes,
    nodes,
    previousChronologicalPeriod: params.previousChronologicalPeriod,
    previousPreviewType: params.previousPreviewType,
    previewType: params.previewType,
    replacePositionsOnNextLayout: params.replacePositionsOnNextLayout,
    setEdges,
    setNodes,
    visibleNodePositions: params.visibleNodePositions,
  });
  const onConnect = useTreeConnection({
    canEdit: params.canEdit,
    lang: params.lang,
    t: params.t,
    setMotherPicker: params.setMotherPicker,
  });
  const edgeEditing = useTreeEdgeEditing({
    canEdit: params.canEdit,
    preserveDetachedSubtree: params.preserveDetachedSubtree,
    setEdges,
    t: params.t,
  });
  const nodeDrag = useTreeNodeDrag({
    canEdit: params.canEdit,
    nodes,
    previewType: params.previewType,
    setEdges,
    setNodes,
  });
  const keyboardDeletion = useTreeKeyboardDelete({
    canEdit: params.canEdit,
    nodes,
    setEdges,
    setNodes,
    t: params.t,
  });
  const onAutoLayout = useTreeAutoLayout({
    canAutoLayout: params.canAutoLayout,
    canEdit: params.canEdit,
    chronologicalPeriod: params.chronologicalPeriod,
    collapsed: params.collapsed,
    didFit: params.didFit,
    fitView: params.fitView,
    highlightId: params.highlightId,
    onAddChild: params.onAddChild,
    onAddParent: params.onAddParent,
    onOpen: params.onOpen,
    onRequestRemove: params.onRequestRemove,
    onToggleCollapsed: params.onToggleCollapsed,
    previewType: params.previewType,
    replacePositionsOnNextLayout: params.replacePositionsOnNextLayout,
    setEdges,
    setNodes,
    t: params.t,
    visibleMembers: params.visibleMembers,
  });
  return {
    ...edgeEditing,
    ...marquee,
    ...nodeDrag,
    clearCanvasSelection,
    edges,
    nodes,
    onAutoLayout,
    onConnect,
    onEdgesChange,
    onNodesChange,
    setEdges,
    keyboardDeletion,
  };
}
