import { describe, expect, it } from "vitest";
import type { Edge, Node } from "reactflow";
import type { FamilyMember } from "@/features/members";
import type { MemberNodeData } from "../ui/member-node";
import {
  alignDecadeSingleChildren,
  routeParentEdges,
  sharedRouteSelectionIds,
  type DecadeBundleRoute,
} from "./route-edges";
import { familyLevelSharedSelectionIds } from "./edge-selection";

const node = (id: string, x: number, y: number): Node<MemberNodeData> =>
  ({
    id,
    position: { x, y },
    width: 260,
    height: 130,
    data: { member: { id, gender: "female" } as FamilyMember },
  }) as Node<MemberNodeData>;

const edge = (target: string, familyKey = "parent:family"): Edge => ({
  id: `parent:${target}`,
  source: "parent",
  target,
  data: { kind: "parent", familyKey },
});

const bundle = (item: Edge) => (item.data as { decadeBundle: DecadeBundleRoute }).decadeBundle;

const segments = (item: Edge) => {
  const route = bundle(item);
  return [route.branch, ...(route.sharedPaths ?? [])].flatMap((path) =>
    path.slice(1).map((point, index) => ({ first: path[index], second: point })),
  );
};

const overlapLength = (first: number, second: number, third: number, fourth: number) =>
  Math.min(Math.max(first, second), Math.max(third, fourth)) -
  Math.max(Math.min(first, second), Math.min(third, fourth));

const collinearOverlap = (
  first: ReturnType<typeof segments>[number],
  second: ReturnType<typeof segments>[number],
) => {
  const firstVertical = first.first.x === first.second.x;
  const secondVertical = second.first.x === second.second.x;
  if (firstVertical !== secondVertical) return false;
  return firstVertical
    ? first.first.x === second.first.x &&
        overlapLength(first.first.y, first.second.y, second.first.y, second.second.y) > 0
    : first.first.y === second.first.y &&
        overlapLength(first.first.x, first.second.x, second.first.x, second.second.x) > 0;
};

describe("preview connector structure", () => {
  it("keeps Family Levels edges unchanged", () => {
    const edges = [edge("child")];
    expect(routeParentEdges([node("parent", 0, 0), node("child", 0, 400)], edges, false)).toBe(
      edges,
    );
  });

  it("draws one shared stem and visible junction for a By Decade combination", () => {
    const routed = routeParentEdges(
      [
        node("parent", 0, 0),
        node("first", -320, 500),
        node("second", 0, 500),
        node("third", 320, 500),
      ],
      [edge("first"), edge("second"), edge("third")],
      true,
    );

    const owners = routed.filter((item) => bundle(item).sharedPaths);
    expect(owners).toHaveLength(1);
    expect(bundle(owners[0]).sharedPaths).toHaveLength(3);
    expect(bundle(owners[0]).junction).toEqual({ x: 130, y: 170 });
  });

  it("gives every child an independent route after the junction", () => {
    const routed = routeParentEdges(
      [
        node("parent", 0, 0),
        node("first", -320, 500),
        node("second", 0, 500),
        node("third", 320, 500),
      ],
      [edge("first"), edge("second"), edge("third")],
      true,
    );

    const branchStarts = routed.map((item) => bundle(item).branch[0]);
    const verticalLanes = routed.map((item) => bundle(item).branch[1].x);
    const approachRows = routed.map((item) => bundle(item).branch[2].y);
    expect(new Set(branchStarts.map(({ x, y }) => `${x}:${y}`)).size).toBe(3);
    expect(new Set(verticalLanes).size).toBe(3);
    expect(new Set(approachRows).size).toBe(3);
    routed.forEach((item) => {
      const highlight = bundle(item).highlightPath;
      expect(highlight[0]).toEqual({ x: 130, y: 130 });
      expect(highlight.at(-1)).toEqual(bundle(item).branch.at(-1));
    });
  });

  it("selects every child represented by a clicked shared route", () => {
    const edges = [
      edge("first", "parent:first-family"),
      edge("second", "parent:first-family"),
      edge("third", "parent:second-family"),
      { ...edge("other", "other:family"), source: "other-parent" },
    ];

    expect([...sharedRouteSelectionIds(edges, edges[0], "family")]).toEqual([
      "parent:first",
      "parent:second",
    ]);
    expect([...sharedRouteSelectionIds(edges, edges[0], "source")]).toEqual([
      "parent:first",
      "parent:second",
      "parent:third",
    ]);
  });

  it("uses a straight vertical branch when the target lane is clear", () => {
    const [routed] = routeParentEdges(
      [node("parent", 0, 0), node("child", 0, 500)],
      [edge("child")],
      true,
    );

    expect(bundle(routed).branch.every((point) => point.x === 130)).toBe(true);
  });

  it("aligns an only child under its parent when the row has room", () => {
    const nodes = [node("parent", 120, 0), node("child", 0, 700)];
    alignDecadeSingleChildren(nodes, [edge("child")], 140);
    expect(nodes[1].position.x).toBe(120);
  });

  it("puts left-side target approaches above right-side approaches", () => {
    const routed = routeParentEdges(
      [node("parent", 0, 0), node("left", -320, 500), node("right", 320, 500)],
      [edge("left"), edge("right")],
      true,
    );
    const byTarget = new Map(routed.map((item) => [item.target, bundle(item).branch[2].y]));
    expect(byTarget.get("left")!).toBeLessThan(byTarget.get("right")!);
  });

  it("routes around an unrelated member card", () => {
    const [routed] = routeParentEdges(
      [node("parent", 0, 0), node("blocker", 0, 300), node("child", 0, 700)],
      [edge("child")],
      true,
    );

    const laneX = bundle(routed).branch[0].x;
    expect(laneX <= -24 || laneX >= 284).toBe(true);
  });

  it("chooses the shortest valid side of an obstacle from root to child", () => {
    const [routed] = routeParentEdges(
      [node("parent", 640, 0), node("blocker", 0, 300), node("child", 0, 700)],
      [edge("child")],
      true,
    );

    expect(bundle(routed).branch[0].x).toBe(292);
  });

  it("gives separate combinations their own junction rows", () => {
    const routed = routeParentEdges(
      [node("parent", 0, 0), node("first", -160, 500), node("second", 160, 500)],
      [edge("first", "parent:first-family"), edge("second", "parent:second-family")],
      true,
    );

    const junctionRows = routed.map((item) => bundle(item).junction!.y);
    expect(new Set(junctionRows).size).toBe(2);
    const trunkXs = routed.map((item) => bundle(item).junction!.x);
    expect(new Set(trunkXs).size).toBe(2);
    expect(Math.abs(trunkXs[0] - trunkXs[1])).toBeGreaterThanOrEqual(20);
  });
});

