import type { Edge, Node } from "reactflow";
import type { MemberNodeData } from "../ui/member-node";
import type { RoutePoint } from "./route-edges";

type CardRect = { id: string; left: number; right: number; top: number; bottom: number };
const NODE_WIDTH = 260;
const BRANCH_GAP = 36;
const APPROACH_GAP = 32;
const STEM_CLEARANCE = 40;
const CARD_CLEARANCE = 32;
const ROW_NUDGE = 8;

const width = (node: Node<MemberNodeData>) =>
  Number.isFinite(node.width) && node.width! > 0 ? node.width! : NODE_WIDTH;

interface RoutedChild {
  edge: Edge;
  laneX: number;
  branch: RoutePoint[];
}

export function routeBundleChild(
  edge: Edge,
  target: Node<MemberNodeData>,
  index: number,
  siblingsLength: number,
  cards: CardRect[],
  sourceId: string,
  busY: number,
  trunkX: number,
  targetApproachOrdinal: Map<string, number>,
  usedVerticalLanes: Array<{ x: number; top: number; bottom: number }>,
  reserveHorizontalRow: (preferredY: number, direction: -1 | 1) => number,
  reserveVerticalSegment: (x: number, firstY: number, secondY: number) => void,
): RoutedChild {
  const targetX = target.position.x + width(target) / 2;
  const unrelated = cards.filter((card) => card.id !== sourceId && card.id !== target.id);
  let approachY =
    target.position.y - STEM_CLEARANCE - (targetApproachOrdinal.get(edge.id) ?? 0) * APPROACH_GAP;
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
  const blockingTargetLanes = usedVerticalLanes.filter(
    (lane) =>
      lane.x === targetX &&
      Math.max(lane.top, approachY) < Math.min(lane.bottom, target.position.y),
  );
  if (blockingTargetLanes.length) {
    approachY = Math.min(
      target.position.y,
      Math.max(...blockingTargetLanes.map((lane) => lane.bottom)) + ROW_NUDGE,
    );
  }
  approachY = reserveHorizontalRow(approachY, -1);

  const top = Math.min(busY, approachY);
  const bottom = Math.max(busY, approachY);
  const outerLeft = Math.min(...cards.map((card) => card.left)) - CARD_CLEARANCE;
  const outerRight = Math.max(...cards.map((card) => card.right)) + CARD_CLEARANCE;
  const centered = index - (siblingsLength - 1) / 2;
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
            !segmentHitsCard({ x: candidateX, y: busY }, { x: candidateX, y: approachY }, card) &&
            !segmentHitsCard({ x: candidateX, y: approachY }, { x: targetX, y: approachY }, card),
        ),
      )
      .sort(
        (first, second) =>
          routeLength(first) - routeLength(second) ||
          bendCount(first) - bendCount(second) ||
          Math.abs(first - targetX) - Math.abs(second - targetX) ||
          first - second,
      )[0] ??
    [outerLeft, outerRight].sort((first, second) => routeLength(first) - routeLength(second))[0];
  reserveVerticalSegment(laneX, busY, approachY);
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
}

function segmentHitsCard(first: RoutePoint, second: RoutePoint, card: CardRect) {
  const minX = Math.min(first.x, second.x);
  const maxX = Math.max(first.x, second.x);
  const minY = Math.min(first.y, second.y);
  const maxY = Math.max(first.y, second.y);
  return first.x === second.x
    ? first.x > card.left && first.x < card.right && maxY > card.top && minY < card.bottom
    : first.y > card.top && first.y < card.bottom && maxX > card.left && minX < card.right;
}
