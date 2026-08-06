import type { HTMLAttributes, RefObject } from "react";
import ReactFlow, {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  Panel,
  type ReactFlowProps,
  type Viewport,
} from "reactflow";
import { FamilyTreeDialogs, type FamilyTreeDialogsProps } from "./family-tree-dialogs";
import { FamilyTreeSidebar, type FamilyTreeSidebarProps } from "./family-tree-sidebar";
import { FamilyTreeTopbar, type FamilyTreeTopbarProps } from "./family-tree-topbar";
import { EditToolbar } from "./family-tree-topbar";
import { MemberNode } from "./member-node";
import { RelationshipEdge } from "./relationship-edge";

const nodeTypes = { member: MemberNode };
const edgeTypes = { relationship: RelationshipEdge };

interface ChronologicalOverlay {
  end: number;
  start: number;
  top: number;
}

interface MarqueeRect {
  height: number;
  width: number;
  x: number;
  y: number;
}

interface FamilyTreeViewProps {
  canvasHandlers: Pick<
    HTMLAttributes<HTMLDivElement>,
    | "onLostPointerCapture"
    | "onPointerCancelCapture"
    | "onPointerDownCapture"
    | "onPointerMoveCapture"
    | "onPointerUpCapture"
    | "onWheel"
  >;
  canvasRef: RefObject<HTMLDivElement | null>;
  chronologicalOverlay?: ChronologicalOverlay;
  dialogs: FamilyTreeDialogsProps;
  flow: ReactFlowProps;
  flowKey: string;
  marqueeRect: MarqueeRect | null;
  onViewportChange: (viewport: Viewport) => void;
  sidebar: FamilyTreeSidebarProps;
  topbar: FamilyTreeTopbarProps;
}

export function FamilyTreeView(props: FamilyTreeViewProps) {
  return (
    <div
      ref={props.canvasRef}
      className={`family-canvas relative h-full w-full ${props.marqueeRect ? "is-marquee-selecting" : ""}`}
      {...props.canvasHandlers}
    >
      <FamilyTreeTopbar {...props.topbar} />
      <ReactFlow
        key={props.flowKey}
        {...props.flow}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        minZoom={0.1}
        maxZoom={2}
        selectionOnDrag={false}
        panOnDrag={[0, 1]}
        panActivationKeyCode={null}
        multiSelectionKeyCode={["Meta", "Control"]}
        selectionKeyCode={null}
        zoomOnScroll={false}
        panOnScroll={false}
        zoomOnPinch={false}
        zoomOnDoubleClick={false}
        proOptions={{ hideAttribution: true }}
        connectionLineStyle={{ stroke: "#0ea5e9", strokeWidth: 2, strokeDasharray: "6 4" }}
        deleteKeyCode={null}
        fitView
        onMove={(_event, viewport) => props.onViewportChange(viewport)}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={20}
          size={1.35}
          color="var(--color-border)"
          className="bg-muted/20!"
        />
        {props.chronologicalOverlay && <ChronologicalGuide {...props.chronologicalOverlay} />}
        <Panel
          position="top-right"
          className="z-10! flex max-h-[calc(100%-5rem)] max-w-[calc(100%-2rem)] flex-col items-end gap-2"
          style={{ margin: 0, right: 16, top: 64 }}
        >
          {props.topbar.canEdit ? <EditToolbar {...props.topbar} /> : null}
          <FamilyTreeSidebar {...props.sidebar} />
          <MiniMap
            pannable
            zoomable
            position="top-right"
            nodeStrokeWidth={3}
            maskColor="color-mix(in oklab, var(--color-background) 72%, transparent)"
            className="canvas-minimap! m-0! shrink-0 overflow-hidden! rounded-xl! border! border-border/80! bg-card/95! shadow-lg!"
            style={{ position: "relative", inset: "auto" }}
          />
        </Panel>
        <Controls
          showInteractive={false}
          position="bottom-left"
          className="canvas-controls! overflow-hidden! rounded-xl! border! border-border/80! bg-card/95! p-1! shadow-lg!"
        />
      </ReactFlow>
      {props.marqueeRect && <Marquee rect={props.marqueeRect} />}
      <FamilyTreeDialogs {...props.dialogs} />
    </div>
  );
}

function ChronologicalGuide({ end, start, top }: ChronologicalOverlay) {
  return (
    <div
      className="pointer-events-none absolute inset-x-0 z-0 border-t-2 border-dashed border-primary/25"
      style={{ top }}
    >
      <span className="ms-3 rounded-b bg-background/90 px-2 py-1 text-[10px] font-medium text-muted-foreground">
        {start}
        {"\u2013"}
        {end}
      </span>
    </div>
  );
}

function Marquee({ rect }: { rect: MarqueeRect }) {
  return (
    <div
      className="pointer-events-none absolute z-5 border border-primary bg-primary/10"
      style={{ left: rect.x, top: rect.y, width: rect.width, height: rect.height }}
      aria-hidden="true"
    />
  );
}