describe("Family Levels connector selection", () => {
  it("selects every parent connector sharing the clicked collinear segment", () => {
    const nodes = [node("parent", 0, 0), node("left", -320, 500), node("right", 320, 500)];
    const edges = [edge("left"), edge("right")];

    expect([...familyLevelSharedSelectionIds(edges, nodes, edges[0], { x: 130, y: 250 })]).toEqual([
      "parent:left",
      "parent:right",
    ]);
  });

  it("selects only the clicked connector on its unique child approach", () => {
    const nodes = [node("parent", 0, 0), node("left", -320, 500), node("right", 320, 500)];
    const edges = [edge("left"), edge("right")];

    expect([...familyLevelSharedSelectionIds(edges, nodes, edges[0], { x: -190, y: 450 })]).toEqual(
      ["parent:left"],
    );
  });

  it("does not combine connectors that only cross perpendicularly", () => {
    const nodes = [
      node("parent", 0, 0),
      node("left", -320, 500),
      node("other-parent", -130, 0),
      node("other", -130, 500),
    ];
    const first = edge("left");
    const crossing = { ...edge("other", "other:family"), source: "other-parent" };

    expect([
      ...familyLevelSharedSelectionIds([first, crossing], nodes, first, { x: 0, y: 315 }),
    ]).toEqual(["parent:left"]);
  });
});

describe("preview connector collision handling", () => {
  it("does not overlap collinear segments from separate combinations", () => {
    const routed = routeParentEdges(
      [
        node("parent", 0, 0),
        node("other-parent", 0, 500),
        node("first", -320, 1000),
        node("second", 0, 1000),
        node("third", 320, 1000),
      ],
      [
        edge("first", "parent:first-family"),
        { ...edge("second", "other:second-family"), source: "other-parent" },
        { ...edge("third", "other:third-family"), source: "other-parent" },
      ],
      true,
    );

    routed.forEach((item, index) => {
      for (const other of routed.slice(index + 1)) {
        for (const firstSegment of segments(item)) {
          for (const secondSegment of segments(other)) {
            expect(
              collinearOverlap(firstSegment, secondSegment),
              `${item.id} ${JSON.stringify(firstSegment)} overlaps ${other.id} ${JSON.stringify(secondSegment)}`,
            ).toBe(false);
          }
        }
      }
    });
  });

  it("allows perpendicular connector segments to cross", () => {
    const vertical = { first: { x: 10, y: 0 }, second: { x: 10, y: 20 } };
    const horizontal = { first: { x: 0, y: 10 }, second: { x: 20, y: 10 } };
    expect(collinearOverlap(vertical, horizontal)).toBe(false);
  });
});
