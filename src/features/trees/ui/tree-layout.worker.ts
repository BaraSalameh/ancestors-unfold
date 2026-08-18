/// <reference lib="webworker" />
import type { FamilyMember } from "@/features/members";
import { computeTreeLayoutGeometry } from "../domain/tree-layout-geometry";

type LayoutRequest = {
  id: number;
  members: FamilyMember[];
  collapsedIds: string[];
  chronological: boolean;
  period: number;
};

self.onmessage = (event: MessageEvent<LayoutRequest>) => {
  const { id, members, collapsedIds, chronological, period } = event.data;
  const geometry = computeTreeLayoutGeometry(members, collapsedIds, chronological, period);
  self.postMessage({ id, geometry });
};

export {};
