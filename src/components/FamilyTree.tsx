import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  type Node,
  type Edge,
  type Connection,
  useNodesState,
  useEdgesState,
  useReactFlow,
  ReactFlowProvider,
  MarkerType,
  updateEdge,
} from "reactflow";
import dagre from "dagre";
import "reactflow/dist/style.css";
import { Search, X, Info, LayoutGrid } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { MemberNode, type MemberNodeData } from "./MemberNode";
import { RelationshipEdge } from "./RelationshipEdge";
import { familyStore, useFamily } from "@/lib/family-store";
import { displayName, useI18n } from "@/lib/i18n";
import { useNavigate } from "@tanstack/react-router";
import type { FamilyMember } from "@/lib/family-types";
import { computeWivesByHusband, wifeColorFor } from "@/lib/wife-colors";

const NODE_W = 260;
const NODE_H = 130;
const NODE_H_HUSBAND = 190; // taller when wives chips are rendered
const nodeTypes = { member: MemberNode };
const edgeTypes = { relationship: RelationshipEdge };

function yearOf(m: FamilyMember): number | null {
  const y = m.birth_date?.slice(0, 4);
  const n = y ? parseInt(y, 10) : NaN;
  return Number.isFinite(n) ? n : null;
}

function layout(
  members: FamilyMember[],
  collapsed: Set<string>,
  onOpen: (id: string) => void,
  highlightId: string | null,
) {
  const childrenMap = new Map<string, string[]>();
  for (const m of members) {
    for (const pid of [m.father_id, m.mother_id]) {
      if (pid) {
        if (!childrenMap.has(pid)) childrenMap.set(pid, []);
        childrenMap.get(pid)!.push(m.id);
      }
    }
  }
  const hidden = new Set<string>();
  const walk = (id: string) => {
    for (const k of childrenMap.get(id) ?? []) {
      if (!hidden.has(k)) {
        hidden.add(k);
        walk(k);
      }
    }
  };
  for (const c of collapsed) walk(c);

  const wivesByHusband = computeWivesByHusband(members);

  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: "TB", nodesep: 120, ranksep: 180, marginx: 40, marginy: 40 });
  g.setDefaultEdgeLabel(() => ({}));

  const memberById = new Map(members.map((m) => [m.id, m]));
  const renderedIds = members.filter((m) => !hidden.has(m.id)).map((m) => m.id);
  for (const id of renderedIds) {
    const m = memberById.get(id)!;
    const h = wivesByHusband.has(id) ? NODE_H_HUSBAND : NODE_H;
    void m;
    g.setNode(id, { width: NODE_W, height: h });
  }

  const edges: Edge[] = [];

  const DEFAULT_EDGE_COLOR = "#64748b";
  const mkStyle = (color: string) => ({ stroke: color, strokeWidth: 2, strokeOpacity: 0.95 });
  const mkArrow = (color: string) => ({
    type: MarkerType.ArrowClosed,
    color,
    width: 16,
    height: 16,
  });

  // Parent → child edges. Source card is the husband (father). Color is
  // determined by the mother's index in the father's wives list, so children
  // of different mothers get different colored edges. Children with only a
  // mother connect from the mother's card with the default neutral color.
  for (const m of members) {
    if (hidden.has(m.id)) continue;
    const fId = m.father_id && renderedIds.includes(m.father_id) ? m.father_id : undefined;
    const mId = m.mother_id && renderedIds.includes(m.mother_id) ? m.mother_id : undefined;

    if (fId) {
      let color = DEFAULT_EDGE_COLOR;
      if (mId) {
        const wives = wivesByHusband.get(fId) ?? [];
        const idx = wives.findIndex((w) => w.id === mId);
        if (idx >= 0) color = wifeColorFor(idx).stroke;
      }
      g.setEdge(fId, m.id);
      edges.push({
        id: `p:${fId}:${m.id}`,
        source: fId,
        target: m.id,
        sourceHandle: "child-out",
        targetHandle: "parent-in",
        type: "relationship",
        style: mkStyle(color),
        markerEnd: mkArrow(color),
        data: { parentId: fId, childId: m.id, kind: "parent" },
      });
    } else if (mId) {
      g.setEdge(mId, m.id);
      edges.push({
        id: `p:${mId}:${m.id}`,
        source: mId,
        target: m.id,
        sourceHandle: "child-out",
        targetHandle: "parent-in",
        type: "relationship",
        style: mkStyle(DEFAULT_EDGE_COLOR),
        markerEnd: mkArrow(DEFAULT_EDGE_COLOR),
        data: { parentId: mId, childId: m.id, kind: "parent" },
      });
    }
  }

  // spouse "married to" edges (dotted, no arrow)
  const spouseSeen = new Set<string>();
  for (const m of members) {
    if (hidden.has(m.id) || !m.spouse_id) continue;
    const sp = memberById.get(m.spouse_id);
    if (!sp || hidden.has(sp.id)) continue;
    const key = [m.id, sp.id].sort().join("~");
    if (spouseSeen.has(key)) continue;
    spouseSeen.add(key);
    edges.push({
      id: `spouse:${key}`,
      source: m.id,
      target: sp.id,
      sourceHandle: "spouse-r",
      targetHandle: "spouse-l",
      type: "straight",
      style: { stroke: "#a855f7", strokeWidth: 1.5, strokeDasharray: "2 4", strokeOpacity: 0.7 },
      data: { kind: "spouse" },
    });
  }

  dagre.layout(g);

  // Align generations by time period (25-year cohorts).
  const COHORT = 25;
  const ROW_H = 320;
  const years = renderedIds
    .map((id) => yearOf(memberById.get(id)!))
    .filter((y): y is number => y !== null);
  const minYear = years.length ? Math.min(...years) : 1900;
  const baseYearBucket = Math.floor(minYear / COHORT);

  const bucketFor = (m: FamilyMember): number | null => {
    const y = yearOf(m);
    if (y !== null) return Math.floor(y / COHORT) - baseYearBucket;
    const parents = [m.father_id, m.mother_id]
      .map((pid) => (pid ? memberById.get(pid) : undefined))
      .filter(Boolean) as FamilyMember[];
    const parentBuckets = parents.map(bucketFor).filter((b): b is number => b !== null);
    if (parentBuckets.length) return Math.max(...parentBuckets) + 1;
    return null;
  };

  const nodes: Node<MemberNodeData>[] = renderedIds.map((id) => {
    const m = memberById.get(id)!;
    const pos = g.node(id);
    const b = bucketFor(m);
    const autoY = b !== null ? b * ROW_H : pos.y - pos.height / 2;
    const autoX = pos.x - pos.width / 2;
    const hasCustom = typeof m.pos_x === "number" && typeof m.pos_y === "number";
    return {
      id,
      type: "member",
      position: hasCustom ? { x: m.pos_x!, y: m.pos_y! } : { x: autoX, y: autoY },
      data: {
        member: m,
        highlighted: highlightId === id,
        onOpen,
        wives: wivesByHusband.get(id),
      },
      draggable: true,
    };
  });

  // Place spouses side-by-side (husband left, wife right) at the same Y,
  // unless either partner has been manually positioned.
  const SPOUSE_GAP = 80;
  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const pairSeen = new Set<string>();
  for (const m of members) {
    if (!m.spouse_id) continue;
    const a = nodeById.get(m.id);
    const b = nodeById.get(m.spouse_id);
    if (!a || !b) continue;
    const key = [a.id, b.id].sort().join("~");
    if (pairSeen.has(key)) continue;
    pairSeen.add(key);
    const ma = memberById.get(a.id)!;
    const mb = memberById.get(b.id)!;
    if (typeof ma.pos_x === "number" || typeof mb.pos_x === "number") continue;
    const [left, right] = ma.gender === "male" ? [a, b] : [b, a];
    const centerX = (a.position.x + b.position.x) / 2 + NODE_W / 2;
    const y = Math.max(a.position.y, b.position.y);
    left.position = { x: centerX - NODE_W - SPOUSE_GAP / 2, y };
    right.position = { x: centerX + SPOUSE_GAP / 2, y };
  }

  // Collision resolution — enforce a minimum horizontal gap per row, so no
  // card overlaps another. Rows are grouped by rounded Y so slight vertical
  // differences (e.g. tall husband cards next to short ones) still count as
  // the same visual row.
  const ROW_KEY = (y: number) => Math.round(y / 60) * 60;
  const rows = new Map<number, Node<MemberNodeData>[]>();
  for (const n of nodes) {
    const k = ROW_KEY(n.position.y);
    if (!rows.has(k)) rows.set(k, []);
    rows.get(k)!.push(n);
  }
  const HGAP = 40;
  for (const arr of rows.values()) {
    arr.sort((a, b) => a.position.x - b.position.x);
    for (let i = 1; i < arr.length; i++) {
      const prev = arr[i - 1];
      const minX = prev.position.x + NODE_W + HGAP;
      if (arr[i].position.x < minX) arr[i].position.x = minX;
    }
  }

  return { nodes, edges };
}

