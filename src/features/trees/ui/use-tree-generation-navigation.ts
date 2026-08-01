import { useMemo } from "react";
import type { ReactFlowInstance, Viewport } from "reactflow";
import type { FamilyMember } from "@/features/members";
import {
  chronologicalBandForYear,
  chronologicalBandsForMembers,
  type ChronologicalPeriod,
} from "../domain/canvas-preview";
import { DECADE_ROW_H, NODE_H } from "./family-tree-layout";

interface Params {
  chronologicalPeriod: ChronologicalPeriod;
  generationYear: string;
  setCenter: ReactFlowInstance["setCenter"];
  setGenerationYear: (year: string) => void;
  viewport: Viewport;
  visibleMembers: FamilyMember[];
}

export function useTreeGenerationNavigation(params: Params) {
  const generations = useMemo(
    () => chronologicalBandsForMembers(params.visibleMembers, params.chronologicalPeriod),
    [params.visibleMembers, params.chronologicalPeriod],
  );
  const earliestGeneration = generations[0]?.start ?? 0;
  const activeGeneration = useMemo(() => {
    if (!generations.length) return null;
    const graphCenterY =
      ((typeof window === "undefined" ? 800 : window.innerHeight) / 2 - params.viewport.y) /
      params.viewport.zoom;
    return generations.reduce((closest, band) => {
      const bandY = ((band.start - earliestGeneration) / params.chronologicalPeriod) * DECADE_ROW_H;
      const closestY =
        ((closest.start - earliestGeneration) / params.chronologicalPeriod) * DECADE_ROW_H;
      return Math.abs(bandY - graphCenterY) < Math.abs(closestY - graphCenterY) ? band : closest;
    });
  }, [generations, earliestGeneration, params.chronologicalPeriod, params.viewport]);

  const scrollToGeneration = () => {
    const year = Number.parseInt(params.generationYear, 10);
    if (!Number.isFinite(year) || !generations.length) return;
    const requested = chronologicalBandForYear(year, params.chronologicalPeriod).start;
    const closest = generations.reduce((best, band) =>
      Math.abs(band.start - requested) < Math.abs(best.start - requested) ? band : best,
    );
    const y =
      ((closest.start - earliestGeneration) / params.chronologicalPeriod) * DECADE_ROW_H +
      NODE_H / 2;
    params.setCenter(0, y, { zoom: Math.max(params.viewport.zoom, 0.65), duration: 600 });
    params.setGenerationYear(String(year));
  };

  return { activeGeneration, earliestGeneration, generations, scrollToGeneration };
}
