import { memo } from "react";
import {
  BaseEdge,
  EdgeLabelRenderer,
  getSmoothStepPath,
  useReactFlow,
  type EdgeProps,
} from "reactflow";
import { X } from "lucide-react";

type Point = { x: number; y: number };

function roundedOrthogonalPath(points: Point[], radius = 10) {
  const compact = points.filter((point, index) => index === 0 || point.x !== points[index - 1].x || point.y !== points[index - 1].y);
  const simplified = compact.filter((point, index) => {
    if (index === 0 || index === compact.length - 1) return true;
    const previous = compact[index - 1];
    const next = compact[index + 1];
    return !((previous.x === point.x && point.x === next.x) || (previous.y === point.y && point.y === next.y));
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
    const before = { x: corner.x - Math.sign(corner.x - previous.x) * r, y: corner.y - Math.sign(corner.y - previous.y) * r };
    const after = { x: corner.x + Math.sign(next.x - corner.x) * r, y: corner.y + Math.sign(next.y - corner.y) * r };
    path += ` L ${before.x} ${before.y} Q ${corner.x} ${corner.y} ${after.x} ${after.y}`;
  }
  const end = simplified[simplified.length - 1];
  return `${path} L ${end.x} ${end.y}`;
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

  const routing = props.data as { routeX?: number; sourceLane?: number; targetLane?: number; branchY?: number; drawTrunk?: boolean; trunkEndY?: number; generationBreakpoints?: number[] } | undefined;
  const fallback = getSmoothStepPath({
    sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, borderRadius: 12,
  });
  const sourceLaneY = sourceY + (routing?.sourceLane ?? 0);
  const targetLaneY = routing?.branchY ?? (targetY - (routing?.targetLane ?? 0));
  // Treat nearly aligned coordinates as identical. Sub-pixel/layout rounding
  // must not create a visible hook in an otherwise straight connector.
  let routeX = routing?.routeX !== undefined && Math.abs(routing.routeX - sourceX) < 16
    ? sourceX
    : routing?.routeX;
  const path = routing?.routeX === undefined
    ? fallback[0]
    : roundedOrthogonalPath([
        { x: routeX!, y: targetLaneY },
        { x: targetX, y: targetLaneY },
        { x: targetX, y: targetY },
      ]);
  const trunkPath = routing?.drawTrunk && routeX !== undefined
    ? roundedOrthogonalPath([
        { x: sourceX, y: sourceY },
        { x: sourceX, y: sourceLaneY },
        { x: routeX, y: sourceLaneY },
        { x: routeX, y: routing.trunkEndY ?? targetLaneY },
      ])
    : null;
  const labelX = routeX ?? fallback[1];
  const labelY = routing?.routeX === undefined ? fallback[2] : (sourceY + targetLaneY) / 2;

  const rf = useReactFlow();

  return (
    <>
      {trunkPath && <BaseEdge id={`${id}:trunk`} path={trunkPath} style={style} />}
      <BaseEdge id={id} path={path} style={style} markerEnd={markerEnd} />
      {/* wider invisible hit area for easier hover/click */}
      <path
        d={path}
        fill="none"
        stroke="transparent"
        strokeWidth={22}
        className="react-flow__edge-interaction"
        style={{ cursor: "pointer" }}
      />
      {selected && (
        <EdgeLabelRenderer>
          <div
            className="nodrag nopan"
            style={{
              position: "absolute",
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              pointerEvents: "all",
            }}
          >
            <button
              onClick={(e) => {
                e.stopPropagation();
                rf.deleteElements({ edges: [{ id }] });
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
