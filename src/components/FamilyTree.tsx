import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  type Node,
  type Edge,
  useNodesState,
  useEdgesState,
  useReactFlow,
  ReactFlowProvider,
  MarkerType,
} from "reactflow";
import dagre from "dagre";
import "reactflow/dist/style.css";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { MemberNode, type MemberNodeData } from "./MemberNode";
import { useFamily } from "@/lib/family-store";
import { displayName, useI18n } from "@/lib/i18n";
import { useNavigate } from "@tanstack/react-router";
import type { FamilyMember } from "@/lib/family-types";

const NODE_W = 280;
const NODE_H = 110;
const nodeTypes = { member: MemberNode };

function layout(members: FamilyMember[], collapsed: Set<string>, onOpen: (id: string) => void, highlightId: string | null) {
  // Determine which members to render: hide descendants under collapsed nodes
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
    const kids = childrenMap.get(id) ?? [];
    for (const k of kids) {
      if (!hidden.has(k)) {
        hidden.add(k);
        walk(k);
      }
    }
  };
  for (const c of collapsed) walk(c);

  // Don't render spouses as their own node — attach to primary. Choose primary as the one with parents in tree, or male.
  const spousePairs = new Map<string, string>(); // primaryId -> spouseId
  const renderedAsSpouse = new Set<string>();
  for (const m of members) {
    if (hidden.has(m.id) || renderedAsSpouse.has(m.id)) continue;
    if (!m.spouse_id) continue;
    const sp = members.find((x) => x.id === m.spouse_id);
    if (!sp || hidden.has(sp.id)) continue;
    if (renderedAsSpouse.has(sp.id) || spousePairs.has(sp.id)) continue;
    // primary: one with a father in members (descendant in this lineage), else male
    const mHasParent = !!m.father_id || !!m.mother_id;
    const sHasParent = !!sp.father_id || !!sp.mother_id;
    let primary = m, secondary = sp;
    if (sHasParent && !mHasParent) { primary = sp; secondary = m; }
    else if (mHasParent === sHasParent && sp.gender === "male" && m.gender !== "male") { primary = sp; secondary = m; }
    spousePairs.set(primary.id, secondary.id);
    renderedAsSpouse.add(secondary.id);
  }

  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: "TB", nodesep: 80, ranksep: 120, marginx: 40, marginy: 40 });
  g.setDefaultEdgeLabel(() => ({}));

  const renderedIds = members
    .filter((m) => !hidden.has(m.id) && !renderedAsSpouse.has(m.id))
    .map((m) => m.id);

  for (const id of renderedIds) {
    const hasSpouse = spousePairs.has(id);
    g.setNode(id, { width: hasSpouse ? NODE_W * 2 + 60 : NODE_W, height: NODE_H });
  }

  const edges: Edge[] = [];
  for (const m of members) {
    if (hidden.has(m.id) || renderedAsSpouse.has(m.id)) continue;
    const parentId = m.father_id ?? m.mother_id;
    if (!parentId) continue;
    // map to whoever the parent is rendered as
    let renderedParent = parentId;
    if (renderedAsSpouse.has(parentId)) {
      // find primary
      for (const [p, s] of spousePairs) if (s === parentId) { renderedParent = p; break; }
    }
    if (!renderedIds.includes(renderedParent)) continue;
    g.setEdge(renderedParent, m.id);
    edges.push({
      id: `${renderedParent}->${m.id}`,
      source: renderedParent,
      target: m.id,
      type: "smoothstep",
      style: { stroke: "hsl(var(--muted-foreground) / 0.4)", strokeWidth: 1.5 },
      markerEnd: { type: MarkerType.ArrowClosed, color: "hsl(var(--muted-foreground) / 0.5)" },
    });
  }

  dagre.layout(g);

  const nodes: Node<MemberNodeData>[] = renderedIds.map((id) => {
    const m = members.find((x) => x.id === id)!;
    const pos = g.node(id);
    const spouseId = spousePairs.get(id);
    const spouse = spouseId ? members.find((x) => x.id === spouseId) : undefined;
    return {
      id,
      type: "member",
      position: { x: pos.x - pos.width / 2, y: pos.y - pos.height / 2 },
      data: { member: m, spouse, highlighted: highlightId === id || highlightId === spouseId, onOpen },
      draggable: false,
    };
  });

  return { nodes, edges };
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

  const onOpen = useCallback((id: string) => {
    navigate({ to: "/member/$id", params: { id } });
  }, [navigate]);

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
      setCenter(node.position.x + NODE_W / 2, node.position.y + NODE_H / 2, { zoom: 1.1, duration: 500 });
    } else {
      // member may be hidden under collapsed branch — expand all
      setCollapsed(new Set());
      setTimeout(() => {
        const n = initialNodes.find((x) => x.id === id);
        if (n) setCenter(n.position.x, n.position.y, { zoom: 1.1, duration: 500 });
      }, 50);
    }
  };

  // Build collapse overlay buttons
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
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex justify-center p-4">
        <div className="pointer-events-auto w-full max-w-md">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground ltr:left-3 rtl:right-3" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("search_placeholder")}
              className="bg-card ltr:pl-9 rtl:pr-9"
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
                    <div className="text-xs text-muted-foreground">{lang === "ar" ? m.name_en : m.name_ar}</div>
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      </div>

      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        minZoom={0.1}
        maxZoom={2}
        proOptions={{ hideAttribution: true }}
        fitView
      >
        <Background gap={24} className="!bg-background" />
        <MiniMap pannable zoomable className="!bg-card !border" />
        <Controls className="!bg-card !border" />
      </ReactFlow>

      {/* collapse buttons overlay */}
      <div className="pointer-events-none absolute inset-0">
        {/* using absolute positioning relative to react-flow not feasible without transform; skip overlay collapse, use node-level toggle via right corner button (rendered separately) */}
      </div>

      {/* Collapse panel */}
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
