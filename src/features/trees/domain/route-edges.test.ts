import { describe, expect, it } from "vitest";
import type { Edge, Node } from "reactflow";
import type { FamilyMember } from "@/features/members";
import type { MemberNodeData } from "../ui/member-node";
import { alignDecadeSingleChildren, routeParentEdges, type DecadeBundleRoute } from "./route-edges";

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
    expect(bundle(owners[0]).sharedPaths).toHaveLength(2);
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
