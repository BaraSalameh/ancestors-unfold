import { useCallback, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import { type Edge, type Node, useReactFlow } from "reactflow";
import { toast } from "sonner";
import type { FamilyMember } from "@/features/members";
import { useI18n } from "@/shared/i18n";
import { familyStore } from "../client/family-store";
import type { ChronologicalPeriod, TreePreviewType } from "../domain/canvas-preview";
import { layout } from "./family-tree-layout";
import type { MemberNodeData } from "./member-node";

type Translator = ReturnType<typeof useI18n>["t"];

interface AutoLayoutOptions {
  canAutoLayout: boolean;
  canEdit: boolean;
  chronologicalPeriod: ChronologicalPeriod;
  collapsed: Set<string>;
  didFit: MutableRefObject<boolean>;
  fitView: ReturnType<typeof useReactFlow>["fitView"];
  highlightId: string | null;
  onAddChild: (id: string) => void;
  onAddParent: (id: string) => void;
  onOpen: (id: string) => void;
  onRequestRemove: (relationship: { parentId: string; childId: string; motherId?: string }) => void;
  onToggleCollapsed?: (id: string) => void;
  previewType: TreePreviewType;
  replacePositionsOnNextLayout: MutableRefObject<boolean>;
  setEdges: Dispatch<SetStateAction<Edge[]>>;
  setNodes: Dispatch<SetStateAction<Node<MemberNodeData>[]>>;
  t: Translator;
  visibleMembers: FamilyMember[];
}

export function useTreeAutoLayout(options: AutoLayoutOptions) {
  const {
    canAutoLayout,
    canEdit,
    chronologicalPeriod,
    collapsed,
    didFit,
    fitView,
    highlightId,
    onAddChild,
    onAddParent,
    onOpen,
    onRequestRemove,
    onToggleCollapsed,
    previewType,
    replacePositionsOnNextLayout,
    setEdges,
    setNodes,
    t,
    visibleMembers,
  } = options;
  return useCallback(() => {
    if (!canAutoLayout) return;
    const auto = layout(
      visibleMembers.map(withoutCanvasPositions),
      collapsed,
      onOpen,
      onAddParent,
      onAddChild,
      onRequestRemove,
      highlightId,
      canEdit,
      previewType === "chronological",
      chronologicalPeriod,
      onToggleCollapsed,
    );
    replacePositionsOnNextLayout.current = true;
    setNodes(auto.nodes);
    setEdges(auto.edges);
    const positions = new Map(auto.nodes.map((node) => [node.id, node.position]));
    if (previewType === "lineage") familyStore.setPositions(positions);
    didFit.current = false;
    requestAnimationFrame(() => fitView({ padding: 0.2, duration: 400 }));
    toast.success(t("auto_layout_done"));
  }, [
    canAutoLayout,
    canEdit,
    chronologicalPeriod,
    collapsed,
    didFit,
    fitView,
    highlightId,
    onAddChild,
    onAddParent,
    onOpen,
    onRequestRemove,
    onToggleCollapsed,
    previewType,
    replacePositionsOnNextLayout,
    setEdges,
    setNodes,
    t,
    visibleMembers,
  ]);
}

function withoutCanvasPositions(member: FamilyMember): FamilyMember {
  return {
    ...member,
    pos_x: undefined,
    pos_y: undefined,
  };
}
