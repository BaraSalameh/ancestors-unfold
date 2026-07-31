import { memo, useState, type MouseEvent as ReactMouseEvent } from "react";
import { BaseEdge, EdgeLabelRenderer, getSmoothStepPath, type EdgeProps } from "reactflow";
import { X } from "lucide-react";
import type { DecadeBundleRoute } from "../domain/route-edges";

type Point = { x: number; y: number };

function roundedOrthogonalPath(points: Point[], radius = 10) {
  const compact = points.filter(
    (point, index) =>
      index === 0 || point.x !== points[index - 1].x || point.y !== points[index - 1].y,
  );
  const simplified = compact.filter((point, index) => {
    if (index === 0 || index === compact.length - 1) return true;
    const previous = compact[index - 1];
    const next = compact[index + 1];
    return !(
      (previous.x === point.x && point.x === next.x) ||
      (previous.y === point.y && point.y === next.y)
    );
  });
  if (simplified.length < 2) return "";
  let path = `M ${simplified[0].x} ${simplified[0].y}`;
  for (let index = 1; index < simplified.length - 1; index++) {
    const previous = simplified[index - 1];
    const corner = simplified[index];
    const next = simplified[index + 1];
    const incoming = Math.hypot(corner.x - previous.x, corner.y - previous.y);
    const outgoing = Math.hypot(next.x - corner.x, next.y - corner.y);
    const r = Math.min(radius, incoming / 2, outgoing / 2);
    const before = {
      x: corner.x - Math.sign(corner.x - previous.x) * r,
      y: corner.y - Math.sign(corner.y - previous.y) * r,
    };
    const after = {
      x: corner.x + Math.sign(next.x - corner.x) * r,
      y: corner.y + Math.sign(next.y - corner.y) * r,
    };
    path += ` L ${before.x} ${before.y} Q ${corner.x} ${corner.y} ${after.x} ${after.y}`;
  }
  const end = simplified[simplified.length - 1];
  return `${path} L ${end.x} ${end.y}`;
}

function anchoredDecadeBranch(route: DecadeBundleRoute, target: Point): Point[] {
  if (route.branch.length < 2) return [...route.branch, target];
  return [...route.branch.slice(0, -2), { ...route.branch.at(-2)!, x: target.x }, target];
}

function anchoredSharedPaths(route: DecadeBundleRoute, source: Point): Point[][] | undefined {
  return route.sharedPaths?.map((path, pathIndex) =>
    pathIndex === 0 && path.length
      ? [
          source,
          ...path
            .slice(1)
            .map((point, pointIndex) => (pointIndex === 0 ? { ...point, x: source.x } : point)),
        ]
      : path,
  );
}

function RelationshipEdgeImpl(props: EdgeProps) {
  const {
    id,
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    style,
    markerEnd,
    selected,
  } = props;

  const relationship = props.data as
    { kind?: string; decadeBundle?: DecadeBundleRoute } | undefined;
  const sharedPaths = relationship?.decadeBundle
    ? anchoredSharedPaths(relationship.decadeBundle, { x: sourceX, y: sourceY })
    : undefined;
  const fallback = getSmoothStepPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    borderRadius: 12,
  });
  const isParentConnector = relationship?.kind === "parent";
  const middleY = sourceY + (targetY - sourceY) / 2;
  const path = relationship?.decadeBundle
    ? roundedOrthogonalPath(
        anchoredDecadeBranch(relationship.decadeBundle, { x: targetX, y: targetY }),
      )
    : isParentConnector
      ? roundedOrthogonalPath([
          { x: sourceX, y: sourceY },
          { x: sourceX, y: middleY },
          { x: targetX, y: middleY },
          { x: targetX, y: targetY },
        ])
      : fallback[0];
  const [clickedPosition, setClickedPosition] = useState<Point | null>(null);
  const setRemoveAtPointer = (event: ReactMouseEvent<SVGPathElement>) => {
    const matrix = event.currentTarget.getScreenCTM();
    if (!matrix) return;
    const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
    setClickedPosition({ x: point.x, y: point.y });
  };
  const relationshipData = props.data as
    { canRemove?: boolean; onRequestRemove?: () => void } | undefined;
  const onRequestRemove = relationshipData?.onRequestRemove;

  return (
    <>
      {sharedPaths?.map((sharedPath, index) => (
        <g key={`${id}:shared:${index}`}>
          <path d={roundedOrthogonalPath(sharedPath)} fill="none" style={style} />
          <path
            d={roundedOrthogonalPath(sharedPath)}
            fill="none"
            stroke="transparent"
            strokeWidth={22}
            className="react-flow__edge-interaction"
            style={{ cursor: "pointer" }}
            onClick={setRemoveAtPointer}
          />
        </g>
      ))}
      <BaseEdge id={id} path={path} style={style} markerEnd={markerEnd} />
      {/* wider invisible hit area for easier clicking */}
      <path
        d={path}
        fill="none"
        stroke="transparent"
        strokeWidth={22}
        className="react-flow__edge-interaction"
        style={{ cursor: "pointer" }}
        onClick={setRemoveAtPointer}
      />
      {relationshipData?.canRemove && onRequestRemove && selected && clickedPosition && (
        <EdgeLabelRenderer>
          <div
            className="nodrag nopan"
            style={{
              position: "absolute",
              transform: `translate(-50%, -50%) translate(${clickedPosition.x}px, ${clickedPosition.y}px)`,
              pointerEvents: "all",
            }}
          >
            <button
              onClick={(e) => {
                e.stopPropagation();
                onRequestRemove();
              }}
              title="Delete connection"
              className="flex h-6 w-6 items-center justify-center rounded-full bg-destructive text-destructive-foreground shadow-lg ring-2 ring-background transition hover:scale-110"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

export const RelationshipEdge = memo(RelationshipEdgeImpl);
