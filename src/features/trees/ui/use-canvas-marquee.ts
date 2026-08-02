import {
  useCallback,
  useRef,
  useState,
  type Dispatch,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
  type SetStateAction,
} from "react";
import type { Edge, Node, XYPosition } from "reactflow";
import {
  canvasRectBetween,
  canvasRectsIntersect,
  hasCanvasDragStarted,
  isDoublePanePress,
  type CanvasPoint,
  type CanvasRect,
} from "../domain/canvas-preview";
import { NODE_H, NODE_W } from "./family-tree-layout";

type SetNodes = Dispatch<SetStateAction<Node[]>>;
type SetEdges = Dispatch<SetStateAction<Edge[]>>;

function selectNodesInRect(nodes: Node[], selection: CanvasRect): Node[] {
  return nodes.map((node) => ({
    ...node,
    selected:
      node.type === "member" &&
      canvasRectsIntersect(selection, {
        x: node.position.x,
        y: node.position.y,
        width: node.width ?? NODE_W,
        height: node.height ?? NODE_H,
      }),
  }));
}

const isEmptyCanvasTarget = (target: EventTarget | null) =>
  target instanceof Element &&
  Boolean(target.closest(".react-flow__pane")) &&
  !target.closest(
    ".react-flow__node, .react-flow__edge, .react-flow__controls, .react-flow__minimap",
  );

export function useCanvasSelection(setNodes: SetNodes, setEdges: SetEdges) {
  return useCallback(() => {
    setNodes((current) =>
      current.map((node) => (node.selected ? { ...node, selected: false } : node)),
    );
    setEdges((current) =>
      current.map((edge) => (edge.selected ? { ...edge, selected: false } : edge)),
    );
  }, [setEdges, setNodes]);
}

interface MarqueeOptions {
  canvasRef: RefObject<HTMLDivElement | null>;
  clearSelection: () => void;
  setNodes: SetNodes;
  screenToFlowPosition: (position: XYPosition) => XYPosition;
}

export function useCanvasMarquee({
  canvasRef,
  clearSelection,
  setNodes,
  screenToFlowPosition,
}: MarqueeOptions) {
  const firstPanePress = useRef<
    (CanvasPoint & { pointerId: number; at: number; moved: boolean }) | null
  >(null);
  const previousPaneClick = useRef<(CanvasPoint & { at: number }) | null>(null);
  const marqueePointer = useRef<{
    pointerId: number;
    start: CanvasPoint & { at: number };
    dragging: boolean;
  } | null>(null);
  const [marqueeRect, setMarqueeRect] = useState<CanvasRect | null>(null);

  const cancelMarquee = useCallback(() => {
    marqueePointer.current = null;
    firstPanePress.current = null;
    previousPaneClick.current = null;
    setMarqueeRect(null);
  }, []);

  const onPointerDownCapture = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || !isEmptyCanvasTarget(event.target)) {
      previousPaneClick.current = null;
      firstPanePress.current = null;
      return;
    }
    const point = { x: event.clientX, y: event.clientY, at: event.timeStamp };
    if (isDoublePanePress(previousPaneClick.current, point)) {
      previousPaneClick.current = null;
      firstPanePress.current = null;
      marqueePointer.current = { pointerId: event.pointerId, start: point, dragging: false };
      event.currentTarget.setPointerCapture(event.pointerId);
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    firstPanePress.current = { ...point, pointerId: event.pointerId, moved: false };
  }, []);

  const onPointerMoveCapture = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const marquee = marqueePointer.current;
      if (marquee?.pointerId === event.pointerId) {
        event.preventDefault();
        event.stopPropagation();
        const end = { x: event.clientX, y: event.clientY };
        if (!marquee.dragging && hasCanvasDragStarted(marquee.start, end)) marquee.dragging = true;
        if (marquee.dragging) {
          const bounds = canvasRef.current?.getBoundingClientRect();
          if (bounds)
            setMarqueeRect(
              canvasRectBetween(
                { x: marquee.start.x - bounds.left, y: marquee.start.y - bounds.top },
                { x: end.x - bounds.left, y: end.y - bounds.top },
              ),
            );
        }
        return;
      }
      const first = firstPanePress.current;
      if (
        first?.pointerId === event.pointerId &&
        hasCanvasDragStarted(first, { x: event.clientX, y: event.clientY })
      )
        first.moved = true;
    },
    [canvasRef],
  );

  const onPointerUpCapture = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const marquee = marqueePointer.current;
      if (marquee?.pointerId === event.pointerId) {
        event.preventDefault();
        event.stopPropagation();
        clearSelection();
        if (marquee.dragging) {
          const selection = canvasRectBetween(
            screenToFlowPosition(marquee.start),
            screenToFlowPosition({ x: event.clientX, y: event.clientY }),
          );
          setNodes((current) => selectNodesInRect(current, selection));
        }
        if (event.currentTarget.hasPointerCapture(event.pointerId))
          event.currentTarget.releasePointerCapture(event.pointerId);
        marqueePointer.current = null;
        setMarqueeRect(null);
        return;
      }
      const first = firstPanePress.current;
      if (first?.pointerId !== event.pointerId) return;
      previousPaneClick.current =
        !first.moved && isEmptyCanvasTarget(event.target)
          ? { x: first.x, y: first.y, at: event.timeStamp }
          : null;
      firstPanePress.current = null;
    },
    [clearSelection, screenToFlowPosition, setNodes],
  );

  const onPointerCancelCapture = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (
        marqueePointer.current?.pointerId === event.pointerId ||
        firstPanePress.current?.pointerId === event.pointerId
      )
        cancelMarquee();
    },
    [cancelMarquee],
  );

  return {
    marqueeRect,
    cancelMarquee,
    onPointerDownCapture,
    onPointerMoveCapture,
    onPointerUpCapture,
    onPointerCancelCapture,
  };
}
