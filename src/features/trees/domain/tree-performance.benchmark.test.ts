import { performance } from "node:perf_hooks";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { removeMembers } from "@/features/members/domain";
import { createFamilyDraftHistory } from "../client/family-draft-history";
import {
  createMemberCommands,
  type MemberCommandContext,
} from "../client/family-store-member-commands";
import { createSyntheticFamily } from "../testing/synthetic-family";
import { layout } from "../ui/family-tree-layout";
import { canvasMapTransform } from "./canvas-navigation-map";
import { parseFamilyCsv } from "./family-csv-import";
import { routeParentEdges } from "./route-edges";
import { computeTreeLayoutGeometry } from "./tree-layout-geometry";

const realFamilyCsv = readFileSync(
  new URL(
    "../../../../outputs/019feb97-c69d-7402-87f1-637a7b74ec7d/family-tree-filled.csv",
    import.meta.url,
  ),
  "utf8",
);

describe("large tree performance budgets", () => {
  it.each([871, 2_000, 10_000])("lays out %i members within the background budget", (count) => {
    const members = createSyntheticFamily(count);
    const started = performance.now();
    const geometry = computeTreeLayoutGeometry(members, [], true, 10);
    const elapsed = performance.now() - started;
    expect(geometry.renderedIds).toHaveLength(count);
    const budget = count === 871 ? 1_000 : count === 2_000 ? 2_000 : 5_000;
    expect(elapsed).toBeLessThan(budget);
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

  it("runs the real 871-row CSV through import, update, decade preview, and navigation", () => {
    const importStarted = performance.now();
    const parsed = parseFamilyCsv(realFamilyCsv);
    const importElapsed = performance.now() - importStarted;
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.preview.summary.members).toBe(871);
    expect(importElapsed).toBeLessThan(500);

    let members = parsed.preview.members;
    const history = createFamilyDraftHistory({
      canEdit: () => true,
      getMembers: () => members,
      setMembers: (next) => {
        members = next;
      },
      getSubfamilies: () => parsed.preview.subfamilies,
      setSubfamilies: () => undefined,
      getImages: () => new Map(),
      replaceImages: () => undefined,
      discardRemovedImages: () => undefined,
      afterChange: () => undefined,
      markChanged: () => undefined,
    });
    const context: MemberCommandContext = {
      get state() {
        return members;
      },
      set state(next) {
        members = next;
      },
      stagedImages: new Map(),
      commit: history.commit,
      replaceStagedImages: () => undefined,
      emit: () => undefined,
    };
    const updateStarted = performance.now();
    createMemberCommands(context).update(members.at(-1)!.id, { notes: "benchmark update" });
    const updateElapsed = performance.now() - updateStarted;
    expect(members.at(-1)?.notes).toBe("benchmark update");
    expect(history.canUndo()).toBe(true);
    expect(updateElapsed).toBeLessThan(100);

    const previewStarted = performance.now();
    const geometry = computeTreeLayoutGeometry(members, [], true, 10);
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
    const previewElapsed = performance.now() - previewStarted;
    expect(graph.nodes).toHaveLength(geometry.renderedIds.length);
    expect(edges).toHaveLength(graph.edges.length);
    expect(previewElapsed).toBeLessThan(1_000);

    const navigationStarted = performance.now();
    const transform = canvasMapTransform(graph.nodes, 272, 156);
    const navigationElapsed = performance.now() - navigationStarted;
    expect(transform?.scale).toBeGreaterThan(0);
    expect(navigationElapsed).toBeLessThan(25);
  });
});
