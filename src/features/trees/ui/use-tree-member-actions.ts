import { useCallback, useState, type MutableRefObject } from "react";
import { toast } from "sonner";
import type { useNavigate } from "@tanstack/react-router";
import { descendantIds, memberDetailsSearch } from "@/features/members";
import type { useI18n } from "@/shared/i18n";
import { computeWivesByHusband } from "../domain/wife-colors";
import { familyStore } from "../client/family-store";
import type { TreeAccessMode } from "../domain/access-policy";
import type { TreePreviewType } from "../domain/canvas-preview";
import type {
  AddRelativeTarget,
  ChildMotherChoice,
  CreationChoice,
  RemoveParentChoice,
} from "./family-tree-dialogs";

interface Params {
  accessMode: TreeAccessMode;
  canEdit: boolean;
  navigate: ReturnType<typeof useNavigate>;
  previewType: TreePreviewType;
  t: ReturnType<typeof useI18n>["t"];
  visibleNodePositions: MutableRefObject<Map<string, { x: number; y: number }>>;
}

export function useTreeMemberActions(params: Params) {
  const [creationChoice, setCreationChoice] = useState<CreationChoice | null>(null);
  const [childMotherChoice, setChildMotherChoice] = useState<ChildMotherChoice | null>(null);
  const [removeParentChoice, setRemoveParentChoice] = useState<RemoveParentChoice | null>(null);

  const onOpen = useCallback(
    (id: string) => {
      params.navigate({
        to: "/member/$id",
        params: { id },
        search: memberDetailsSearch({
          treeId: familyStore.getActiveTreeId(),
          returnMode: params.accessMode,
          returnPreview: params.previewType,
        }),
      });
    },
    // Capability fields form the callback contract; the wrapper object is recreated by the caller.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [params.accessMode, params.navigate, params.previewType],
  );

  const navigateToAdd = useCallback(
    (search: AddRelativeTarget) =>
      params.navigate({
        to: "/tree/$id/add",
        params: { id: familyStore.getActiveTreeId() },
        search: { ...search, returnPreview: params.previewType },
      }),
    // Capability fields form the callback contract; the wrapper object is recreated by the caller.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [params.navigate, params.previewType],
  );

  const onAddParent = useCallback(
    (id: string) => {
      const child = familyStore.get(id);
      if (!params.canEdit || !child || (child.father_id && child.mother_id)) return;
      if (!child.father_id && !child.mother_id) {
        setCreationChoice({ kind: "parent", memberId: id });
        return;
      }
      navigateToAdd({ childId: id, parentRole: child.father_id ? "mother" : "father" });
    },
    [navigateToAdd, params.canEdit],
  );

  const onAddChild = useCallback(
    (id: string) => {
      const parent = familyStore.get(id);
      if (!params.canEdit || !parent) return;
      if (parent.gender === "unspecified") {
        setCreationChoice({ kind: "child-role", memberId: id });
        return;
      }
      if (parent.gender === "female") {
        const husbands = [...computeWivesByHusband(familyStore.getAll()).entries()]
          .filter(([, wives]) => wives.some((wife) => wife.id === id))
          .map(([husbandId]) => husbandId);
        navigateToAdd({ motherId: id, fatherId: husbands.length === 1 ? husbands[0] : undefined });
        return;
      }
      const wives = computeWivesByHusband(familyStore.getAll()).get(id) ?? [];
      if (wives.length > 1) {
        setChildMotherChoice({ fatherId: id, wives });
        return;
      }
      navigateToAdd({ fatherId: id, motherId: wives[0]?.id });
    },
    [navigateToAdd, params.canEdit],
  );

  const preserveDetachedSubtree = useCallback(
    (childId: string, removedRole: "father_id" | "mother_id") => {
      const child = familyStore.get(childId);
      if (!child) return;
      const remainingParent = removedRole === "father_id" ? child.mother_id : child.father_id;
      if (remainingParent) return;
      const positions = new Map<string, { x: number; y: number }>();
      for (const id of descendantIds(familyStore.getAll(), childId)) {
        const position = params.visibleNodePositions.current.get(id);
        if (position) positions.set(id, position);
      }
      familyStore.setPositions(positions);
    },
    [params.visibleNodePositions],
  );

  const onRequestRemove = useCallback(
    (relationship: { parentId: string; childId: string; motherId?: string }) => {
      const child = familyStore.get(relationship.childId);
      if (!params.canEdit || !child) return;
      if (
        relationship.motherId &&
        relationship.motherId !== relationship.parentId &&
        child.father_id &&
        child.mother_id
      ) {
        setRemoveParentChoice({
          childId: child.id,
          fatherId: relationship.parentId,
          motherId: relationship.motherId,
        });
        return;
      }
      const role = relationship.parentId === child.mother_id ? "mother_id" : "father_id";
      preserveDetachedSubtree(child.id, role);
      familyStore.detachParent(child.id, role);
      toast.success(params.t("link_removed"));
    },
    // Capability fields form the callback contract; the wrapper object is recreated by the caller.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [params.canEdit, params.t, preserveDetachedSubtree],
  );

  return {
    childMotherChoice,
    creationChoice,
    navigateToAdd,
    onAddChild,
    onAddParent,
    onOpen,
    onRequestRemove,
    preserveDetachedSubtree,
    removeParentChoice,
    setChildMotherChoice,
    setCreationChoice,
    setRemoveParentChoice,
  };
}
