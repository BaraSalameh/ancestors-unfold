import type { TreeAccessMode } from "../domain/access-policy";
import type { ChronologicalPeriod, TreePreviewType } from "../domain/canvas-preview";
import { useCanvasWheel } from "./use-canvas-wheel";
import type { FamilyTreeState } from "./use-family-tree-state";
import { useTreeGenerationNavigation } from "./use-tree-generation-navigation";
import { useTreeLayoutProjection } from "./use-tree-layout-projection";
import { useTreeMemberActions } from "./use-tree-member-actions";

interface Params {
  accessMode: TreeAccessMode;
  chronologicalPeriod: ChronologicalPeriod;
  previewType: TreePreviewType;
  state: FamilyTreeState;
}

export function useFamilyTreeProjection(params: Params) {
  const { core, flow, refs, selection, ui } = params.state;
  const canEdit = core.capabilities.canMutate;
  const collapsed = selection.collapsedByPreview[params.previewType];
  const actions = useTreeMemberActions({
    accessMode: params.accessMode,
    canEdit,
    navigate: core.navigate,
    previewType: params.previewType,
    t: core.t,
    visibleNodePositions: refs.visibleNodePositions,
  });
  const onCanvasWheel = useCanvasWheel({
    canvasRef: refs.canvasRef,
    setViewport: flow.setViewport,
    viewportRef: refs.viewportRef,
  });
  const layout = useTreeLayoutProjection({
    canEdit,
    chronologicalPeriod: params.chronologicalPeriod,
    collapsed,
    highlightId: selection.highlightId,
    members: core.members,
    onAddChild: actions.onAddChild,
    onAddParent: actions.onAddParent,
    onOpen: actions.onOpen,
    onRequestRemove: actions.onRequestRemove,
    previewType: params.previewType,
    selectedSubfamilyId: selection.selectedSubfamilyId,
    setCollapsedByPreview: selection.setCollapsedByPreview,
    subfamilyFilterEnabled: selection.subfamilyFilterEnabled,
  });
  const generation = useTreeGenerationNavigation({
    chronologicalPeriod: params.chronologicalPeriod,
    generationYear: ui.generationYear,
    setCenter: flow.setCenter,
    setGenerationYear: ui.setGenerationYear,
    viewport: ui.viewport,
    visibleMembers: layout.visibleMembers,
  });
  return { actions, canEdit, collapsed, generation, layout, onCanvasWheel };
}

export type FamilyTreeProjection = ReturnType<typeof useFamilyTreeProjection>;
