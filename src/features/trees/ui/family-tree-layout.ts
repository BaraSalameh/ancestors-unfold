import dagre from "dagre";
import { MarkerType, type Edge, type Node } from "reactflow";
import { computeWivesByHusband, wifeColorFor } from "../domain/wife-colors";
import type { FamilyMember } from "@/features/members";
import type { MemberNodeData } from "./member-node";
import { alignDecadeSingleChildren, routeParentEdges } from "../domain/route-edges";
import {
  chronologicalBandForYear,
  hierarchyPositions,
  DEFAULT_CHRONOLOGICAL_PERIOD,
  type ChronologicalBand,
  type ChronologicalPeriod,
} from "../domain/canvas-preview";

export const NODE_W = 260;
export const NODE_H = 130;
const NODE_H_HUSBAND = 220;
export const DECADE_ROW_H = 520;
const DECADE_CARD_GAP = 140;
export const DIVORCED_COLOR = "#94a3b8";
const FAMILY_ROW_H = 340;

const birthYear = (member: FamilyMember) => {
  const year = Number.parseInt(member.birth_date?.slice(0, 4) ?? "", 10);
  return Number.isFinite(year) ? year : null;
};

const generationBandFor = (
  member: FamilyMember,
  period: ChronologicalPeriod,
): ChronologicalBand | null => {
  const year = birthYear(member);
  return year === null ? null : chronologicalBandForYear(year, period);
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

function buildLayoutEdges(
  members: FamilyMember[],
  memberById: Map<string, FamilyMember>,
  wivesByHusband: ReturnType<typeof computeWivesByHusband>,
  wifeHusbandOf: Map<string, string>,
  hidden: Set<string>,
  renderedIds: string[],
  graph: dagre.graphlib.Graph,
  editable: boolean,
  onRequestRemove: (relationship: { parentId: string; childId: string; motherId?: string }) => void,
): Edge[] {
  const edges: Edge[] = [];

  const DEFAULT_EDGE_COLOR = "#64748b";
  const mkStyle = (color: string) => ({ stroke: color, strokeWidth: 2, strokeOpacity: 0.95 });
  const mkArrow = (color: string) => ({
    type: MarkerType.ArrowClosed,
    color,
    width: 16,
    height: 16,
  });

  // Parent - child edges. Source is the father's card (husband). Color reflects
  // the mother's index in the father's wife list. If the wife is divorced from
  // the father, use a neutral gray instead.
  for (const m of members) {
    if (hidden.has(m.id)) continue;
    const fId = m.father_id && renderedIds.includes(m.father_id) ? m.father_id : undefined;
    const mId = m.mother_id;

    if (fId) {
      let color = DEFAULT_EDGE_COLOR;
      if (mId) {
        const wives = wivesByHusband.get(fId) ?? [];
        const idx = wives.findIndex((w) => w.id === mId);
        if (idx >= 0) {
          const father = memberById.get(fId);
          const divorced = father?.divorced_from?.includes(mId);
          color = divorced ? DIVORCED_COLOR : wifeColorFor(idx).stroke;
        }
      }
      graph.setEdge(fId, m.id);
      edges.push({
        id: `p:${fId}:${m.id}`,
        source: fId,
        target: m.id,
        sourceHandle: "child-out",
        targetHandle: "parent-in",
        type: "relationship",
        style: mkStyle(color),
        markerEnd: mkArrow(color),
        data: {
          parentId: fId,
          childId: m.id,
          motherId: mId,
          canRemove: editable,
          onRequestRemove: () => onRequestRemove({ parentId: fId, childId: m.id, motherId: mId }),
          familyKey: `${fId}:${mId ?? "unknown"}`,
          kind: "parent",
        },
      });
    } else if (mId && renderedIds.includes(mId)) {
      graph.setEdge(mId, m.id);
      edges.push({
        id: `p:${mId}:${m.id}`,
        source: mId,
        target: m.id,
        sourceHandle: "child-out",
        targetHandle: "parent-in",
        type: "relationship",
        style: mkStyle(DEFAULT_EDGE_COLOR),
        markerEnd: mkArrow(DEFAULT_EDGE_COLOR),
        data: {
          parentId: mId,
          childId: m.id,
          motherId: mId,
          canRemove: editable,
          familyKey: `${mId}:mother-only`,
          kind: "parent",
          onRequestRemove: () => onRequestRemove({ parentId: mId, childId: m.id, motherId: mId }),
        },
      });
    }
  }

  // Spouse "married to" edges Ã¢â‚¬â€ only when both endpoints are still visible.
  appendSpouseEdges(edges, members, memberById, wifeHusbandOf, hidden);
  return edges;
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
) {
  const { memberById, wivesByHusband, wifeHusbandOf, childrenMap, hidden, renderedIds } =
    layoutVisibility(members, collapsed);

  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: "TB", nodesep: 120, ranksep: 180, marginx: 40, marginy: 40 });
  g.setDefaultEdgeLabel(() => ({}));

  for (const id of renderedIds) {
    const h = memberById.get(id)?.gender === "male" ? NODE_H_HUSBAND : NODE_H;
    g.setNode(id, { width: NODE_W, height: h });
  }

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
  dagre.layout(g);
  const hierarchy = hierarchyPositions(members, new Set(renderedIds));

  // Generation depth â€” sons, cousins, second cousins etc. share a level.
  const genCache = new Map<string, number>();
  const genOf = (id: string, seen = new Set<string>()): number => {
    if (genCache.has(id)) return genCache.get(id)!;
    if (seen.has(id)) return 0;
    seen.add(id);
    const m = memberById.get(id);
    if (!m) return 0;
    const parents: number[] = [];
    if (m.father_id && memberById.has(m.father_id)) parents.push(genOf(m.father_id, seen) + 1);
    if (m.mother_id && memberById.has(m.mother_id)) parents.push(genOf(m.mother_id, seen) + 1);
    const g = parents.length ? Math.max(...parents) : 0;
    genCache.set(id, g);
    return g;
  };

  const nodes: Node<MemberNodeData>[] = renderedIds.map((id) => {
    const m = memberById.get(id)!;
    const pos = g.node(id);
    const band = generationBandFor(m, chronologicalPeriod);
    const earliestBand = Math.min(
      ...members
        .map((member) => generationBandFor(member, chronologicalPeriod))
        .filter((value): value is ChronologicalBand => value !== null)
        .map((value) => value.start),
    );
    const autoY =
      chronological && band && Number.isFinite(earliestBand)
        ? ((band.start - earliestBand) / chronologicalPeriod) * DECADE_ROW_H
        : genOf(id) * FAMILY_ROW_H;
    const hierarchyPosition = hierarchy.get(id);
    const autoX = chronological
      ? pos.x - pos.width / 2
      : (hierarchyPosition?.x ?? pos.x - pos.width / 2);
    const hierarchyY = hierarchyPosition?.y ?? genOf(id) * FAMILY_ROW_H;
    const hasCustom = typeof m.pos_x === "number" && typeof m.pos_y === "number";
    return {
      id,
      type: "member",
      position:
        hasCustom && !chronological
          ? { x: m.pos_x!, y: m.pos_y! }
          : { x: autoX, y: chronological ? autoY : hierarchyY },
      data: {
        member: m,
        highlighted: highlightId === id,
        onOpen,
        onAddParent,
        onAddChild,
        wives: wivesByHusband.get(id),
        hasDescendants: (childrenMap.get(id)?.length ?? 0) > 0,
        collapsed: collapsed.has(id),
        onToggleCollapsed,
        editable,
      },
      draggable: editable,
      connectable: editable,
    };
  });

  // Collision resolution â€” enforce min horizontal gap per generation row.
  resolveLayoutCollisions(nodes, members, chronological, hierarchy);
  if (chronological) alignDecadeSingleChildren(nodes, edges, DECADE_CARD_GAP);
  const routedEdges = routeParentEdges(nodes, edges, chronological);

  return { nodes, edges: routedEdges };
}
