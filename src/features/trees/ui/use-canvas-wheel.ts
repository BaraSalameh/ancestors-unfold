import { useCallback, type MutableRefObject, type WheelEvent as ReactWheelEvent } from "react";
import type { ReactFlowInstance, Viewport } from "reactflow";
import { canvasWheelIntent } from "../domain/canvas-preview";

export function useCanvasWheel({
  canvasRef,
  setViewport,
  viewportRef,
}: {
  canvasRef: MutableRefObject<HTMLDivElement | null>;
  setViewport: ReactFlowInstance["setViewport"];
  viewportRef: MutableRefObject<Viewport>;
}) {
  return useCallback(
    (event: ReactWheelEvent<HTMLDivElement>) => {
      const target = event.target as HTMLElement | null;
      const interactive = target?.closest("input, textarea, select, button, [role='dialog']");
      if (interactive && !interactive.closest("[data-member-card]")) return;
      event.preventDefault();
      const current = viewportRef.current;
      if (canvasWheelIntent(event) === "pan") {
        const horizontal =
          event.shiftKey && Math.abs(event.deltaX) < 0.5 ? event.deltaY : event.deltaX;
        const next = {
          x: current.x - horizontal,
          y: current.y - (event.shiftKey ? 0 : event.deltaY),
          zoom: current.zoom,
        };
        viewportRef.current = next;
        void setViewport(next);
        return;
      }
      const bounds = canvasRef.current?.getBoundingClientRect();
      if (!bounds) return;
      const scale = event.deltaMode === WheelEvent.DOM_DELTA_PIXEL ? 0.002 : 0.08;
      const zoom = Math.min(2, Math.max(0.1, current.zoom * Math.exp(-event.deltaY * scale)));
      const pointerX = event.clientX - bounds.left;
      const pointerY = event.clientY - bounds.top;
      const ratio = zoom / current.zoom;
      const next = {
        x: pointerX - (pointerX - current.x) * ratio,
        y: pointerY - (pointerY - current.y) * ratio,
        zoom,
      };
      viewportRef.current = next;
      void setViewport(next);
    },
    [canvasRef, setViewport, viewportRef],
  );
}
