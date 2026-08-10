import type { ChronologicalPeriod, TreePreviewType } from "../domain/canvas-preview";
import { branchesWidgetVisible } from "../domain/canvas-widgets";
import { DECADE_ROW_H } from "./family-tree-layout";
import { FamilyTreeView } from "./family-tree-view";
import { useTreeCenter } from "./use-tree-center";
import type { FamilyTreeInteractions } from "./use-family-tree-interactions";
import type { FamilyTreeProjection } from "./use-family-tree-projection";
import type { FamilyTreeState } from "./use-family-tree-state";

interface Props {
  chronologicalPeriod: ChronologicalPeriod;
  interactions: FamilyTreeInteractions;
  overviewMode: boolean;
  previewType: TreePreviewType;
  projection: FamilyTreeProjection;
  state: FamilyTreeState;
  csvImportOpen: boolean;
  onCsvImportOpenChange: (open: boolean) => void;
}

export function FamilyTreeComposition(props: Props) {
  const { core, refs, selection, ui } = props.state;
  const { actions, canEdit, generation, onCanvasWheel } = props.projection;
  const { graph, onEdgeClick, pickMother, search } = props.interactions;
  const centerTree = useTreeCenter({
    canvasRef: refs.canvasRef,
    nodes: graph.nodes,
    setViewport: props.state.flow.setViewport,
    viewportRef: refs.viewportRef,
  });
  return (
    <FamilyTreeView
      canvasRef={refs.canvasRef}
      canvasHandlers={{
        onWheel: onCanvasWheel,
        onPointerDownCapture: graph.onPointerDownCapture,
        onPointerMoveCapture: graph.onPointerMoveCapture,
        onPointerUpCapture: graph.onPointerUpCapture,
        onPointerCancelCapture: graph.onPointerCancelCapture,
        onLostPointerCapture: graph.onPointerCancelCapture,
      }}
      topbar={{
        canAutoLayout: core.capabilities.canAutoLayout,
        canEdit: core.canEdit,
        canMutate: canEdit,
        lang: core.lang,
        matches: search.matches,
        members: core.members,
        onAutoLayout: graph.onAutoLayout,
        onFocusMember: search.focusMember,
        query: ui.query,
        setQuery: ui.setQuery,
        t: core.t,
        csvImportOpen: props.csvImportOpen,
        onCsvImportOpenChange: props.onCsvImportOpenChange,
      }}
      flowKey={props.previewType}
      onCenter={centerTree}
      flow={{
        nodes: graph.nodes,
        edges: graph.edges,
        onNodesChange: graph.onNodesChange,
        onEdgesChange: graph.onEdgesChange,
        onEdgeClick,
        onNodeClick: () =>
          graph.setEdges((current) =>
            current.map((edge) => (edge.selected ? { ...edge, selected: false } : edge)),
          ),
        onPaneClick: graph.clearCanvasSelection,
        onConnect: core.capabilities.canConnect ? graph.onConnect : undefined,
        onEdgesDelete: canEdit ? graph.onEdgesDelete : undefined,
        onEdgeUpdate: canEdit ? graph.onEdgeUpdate : undefined,
        onEdgeUpdateStart: canEdit ? graph.onEdgeUpdateStart : undefined,
        onEdgeUpdateEnd: canEdit ? graph.onEdgeUpdateEnd : undefined,
        onNodeDragStart: core.capabilities.canDrag ? graph.onNodeDragStart : undefined,
        onNodeDrag: core.capabilities.canDrag ? graph.onNodeDrag : undefined,
        onNodeDragStop: core.capabilities.canDrag ? graph.onNodeDragStop : undefined,
        nodesDraggable: core.capabilities.canDrag,
        nodesConnectable: core.capabilities.canConnect,
        elementsSelectable: core.capabilities.canSelect,
        edgesUpdatable: canEdit,
        edgesFocusable: core.capabilities.canSelect,
        defaultEdgeOptions: {
          type: "relationship",
          focusable: core.capabilities.canSelect,
          deletable: false,
          updatable: canEdit,
        },
      }}
      onViewportChange={(viewport) => {
        refs.viewportRef.current = viewport;
        ui.commitViewport(viewport);
      }}
      chronologicalOverlay={chronologicalOverlay(props)}
      marqueeRect={graph.marqueeRect}
      sidebar={{
        activeGeneration: generation.activeGeneration ?? undefined,
        chronologicalPeriod: props.chronologicalPeriod,
        collapsedWidgets: ui.collapsedWidgets,
        generationYear: ui.generationYear,
        generations: generation.generations,
        overviewMode: props.overviewMode,
        periodDraft: ui.periodDraft,
        previewType: props.previewType,
        registeredMemberCount: core.members.length,
        scrollToGeneration: generation.scrollToGeneration,
        selectedSubfamilyId: selection.selectedSubfamilyId,
        setGenerationYear: ui.setGenerationYear,
        setPeriodDraft: ui.setPeriodDraft,
        setSelectedSubfamilyId: selection.setSelectedSubfamilyId,
        setSubfamilyFilterEnabled: selection.setSubfamilyFilterEnabled,
        subfamilyFilterEnabled: selection.subfamilyFilterEnabled,
        showSubfamilies: branchesWidgetVisible(core.canManageSubfamilies, props.overviewMode),
        t: core.t,
        toggleWidget: (widget) => toggleCollapsedWidget(ui, widget),
        viewport: ui.viewport,
      }}
      dialogs={{
        canEdit,
        cancelMemberDeletion: graph.keyboardDeletion.cancelDeletion,
        childMotherChoice: actions.childMotherChoice,
        creationChoice: actions.creationChoice,
        lang: core.lang,
        motherPicker: ui.motherPicker,
        memberDeletion: graph.keyboardDeletion.deletion,
        navigateToAdd: actions.navigateToAdd,
        pickMother,
        preserveDetachedSubtree: actions.preserveDetachedSubtree,
        removeParentChoice: actions.removeParentChoice,
        setChildMotherChoice: actions.setChildMotherChoice,
        setCreationChoice: actions.setCreationChoice,
        setMotherPicker: ui.setMotherPicker,
        setRemoveParentChoice: actions.setRemoveParentChoice,
        t: core.t,
        confirmMemberDeletion: graph.keyboardDeletion.confirmDeletion,
      }}
    />
  );
}

function toggleCollapsedWidget(
  ui: FamilyTreeState["ui"],
  widget: keyof FamilyTreeState["ui"]["collapsedWidgets"],
) {
  ui.setCollapsedWidgets((current) => ({ ...current, [widget]: !current[widget] }));
}

function chronologicalOverlay(props: Props) {
  const { generation } = props.projection;
  const active = generation.activeGeneration;
  if (props.previewType !== "chronological" || !active) return undefined;
  const { viewport } = props.state.ui;
  return {
    start: active.start,
    end: active.end,
    top:
      ((active.start - generation.earliestGeneration) / props.chronologicalPeriod) *
        DECADE_ROW_H *
        viewport.zoom +
      viewport.y,
  };
}
