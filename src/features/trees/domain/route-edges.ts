import type { Edge, Node } from "reactflow";
import type { MemberNodeData } from "../ui/member-node";

export type RoutePoint = { x: number; y: number };
type Rect = { id: string; left: number; right: number; top: number; bottom: number };

const W = 260;
const H = 130;
const HUSBAND_H = 220;
const CLEARANCE = 24;
const ENDPOINT_CLEARANCE = 40;
const FAMILY_STEM_GAP = 20;
const BRANCH_LANE_GAP = 18;
const HORIZONTAL_LANE_GAP = 16;

const finiteDimension = (value: number | null | undefined, fallback: number) =>
  Number.isFinite(value) && value! > 0 ? value! : fallback;
const width = (node: Node<MemberNodeData>) => finiteDimension(node.width, W);
const height = (node: Node<MemberNodeData>) =>
  finiteDimension(node.height, node.data.member.gender === "male" ? HUSBAND_H : H);

function segments(points: RoutePoint[]) {
  return points.slice(1).map((point, index) => [points[index], point] as const);
}

function segmentConflict(
  [a, b]: readonly [RoutePoint, RoutePoint],
  [c, d]: readonly [RoutePoint, RoutePoint],
) {
  const firstVertical = a.x === b.x;
  const secondVertical = c.x === d.x;
  if (firstVertical !== secondVertical) {
    const vertical = firstVertical ? [a, b] : [c, d];
    const horizontal = firstVertical ? [c, d] : [a, b];
    return (
      vertical[0].x > Math.min(horizontal[0].x, horizontal[1].x) &&
      vertical[0].x < Math.max(horizontal[0].x, horizontal[1].x) &&
      horizontal[0].y > Math.min(vertical[0].y, vertical[1].y) &&
      horizontal[0].y < Math.max(vertical[0].y, vertical[1].y)
    );
  }
  if (firstVertical) {
    return (
      a.x === c.x &&
      Math.max(Math.min(a.y, b.y), Math.min(c.y, d.y)) <
        Math.min(Math.max(a.y, b.y), Math.max(c.y, d.y))
    );
  }
  return (
    a.y === c.y &&
    Math.max(Math.min(a.x, b.x), Math.min(c.x, d.x)) <
      Math.min(Math.max(a.x, b.x), Math.max(c.x, d.x))
  );
}

export function segmentHitsCard(a: RoutePoint, b: RoutePoint, rect: Rect) {
  const minX = Math.min(a.x, b.x);
  const maxX = Math.max(a.x, b.x);
  const minY = Math.min(a.y, b.y);
  const maxY = Math.max(a.y, b.y);
  return a.x === b.x
    ? a.x > rect.left && a.x < rect.right && maxY > rect.top && minY < rect.bottom
    : a.y > rect.top && a.y < rect.bottom && maxX > rect.left && minX < rect.right;
}

export function normalizeDecadeRoute(
  source: RoutePoint,
  target: RoutePoint,
  waypoints: RoutePoint[],
  kind: "parent" | "spouse" | undefined,
) {
  const finite = waypoints.filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y));
  if (!finite.length) return [source, target];
  const first = finite[0];
  const last = finite[finite.length - 1];
  const middle = finite.slice(1, -1);
  return kind === "spouse"
    ? [source, { x: first.x, y: source.y }, ...middle, { x: last.x, y: target.y }, target]
    : [source, { x: source.x, y: first.y }, ...middle, { x: target.x, y: last.y }, target];
}

