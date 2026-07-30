import type { Edge, Node } from "reactflow";
import type { MemberNodeData } from "../ui/member-node";

export type RoutePoint = { x: number; y: number };
type CardRect = { id: string; left: number; right: number; top: number; bottom: number };

export interface DecadeBundleRoute {
  branch: RoutePoint[];
  junction?: RoutePoint;
  sharedPaths?: RoutePoint[][];
}

const NODE_WIDTH = 260;
const NODE_HEIGHT = 130;
const HUSBAND_HEIGHT = 220;
const STEM_CLEARANCE = 40;
const CARD_CLEARANCE = 32;
const BUNDLE_GAP = 44;
const BRANCH_GAP = 36;
const APPROACH_GAP = 32;

const dimension = (value: number | null | undefined, fallback: number) =>
  Number.isFinite(value) && value! > 0 ? value! : fallback;

const width = (node: Node<MemberNodeData>) => dimension(node.width, NODE_WIDTH);
const height = (node: Node<MemberNodeData>) =>
  dimension(node.height, node.data.member.gender === "male" ? HUSBAND_HEIGHT : NODE_HEIGHT);

function segmentHitsCard(first: RoutePoint, second: RoutePoint, card: CardRect) {
  const minX = Math.min(first.x, second.x);
  const maxX = Math.max(first.x, second.x);
  const minY = Math.min(first.y, second.y);
  const maxY = Math.max(first.y, second.y);
  return first.x === second.x
    ? first.x > card.left && first.x < card.right && maxY > card.top && minY < card.bottom
    : first.y > card.top && first.y < card.bottom && maxX > card.left && minX < card.right;
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

function routeDecadeBundles(nodes: Node<MemberNodeData>[], edges: Edge[]): Edge[] {
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
  const targetApproachOrdinal = new Map<string, number>();
  const targetRows = new Map<number, Edge[]>();
  const sortedGroups = [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
  const sourceGroupCounts = new Map<string, number>();
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
  for (const [, familyEdges] of sortedGroups) {
    const sourceId = familyEdges[0]?.source;
    if (sourceId) {
      sourceGroupCounts.set(sourceId, (sourceGroupCounts.get(sourceId) ?? 0) + 1);
    }
  }

  for (const [, familyEdges] of sortedGroups) {
    const source = nodeById.get(familyEdges[0]?.source ?? "");
    if (!source) continue;

    const sourceX = source.position.x + width(source) / 2;
    const sourceY = source.position.y + height(source);
    const sourceGroupIndex = sourceGroupIndexes.get(source.id) ?? 0;
    sourceGroupIndexes.set(source.id, sourceGroupIndex + 1);
    const sourceGroupCount = sourceGroupCounts.get(source.id) ?? 1;
    const trunkX = sourceX + (sourceGroupIndex - (sourceGroupCount - 1) / 2) * BUNDLE_GAP;
    const sourceRowBottom = Math.max(
      ...nodes
        .filter((node) => Math.abs(node.position.y - source.position.y) < 1)
        .map((node) => node.position.y + height(node)),
    );
    const bundleIndex = rowBundleCount.get(source.position.y) ?? 0;
    rowBundleCount.set(source.position.y, bundleIndex + 1);
    const busY = sourceRowBottom + STEM_CLEARANCE + bundleIndex * BUNDLE_GAP;

    const routedChildren = familyEdges
      .map((edge) => ({ edge, target: nodeById.get(edge.target) }))
      .filter(
        (entry): entry is { edge: Edge; target: Node<MemberNodeData> } =>
          entry.target !== undefined,
      )
      .sort(
        (a, b) => a.target.position.x - b.target.position.x || a.edge.id.localeCompare(b.edge.id),
      )
      .map(({ edge, target }, index, siblings) => {
        const targetX = target.position.x + width(target) / 2;
        const unrelated = cards.filter((card) => card.id !== source.id && card.id !== target.id);
        let approachY =
          target.position.y -
          STEM_CLEARANCE -
          (targetApproachOrdinal.get(edge.id) ?? 0) * APPROACH_GAP;
        while (
          approachY > busY + STEM_CLEARANCE &&
          unrelated.some((card) =>
            segmentHitsCard(
              { x: targetX - NODE_WIDTH, y: approachY },
              { x: targetX + NODE_WIDTH, y: approachY },
              card,
            ),
          )
        ) {
          approachY -= APPROACH_GAP;
        }

        const top = Math.min(busY, approachY);
        const bottom = Math.max(busY, approachY);
        const outerLeft = Math.min(...cards.map((card) => card.left)) - CARD_CLEARANCE;
        const outerRight = Math.max(...cards.map((card) => card.right)) + CARD_CLEARANCE;
        const centered = index - (siblings.length - 1) / 2;
        const expansionCount = cards.length + usedVerticalLanes.length + 2;
        const candidateXs = [
          targetX,
          targetX + centered * BRANCH_GAP,
          ...unrelated.flatMap((card) => [card.left, card.right]),
          ...Array.from(
            { length: expansionCount },
            (_, expansionIndex) => outerLeft - expansionIndex * BRANCH_GAP,
          ),
          ...Array.from(
            { length: expansionCount },
            (_, expansionIndex) => outerRight + expansionIndex * BRANCH_GAP,
          ),
        ];
        const routeLength = (candidateX: number) =>
          Math.abs(trunkX - candidateX) +
          Math.abs(candidateX - targetX) +
          Math.abs(busY - approachY) +
          Math.abs(approachY - target.position.y);
        const bendCount = (candidateX: number) => (candidateX === targetX ? 0 : 2);
        const laneX =
          [...new Set(candidateXs)]
            .filter(
              (candidateX) =>
                !usedVerticalLanes.some(
                  (lane) =>
                    Math.abs(lane.x - candidateX) < BRANCH_GAP &&
                    Math.max(lane.top, top) < Math.min(lane.bottom, bottom),
                ),
            )
            .filter((candidateX) =>
              unrelated.every(
                (card) =>
                  !segmentHitsCard(
                    { x: candidateX, y: busY },
                    { x: candidateX, y: approachY },
                    card,
                  ) &&
                  !segmentHitsCard(
                    { x: candidateX, y: approachY },
                    { x: targetX, y: approachY },
                    card,
                  ),
              ),
            )
            .sort(
              (first, second) =>
                routeLength(first) - routeLength(second) ||
                bendCount(first) - bendCount(second) ||
                Math.abs(first - targetX) - Math.abs(second - targetX) ||
                first - second,
            )[0] ??
          [outerLeft, outerRight].sort(
            (first, second) => routeLength(first) - routeLength(second),
          )[0];
        usedVerticalLanes.push({ x: laneX, top, bottom });
        return {
          edge,
          laneX,
          branch: [
            { x: laneX, y: busY },
            { x: laneX, y: approachY },
            { x: targetX, y: approachY },
            { x: targetX, y: target.position.y },
          ],
        };
      });

    if (!routedChildren.length) continue;
    const busLeft = Math.min(trunkX, ...routedChildren.map(({ laneX }) => laneX));
    const busRight = Math.max(trunkX, ...routedChildren.map(({ laneX }) => laneX));
    const junction = { x: trunkX, y: busY };
    const breakoutY = sourceRowBottom + BUNDLE_GAP + sourceGroupIndex * APPROACH_GAP;
    const sharedPaths = [
      [
        { x: sourceX, y: sourceY },
        { x: sourceX, y: breakoutY },
        { x: trunkX, y: breakoutY },
        junction,
      ],
      [
        { x: busLeft, y: busY },
        { x: busRight, y: busY },
      ],
    ];
    routedChildren.forEach(({ edge, branch }, index) => {
      routeById.set(edge.id, {
        branch,
        ...(index === 0 ? { junction, sharedPaths } : {}),
      });
    });
  }

  return edges.map((edge) => {
    const decadeBundle = routeById.get(edge.id);
    return decadeBundle
      ? { ...edge, data: { ...edge.data, decadeBundle } }
      : { ...edge, data: { ...edge.data, decadeBundle: undefined } };
  });
}

export function routeParentEdges(
  nodes: Node<MemberNodeData>[],
  edges: Edge[],
  chronological: boolean,
): Edge[] {
  return chronological ? routeDecadeBundles(nodes, edges) : edges;
}
