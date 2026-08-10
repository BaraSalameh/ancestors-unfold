import { LocateFixed } from "lucide-react";
import { MiniMap, type Node, type Viewport } from "reactflow";
import type { useI18n } from "@/shared/i18n";
import { CANVAS_NAVIGATION_MAP_WIDTH, CANVAS_NAVIGATION_ZOOM_STEP } from "../domain/canvas-widgets";

type Translate = ReturnType<typeof useI18n>["t"];

export function CanvasNavigationWidget({
  nodes,
  t,
  viewport,
}: {
  nodes: Node[];
  t: Translate;
  viewport: Viewport;
}) {
  if (nodes.length > 2_000) return null;
  return (
    <section
      className="pointer-events-auto w-72 max-w-[calc(100vw-2rem)] rounded-xl border border-border/80 bg-card/95 p-2 shadow-lg backdrop-blur"
      data-canvas-widget
      aria-label={t("canvas_navigation")}
    >
      <div className="mb-1.5 flex items-center justify-between gap-3 px-1 text-xs">
        <span className="flex items-center gap-2 font-semibold">
          <LocateFixed className="h-4 w-4 text-primary" aria-hidden="true" />
          {t("canvas_navigation")}
        </span>
        <span className="tabular-nums text-muted-foreground">
          {Math.round(viewport.zoom * 100)}%
        </span>
      </div>
      <MiniMap
        pannable
        zoomable
        zoomStep={CANVAS_NAVIGATION_ZOOM_STEP}
        position="top-right"
        nodeColor="var(--color-primary)"
        nodeStrokeColor="var(--color-background)"
        nodeStrokeWidth={2}
        nodeBorderRadius={3}
        maskColor="color-mix(in oklab, var(--color-background) 78%, transparent)"
        maskStrokeColor="var(--color-primary)"
        maskStrokeWidth={4}
        ariaLabel={t("canvas_navigation_map")}
        className="canvas-minimap! m-0! w-full! overflow-hidden! rounded-lg! border! border-border/70! bg-muted/40!"
        style={{
          position: "relative",
          inset: "auto",
          width: CANVAS_NAVIGATION_MAP_WIDTH,
          maxWidth: "100%",
          height: 136,
        }}
      />
      <p className="mt-1.5 px-1 text-[10px] text-muted-foreground">{t("canvas_navigation_hint")}</p>
    </section>
  );
}
