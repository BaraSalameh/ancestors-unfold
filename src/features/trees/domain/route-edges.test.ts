import { describe, expect, it } from "vitest";
import type { Edge, Node } from "reactflow";
import type { FamilyMember } from "@/features/members";
import type { MemberNodeData } from "../ui/member-node";
import {
  normalizeDecadeRoute,
  routeParentEdges,
  segmentHitsCard,
  type RoutePoint,
} from "./route-edges";

const node = (
  id: string,
  x: number,
  y: number,
  dimensions?: { width: number; height: number },
): Node<MemberNodeData> =>
  ({
    id,
    position: { x, y },
    ...dimensions,
    data: { member: { id, gender: "male" } as FamilyMember },
  }) as Node<MemberNodeData>;
const edge = (target: string): Edge => ({
  id: `root:${target}`,
  source: "root",
  target,
  data: { kind: "parent", familyKey: "root:family" },
});

describe("decade connector bundles", () => {
  it("does not add routing metadata to Family Levels", () => {
    const edges = [edge("child")];
    expect(routeParentEdges([node("root", 0, 0), node("child", 0, 400)], edges, false)).toEqual(
      edges,
    );
  });

  it("gives siblings independent lanes that avoid unrelated cards", () => {
    const nodes = [
      node("root", 0, 0),
      node("blocker", 0, 400),
      node("a", -320, 800),
      node("b", 0, 800),
      node("c", 320, 800),
    ];
    const routed = routeParentEdges(nodes, [edge("a"), edge("b"), edge("c")], true);
    const laneXs = routed.map(
      (item) => (item.data as { decadeRoute: RoutePoint[] }).decadeRoute[1].x,
    );
    expect(new Set(laneXs).size).toBe(3);
    const sharedStem = routed.map(
      (item) => (item.data as { decadeRoute: RoutePoint[] }).decadeRoute[0],
    );
    expect(new Set(sharedStem.map((point) => `${point.x}:${point.y}`)).size).toBe(1);
    const blocker = { id: "blocker", left: -24, right: 284, top: 376, bottom: 644 };
    for (const item of routed) {
      const points = [
        { x: 130, y: 220 },
        ...(item.data as { decadeRoute: RoutePoint[] }).decadeRoute,
        { x: nodes.find((entry) => entry.id === item.target)!.position.x + 130, y: 800 },
      ];
      expect(
        points.slice(1).some((point, index) => segmentHitsCard(points[index], point, blocker)),
      ).toBe(false);
    }
  });

  it("uses measured dimensions and keeps generous endpoint clearance", () => {
    const source = node("root", 0, 0, { width: 256, height: 150 });
    const target = node("child", 300, 500, { width: 256, height: 130 });
    const [routed] = routeParentEdges([source, target], [edge("child")], true);
    const route = (routed.data as { decadeRoute: RoutePoint[] }).decadeRoute;
    expect(route[0]).toEqual({ x: 128, y: 190 });
    expect(route.at(-1)).toEqual({ x: 428, y: 460 });
  });

  it("normalizes parent endpoints without creating diagonal segments", () => {
    const points = normalizeDecadeRoute(
      { x: 128, y: 150 },
      { x: 428, y: 500 },
      [
        { x: 130, y: 190 },
        { x: 280, y: 190 },
        { x: 280, y: 460 },
        { x: 430, y: 460 },
      ],
      "parent",
    );
    expect(points[1]).toEqual({ x: 128, y: 190 });
    expect(points.at(-2)).toEqual({ x: 428, y: 460 });
    for (let index = 1; index < points.length; index++) {
      expect(
        points[index - 1].x === points[index].x || points[index - 1].y === points[index].y,
      ).toBe(true);
    }
  });

  it("keeps different family groups on separate source stems", () => {
    const otherFamily = {
      ...edge("b"),
      id: "root:b:other",
      data: { kind: "parent", familyKey: "root:other" },
    };
    const routed = routeParentEdges(
      [node("root", 0, 0), node("a", 0, 500), node("b", 320, 500)],
      [edge("a"), otherFamily],
      true,
    );
    const stemYs = routed.map(
      (item) => (item.data as { decadeRoute: RoutePoint[] }).decadeRoute[0].y,
    );
    expect(new Set(stemYs).size).toBe(2);
  });

  it("uses one straight vertical route when aligned cards have no obstacle", () => {
    const [routed] = routeParentEdges(
      [node("root", 0, 0), node("child", 0, 500)],
      [edge("child")],
      true,
    );
    const route = (routed.data as { decadeRoute: RoutePoint[] }).decadeRoute;
    expect(route).toHaveLength(1);
    expect(route[0].x).toBe(130);
  });

  it("separates horizontal lanes for different families entering the same row", () => {
    const secondFamily = {
      ...edge("b"),
      id: "other:b",
      source: "other",
      data: { kind: "parent", familyKey: "other:family" },
    };
    const routed = routeParentEdges(
      [node("root", -300, 0), node("other", 300, 0), node("a", -100, 500), node("b", 100, 500)],
      [edge("a"), secondFamily],
      true,
    );
    const horizontalYs = routed.map(
      (item) => (item.data as { decadeRoute: RoutePoint[] }).decadeRoute.at(-1)!.y,
    );
    expect(Math.abs(horizontalYs[0] - horizontalYs[1])).toBeGreaterThanOrEqual(16);
  });
});
