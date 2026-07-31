import type { Edge, Node } from "reactflow";
import type { MemberNodeData } from "../ui/member-node";

type Point = { x: number; y: number };
type OrthogonalSegment = { first: Point; second: Point; vertical: boolean };

const NODE_WIDTH = 260;
const NODE_HEIGHT = 130;
const HUSBAND_HEIGHT = 220;
const dimension = (value: number | null | undefined, fallback: number) =>
  Number.isFinite(value) && value! > 0 ? value! : fallback;
const width = (node: Node<MemberNodeData>) => dimension(node.width, NODE_WIDTH);
const height = (node: Node<MemberNodeData>) =>
  dimension(node.height, node.data.member.gender === "male" ? HUSBAND_HEIGHT : NODE_HEIGHT);

function pointToSegmentDistance(point: Point, segment: OrthogonalSegment): number {
  if (segment.vertical) {
    const nearestY = Math.max(
      Math.min(segment.first.y, segment.second.y),
      Math.min(point.y, Math.max(segment.first.y, segment.second.y)),
    );
    return Math.hypot(point.x - segment.first.x, point.y - nearestY);
  }
  const nearestX = Math.max(
    Math.min(segment.first.x, segment.second.x),
    Math.min(point.x, Math.max(segment.first.x, segment.second.x)),
  );
  return Math.hypot(point.x - nearestX, point.y - segment.first.y);
}

function familyLevelSegments(
  edge: Edge,
  nodeById: ReadonlyMap<string, Node<MemberNodeData>>,
): OrthogonalSegment[] {
  const source = nodeById.get(edge.source);
  const target = nodeById.get(edge.target);
  if (!source || !target) return [];
  const sourcePoint = {
    x: source.position.x + width(source) / 2,
    y: source.position.y + height(source),
  };
  const targetPoint = {
    x: target.position.x + width(target) / 2,
    y: target.position.y,
  };
  const middleY = sourcePoint.y + (targetPoint.y - sourcePoint.y) / 2;
  const points = [
    sourcePoint,
    { x: sourcePoint.x, y: middleY },
    { x: targetPoint.x, y: middleY },
    targetPoint,
  ];
  return points.slice(1).map((point, index) => ({
    first: points[index],
    second: point,
    vertical: points[index].x === point.x,
  }));
}

export function familyLevelSharedSelectionIds(
  edges: Edge[],
  nodes: Node<MemberNodeData>[],
  clickedEdge: Edge,
  pointer: Point,
  tolerance = 10,
): Set<string> {
  if ((clickedEdge.data as { kind?: string } | undefined)?.kind !== "parent") {
    return new Set([clickedEdge.id]);
  }
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const clickedSegments = familyLevelSegments(clickedEdge, nodeById).filter(
    (segment) => pointToSegmentDistance(pointer, segment) <= tolerance,
  );
  if (!clickedSegments.length) return new Set([clickedEdge.id]);
  return new Set(
    edges
      .filter((edge) => {
        if ((edge.data as { kind?: string } | undefined)?.kind !== "parent") return false;
        return familyLevelSegments(edge, nodeById).some(
          (candidate) =>
            clickedSegments.some((clicked) => clicked.vertical === candidate.vertical) &&
            pointToSegmentDistance(pointer, candidate) <= tolerance,
        );
      })
      .map((edge) => edge.id),
  );
}