function routeDecadeEdges(nodes: Node<MemberNodeData>[], edges: Edge[]) {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const cards: Rect[] = nodes.map((node) => ({
    id: node.id,
    left: node.position.x - CLEARANCE,
    right: node.position.x + width(node) + CLEARANCE,
    top: node.position.y - CLEARANCE,
    bottom: node.position.y + height(node) + CLEARANCE,
  }));
  const groups = new Map<string, Edge[]>();
  for (const edge of edges) {
    const data = edge.data as { kind?: string; familyKey?: string } | undefined;
    const key = data?.familyKey ?? `${data?.kind ?? "edge"}:${edge.source}:${edge.target}`;
    groups.set(key, [...(groups.get(key) ?? []), edge]);
  }
  const routeById = new Map<string, RoutePoint[]>();
  const bundleBase = new Map<string, number>();
  const acceptedSegments: Array<{
    familyKey: string;
    segment: readonly [RoutePoint, RoutePoint];
  }> = [];
  const sortedGroups = [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
  const sourceFamilyCount = new Map<string, number>();
  const familyStemOffset = new Map<string, number>();
  const targetRowFamilyCount = new Map<number, number>();
  const targetRowFamilyOffset = new Map<string, number>();
  for (const [familyKey, familyEdges] of sortedGroups) {
    const first = familyEdges[0];
    const kind = (first?.data as { kind?: string } | undefined)?.kind;
    if (!first || kind !== "parent") continue;
    const ordinal = sourceFamilyCount.get(first.source) ?? 0;
    sourceFamilyCount.set(first.source, ordinal + 1);
    familyStemOffset.set(familyKey, ordinal * FAMILY_STEM_GAP);
    for (const targetY of [
      ...new Set(
        familyEdges
          .map((edge) => byId.get(edge.target)?.position.y)
          .filter((value): value is number => value !== undefined),
      ),
    ]) {
      const rowOrdinal = targetRowFamilyCount.get(targetY) ?? 0;
      targetRowFamilyCount.set(targetY, rowOrdinal + 1);
      targetRowFamilyOffset.set(`${familyKey}:${targetY}`, rowOrdinal * HORIZONTAL_LANE_GAP);
    }
  }

  for (const [familyKey, familyEdges] of sortedGroups) {
    const familyLanes: number[] = [];
    familyEdges.sort(
      (a, b) =>
        (byId.get(a.target)?.position.x ?? 0) - (byId.get(b.target)?.position.x ?? 0) ||
        a.id.localeCompare(b.id),
    );
    familyEdges.forEach((edge, index) => {
      const source = byId.get(edge.source);
      const target = byId.get(edge.target);
      if (!source || !target) return;
      const kind = (edge.data as { kind?: string } | undefined)?.kind;
      const sourceWidth = width(source);
      const targetWidth = width(target);
      const sourceX = source.position.x + (kind === "spouse" ? sourceWidth : sourceWidth / 2);
      const sourceY = source.position.y + (kind === "spouse" ? height(source) / 2 : height(source));
      const targetX = target.position.x + (kind === "spouse" ? 0 : targetWidth / 2);
      const targetY = target.position.y + (kind === "spouse" ? height(target) / 2 : 0);
      const unrelated = cards.filter((card) => card.id !== source.id && card.id !== target.id);
      const centered = index - (familyEdges.length - 1) / 2;
      const preferredX =
        (bundleBase.get(familyKey) ?? (sourceX + targetX) / 2) + centered * BRANCH_LANE_GAP;
      const outerLeft = Math.min(...cards.map((card) => card.left), sourceX, targetX) - CLEARANCE;
      const outerRight = Math.max(...cards.map((card) => card.right), sourceX, targetX) + CLEARANCE;
      const sourceLaneY =
        kind === "spouse"
          ? Math.min(source.position.y, target.position.y) - CLEARANCE
          : Math.max(
              ...nodes
                .filter((node) => Math.abs(node.position.y - source.position.y) < 1)
                .map((node) => node.position.y + height(node)),
            ) +
            ENDPOINT_CLEARANCE +
            (familyStemOffset.get(familyKey) ?? 0);
      const targetLaneY =
        kind === "spouse"
          ? sourceLaneY
          : target.position.y -
            ENDPOINT_CLEARANCE -
            (targetRowFamilyOffset.get(`${familyKey}:${target.position.y}`) ?? 0);
      const directSegment = [
        { x: sourceX, y: sourceY },
        { x: targetX, y: targetY },
      ] as const;
      const canRouteDirectly =
        kind === "parent" &&
        sourceX === targetX &&
        unrelated.every((card) => !segmentHitsCard(...directSegment, card)) &&
        acceptedSegments.every(
          (accepted) =>
            accepted.familyKey === familyKey || !segmentConflict(directSegment, accepted.segment),
        );
      if (canRouteDirectly) {
        const directRoute = [directSegment[0], { x: sourceX, y: targetLaneY }, directSegment[1]];
        acceptedSegments.push(...segments(directRoute).map((segment) => ({ familyKey, segment })));
        routeById.set(edge.id, directRoute.slice(1, -1));
        return;
      }
      const candidateXs = [
        preferredX,
        sourceX,
        targetX,
        ...unrelated.flatMap((card) => [card.left, card.right]),
        outerLeft,
        outerRight,
      ];
      const candidates = [...new Set(candidateXs)]
        .map((x) =>
          kind === "spouse"
            ? [
                { x: sourceX, y: sourceY },
                { x: sourceX + CLEARANCE, y: sourceY },
                { x: sourceX + CLEARANCE, y: sourceLaneY },
                { x: targetX - CLEARANCE, y: targetLaneY },
                { x: targetX - CLEARANCE, y: targetY },
                { x: targetX, y: targetY },
              ]
            : [
                { x: sourceX, y: sourceY },
                { x: sourceX, y: sourceLaneY },
                { x, y: sourceLaneY },
                { x, y: targetLaneY },
                { x: targetX, y: targetLaneY },
                { x: targetX, y: targetY },
              ],
        )
        .filter(
          (points) =>
            !familyLanes.some(
              (laneX) => Math.abs(laneX - (points[2]?.x ?? points[1].x)) < BRANCH_LANE_GAP,
            ) &&
            segments(points).every(([a, b]) =>
              unrelated.every((card) => !segmentHitsCard(a, b, card)),
            ),
        )
        .sort((a, b) => {
          const score = (points: RoutePoint[]) =>
            segments(points).reduce(
              (sum, [p, q]) => sum + Math.abs(p.x - q.x) + Math.abs(p.y - q.y),
              0,
            ) +
            Math.abs((points[2]?.x ?? points[1].x) - preferredX) * 2 +
            segments(points).reduce(
              (count, segment) =>
                count +
                acceptedSegments.filter(
                  (accepted) =>
                    accepted.familyKey !== familyKey && segmentConflict(segment, accepted.segment),
                ).length,
              0,
            ) *
              1_000_000;
          return score(a) - score(b);
        });
      const route = candidates[0] ?? [
        { x: sourceX, y: sourceY },
        { x: sourceX, y: sourceLaneY },
        { x: outerLeft - index * BRANCH_LANE_GAP, y: sourceLaneY },
        { x: outerLeft - index * BRANCH_LANE_GAP, y: targetLaneY },
        { x: targetX, y: targetLaneY },
        { x: targetX, y: targetY },
      ];
      if (!bundleBase.has(familyKey)) bundleBase.set(familyKey, route[2]?.x ?? route[1].x);
      familyLanes.push(route[2]?.x ?? route[1].x);
      acceptedSegments.push(...segments(route).map((segment) => ({ familyKey, segment })));
      routeById.set(edge.id, route.slice(1, -1));
    });
  }
  return edges.map((edge) => ({
    ...edge,
    data: { ...edge.data, decadeRoute: routeById.get(edge.id) },
  }));
}

export function routeParentEdges(
  nodes: Node<MemberNodeData>[],
  edges: Edge[],
  chronological: boolean,
): Edge[] {
  return chronological ? routeDecadeEdges(nodes, edges) : edges;
}