function isDescendant(members: FamilyMember[], ancestorId: string, targetId: string): boolean {
  const stack = [ancestorId];
  const seen = new Set<string>();
  while (stack.length) {
    const cur = stack.pop()!;
    if (seen.has(cur)) continue;
    seen.add(cur);
    for (const m of members) {
      if (m.father_id === cur || m.mother_id === cur) {
        if (m.id === targetId) return true;
        stack.push(m.id);
      }
    }
  }
  return false;
}

function Inner() {
  const members = useFamily();
  const { t, lang } = useI18n();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const { setCenter, fitView } = useReactFlow();
  const didFit = useRef(false);
  const edgeUpdateSuccessful = useRef(true);

  const onOpen = useCallback(
    (id: string) => {
      navigate({ to: "/member/$id", params: { id } });
    },
    [navigate],
  );

  const { nodes: initialNodes, edges: initialEdges } = useMemo(
    () => layout(members, collapsed, onOpen, highlightId),
    [members, collapsed, onOpen, highlightId],
  );

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  useEffect(() => {
    setNodes(initialNodes);
    setEdges(initialEdges);
    if (!didFit.current && initialNodes.length) {
      requestAnimationFrame(() => fitView({ padding: 0.2, duration: 300 }));
      didFit.current = true;
    }
  }, [initialNodes, initialEdges, setNodes, setEdges, fitView]);

  const onConnect = useCallback(
    (conn: Connection) => {
      if (!conn.source || !conn.target) return;
      if (conn.source === conn.target) {
        toast.error(t("cannot_link_self"));
        return;
      }
      const parent = familyStore.get(conn.source);
      const child = familyStore.get(conn.target);
      if (!parent || !child) return;
      if (isDescendant(familyStore.getAll(), conn.target, conn.source)) {
        toast.error(t("cannot_link_cycle"));
        return;
      }
      const key = parent.gender === "male" ? "father_id" : "mother_id";
      familyStore.update(child.id, { [key]: parent.id } as Partial<FamilyMember>);
      toast.success(`${displayName(parent, lang)} → ${displayName(child, lang)}`);
    },
    [t, lang],
  );

  const onEdgesDelete = useCallback(
    (removed: Edge[]) => {
      let cleared = 0;
      for (const e of removed) {
        const data = e.data as
          | { parentId?: string; childId?: string; kind?: string }
          | undefined;
        if (data?.kind === "spouse") {
          const a = familyStore.get(e.source);
          const b = familyStore.get(e.target);
          if (a) familyStore.update(a.id, { spouse_id: undefined } as Partial<FamilyMember>);
          if (b) familyStore.update(b.id, { spouse_id: undefined } as Partial<FamilyMember>);
          cleared++;
          continue;
        }
        if (!data?.childId || !data?.parentId) continue;
        const child = familyStore.get(data.childId);
        const parent = familyStore.get(data.parentId);
        if (!child || !parent) continue;
        const key = parent.gender === "male" ? "father_id" : "mother_id";
        familyStore.update(child.id, { [key]: undefined } as Partial<FamilyMember>);
        cleared++;
      }
      if (cleared) toast.success(t("link_removed"));
    },
    [t],
  );

  // Reconnecting an edge's source or target (drag either endpoint to another node).
  const onEdgeUpdateStart = useCallback(() => {
    edgeUpdateSuccessful.current = false;
  }, []);

  const onEdgeUpdate = useCallback(
    (oldEdge: Edge, newConn: Connection) => {
      edgeUpdateSuccessful.current = true;
      if (!newConn.source || !newConn.target) return;
      const data = oldEdge.data as
        | { parentId?: string; childId?: string; kind?: string }
        | undefined;

      // Spouse edge reconnection: just move spouse link.
      if (data?.kind === "spouse") {
        const oldA = familyStore.get(oldEdge.source);
        const oldB = familyStore.get(oldEdge.target);
        if (oldA) familyStore.update(oldA.id, { spouse_id: undefined } as Partial<FamilyMember>);
        if (oldB) familyStore.update(oldB.id, { spouse_id: undefined } as Partial<FamilyMember>);
        familyStore.update(newConn.source, {
          spouse_id: newConn.target,
        } as Partial<FamilyMember>);
        setEdges((es) => updateEdge(oldEdge, newConn, es));
        toast.success(t("link_updated"));
        return;
      }

      if (!data?.parentId || !data?.childId) return;
      const oldParent = familyStore.get(data.parentId);
      const oldChild = familyStore.get(data.childId);
      if (!oldParent || !oldChild) return;
      const oldRole = oldParent.gender === "male" ? "father_id" : "mother_id";

      const newSource = familyStore.get(newConn.source);
      const newTarget = familyStore.get(newConn.target);
      if (!newSource || !newTarget) return;
      if (newConn.source === newConn.target) {
        toast.error(t("cannot_link_self"));
        return;
      }

      // Determine new (parent, child) mapping from the reconnected endpoints.
      // The parent is whichever endpoint kept/became the source; the child is
      // the target. If the user reversed them, treat source as parent still.
      const newParent = newSource;
      const newChild = newTarget;
      if (isDescendant(familyStore.getAll(), newChild.id, newParent.id)) {
        toast.error(t("cannot_link_cycle"));
        return;
      }
      const newRole = newParent.gender === "male" ? "father_id" : "mother_id";

      // Clear the old parent link on the old child.
      familyStore.update(oldChild.id, { [oldRole]: undefined } as Partial<FamilyMember>);
      // Apply the new parent link on the new child.
      familyStore.update(newChild.id, { [newRole]: newParent.id } as Partial<FamilyMember>);
      setEdges((es) => updateEdge(oldEdge, newConn, es));
      toast.success(t("link_updated"));
    },
    [setEdges, t],
  );

  const onEdgeUpdateEnd = useCallback(
    (_evt: unknown, edge: Edge) => {
      if (!edgeUpdateSuccessful.current) {
        // dropped in empty space → delete
        setEdges((es) => es.filter((e) => e.id !== edge.id));
        onEdgesDelete([edge]);
      }
      edgeUpdateSuccessful.current = true;
    },
    [setEdges, onEdgesDelete],
  );

  const onNodeDragStop = useCallback((_e: unknown, node: Node) => {
    if (node.type !== "member") return;
    familyStore.setPosition(node.id, { x: node.position.x, y: node.position.y });
  }, []);

  const onAutoLayout = useCallback(() => {
    familyStore.clearPositions();
    didFit.current = false;
    requestAnimationFrame(() => fitView({ padding: 0.2, duration: 400 }));
    toast.success(t("auto_layout_done"));
  }, [fitView, t]);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return members
      .filter((m) => m.name_en.toLowerCase().includes(q) || m.name_ar.includes(query.trim()))
      .slice(0, 8);
  }, [query, members]);

  const focusMember = (id: string) => {
    setHighlightId(id);
    setQuery("");
    const node = initialNodes.find((n) => n.id === id);
    if (node) {
      setCenter(node.position.x + NODE_W / 2, node.position.y + NODE_H / 2, {
        zoom: 1.1,
        duration: 500,
      });
    } else {
      setCollapsed(new Set());
    }
  };

  const childrenMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const m of members) {
      for (const pid of [m.father_id, m.mother_id]) {
        if (pid) map.set(pid, (map.get(pid) ?? 0) + 1);
      }
    }
    return map;
  }, [members]);

  return (
    <div className="relative h-full w-full">
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex flex-col items-center gap-2 p-4">
        <div className="pointer-events-auto w-full max-w-md">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground ltr:left-3 rtl:right-3" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("search_placeholder")}
              className="bg-card shadow-sm ltr:pl-9 rtl:pr-9"
            />
            {query && (
              <button
                onClick={() => setQuery("")}
                className="absolute top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground ltr:right-3 rtl:left-3"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          {query && (
            <div className="mt-1 max-h-72 overflow-y-auto rounded-md border bg-popover shadow-lg">
              {matches.length === 0 ? (
                <div className="p-3 text-sm text-muted-foreground">{t("no_results")}</div>
              ) : (
                matches.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => focusMember(m.id)}
                    className="block w-full p-2 text-start text-sm hover:bg-accent"
                  >
                    <div className="font-medium">{displayName(m, lang)}</div>
                    <div className="text-xs text-muted-foreground">
                      {lang === "ar" ? m.name_en : m.name_ar}
                    </div>
                  </button>
                ))
              )}
            </div>
          )}
        </div>
        <div className="pointer-events-auto flex flex-wrap items-center justify-center gap-2">
          <div className="inline-flex items-center gap-2 rounded-full border bg-card/90 px-3 py-1 text-[11px] text-muted-foreground shadow-sm backdrop-blur">
            <Info className="h-3 w-3" />
            {t("connect_hint")}
          </div>
          <Button size="sm" variant="secondary" onClick={onAutoLayout} className="gap-1.5 shadow-sm">
            <LayoutGrid className="h-3.5 w-3.5" />
            {t("auto_layout")}
          </Button>
        </div>
      </div>

      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onEdgesDelete={onEdgesDelete}
        onEdgeUpdate={onEdgeUpdate}
        onEdgeUpdateStart={onEdgeUpdateStart}
        onEdgeUpdateEnd={onEdgeUpdateEnd}
        onNodeDragStop={onNodeDragStop}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        edgesUpdatable
        edgesFocusable
        minZoom={0.1}
        maxZoom={2}
        proOptions={{ hideAttribution: true }}
        connectionLineStyle={{ stroke: "#0ea5e9", strokeWidth: 2, strokeDasharray: "6 4" }}
        defaultEdgeOptions={{ type: "relationship", focusable: true, deletable: true, updatable: true }}
        deleteKeyCode={["Backspace", "Delete"]}
        fitView
      >
        <Background gap={24} className="!bg-background" />
        <MiniMap pannable zoomable className="!bg-card !border" />
        <Controls className="!bg-card !border" />
      </ReactFlow>

      <div className="absolute bottom-4 ltr:right-4 rtl:left-4 z-10 max-w-xs rounded-lg border bg-card p-2 text-xs shadow-sm">
        <div className="mb-1 px-1 font-semibold text-card-foreground">{t("generation")}</div>
        <div className="flex max-h-32 flex-wrap gap-1 overflow-y-auto">
          {[...childrenMap.entries()]
            .sort((a, b) => b[1] - a[1])
            .slice(0, 12)
            .map(([id, count]) => {
              const m = members.find((x) => x.id === id)!;
              const isCollapsed = collapsed.has(id);
              return (
                <Button
                  key={id}
                  size="sm"
                  variant={isCollapsed ? "secondary" : "outline"}
                  className="h-6 px-2 text-[10px]"
                  onClick={() => {
                    const next = new Set(collapsed);
                    if (isCollapsed) next.delete(id);
                    else next.add(id);
                    setCollapsed(next);
                  }}
                >
                  {isCollapsed ? "+" : "−"} {displayName(m, lang)} ({count})
                </Button>
              );
            })}
        </div>
      </div>
    </div>
  );
}

export function FamilyTree() {
  return (
    <ReactFlowProvider>
      <Inner />
    </ReactFlowProvider>
  );
}
