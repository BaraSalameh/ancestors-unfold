import { LocateFixed } from "lucide-react";
import {
  useCallback,
  useEffect,
  useRef,
  type MutableRefObject,
  type PointerEvent,
  type RefObject,
} from "react";
import { type Node, type Viewport, useReactFlow } from "reactflow";
import type { useI18n } from "@/shared/i18n";
import { canvasMapTransform, type CanvasMapTransform } from "../domain/canvas-navigation-map";

type Translate = ReturnType<typeof useI18n>["t"];
const MAP_HEIGHT = 156;
const NODE_WIDTH = 260;
const NODE_HEIGHT = 150;

function useDrawNavigationMap(
  mapRef: RefObject<HTMLCanvasElement | null>,
  transformRef: MutableRefObject<CanvasMapTransform | undefined>,
  canvasRef: RefObject<HTMLDivElement | null>,
  nodes: Node[],
  viewport: Viewport,
) {
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const width = map.clientWidth;
    const ratio = window.devicePixelRatio || 1;
    map.width = Math.round(width * ratio);
    map.height = Math.round(MAP_HEIGHT * ratio);
    const context = map.getContext("2d");
    if (!context) return;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, width, MAP_HEIGHT);
    const transform = canvasMapTransform(nodes, width, MAP_HEIGHT);
    transformRef.current = transform;
    if (!transform) return;
    const color = getComputedStyle(map).color;
    context.fillStyle = color;
    context.globalAlpha = nodes.length > 1_000 ? 0.48 : 0.68;
    for (const node of nodes) {
      const x = transform.offsetX + (node.position.x - transform.minX) * transform.scale;
      const y = transform.offsetY + (node.position.y - transform.minY) * transform.scale;
      context.fillRect(
        x,
        y,
        Math.max(1.5, (node.width ?? NODE_WIDTH) * transform.scale),
        Math.max(1.5, (node.height ?? NODE_HEIGHT) * transform.scale),
      );
    }
    const bounds = canvasRef.current?.getBoundingClientRect();
    if (!bounds || viewport.zoom <= 0) return;
    const x = transform.offsetX + (-viewport.x / viewport.zoom - transform.minX) * transform.scale;
    const y = transform.offsetY + (-viewport.y / viewport.zoom - transform.minY) * transform.scale;
    const visibleWidth = (bounds.width / viewport.zoom) * transform.scale;
    const visibleHeight = (bounds.height / viewport.zoom) * transform.scale;
    context.globalAlpha = 0.16;
    context.fillRect(x, y, visibleWidth, visibleHeight);
    context.globalAlpha = 0.95;
    context.lineWidth = 2;
    context.strokeStyle = color;
    context.strokeRect(x, y, visibleWidth, visibleHeight);
    context.globalAlpha = 1;
  }, [canvasRef, mapRef, nodes, transformRef, viewport]);
}

export function CanvasNavigationWidget({
  canvasRef,
  nodes,
  t,
  viewport,
}: {
  canvasRef: RefObject<HTMLDivElement | null>;
  nodes: Node[];
  t: Translate;
  viewport: Viewport;
}) {
  const mapRef = useRef<HTMLCanvasElement>(null);
  const transformRef = useRef<CanvasMapTransform | undefined>(undefined);
  const draggingRef = useRef(false);
  const { setCenter, setViewport } = useReactFlow();
  useDrawNavigationMap(mapRef, transformRef, canvasRef, nodes, viewport);

  const navigateFromPointer = useCallback(
    (event: PointerEvent<HTMLCanvasElement>) => {
      const map = mapRef.current;
      const transform = transformRef.current;
      if (!map || !transform) return;
      const bounds = map.getBoundingClientRect();
      const worldX =
        transform.minX + (event.clientX - bounds.left - transform.offsetX) / transform.scale;
      const worldY =
        transform.minY + (event.clientY - bounds.top - transform.offsetY) / transform.scale;
      void setCenter(worldX, worldY, {
        zoom: viewport.zoom,
        duration: draggingRef.current ? 0 : 180,
      });
    },
    [setCenter, viewport.zoom],
  );

  if (nodes.length === 0) return null;
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
          {nodes.length.toLocaleString()} · {Math.round(viewport.zoom * 100)}%
        </span>
      </div>
      <canvas
        ref={mapRef}
        role="img"
        tabIndex={0}
        aria-label={t("canvas_navigation_map")}
        className="block h-[156px] w-full touch-none cursor-crosshair rounded-lg border border-border/70 bg-muted/40 text-primary"
        onPointerDown={(event) => {
          draggingRef.current = true;
          event.currentTarget.setPointerCapture(event.pointerId);
          navigateFromPointer(event);
        }}
        onPointerMove={(event) => draggingRef.current && navigateFromPointer(event)}
        onPointerUp={(event) => {
          draggingRef.current = false;
          event.currentTarget.releasePointerCapture(event.pointerId);
        }}
        onPointerCancel={() => {
          draggingRef.current = false;
        }}
        onKeyDown={(event) => {
          const distance = 80;
          if (!event.key.startsWith("Arrow")) return;
          event.preventDefault();
          void setViewport({
            ...viewport,
            x:
              viewport.x +
              (event.key === "ArrowLeft" ? distance : event.key === "ArrowRight" ? -distance : 0),
            y:
              viewport.y +
              (event.key === "ArrowUp" ? distance : event.key === "ArrowDown" ? -distance : 0),
          });
        }}
      />
      <p className="mt-1.5 px-1 text-[10px] text-muted-foreground">{t("canvas_navigation_hint")}</p>
    </section>
  );
}
