import dagre from "dagre";
import { MarkerType, type Edge, type Node } from "reactflow";
import { computeWivesByHusband, wifeColorFor } from "../domain/wife-colors";
import type { FamilyMember } from "@/features/members";
import type { MemberNodeData } from "./member-node";
import {
  alignDecadeSingleChildren,
  MAX_DETAILED_CHRONOLOGICAL_ROUTES,
} from "../domain/route-edges";
import {
  type CanvasDetail,
  hierarchyPositions,
  DEFAULT_CHRONOLOGICAL_PERIOD,
  type ChronologicalPeriod,
} from "../domain/canvas-preview";
import type { TreeLayoutGeometry } from "../domain/tree-layout-geometry";
import { aggregateOverviewGraph } from "./family-tree-overview";
import {
  DECADE_CARD_GAP,
  DIVORCED_COLOR,
  NODE_H,
  NODE_H_HUSBAND,
  NODE_W,
} from "./family-tree-layout-constants";
import { createNodeProjectionContext, projectLayoutNodes } from "./family-tree-node-projection";

export { DECADE_ROW_H, DIVORCED_COLOR, NODE_H, NODE_W } from "./family-tree-layout-constants";

const birthYear = (member: FamilyMember) => {
  const year = Number.parseInt(member.birth_date?.slice(0, 4) ?? "", 10);
  return Number.isFinite(year) ? year : null;
};

interface LayoutVisibility {
  memberById: Map<string, FamilyMember>;
  wivesByHusband: ReturnType<typeof computeWivesByHusband>;
  wifeHusbandOf: Map<string, string>;
  childrenMap: Map<string, string[]>;
  hidden: Set<string>;
  renderedIds: string[];
}

function descendantsOf(
  collapsed: Set<string>,
  children: Map<string, string[]>,
  initiallyHidden: Set<string>,
): Set<string> {
  const hidden = new Set(initiallyHidden);
  const visit = (id: string) => {
    for (const childId of children.get(id) ?? []) {
      if (hidden.has(childId)) continue;
      hidden.add(childId);
      visit(childId);
    }
  };
  collapsed.forEach(visit);
  return hidden;
}

function layoutVisibility(members: FamilyMember[], collapsed: Set<string>): LayoutVisibility {
  const memberById = new Map(members.map((member) => [member.id, member]));
  const wivesByHusband = computeWivesByHusband(members);
  const asWife = new Set<string>();
  const wifeHusbandOf = new Map<string, string>();
  for (const [husbandId, wives] of wivesByHusband.entries())
    for (const wife of wives) {
      wifeHusbandOf.set(wife.id, husbandId);
      const hasFamily = Boolean(
        (wife.father_id && memberById.has(wife.father_id)) ||
        (wife.mother_id && memberById.has(wife.mother_id)),
      );
      if (!hasFamily || wife.is_unknown) asWife.add(wife.id);
    }
  const childrenMap = new Map<string, string[]>();
  for (const member of members)
    for (const parentId of [member.father_id, member.mother_id])
      if (parentId) childrenMap.set(parentId, [...(childrenMap.get(parentId) ?? []), member.id]);
  const hidden = descendantsOf(collapsed, childrenMap, asWife);
  return {
    memberById,
    wivesByHusband,
    wifeHusbandOf,
    childrenMap,
    hidden,
    renderedIds: members.filter((member) => !hidden.has(member.id)).map((member) => member.id),
  };
}

function hasFixedPosition(member: FamilyMember, chronological: boolean): boolean {
  return !chronological && typeof member.pos_x === "number" && typeof member.pos_y === "number";
}

function layoutNodesOverlap(current: Node<MemberNodeData>, other: Node<MemberNodeData>): boolean {
  const currentHeight = current.data.member.gender === "male" ? NODE_H_HUSBAND : NODE_H;
  const otherHeight = other.data.member.gender === "male" ? NODE_H_HUSBAND : NODE_H;
  const overlapsY =
    current.position.y < other.position.y + otherHeight + 40 &&
    current.position.y + currentHeight + 40 > other.position.y;
  const overlapsX =
    current.position.x < other.position.x + NODE_W + 40 &&
    current.position.x + NODE_W + 40 > other.position.x;
  return overlapsX && overlapsY;
}

