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
} from "reactflow";
import dagre from "dagre";
import "reactflow/dist/style.css";
import { Search, X, Info } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { MemberNode, type MemberNodeData } from "./MemberNode";
import { UnionNode } from "./UnionNode";
import { familyStore, useFamily } from "@/lib/family-store";
import { displayName, useI18n } from "@/lib/i18n";
import { useNavigate } from "@tanstack/react-router";
import type { FamilyMember } from "@/lib/family-types";

const NODE_W = 280;
const NODE_H = 130;
const nodeTypes = { member: MemberNode, union: UnionNode };

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

  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: "TB", nodesep: 80, ranksep: 140, marginx: 40, marginy: 40 });
  g.setDefaultEdgeLabel(() => ({}));

  const renderedIds = members.filter((m) => !hidden.has(m.id)).map((m) => m.id);
  for (const id of renderedIds) g.setNode(id, { width: NODE_W, height: NODE_H });

  const edges: Edge[] = [];
  const memberById = new Map(members.map((m) => [m.id, m]));

  for (const m of members) {
    if (hidden.has(m.id)) continue;
    for (const parentId of [m.father_id, m.mother_id]) {
      if (!parentId || !renderedIds.includes(parentId)) continue;
      const parent = memberById.get(parentId);
      const isFather = parent?.gender === "male";
      const color = isFather ? "#0ea5e9" : "#ec4899";
      g.setEdge(parentId, m.id);
      edges.push({
        id: `${parentId}->${m.id}`,
        source: parentId,
        target: m.id,
        sourceHandle: "child-out",
        targetHandle: "parent-in",
        type: "smoothstep",
        style: isFather
          ? { stroke: color, strokeWidth: 1.5, strokeOpacity: 0.55, strokeDasharray: "6 4" }
          : { stroke: color, strokeWidth: 2.25, strokeOpacity: 0.9 },
        markerEnd: { type: MarkerType.ArrowClosed, color, width: 14, height: 14 },
        data: { parentId, childId: m.id },
      });
    }
  }

  // spouse "married to" edges (dotted, no arrow) — for reference; supports many
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
    });
  }

  dagre.layout(g);

  // Align generations by time period: override Y using birth year when available.
  // Bucket by 25-year cohorts so siblings/cousins align.
  const COHORT = 25;
  const ROW_H = 260;
  const years = renderedIds
    .map((id) => yearOf(memberById.get(id)!))
    .filter((y): y is number => y !== null);
  const minYear = years.length ? Math.min(...years) : 1900;
  const baseYearBucket = Math.floor(minYear / COHORT);

  const bucketFor = (m: FamilyMember): number | null => {
    const y = yearOf(m);
    if (y !== null) return Math.floor(y / COHORT) - baseYearBucket;
    // fall back: one deeper than max parent bucket
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
    const y = b !== null ? b * ROW_H : pos.y - pos.height / 2;
    return {
      id,
      type: "member",
      position: { x: pos.x - pos.width / 2, y },
      data: {
        member: m,
        highlighted: highlightId === id,
        onOpen,
      },
      draggable: false,
    };
  });

  // Place spouses side-by-side: same Y, husband on left, wife on right.
  const SPOUSE_GAP = 40;
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
    const [left, right] = ma.gender === "male" ? [a, b] : [b, a];
    const centerX = (a.position.x + b.position.x) / 2 + NODE_W / 2;
    const y = Math.max(a.position.y, b.position.y);
    left.position = { x: centerX - NODE_W - SPOUSE_GAP / 2, y };
    right.position = { x: centerX + SPOUSE_GAP / 2, y };
  }

  return { nodes, edges };
}


function isDescendant(members: FamilyMember[], ancestorId: string, targetId: string): boolean {
  // returns true if targetId is a descendant of ancestorId
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
      // cycle check: parent must not be a descendant of child
      if (isDescendant(familyStore.getAll(), conn.target, conn.source)) {
        toast.error(t("cannot_link_cycle"));
        return;
      }
      const key = parent.gender === "male" ? "father_id" : "mother_id";
      familyStore.update(child.id, { [key]: parent.id } as any);
      toast.success(`${displayName(parent, lang)} → ${displayName(child, lang)}`);
    },
    [t, lang],
  );

  const onEdgesDelete = useCallback(
    (removed: Edge[]) => {
      for (const e of removed) {
        const data = e.data as { parentId?: string; childId?: string } | undefined;
        if (!data?.parentId || !data?.childId) continue;
        const parent = familyStore.get(data.parentId);
        const child = familyStore.get(data.childId);
        if (!parent || !child) continue;
        const key = parent.gender === "male" ? "father_id" : "mother_id";
        familyStore.update(child.id, { [key]: undefined } as any);
      }
      if (removed.length) toast.success(t("link_removed"));
    },
    [t],
  );

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
        <div className="pointer-events-auto inline-flex items-center gap-2 rounded-full border bg-card/90 px-3 py-1 text-[11px] text-muted-foreground shadow-sm backdrop-blur">
          <Info className="h-3 w-3" />
          {t("connect_hint")}
        </div>
      </div>

      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onEdgesDelete={onEdgesDelete}
        nodeTypes={nodeTypes}
        minZoom={0.1}
        maxZoom={2}
        proOptions={{ hideAttribution: true }}
        connectionLineStyle={{ stroke: "#0ea5e9", strokeWidth: 2, strokeDasharray: "6 4" }}
        defaultEdgeOptions={{ type: "smoothstep" }}
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
