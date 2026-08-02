import type { Edge, Node } from "reactflow";
import type { MemberNodeData } from "../ui/member-node";
import { routeBundleChild } from "./decade-child-route";

export type RoutePoint = { x: number; y: number };
export type SharedRouteScope = "source" | "family";
type CardRect = { id: string; left: number; right: number; top: number; bottom: number };

export interface DecadeBundleRoute {
  branch: RoutePoint[];
  highlightPath: RoutePoint[];
  junction?: RoutePoint;
  sharedPaths?: RoutePoint[][];
  sharedPathScopes?: SharedRouteScope[];
  anchorSharedSource?: boolean;
}

const NODE_WIDTH = 260;
const NODE_HEIGHT = 130;
const HUSBAND_HEIGHT = 220;
const STEM_CLEARANCE = 40;
const CARD_CLEARANCE = 32;
const BUNDLE_GAP = 44;
const BRANCH_GAP = 36;
const ROW_NUDGE = 8;

const dimension = (value: number | null | undefined, fallback: number) =>
  Number.isFinite(value) && value! > 0 ? value! : fallback;

const width = (node: Node<MemberNodeData>) => dimension(node.width, NODE_WIDTH);
const height = (node: Node<MemberNodeData>) =>
  dimension(node.height, node.data.member.gender === "male" ? HUSBAND_HEIGHT : NODE_HEIGHT);

export function sharedRouteSelectionIds(
  edges: Edge[],
  clickedEdge: Edge,
  scope: SharedRouteScope,
): Set<string> {
  const clickedFamilyKey = (clickedEdge.data as { familyKey?: string } | undefined)?.familyKey;
  return new Set(
    edges
      .filter((edge) => {
        const data = edge.data as { familyKey?: string; kind?: string } | undefined;
        if (data?.kind !== "parent") return false;
        return scope === "source"
          ? edge.source === clickedEdge.source
          : Boolean(clickedFamilyKey && data.familyKey === clickedFamilyKey);
      })
      .map((edge) => edge.id),
  );
}

export function alignDecadeSingleChildren(
  nodes: Node<MemberNodeData>[],
  edges: Edge[],
  horizontalGap: number,
) {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const edgesBySource = new Map<string, Edge[]>();
  for (const edge of edges) {
    if ((edge.data as { kind?: string } | undefined)?.kind !== "parent") continue;
    edgesBySource.set(edge.source, [...(edgesBySource.get(edge.source) ?? []), edge]);
  }

  const singleChildren = [...edgesBySource.values()]
    .filter((sourceEdges) => sourceEdges.length === 1)
    .map(([edge]) => edge)
    .sort(
      (first, second) =>
        (nodeById.get(first.source)?.position.y ?? 0) -
          (nodeById.get(second.source)?.position.y ?? 0) || first.id.localeCompare(second.id),
    );

  for (const edge of singleChildren) {
    const source = nodeById.get(edge.source);
    const target = nodeById.get(edge.target);
    if (!source || !target) continue;
    if (
      typeof target.data.member.decade_pos_x === "number" &&
      typeof target.data.member.decade_pos_y === "number"
    )
      continue;
    const desiredX = source.position.x + (width(source) - width(target)) / 2;
    const wouldOverlap = nodes.some(
      (other) =>
        other.id !== target.id &&
        Math.abs(other.position.y - target.position.y) < 1 &&
        desiredX < other.position.x + width(other) + horizontalGap &&
        desiredX + width(target) + horizontalGap > other.position.x,
    );
    if (!wouldOverlap) target.position.x = desiredX;
  }
}

interface BundleRoutingState {
  nodeById: Map<string, Node<MemberNodeData>>;
  cards: CardRect[];
  routeById: Map<string, DecadeBundleRoute>;
  rowBundleCount: Map<number, number>;
  usedVerticalLanes: Array<{ x: number; top: number; bottom: number }>;
  reserveHorizontalRow: (preferredY: number, direction: -1 | 1) => number;
  reserveVerticalSegment: (x: number, firstY: number, secondY: number) => void;
  verticalLaneConflicts: (x: number, firstY: number, secondY: number) => boolean;
  targetApproachOrdinal: Map<string, number>;
  sortedGroups: Array<[string, Edge[]]>;
  sourceGroupCounts: Map<string, number>;
  sourceGroupIndexes: Map<string, number>;
}

