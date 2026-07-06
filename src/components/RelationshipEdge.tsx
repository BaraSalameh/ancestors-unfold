import { memo } from "react";
import {
  BaseEdge,
  EdgeLabelRenderer,
  getSmoothStepPath,
  useReactFlow,
  type EdgeProps,
} from "reactflow";
import { X } from "lucide-react";

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

  const [path, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    borderRadius: 12,
  });

  const rf = useReactFlow();

  return (
    <>
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
