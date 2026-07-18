import type { Edge, Node } from "reactflow";
import type { MemberNodeData } from "@/components/MemberNode";

const NODE_W = 260;
const NODE_H = 130;
const NODE_H_HUSBAND = 220;

// Routing evaluates several independent collision constraints in one deterministic scoring pass.
// eslint-disable-next-line complexity
export function routeParentEdges(
  nodes: Node<MemberNodeData>[],
  edges: Edge[],
  chronological: boolean,
): Edge[] {
  // Route each parent connector through a distinct gutter. Vertical segments
  // are rejected when they would pass through any card, while the staggered
  // entry/exit corridors prevent siblings from sharing the same visible line.
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const usedLanes: Array<{ x: number; top: number; bottom: number }> = [];
  const parentGroups = new Map<string, Edge[]>();
  for (const edge of edges) {
    const data = edge.data as { kind?: string; familyKey?: string } | undefined;
    if (data?.kind !== "parent") continue;
    const key = data.familyKey ?? edge.source;
    parentGroups.set(key, [...(parentGroups.get(key) ?? []), edge]);
  }
  const routeByEdge = new Map<string, Record<string, unknown>>();
  const sourceFamilyCounts = new Map<string, number>();
  for (const familyEdges of parentGroups.values()) {
    const source = nodeById.get(familyEdges[0].source);
    const targets = familyEdges
      .map((edge) => nodeById.get(edge.target))
      .filter((node): node is Node<MemberNodeData> => !!node);
    if (!source || !targets.length) continue;
    const sourceFamilyIndex = sourceFamilyCounts.get(source.id) ?? 0;
    sourceFamilyCounts.set(source.id, sourceFamilyIndex + 1);
    const sourceHeight = source.data.member.gender === "male" ? NODE_H_HUSBAND : NODE_H;
    const verticalTop = source.position.y + sourceHeight + 24;
    const verticalBottom = Math.max(...targets.map((target) => target.position.y - 24));
    const sourceCenter = source.position.x + NODE_W / 2;
    const targetCenter =
      targets.reduce((sum, target) => sum + target.position.x + NODE_W / 2, 0) / targets.length;
    const clearance = 28;
    const candidates = [
      sourceCenter,
      source.position.x - clearance,
      source.position.x + NODE_W + clearance,
      ...targets.flatMap((target) => [
        target.position.x - clearance,
        target.position.x + NODE_W + clearance,
      ]),
      ...nodes.flatMap((node) => [
        node.position.x - clearance,
        node.position.x + NODE_W + clearance,
      ]),
    ];
    const isClear = (x: number) =>
      nodes.every((node) => {
        if (node.id === source.id) return true;
        const height = node.data.member.gender === "male" ? NODE_H_HUSBAND : NODE_H;
        const overlapsY =
          node.position.y - 14 < verticalBottom && node.position.y + height + 14 > verticalTop;
        return !(overlapsY && x > node.position.x - 14 && x < node.position.x + NODE_W + 14);
      });
    const clear = [...new Set(candidates)].filter(isClear);
    const conflictsWithLane = (x: number) =>
      usedLanes.some(
        (lane) =>
          Math.abs(lane.x - x) < 24 && lane.top < verticalBottom && lane.bottom > verticalTop,
      );
    let routeX = (clear.length ? clear : candidates).sort((a, b) => {
      const score = (x: number) =>
        Math.abs(x - sourceCenter) +
        Math.abs(x - targetCenter) +
        (x === sourceCenter ? -500 : 0) +
        (conflictsWithLane(x) ? 10000 : 0);
      return score(a) - score(b);
    })[0];
    // A single child needs no shared family gutter: move toward that child
    // once, then descend directly into the card.
    if (familyEdges.length === 1) {
      const directX = targets[0].position.x + NODE_W / 2;
      if (isClear(directX) && !conflictsWithLane(directX)) routeX = directX;
    } else {
      // Snap once for the whole sibling group, never independently per edge.
      // This keeps one canonical family trunk when a child is already close
      // to the selected lane and avoids a visually parallel short drop.
      const nearbyTargetX = targets
        .map((target) => target.position.x + NODE_W / 2)
        .sort((a, b) => Math.abs(a - routeX) - Math.abs(b - routeX))[0];
      if (
        Math.abs(nearbyTargetX - routeX) < 72 &&
        isClear(nearbyTargetX) &&
        !conflictsWithLane(nearbyTargetX)
      ) {
        routeX = nearbyTargetX;
      }
    }
    usedLanes.push({ x: routeX, top: verticalTop, bottom: verticalBottom });
    const generationYs = [...new Set(targets.map((target) => target.position.y - 24))].sort(
      (a, b) => a - b,
    );
    const sharedFamilyJunctionY = generationYs[0];
    const trunkEndY = generationYs[generationYs.length - 1];
    const trunkOwnerId = familyEdges[0].id;
    familyEdges.sort(
      (a, b) =>
        (nodeById.get(a.target)?.position.x ?? 0) - (nodeById.get(b.target)?.position.x ?? 0),
    );
    familyEdges.forEach((edge, index) => {
      const target = nodeById.get(edge.target);
      const decadeJunctionY = target ? target.position.y - 24 : sharedFamilyJunctionY;
      routeByEdge.set(edge.id, {
        routeX,
        // Separate each spouse/family group immediately below the parent card.
        // Children in the same group still share this exact source segment.
        sourceLane: 24 + sourceFamilyIndex * 14,
        targetLane: 24,
        // Family Levels has one family bus. By Decade has one bus per decade;
        // siblings on the same decade row therefore share the exact junction.
        branchY: chronological ? decadeJunctionY : sharedFamilyJunctionY,
        drawTrunk: edge.id === trunkOwnerId,
        trunkEndY,
        generationBreakpoints:
          index === 0 ? (chronological ? generationYs : [sharedFamilyJunctionY]) : undefined,
      });
    });
  }
  const routedEdges = edges.map((edge) => ({
    ...edge,
    data: { ...edge.data, ...(routeByEdge.get(edge.id) ?? {}) },
  }));
  return routedEdges;
}