function countSourceGroups(groups: Array<[string, Edge[]]>): Map<string, number> {
  const counts = new Map<string, number>();
  for (const [, familyEdges] of groups) {
    const sourceId = familyEdges[0]?.source;
    if (sourceId) counts.set(sourceId, (counts.get(sourceId) ?? 0) + 1);
  }
  return counts;
}

function createBundleRoutingState(
  nodes: Node<MemberNodeData>[],
  edges: Edge[],
): BundleRoutingState {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const cards: CardRect[] = nodes.map((node) => ({
    id: node.id,
    left: node.position.x - CARD_CLEARANCE,
    right: node.position.x + width(node) + CARD_CLEARANCE,
    top: node.position.y - CARD_CLEARANCE,
    bottom: node.position.y + height(node) + CARD_CLEARANCE,
  }));
  const groups = new Map<string, Edge[]>();
  const routeById = new Map<string, DecadeBundleRoute>();

  for (const edge of edges) {
    const data = edge.data as { kind?: string; familyKey?: string } | undefined;
    if (data?.kind !== "parent") continue;
    const key = data.familyKey ?? `${edge.source}:${edge.target}`;
    groups.set(key, [...(groups.get(key) ?? []), edge]);
  }

  const rowBundleCount = new Map<number, number>();
  const usedVerticalLanes: Array<{ x: number; top: number; bottom: number }> = [];
  const usedHorizontalRows = new Set<number>();
  const reserveHorizontalRow = (preferredY: number, direction: -1 | 1) => {
    let y = preferredY;
    while (usedHorizontalRows.has(y)) y += direction * ROW_NUDGE;
    usedHorizontalRows.add(y);
    return y;
  };
  const reserveVerticalSegment = (x: number, firstY: number, secondY: number) => {
    if (firstY === secondY) return;
    usedVerticalLanes.push({
      x,
      top: Math.min(firstY, secondY),
      bottom: Math.max(firstY, secondY),
    });
  };
  const verticalLaneConflicts = (x: number, firstY: number, secondY: number) => {
    const top = Math.min(firstY, secondY);
    const bottom = Math.max(firstY, secondY);
    return usedVerticalLanes.some(
      (lane) => lane.x === x && Math.max(lane.top, top) < Math.min(lane.bottom, bottom),
    );
  };
  const targetApproachOrdinal = new Map<string, number>();
  const targetRows = new Map<number, Edge[]>();
  const sortedGroups = [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
  const sourceGroupCounts = countSourceGroups(sortedGroups);
  const sourceGroupIndexes = new Map<string, number>();
  for (const edge of edges) {
    if ((edge.data as { kind?: string } | undefined)?.kind !== "parent") continue;
    const target = nodeById.get(edge.target);
    if (!target) continue;
    targetRows.set(target.position.y, [...(targetRows.get(target.position.y) ?? []), edge]);
  }
  for (const rowEdges of targetRows.values()) {
    rowEdges
      .sort(
        (first, second) =>
          (nodeById.get(first.target)?.position.x ?? 0) -
            (nodeById.get(second.target)?.position.x ?? 0) || first.id.localeCompare(second.id),
      )
      .forEach((edge, index) => targetApproachOrdinal.set(edge.id, rowEdges.length - 1 - index));
  }
  return {
    nodeById,
    cards,
    routeById,
    rowBundleCount,
    usedVerticalLanes,
    reserveHorizontalRow,
    reserveVerticalSegment,
    verticalLaneConflicts,
    targetApproachOrdinal,
    sortedGroups,
    sourceGroupCounts,
    sourceGroupIndexes,
  };
}

function applyBundleRoutes(edges: Edge[], routes: Map<string, DecadeBundleRoute>): Edge[] {
  return edges.map((edge) => {
    const decadeBundle = routes.get(edge.id);
    return decadeBundle
      ? { ...edge, data: { ...edge.data, decadeBundle } }
      : { ...edge, data: { ...edge.data, decadeBundle: undefined } };
  });
}

function routeDecadeBundles(nodes: Node<MemberNodeData>[], edges: Edge[]): Edge[] {
  const {
    nodeById,
    cards,
    routeById,
    rowBundleCount,
    usedVerticalLanes,
    reserveHorizontalRow,
    reserveVerticalSegment,
    verticalLaneConflicts,
    targetApproachOrdinal,
    sortedGroups,
    sourceGroupCounts,
    sourceGroupIndexes,
  } = createBundleRoutingState(nodes, edges);
  for (const [, familyEdges] of sortedGroups) {
    const source = nodeById.get(familyEdges[0]?.source ?? "");
    if (!source) continue;

    const sourceX = source.position.x + width(source) / 2;
    const sourceY = source.position.y + height(source);
    const sourceGroupIndex = sourceGroupIndexes.get(source.id) ?? 0;
    sourceGroupIndexes.set(source.id, sourceGroupIndex + 1);
    const sourceGroupCount = sourceGroupCounts.get(source.id) ?? 1;
    const sourceRowBottom = Math.max(
      ...nodes
        .filter((node) => Math.abs(node.position.y - source.position.y) < 1)
        .map((node) => node.position.y + height(node)),
    );
    const bundleIndex = rowBundleCount.get(source.position.y) ?? 0;
    rowBundleCount.set(source.position.y, bundleIndex + 1);
    const busY = reserveHorizontalRow(
      sourceRowBottom + STEM_CLEARANCE + bundleIndex * BUNDLE_GAP,
      1,
    );
    const breakoutY = reserveHorizontalRow(
      sourceRowBottom +
        Math.max(ROW_NUDGE, STEM_CLEARANCE - (sourceGroupCount - sourceGroupIndex) * ROW_NUDGE),
      -1,
    );
    let trunkX = sourceX + (sourceGroupIndex - (sourceGroupCount - 1) / 2) * BUNDLE_GAP;
    let trunkOffset = 1;
    while (verticalLaneConflicts(trunkX, breakoutY, busY)) {
      trunkX += (trunkOffset % 2 === 1 ? 1 : -1) * trunkOffset * BRANCH_GAP;
      trunkOffset += 1;
    }
    if (sourceGroupIndex === 0) reserveVerticalSegment(sourceX, sourceY, breakoutY);
    reserveVerticalSegment(trunkX, breakoutY, busY);

    const routedChildren = familyEdges
      .map((edge) => ({ edge, target: nodeById.get(edge.target) }))
      .filter(
        (entry): entry is { edge: Edge; target: Node<MemberNodeData> } =>
          entry.target !== undefined,
      )
      .sort(
        (a, b) => a.target.position.x - b.target.position.x || a.edge.id.localeCompare(b.edge.id),
      )
      .map(({ edge, target }, index, siblings) =>
        routeBundleChild(
          edge,
          target,
          index,
          siblings.length,
          cards,
          source.id,
          busY,
          trunkX,
          targetApproachOrdinal,
          usedVerticalLanes,
          reserveHorizontalRow,
          reserveVerticalSegment,
        ),
      );

    if (!routedChildren.length) continue;
    const busLeft = Math.min(trunkX, ...routedChildren.map(({ laneX }) => laneX));
    const busRight = Math.max(trunkX, ...routedChildren.map(({ laneX }) => laneX));
    const junction = { x: trunkX, y: busY };
    const sourceStem = [
      { x: sourceX, y: sourceY },
      { x: sourceX, y: breakoutY },
    ];
    const familyStem = [{ x: sourceX, y: breakoutY }, { x: trunkX, y: breakoutY }, junction];
    const familyBus = [
      { x: busLeft, y: busY },
      { x: busRight, y: busY },
    ];
    const sharedPaths =
      sourceGroupIndex === 0 ? [sourceStem, familyStem, familyBus] : [familyStem, familyBus];
    const sharedPathScopes: SharedRouteScope[] =
      sourceGroupIndex === 0 ? ["source", "family", "family"] : ["family", "family"];
    routedChildren.forEach(({ branch }) => {
      const approach = branch.at(-2)!;
      const target = branch.at(-1)!;
      reserveVerticalSegment(target.x, approach.y, target.y);
    });
    routedChildren.forEach(({ edge, branch, laneX }, index) => {
      routeById.set(edge.id, {
        branch,
        highlightPath: [
          { x: sourceX, y: sourceY },
          { x: sourceX, y: breakoutY },
          { x: trunkX, y: breakoutY },
          junction,
          { x: laneX, y: busY },
          ...branch.slice(1),
        ],
        ...(index === 0
          ? {
              junction,
              sharedPaths,
              sharedPathScopes,
              anchorSharedSource: sourceGroupIndex === 0,
            }
          : {}),
      });
    });
  }

  return applyBundleRoutes(edges, routeById);
}

export function routeParentEdges(
  nodes: Node<MemberNodeData>[],
  edges: Edge[],
  chronological: boolean,
): Edge[] {
  return chronological ? routeDecadeBundles(nodes, edges) : edges;
}
