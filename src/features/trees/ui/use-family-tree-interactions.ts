import { toast } from "sonner";
import type { ReactFlowProps } from "reactflow";
import type { FamilyMember } from "@/features/members";
import { displayName } from "@/shared/i18n";
import { familyStore } from "../client/family-store";
import { familyLevelSharedSelectionIds } from "../domain/edge-selection";
import { sharedRouteSelectionIds } from "../domain/route-edges";
import type { ChronologicalPeriod, TreePreviewType } from "../domain/canvas-preview";
import type { FamilyTreeState } from "./use-family-tree-state";
import type { FamilyTreeProjection } from "./use-family-tree-projection";
import { useTreeFlowController } from "./use-tree-flow-controller";
import { useTreeMemberSearch } from "./use-tree-member-search";

interface Params {
  chronologicalPeriod: ChronologicalPeriod;
  previewType: TreePreviewType;
  projection: FamilyTreeProjection;
  state: FamilyTreeState;
}

export function useFamilyTreeInteractions(params: Params) {
  const { core, flow, refs, selection, ui } = params.state;
  const { actions, canEdit, collapsed, layout } = params.projection;
  const graph = useTreeFlowController({
    canAutoLayout: core.capabilities.canAutoLayout,
    canEdit,
    canvasRef: refs.canvasRef,
    chronologicalPeriod: params.chronologicalPeriod,
    collapsed,
    didFit: refs.didFit,
    fitView: flow.fitView,
    highlightId: selection.highlightId,
    initialEdges: layout.edges,
    initialNodes: layout.nodes,
    lang: core.lang,
    onAddChild: actions.onAddChild,
    onAddParent: actions.onAddParent,
    onOpen: actions.onOpen,
    onRequestRemove: actions.onRequestRemove,
    onToggleCollapsed: layout.onToggleCollapsed,
    preserveDetachedSubtree: actions.preserveDetachedSubtree,
    previousChronologicalPeriod: refs.previousChronologicalPeriod,
    previousPreviewType: refs.previousPreviewType,
    previewType: params.previewType,
    replacePositionsOnNextLayout: refs.replacePositionsOnNextLayout,
    screenToFlowPosition: flow.screenToFlowPosition,
    setMotherPicker: ui.setMotherPicker,
    t: core.t,
    visibleMembers: layout.visibleMembers,
    visibleNodePositions: refs.visibleNodePositions,
  });
  const search = useTreeMemberSearch({
    initialNodes: layout.nodes,
    members: core.members,
    previewType: params.previewType,
    query: ui.query,
    setCenter: flow.setCenter,
    setCollapsedByPreview: selection.setCollapsedByPreview,
    setHighlightId: selection.setHighlightId,
    setQuery: ui.setQuery,
  });
  const pickMother = (wifeId: string | null) => {
    if (!ui.motherPicker) return;
    const patch: Partial<FamilyMember> = { father_id: ui.motherPicker.fatherId };
    if (wifeId) patch.mother_id = wifeId;
    familyStore.update(ui.motherPicker.childId, patch);
    const father = familyStore.get(ui.motherPicker.fatherId);
    const child = familyStore.get(ui.motherPicker.childId);
    if (father && child) {
      toast.success(
        core.t("connection_success", {
          parent: displayName(father, core.lang),
          child: displayName(child, core.lang),
        }),
      );
    }
    ui.setMotherPicker(null);
  };
  const onEdgeClick: NonNullable<ReactFlowProps["onEdgeClick"]> = (event, edge) => {
    const scope =
      event.target instanceof Element
        ? event.target.closest<SVGPathElement>("[data-shared-scope]")?.dataset.sharedScope
        : undefined;
    const selection =
      scope === "source" || scope === "family"
        ? sharedRouteSelectionIds(graph.edges, edge, scope)
        : params.previewType === "lineage"
          ? familyLevelSharedSelectionIds(
              graph.edges,
              graph.nodes,
              edge,
              flow.screenToFlowPosition({ x: event.clientX, y: event.clientY }),
            )
          : null;
    graph.setEdges((current) =>
      current.map((candidate) => ({
        ...candidate,
        selected: selection?.has(candidate.id) ?? candidate.id === edge.id,
      })),
    );
  };
  return { graph, onEdgeClick, pickMother, search };
}

export type FamilyTreeInteractions = ReturnType<typeof useFamilyTreeInteractions>;
