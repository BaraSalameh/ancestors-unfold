import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import type { Edge, Node } from "reactflow";
import type { useI18n } from "@/shared/i18n";
import { memberDeletionPlan, type MemberDeletionPlan } from "@/features/members";
import { familyStore } from "../client/family-store";

type SetNodes = React.Dispatch<React.SetStateAction<Node[]>>;
type SetEdges = React.Dispatch<React.SetStateAction<Edge[]>>;

const isInteractiveTarget = (target: EventTarget | null) =>
  target instanceof Element &&
  Boolean(
    target.closest(
      'input, textarea, select, button, a, [contenteditable="true"], [role="dialog"], [role="menu"], [role="listbox"]',
    ),
  );

export function useTreeKeyboardDelete({
  canEdit,
  nodes,
  setNodes,
  setEdges,
  t,
}: {
  canEdit: boolean;
  nodes: Node[];
  setNodes: SetNodes;
  setEdges: SetEdges;
  t: ReturnType<typeof useI18n>["t"];
}) {
  const nodesRef = useRef(nodes);
  const [deletion, setDeletion] = useState<MemberDeletionPlan | null>(null);
  nodesRef.current = nodes;
  const executeDeletion = useCallback(
    (ids: string[]) => {
      const result = familyStore.removeMany(ids);
      if (result.removed) {
        const removedIds = new Set(ids.filter((id) => familyStore.get(id) === undefined));
        setNodes((current) => current.filter((node) => !removedIds.has(node.id)));
        setEdges((current) =>
          current.filter((edge) => !removedIds.has(edge.source) && !removedIds.has(edge.target)),
        );
        toast.success(
          result.removed === 1 ? t("deleted") : t("members_deleted", { count: result.removed }),
        );
      }
      if (result.skipped) toast.warning(t("members_delete_skipped", { count: result.skipped }));
      setDeletion(null);
    },
    [setEdges, setNodes, t],
  );
  useEffect(() => {
    if (!canEdit) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        event.key !== "Delete" ||
        event.repeat ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey ||
        isInteractiveTarget(event.target)
      )
        return;
      const selectedIds = nodesRef.current
        .filter((node) => node.type === "member" && node.selected)
        .map((node) => node.id);
      if (!selectedIds.length) return;
      event.preventDefault();
      const plan = memberDeletionPlan(selectedIds, familyStore.getAll(), (id) =>
        Boolean(familyStore.protectedImportGender(id)),
      );
      if (plan.wifeIds.length) setDeletion(plan);
      else executeDeletion(plan.selectedIds);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [canEdit, executeDeletion]);
  return {
    deletion,
    cancelDeletion: () => setDeletion(null),
    confirmDeletion: (includeWives: boolean) => {
      if (!deletion) return;
      executeDeletion(
        includeWives ? [...deletion.selectedIds, ...deletion.wifeIds] : deletion.selectedIds,
      );
    },
  };
}
