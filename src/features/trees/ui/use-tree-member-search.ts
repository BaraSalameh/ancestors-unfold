import { useMemo } from "react";
import type { ReactFlowInstance } from "reactflow";
import { memberPaternalSearchLabel, type FamilyMember } from "@/features/members/domain";
import type { TreePreviewType } from "../domain/canvas-preview";
import { NODE_H, NODE_W } from "./family-tree-layout";

interface Params {
  positions: Readonly<Record<string, { x: number; y: number }>>;
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
    const membersById = new Map(params.members.map((member) => [member.id, member]));
    return params.members
      .filter((member) =>
        [
          memberPaternalSearchLabel(member, membersById, "en"),
          memberPaternalSearchLabel(member, membersById, "ar"),
        ].some((label) => label.toLowerCase().includes(normalized)),
      )
      .slice(0, 8);
  }, [params.members, params.query]);

  const focusMember = (id: string) => {
    params.setHighlightId(id);
    params.setQuery("");
    const position = params.positions[id];
    if (position) {
      params.setCenter(position.x + NODE_W / 2, position.y + NODE_H / 2, {
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
