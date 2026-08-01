import { useMemo } from "react";
import type { Node, ReactFlowInstance } from "reactflow";
import type { FamilyMember } from "@/features/members";
import type { TreePreviewType } from "../domain/canvas-preview";
import { NODE_H, NODE_W } from "./family-tree-layout";

interface Params {
  initialNodes: Node[];
  members: FamilyMember[];
  previewType: TreePreviewType;
  query: string;
  setCenter: ReactFlowInstance["setCenter"];
  setCollapsedByPreview: React.Dispatch<React.SetStateAction<Record<TreePreviewType, Set<string>>>>;
  setHighlightId: (id: string | null) => void;
  setQuery: (query: string) => void;
}

export function useTreeMemberSearch(params: Params) {
  const matches = useMemo(() => {
    const query = params.query.trim();
    if (!query) return [];
    const normalized = query.toLowerCase();
    return params.members
      .filter(
        (member) =>
          member.name_en.toLowerCase().includes(normalized) || member.name_ar.includes(query),
      )
      .slice(0, 8);
  }, [params.members, params.query]);

  const focusMember = (id: string) => {
    params.setHighlightId(id);
    params.setQuery("");
    const node = params.initialNodes.find((candidate) => candidate.id === id);
    if (node) {
      params.setCenter(node.position.x + NODE_W / 2, node.position.y + NODE_H / 2, {
        zoom: 1.1,
        duration: 500,
      });
    } else {
      params.setCollapsedByPreview((current) => ({
        ...current,
        [params.previewType]: new Set(),
      }));
    }
  };

  return { focusMember, matches };
}
