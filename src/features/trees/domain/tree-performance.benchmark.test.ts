import { performance } from "node:perf_hooks";
import { describe, expect, it } from "vitest";
import { removeMembers } from "@/features/members/domain";
import { createSyntheticFamily } from "../testing/synthetic-family";
import { layout } from "../ui/family-tree-layout";
import { routeParentEdges } from "./route-edges";
import { computeTreeLayoutGeometry } from "./tree-layout-geometry";

describe("large tree performance budgets", () => {
  it.each([871, 2_000, 10_000])("lays out %i members within the background budget", (count) => {
    const members = createSyntheticFamily(count);
    const started = performance.now();
    const geometry = computeTreeLayoutGeometry(members, [], true, 10);
    const elapsed = performance.now() - started;
    expect(geometry.renderedIds).toHaveLength(count);
    expect(elapsed).toBeLessThan(count === 10_000 ? 15_000 : 5_000);
  });

  it("removes 1,000 members in one pass", () => {
    const members = createSyntheticFamily(10_000);
    const removed = new Set(members.slice(2_000, 3_000).map(({ id }) => id));
    const started = performance.now();
    const remaining = removeMembers(members, removed);
    const elapsed = performance.now() - started;
    expect(remaining).toHaveLength(9_000);
    expect(elapsed).toBeLessThan(500);
  });

  it("projects and routes an 871-member chronological preview without blocking", () => {
    const members = createSyntheticFamily(871);
    const geometry = computeTreeLayoutGeometry(members, [], true, 10);
    const started = performance.now();
    const graph = layout(
      members,
      new Set(),
      () => undefined,
      () => undefined,
      () => undefined,
      () => undefined,
      null,
      false,
      true,
      10,
      undefined,
      "full",
      geometry,
    );
    const edges = routeParentEdges(graph.nodes, graph.edges, true);
    const elapsed = performance.now() - started;
    expect(graph.nodes).toHaveLength(geometry.renderedIds.length);
    expect(edges).toHaveLength(graph.edges.length);
    expect(edges).toBe(graph.edges);
    expect(elapsed).toBeLessThan(1_000);
  });
});
