import { useRef, type PointerEvent as ReactPointerEvent } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Handle, Position } from "reactflow";
import { useI18n } from "@/shared/i18n";

export function MemberNodeConnectors({
  memberId,
  hasDescendants,
  collapsed,
  toggleCollapsed,
  addParent,
  addChild,
  editable,
  selected,
  handleClass,
}: {
  memberId: string;
  hasDescendants?: boolean;
  collapsed?: boolean;
  toggleCollapsed?: (id: string) => void;
  addParent?: (id: string) => void;
  addChild?: (id: string) => void;
  editable: boolean;
  selected: boolean;
  handleClass: string;
}) {
  const { t } = useI18n();
  const start = useRef<{ x: number; y: number } | null>(null);
  const pointerDown = (event: ReactPointerEvent) => {
    start.current = { x: event.clientX, y: event.clientY };
  };
  const pointerUp = (event: ReactPointerEvent, action?: (id: string) => void) => {
    const origin = start.current;
    start.current = null;
    if (origin && action && Math.hypot(event.clientX - origin.x, event.clientY - origin.y) <= 4)
      action(memberId);
  };
  const visibility = editable
    ? selected
      ? "opacity-100!"
      : "opacity-0! group-hover/node:opacity-100!"
    : "pointer-events-none! opacity-0!";
  const classes = `h-7! w-7! border-2! shadow-md transition-all duration-150 hover:scale-110! ${handleClass} ${visibility}`;
  return (
    <>
      {hasDescendants && (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            toggleCollapsed?.(memberId);
          }}
          className="nodrag nopan pointer-events-auto absolute -inset-e-2.5 -top-2.5 z-20 flex h-7 w-7 cursor-pointer items-center justify-center rounded-full border bg-card text-muted-foreground shadow-md transition hover:border-primary/40 hover:bg-accent hover:text-foreground"
          title={collapsed ? t("expand_descendants") : t("collapse_descendants")}
        >
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
      )}
      <Handle
        id="parent-in"
        type="target"
        position={Position.Top}
        isConnectable={editable}
        onPointerDown={editable ? pointerDown : undefined}
        onPointerUp={editable ? (event) => pointerUp(event, addParent) : undefined}
        className={`-top-4.5! ${classes}`}
      />
      <Handle
        id="child-out"
        type="source"
        position={Position.Bottom}
        isConnectable={editable}
        onPointerDown={editable ? pointerDown : undefined}
        onPointerUp={editable ? (event) => pointerUp(event, addChild) : undefined}
        className={`-bottom-4.5! ${classes}`}
      />
      <Handle
        id="spouse-l"
        type="target"
        position={Position.Left}
        isConnectable={false}
        className="pointer-events-none! h-0! w-0! border-0! opacity-0!"
      />
      <Handle
        id="spouse-r"
        type="source"
        position={Position.Right}
        isConnectable={false}
        className="pointer-events-none! h-0! w-0! border-0! opacity-0!"
      />
    </>
  );
}
