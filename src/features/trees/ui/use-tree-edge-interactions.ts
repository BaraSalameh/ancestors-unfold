import { useCallback, useRef, type Dispatch, type SetStateAction } from "react";
import { updateEdge, type Connection, type Edge } from "reactflow";
import { toast } from "sonner";
import type { FamilyMember } from "@/features/members";
import { displayName, useI18n } from "@/shared/i18n";
import { familyStore } from "../client/family-store";
import { computeWivesByHusband } from "../domain/wife-colors";
import { isMemberDescendant } from "../domain/member-ancestry";

type Translator = ReturnType<typeof useI18n>["t"];
type Language = ReturnType<typeof useI18n>["lang"];

export interface MotherPickerState {
  fatherId: string;
  childId: string;
  wives: FamilyMember[];
}

interface ConnectionOptions {
  canEdit: boolean;
  lang: Language;
  t: Translator;
  setMotherPicker: Dispatch<SetStateAction<MotherPickerState | null>>;
}

export function useTreeConnection({ canEdit, lang, t, setMotherPicker }: ConnectionOptions) {
  return useCallback(
    (connection: Connection) => {
      if (!canEdit || !connection.source || !connection.target) return;
      if (connection.source === connection.target) {
        toast.error(t("cannot_link_self"));
        return;
      }
      const parent = familyStore.get(connection.source);
      const child = familyStore.get(connection.target);
      if (!parent || !child) return;
      if (isMemberDescendant(familyStore.getAll(), connection.target, connection.source)) {
        toast.error(t("cannot_link_cycle"));
        return;
      }
      if (parent.gender === "male") {
        const wives = computeWivesByHusband(familyStore.getAll()).get(parent.id) ?? [];
        if (wives.length > 1) {
          setMotherPicker({ fatherId: parent.id, childId: child.id, wives });
          return;
        }
        const patch: Partial<FamilyMember> = { father_id: parent.id };
        if (wives.length === 1) patch.mother_id = wives[0].id;
        familyStore.update(child.id, patch);
      } else {
        familyStore.update(child.id, { mother_id: parent.id });
      }
      toast.success(
        t("connection_success", {
          parent: displayName(parent, lang),
          child: displayName(child, lang),
        }),
      );
    },
    [canEdit, lang, setMotherPicker, t],
  );
}

interface EdgeEditingOptions {
  canEdit: boolean;
  preserveDetachedSubtree: (childId: string, role: "father_id" | "mother_id") => void;
  setEdges: Dispatch<SetStateAction<Edge[]>>;
  t: Translator;
}

export function useTreeEdgeEditing({
  canEdit,
  preserveDetachedSubtree,
  setEdges,
  t,
}: EdgeEditingOptions) {
  const updateSuccessful = useRef(true);
  const onEdgesDelete = useCallback(
    (removed: Edge[]) => {
      if (!canEdit) return;
      let cleared = 0;
      for (const edge of removed) cleared += removeTreeEdge(edge, preserveDetachedSubtree) ? 1 : 0;
      if (cleared) toast.success(t("link_removed"));
    },
    [canEdit, preserveDetachedSubtree, t],
  );

  const onEdgeUpdate = useCallback(
    (oldEdge: Edge, connection: Connection) => {
      if (!canEdit) return;
      updateSuccessful.current = true;
      if (!connection.source || !connection.target) return;
      if (!replaceTreeEdge(oldEdge, connection, t)) return;
      setEdges((edges) => updateEdge(oldEdge, connection, edges));
    },
    [canEdit, setEdges, t],
  );

  const onEdgeUpdateEnd = useCallback(
    (_event: unknown, edge: Edge) => {
      if (!updateSuccessful.current) {
        setEdges((edges) => edges.filter(({ id }) => id !== edge.id));
        onEdgesDelete([edge]);
      }
      updateSuccessful.current = true;
    },
    [onEdgesDelete, setEdges],
  );

  return {
    onEdgesDelete,
    onEdgeUpdate,
    onEdgeUpdateStart: () => {
      updateSuccessful.current = false;
    },
    onEdgeUpdateEnd,
  };
}

function removeTreeEdge(
  edge: Edge,
  preserveDetachedSubtree: (childId: string, role: "father_id" | "mother_id") => void,
): boolean {
  const data = edge.data as { parentId?: string; childId?: string; kind?: string } | undefined;
  if (data?.kind === "spouse") {
    const first = familyStore.get(edge.source);
    const second = familyStore.get(edge.target);
    if (!first || !second) return false;
    familyStore.update(first.id, { spouse_id: undefined });
    familyStore.update(second.id, { spouse_id: undefined });
    return true;
  }
  if (!data?.childId || !data.parentId) return false;
  const child = familyStore.get(data.childId);
  const parent = familyStore.get(data.parentId);
  if (!child || !parent) return false;
  const role =
    child.father_id === parent.id
      ? "father_id"
      : child.mother_id === parent.id
        ? "mother_id"
        : undefined;
  if (!role) return false;
  preserveDetachedSubtree(child.id, role);
  familyStore.detachParent(child.id, role);
  return true;
}

function replaceTreeEdge(oldEdge: Edge, connection: Connection, t: Translator): boolean {
  const data = oldEdge.data as { parentId?: string; childId?: string; kind?: string } | undefined;
  if (data?.kind === "spouse") return replaceSpouseEdge(oldEdge, connection, t);
  if (!data?.parentId || !data.childId) return false;
  const oldParent = familyStore.get(data.parentId);
  const oldChild = familyStore.get(data.childId);
  const newParent = familyStore.get(connection.source!);
  const newChild = familyStore.get(connection.target!);
  if (!oldParent || !oldChild || !newParent || !newChild) return false;
  if (newParent.id === newChild.id) {
    toast.error(t("cannot_link_self"));
    return false;
  }
  if (isMemberDescendant(familyStore.getAll(), newChild.id, newParent.id)) {
    toast.error(t("cannot_link_cycle"));
    return false;
  }
  const oldRole = oldParent.gender === "male" ? "father_id" : "mother_id";
  const newRole = newParent.gender === "male" ? "father_id" : "mother_id";
  familyStore.detachParent(oldChild.id, oldRole);
  familyStore.update(newChild.id, { [newRole]: newParent.id });
  toast.success(t("link_updated"));
  return true;
}

function replaceSpouseEdge(oldEdge: Edge, connection: Connection, t: Translator): boolean {
  const first = familyStore.get(oldEdge.source);
  const second = familyStore.get(oldEdge.target);
  if (first) familyStore.update(first.id, { spouse_id: undefined });
  if (second) familyStore.update(second.id, { spouse_id: undefined });
  familyStore.update(connection.source!, { spouse_id: connection.target! });
  toast.success(t("link_updated"));
  return true;
}
