import { useEffect, useMemo, useRef, useState } from "react";
import type { FamilyMember } from "@/features/members";
import type { ChronologicalPeriod } from "../domain/canvas-preview";
import { computeTreeLayoutGeometry, type TreeLayoutGeometry } from "../domain/tree-layout-geometry";

const WORKER_THRESHOLD = 500;

function layoutTopologyKey(members: FamilyMember[]) {
  return members
    .map((member) =>
      [
        member.id,
        member.gender,
        member.father_id,
        member.mother_id,
        member.spouse_id,
        member.spouse_ids?.join(","),
        member.is_unknown ? "1" : "0",
        member.birth_date,
        member.pos_x,
        member.pos_y,
      ].join(":"),
    )
    .join("|");
}

export function useTreeLayoutGeometry(
  members: FamilyMember[],
  collapsed: ReadonlySet<string>,
  chronological: boolean,
  period: ChronologicalPeriod,
) {
  const topologyKey = useMemo(() => layoutTopologyKey(members), [members]);
  const requestId = useRef(0);
  const [workerResult, setWorkerResult] = useState<{
    geometry: TreeLayoutGeometry;
    topologyKey: string;
    collapsedKey: string;
    chronological: boolean;
    period: ChronologicalPeriod;
  }>();
  const collapsedIds = useMemo(() => [...collapsed].sort(), [collapsed]);
  const collapsedKey = collapsedIds.join("|");
  const membersRef = useRef(members);
  const collapsedIdsRef = useRef(collapsedIds);
  membersRef.current = members;
  collapsedIdsRef.current = collapsedIds;
  const synchronous = members.length < WORKER_THRESHOLD;
  const syncCache = useRef<
    | {
        key: string;
        geometry: TreeLayoutGeometry;
      }
    | undefined
  >(undefined);
  const syncKey = `${topologyKey}:${collapsedKey}:${chronological}:${period}`;
  if (synchronous && syncCache.current?.key !== syncKey)
    syncCache.current = {
      key: syncKey,
      geometry: computeTreeLayoutGeometry(
        membersRef.current,
        collapsedIdsRef.current,
        chronological,
        period,
      ),
    };
  const syncGeometry = synchronous ? syncCache.current?.geometry : undefined;

  useEffect(() => {
    if (synchronous || typeof Worker === "undefined") {
      if (!synchronous)
        setWorkerResult({
          geometry: computeTreeLayoutGeometry(
            membersRef.current,
            collapsedIdsRef.current,
            chronological,
            period,
          ),
          topologyKey,
          collapsedKey,
          chronological,
          period,
        });
      return;
    }
    const id = ++requestId.current;
    const worker = new Worker(new URL("./tree-layout.worker.ts", import.meta.url), {
      type: "module",
    });
    worker.onmessage = (event: MessageEvent<{ id: number; geometry: TreeLayoutGeometry }>) => {
      if (event.data.id !== requestId.current) return;
      setWorkerResult({
        geometry: event.data.geometry,
        topologyKey,
        collapsedKey,
        chronological,
        period,
      });
      worker.terminate();
    };
    worker.onerror = () => {
      if (id === requestId.current) {
        setWorkerResult({
          geometry: computeTreeLayoutGeometry(
            membersRef.current,
            collapsedIdsRef.current,
            chronological,
            period,
          ),
          topologyKey,
          collapsedKey,
          chronological,
          period,
        });
      }
      worker.terminate();
    };
    worker.postMessage({
      id,
      members: membersRef.current,
      collapsedIds: collapsedIdsRef.current,
      chronological,
      period,
    });
    return () => worker.terminate();
  }, [chronological, collapsedKey, period, synchronous, topologyKey]);

  const workerGeometry =
    workerResult?.topologyKey === topologyKey &&
    workerResult.collapsedKey === collapsedKey &&
    workerResult.chronological === chronological &&
    workerResult.period === period
      ? workerResult.geometry
      : undefined;
  return syncGeometry ?? workerGeometry;
}