function resolveLayoutCollisions(
  nodes: Node<MemberNodeData>[],
  members: FamilyMember[],
  chronological: boolean,
  hierarchy: ReturnType<typeof hierarchyPositions>,
): void {
  const fixedIds = new Set(
    members.filter((member) => hasFixedPosition(member, chronological)).map(({ id }) => id),
  );
  const ordered = [...nodes].sort(
    (a, b) => a.position.y - b.position.y || a.position.x - b.position.x,
  );
  const byRow = new Map<number, Node<MemberNodeData>[]>();
  for (const node of ordered)
    byRow.set(node.position.y, [...(byRow.get(node.position.y) ?? []), node]);
  for (const row of byRow.values()) {
    const layoutRow = row.filter((node) => !fixedIds.has(node.id));
    if (!layoutRow.length) continue;
    if (chronological) {
      const nodeById = new Map(layoutRow.map((node) => [node.id, node]));
      const memberOrder = layoutRow
        .map((node) => node.data.member)
        .sort(
          (first, second) =>
            (hierarchy.get(first.id)?.x ?? 0) - (hierarchy.get(second.id)?.x ?? 0) ||
            (birthYear(second) ?? Number.MIN_SAFE_INTEGER) -
              (birthYear(first) ?? Number.MIN_SAFE_INTEGER) ||
            first.id.localeCompare(second.id),
        );
      const totalWidth =
        memberOrder.length * NODE_W + Math.max(0, memberOrder.length - 1) * DECADE_CARD_GAP;
      memberOrder.forEach((member, index) => {
        const node = nodeById.get(member.id)!;
        node.position.x = index * (NODE_W + DECADE_CARD_GAP) - totalWidth / 2;
      });
      continue;
    }

    // Family Levels already uses subtree widths from hierarchyPositions.
  }
  for (let i = 0; i < ordered.length; i++) {
    const current = ordered[i];
    if (fixedIds.has(current.id)) continue;
    let moved = true;
    while (moved) {
      moved = false;
      for (let j = 0; j < i; j++) {
        const other = ordered[j];
        if (layoutNodesOverlap(current, other)) {
          current.position.x = other.position.x + NODE_W + 40;
          moved = true;
        }
      }
    }
  }
}

function appendSpouseEdges(
  edges: Edge[],
  members: FamilyMember[],
  memberById: Map<string, FamilyMember>,
  wifeHusbandOf: Map<string, string>,
  hidden: Set<string>,
): void {
  const spouseSeen = new Set<string>();
  for (const m of members) {
    if (hidden.has(m.id) || !m.spouse_id) continue;
    // Cousin wife: her marital link is already shown as a chip inside the
    // husband's card; skip drawing the extra spouse edge.
    if (wifeHusbandOf.has(m.id)) continue;
    const sp = memberById.get(m.spouse_id);
    if (!sp || hidden.has(sp.id)) continue;
    if (wifeHusbandOf.has(sp.id)) continue;
    const key = [m.id, sp.id].sort().join("~");
    if (spouseSeen.has(key)) continue;
    spouseSeen.add(key);
    edges.push({
      id: `spouse:${key}`,
      source: m.id,
      target: sp.id,
      sourceHandle: "spouse-r",
      targetHandle: "spouse-l",
      type: "relationship",
      style: { stroke: "#a855f7", strokeWidth: 1.5, strokeDasharray: "2 4", strokeOpacity: 0.7 },
      data: { kind: "spouse", familyKey: `spouse:${key}` },
    });
  }
}

const edgeStyle = (color: string) => ({ stroke: color, strokeWidth: 2, strokeOpacity: 0.95 });
const edgeArrow = (color: string) => ({
  type: MarkerType.ArrowClosed,
  color,
  width: 16,
  height: 16,
});

function fatherEdge(
  member: FamilyMember,
  fatherId: string,
  context: {
    memberById: Map<string, FamilyMember>;
    wivesByHusband: ReturnType<typeof computeWivesByHusband>;
    graph: dagre.graphlib.Graph | undefined;
    editable: boolean;
    onRequestRemove: (relationship: {
      parentId: string;
      childId: string;
      motherId?: string;
    }) => void;
  },
) {
  const motherId = member.mother_id;
  const wives = context.wivesByHusband.get(fatherId) ?? [];
  const wifeIndex = motherId ? wives.findIndex(({ id }) => id === motherId) : -1;
  const divorced = Boolean(
    motherId && context.memberById.get(fatherId)?.divorced_from?.includes(motherId),
  );
  const color =
    wifeIndex < 0 ? "#64748b" : divorced ? DIVORCED_COLOR : wifeColorFor(wifeIndex).stroke;
  context.graph?.setEdge(fatherId, member.id);
  return {
    id: `p:${fatherId}:${member.id}`,
    source: fatherId,
    target: member.id,
    sourceHandle: "child-out",
    targetHandle: "parent-in",
    type: "relationship",
    style: edgeStyle(color),
    markerEnd: edgeArrow(color),
    data: {
      parentId: fatherId,
      childId: member.id,
      motherId,
      canRemove: context.editable,
      onRequestRemove: () =>
        context.onRequestRemove({ parentId: fatherId, childId: member.id, motherId }),
      familyKey: `${fatherId}:${motherId ?? "unknown"}`,
      kind: "parent",
    },
  } satisfies Edge;
}

