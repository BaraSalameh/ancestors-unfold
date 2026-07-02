import { memo } from "react";
import { Handle, Position } from "reactflow";

function UnionNodeImpl() {
  return (
    <div className="relative flex h-5 w-5 items-center justify-center">
      <Handle
        id="u-in-l"
        type="target"
        position={Position.Left}
        className="!h-2 !w-2 !border-0 !bg-transparent"
      />
      <Handle
        id="u-in-r"
        type="target"
        position={Position.Right}
        className="!h-2 !w-2 !border-0 !bg-transparent"
      />
      <div className="h-2.5 w-2.5 rounded-full bg-foreground/60 ring-2 ring-background" />
      <Handle
        id="u-out"
        type="source"
        position={Position.Bottom}
        className="!h-2 !w-2 !border-0 !bg-transparent"
      />
    </div>
  );
}

export const UnionNode = memo(UnionNodeImpl);
