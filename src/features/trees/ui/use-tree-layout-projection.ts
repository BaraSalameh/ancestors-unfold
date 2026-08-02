import { useCallback, useMemo } from "react";
import type { FamilyMember } from "@/features/members";
import { familyStore } from "../client/family-store";
import type { ChronologicalPeriod, TreePreviewType } from "../domain/canvas-preview";
import { layout } from "./family-tree-layout";

interface Params {
  canEdit: boolean;
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
  const onToggleCollapsed = useCallback(
    (id: string) => {
      params.setCollapsedByPreview((current) => {
        const next = new Set(current[params.previewType]);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return { ...current, [params.previewType]: next };
      });
    },
    // The callback is keyed to the explicit projection fields; the wrapper object is recreated.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [params.previewType, params.setCollapsedByPreview],
  );
  const visibleMembers = useMemo(
    () =>
      !params.subfamilyFilterEnabled || !params.selectedSubfamilyId
        ? params.members
        : familyStore.getSubfamilyMembers(params.selectedSubfamilyId),
    [params.members, params.selectedSubfamilyId, params.subfamilyFilterEnabled],
  );
  const graph = useMemo(
    () =>
      layout(
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
      ),
    [
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
    ],
  );
  return { ...graph, onToggleCollapsed, visibleMembers };
}