function motherOnlyEdge(
  member: FamilyMember,
  motherId: string,
  graph: dagre.graphlib.Graph | undefined,
  editable: boolean,
  onRequestRemove: (relationship: { parentId: string; childId: string; motherId?: string }) => void,
) {
  const color = "#64748b";
  graph?.setEdge(motherId, member.id);
  return {
    id: `p:${motherId}:${member.id}`,
    source: motherId,
    target: member.id,
    sourceHandle: "child-out",
    targetHandle: "parent-in",
    type: "relationship",
    style: edgeStyle(color),
    markerEnd: edgeArrow(color),
    data: {
      parentId: motherId,
      childId: member.id,
      motherId,
      canRemove: editable,
      familyKey: `${motherId}:mother-only`,
      kind: "parent",
      onRequestRemove: () => onRequestRemove({ parentId: motherId, childId: member.id, motherId }),
    },
  } satisfies Edge;
}

function buildLayoutEdges(
  members: FamilyMember[],
  memberById: Map<string, FamilyMember>,
  wivesByHusband: ReturnType<typeof computeWivesByHusband>,
  wifeHusbandOf: Map<string, string>,
  hidden: Set<string>,
  renderedIds: string[],
  graph: dagre.graphlib.Graph | undefined,
  editable: boolean,
  onRequestRemove: (relationship: { parentId: string; childId: string; motherId?: string }) => void,
): Edge[] {
  const edges: Edge[] = [];
  const visible = new Set(renderedIds);
  for (const member of members) {
    if (hidden.has(member.id)) continue;
    if (member.father_id && visible.has(member.father_id))
      edges.push(
        fatherEdge(member, member.father_id, {
          memberById,
          wivesByHusband,
          graph,
          editable,
          onRequestRemove,
        }),
      );
    else if (member.mother_id && visible.has(member.mother_id))
      edges.push(motherOnlyEdge(member, member.mother_id, graph, editable, onRequestRemove));
  }
  appendSpouseEdges(edges, members, memberById, wifeHusbandOf, hidden);
  return edges;
}

function createLayoutGraph(
  renderedIds: string[],
  memberById: ReadonlyMap<string, FamilyMember>,
  useProvidedGeometry: boolean,
) {
  if (useProvidedGeometry) return undefined;
  const graph = new dagre.graphlib.Graph();
  graph.setGraph({ rankdir: "TB", nodesep: 120, ranksep: 180, marginx: 40, marginy: 40 });
  graph.setDefaultEdgeLabel(() => ({}));
  for (const id of renderedIds) {
    const height = memberById.get(id)?.gender === "male" ? NODE_H_HUSBAND : NODE_H;
    graph.setNode(id, { width: NODE_W, height });
  }
  return graph;
}

export function layout(
  members: FamilyMember[],
  collapsed: Set<string>,
  onOpen: (id: string) => void,
  onAddParent: (id: string) => void,
  onAddChild: (id: string) => void,
  onRequestRemove: (relationship: { parentId: string; childId: string; motherId?: string }) => void,
  highlightId: string | null,
  editable: boolean,
  chronological = false,
  chronologicalPeriod: ChronologicalPeriod = DEFAULT_CHRONOLOGICAL_PERIOD,
  onToggleCollapsed?: (id: string) => void,
  detail: CanvasDetail = "full",
  providedGeometry?: TreeLayoutGeometry,
) {
  const { memberById, wivesByHusband, wifeHusbandOf, childrenMap, hidden, renderedIds } =
    layoutVisibility(members, collapsed);

  const g = createLayoutGraph(renderedIds, memberById, Boolean(providedGeometry));

  const edges = buildLayoutEdges(
    members,
    memberById,
    wivesByHusband,
    wifeHusbandOf,
    hidden,
    renderedIds,
    g,
    editable,
    onRequestRemove,
  );
  if (g) dagre.layout(g);
  const hierarchy = providedGeometry
    ? new Map(Object.entries(providedGeometry.positions))
    : hierarchyPositions(members, new Set(renderedIds));

  const projection = createNodeProjectionContext({
    members,
    memberById,
    graph: g,
    geometry: providedGeometry,
    hierarchy,
    chronological,
    chronologicalPeriod,
  });
  const nodes = projectLayoutNodes({
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
  });

  // Collision resolution â€” enforce min horizontal gap per generation row.
  if (!providedGeometry) resolveLayoutCollisions(nodes, members, chronological, hierarchy);
  if (chronological && nodes.length <= MAX_DETAILED_CHRONOLOGICAL_ROUTES)
    alignDecadeSingleChildren(nodes, edges, DECADE_CARD_GAP);
  return detail === "overview" && nodes.length > 2_000
    ? aggregateOverviewGraph(nodes, edges, chronological)
    : { nodes, edges };
}
