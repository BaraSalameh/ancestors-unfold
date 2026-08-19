import { useCallback, useMemo, useRef } from "react";
import type { FamilyMember } from "@/features/members";
import { familyStore } from "../client/family-store";
import {
  membersForCanvasPreview,
  type CanvasDetail,
  type ChronologicalPeriod,
  type TreePreviewType,
} from "../domain/canvas-preview";
import { layout } from "./family-tree-layout";
import { useTreeLayoutGeometry } from "./use-tree-layout-geometry";

interface Params {
  canEdit: boolean;
  detail: CanvasDetail;
  chronologicalPeriod: ChronologicalPeriod;
  collapsed: Set<string>;
  highlightId: string | null;
  members: FamilyMember[];
  onAddChild: (id: string) => void;
  onAddParent: (id: string) => void;
  onOpen: (id: string) => void;
  onRequestRemove: (relationship: { parentId: string; childId: string; motherId?: string }) => void;
  previewType: TreePreviewType;
  selectedSubfamilyId: string | null;
  setCollapsedByPreview: React.Dispatch<React.SetStateAction<Record<TreePreviewType, Set<string>>>>;
  subfamilyFilterEnabled: boolean;
}

export function useTreeLayoutProjection(params: Params) {
  const { previewType, setCollapsedByPreview } = params;
  const onToggleCollapsed = useCallback(
    (id: string) => {
      setCollapsedByPreview((current) => {
        const next = new Set(current[previewType]);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return { ...current, [previewType]: next };
      });
    },
    [previewType, setCollapsedByPreview],
  );
  const visibleMembers = useMemo(() => {
    const scopedMembers =
      !params.subfamilyFilterEnabled || !params.selectedSubfamilyId
        ? params.members
        : familyStore.getSubfamilyMembers(params.selectedSubfamilyId);
    return membersForCanvasPreview(scopedMembers, params.previewType);
  }, [
    params.members,
    params.previewType,
    params.selectedSubfamilyId,
    params.subfamilyFilterEnabled,
  ]);
  const geometry = useTreeLayoutGeometry(
    visibleMembers,
    params.collapsed,
    params.previewType === "chronological",
    params.chronologicalPeriod,
  );
  const projectedGraph = useMemo(() => {
    if (!geometry) return undefined;
    return layout(
      visibleMembers,
      params.collapsed,
      params.onOpen,
      params.onAddParent,
      params.onAddChild,
      params.onRequestRemove,
      params.highlightId,
      params.canEdit,
      params.previewType === "chronological",
      params.chronologicalPeriod,
      onToggleCollapsed,
      params.detail,
      geometry,
    );
  }, [
    visibleMembers,
    params.collapsed,
    params.onOpen,
    params.onAddParent,
    params.onAddChild,
    params.onRequestRemove,
    params.highlightId,
    params.canEdit,
    params.previewType,
    params.chronologicalPeriod,
    onToggleCollapsed,
    geometry,
    params.detail,
  ]);
  const lastGraph = useRef<NonNullable<typeof projectedGraph>>({ nodes: [], edges: [] });
  if (projectedGraph) lastGraph.current = projectedGraph;
  const graph = projectedGraph ?? lastGraph.current;
  return {
    ...graph,
    focusPositions: geometry?.positions ?? {},
    onToggleCollapsed,
    visibleMembers,
  };
}
