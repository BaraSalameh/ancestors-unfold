import type dagre from "dagre";
import type { Node } from "reactflow";
import type { FamilyMember } from "@/features/members";
import {
  chronologicalBandForYear,
  type CanvasDetail,
  type ChronologicalPeriod,
  hierarchyPositions,
} from "../domain/canvas-preview";
import type { TreeLayoutGeometry } from "../domain/tree-layout-geometry";
import { computeWivesByHusband } from "../domain/wife-colors";
import { DECADE_ROW_H, FAMILY_ROW_H, NODE_W } from "./family-tree-layout-constants";
import type { MemberNodeData } from "./member-node";

const birthYear = (member: FamilyMember) => {
  const year = Number.parseInt(member.birth_date?.slice(0, 4) ?? "", 10);
  return Number.isFinite(year) ? year : null;
};

function generationBandStart(member: FamilyMember, period: ChronologicalPeriod) {
  const year = birthYear(member);
  return year === null ? undefined : chronologicalBandForYear(year, period).start;
}

function generationDepth(memberById: ReadonlyMap<string, FamilyMember>) {
  const cache = new Map<string, number>();
  const depth = (id: string, seen = new Set<string>()): number => {
    const cached = cache.get(id);
    if (cached !== undefined) return cached;
    if (seen.has(id)) return 0;
    const member = memberById.get(id);
    if (!member) return 0;
    const nextSeen = new Set(seen).add(id);
    const parentDepths = [member.father_id, member.mother_id].flatMap((parentId) =>
      parentId && memberById.has(parentId) ? [depth(parentId, nextSeen) + 1] : [],
    );
    const value = parentDepths.length ? Math.max(...parentDepths) : 0;
    cache.set(id, value);
    return value;
  };
  return depth;
}

type NodeProjectionContext = {
  graph: dagre.graphlib.Graph | undefined;
  geometry?: TreeLayoutGeometry;
  hierarchy: ReturnType<typeof hierarchyPositions>;
  chronological: boolean;
  chronologicalPeriod: ChronologicalPeriod;
  earliestBand: number;
  depth: (id: string) => number;
};

export function createNodeProjectionContext({
  members,
  memberById,
  graph,
  geometry,
  hierarchy,
  chronological,
  chronologicalPeriod,
}: {
  members: FamilyMember[];
  memberById: ReadonlyMap<string, FamilyMember>;
  graph: dagre.graphlib.Graph | undefined;
  geometry?: TreeLayoutGeometry;
  hierarchy: ReturnType<typeof hierarchyPositions>;
  chronological: boolean;
  chronologicalPeriod: ChronologicalPeriod;
}): NodeProjectionContext {
  const starts = members.flatMap((member) => {
    const start = generationBandStart(member, chronologicalPeriod);
    return start === undefined ? [] : [start];
  });
  return {
    graph,
    geometry,
    hierarchy,
    chronological,
    chronologicalPeriod,
    earliestBand: starts.length ? Math.min(...starts) : Number.POSITIVE_INFINITY,
    depth: generationDepth(memberById),
  };
}

function automaticX(member: FamilyMember, context: NodeProjectionContext) {
  const graphPosition = context.graph?.node(member.id);
  const hierarchyPosition = context.hierarchy.get(member.id);
  const graphX = (graphPosition?.x ?? 0) - (graphPosition?.width ?? NODE_W) / 2;
  return context.chronological ? graphX : (hierarchyPosition?.x ?? graphX);
}

function automaticY(member: FamilyMember, context: NodeProjectionContext) {
  const hierarchyPosition = context.hierarchy.get(member.id);
  if (!context.chronological)
    return hierarchyPosition?.y ?? context.depth(member.id) * FAMILY_ROW_H;
  const start = generationBandStart(member, context.chronologicalPeriod);
  if (start === undefined || !Number.isFinite(context.earliestBand))
    return context.depth(member.id) * FAMILY_ROW_H;
  return ((start - context.earliestBand) / context.chronologicalPeriod) * DECADE_ROW_H;
}

function projectedPosition(member: FamilyMember, context: NodeProjectionContext) {
  const provided = context.geometry?.positions[member.id];
  if (provided) return provided;
  const hasFixed = typeof member.pos_x === "number" && typeof member.pos_y === "number";
  if (hasFixed && !context.chronological) return { x: member.pos_x!, y: member.pos_y! };
  return { x: automaticX(member, context), y: automaticY(member, context) };
}

export function projectLayoutNodes({
  renderedIds,
  memberById,
  wivesByHusband,
  childrenMap,
  collapsed,
  projection,
  highlightId,
  onOpen,
  onAddParent,
  onAddChild,
  onToggleCollapsed,
  editable,
  detail,
}: {
  renderedIds: string[];
  memberById: ReadonlyMap<string, FamilyMember>;
  wivesByHusband: ReturnType<typeof computeWivesByHusband>;
  childrenMap: ReadonlyMap<string, string[]>;
  collapsed: ReadonlySet<string>;
  projection: NodeProjectionContext;
  highlightId: string | null;
  onOpen: (id: string) => void;
  onAddParent: (id: string) => void;
  onAddChild: (id: string) => void;
  onToggleCollapsed?: (id: string) => void;
  editable: boolean;
  detail: CanvasDetail;
}) {
  return renderedIds.map((id): Node<MemberNodeData> => {
    const member = memberById.get(id)!;
    return {
      id,
      type: "member",
      position: projectedPosition(member, projection),
      data: {
        member,
        highlighted: highlightId === id,
        onOpen,
        onAddParent,
        onAddChild,
        wives: wivesByHusband.get(id),
        hasDescendants: (childrenMap.get(id)?.length ?? 0) > 0,
        collapsed: collapsed.has(id),
        onToggleCollapsed,
        editable,
        detail,
      },
      draggable: editable,
      connectable: editable,
    };
  });
}
