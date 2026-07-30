import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactFlow, {
  Background,
  BackgroundVariant,
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
import { Search, X, LayoutGrid, CalendarRange, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/shared/ui/input";
import { Button } from "@/shared/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog";
import { MemberNode, type MemberNodeData } from "./member-node";
import { RelationshipEdge } from "./relationship-edge";
import {
  computeWivesByHusband,
  familyStore,
  useFamily,
  useFamilyPersistence,
  wifeColorFor,
} from "@/features/trees";
import { displayName, ordinal, useI18n } from "@/shared/i18n";
import { Link, useNavigate } from "@tanstack/react-router";
import type { FamilyMember } from "@/features/members";

const NODE_W = 260;
const NODE_H = 130;
const NODE_H_HUSBAND = 220;
const FAMILY_ROW_H = 340;
const DECADE_ROW_H = 520;
const DECADE_CARD_GAP = 140;
const nodeTypes = { member: MemberNode };
const edgeTypes = { relationship: RelationshipEdge };

type GenerationBand = { start: number; end: number };

const birthYear = (member: FamilyMember) => {
  const year = Number.parseInt(member.birth_date?.slice(0, 4) ?? "", 10);
  return Number.isFinite(year) ? year : null;
};

const generationBandFor = (member: FamilyMember): GenerationBand | null => {
  const year = birthYear(member);
  if (year === null) return null;
  const start = Math.floor(year / 10) * 10;
  return { start, end: start + 9 };
};

const generationKey = (band: GenerationBand) => `${band.start}-${band.end}`;

const DIVORCED_COLOR = "#94a3b8";

import { SubfamilyPanel } from "@/features/subfamilies";
import { descendantIds } from "@/features/members";
import { alignDecadeSingleChildren, routeParentEdges } from "../domain/route-edges";
import {
  canvasCapabilities,
  hierarchyPositions,
  type TreePreviewType,
} from "../domain/canvas-preview";
export { SubfamilyPanel };
function layout(
  members: FamilyMember[],
  collapsed: Set<string>,
  onOpen: (id: string) => void,
  onAddParent: (id: string) => void,
  onAddChild: (id: string) => void,
  onRequestRemove: (relationship: { parentId: string; childId: string; motherId?: string }) => void,
  highlightId: string | null,
  editable: boolean,
  chronological = false,
  onToggleCollapsed?: (id: string) => void,
) {
  const memberById = new Map(members.map((m) => [m.id, m]));
  const wivesByHusband = computeWivesByHusband(members);

  // A dependent wife is embedded in the husband's card. A wife with either
  // recorded parent is independently anchored and keeps her own tree card.
  const asWife = new Set<string>();
  const wifeHusbandOf = new Map<string, string>(); // wifeId -> husbandId
  for (const [husbandId, list] of wivesByHusband.entries()) {
    for (const w of list) {
      wifeHusbandOf.set(w.id, husbandId);
      const hasFamily = Boolean(
        (w.father_id && memberById.has(w.father_id)) ||
        (w.mother_id && memberById.has(w.mother_id)),
      );
      if (!hasFamily || w.is_unknown) asWife.add(w.id);
    }
  }

  const childrenMap = new Map<string, string[]>();
  for (const m of members) {
    for (const pid of [m.father_id, m.mother_id]) {
      if (pid) {
        if (!childrenMap.has(pid)) childrenMap.set(pid, []);
        childrenMap.get(pid)!.push(m.id);
      }
    }
  }
  const hidden = new Set<string>(asWife);
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
  g.setGraph({ rankdir: "TB", nodesep: 120, ranksep: 180, marginx: 40, marginy: 40 });
  g.setDefaultEdgeLabel(() => ({}));

  const renderedIds = members.filter((m) => !hidden.has(m.id)).map((m) => m.id);
  for (const id of renderedIds) {
    const h = memberById.get(id)?.gender === "male" ? NODE_H_HUSBAND : NODE_H;
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

  // Parent â†’ child edges. Source is the father's card (husband). Color reflects
  // the mother's index in the father's wife list. If the wife is divorced from
  // the father, use a neutral gray instead.
  for (const m of members) {
    if (hidden.has(m.id)) continue;
    const fId = m.father_id && renderedIds.includes(m.father_id) ? m.father_id : undefined;
    const mId = m.mother_id;

    if (fId) {
      let color = DEFAULT_EDGE_COLOR;
      if (mId) {
        const wives = wivesByHusband.get(fId) ?? [];
        const idx = wives.findIndex((w) => w.id === mId);
        if (idx >= 0) {
          const father = memberById.get(fId);
          const divorced = father?.divorced_from?.includes(mId);
          color = divorced ? DIVORCED_COLOR : wifeColorFor(idx).stroke;
        }
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
        data: {
          parentId: fId,
          childId: m.id,
          motherId: mId,
          canRemove: editable,
          onRequestRemove: () => onRequestRemove({ parentId: fId, childId: m.id, motherId: mId }),
          familyKey: `${fId}:${mId ?? "unknown"}`,
          kind: "parent",
        },
      });
    } else if (mId && renderedIds.includes(mId)) {
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
        data: {
          parentId: mId,
          childId: m.id,
          motherId: mId,
          canRemove: editable,
          familyKey: `${mId}:mother-only`,
          kind: "parent",
          onRequestRemove: () => onRequestRemove({ parentId: mId, childId: m.id, motherId: mId }),
        },
      });
    }
  }

  // Spouse "married to" edges â€” only when both endpoints are still visible.
  const spouseSeen = new Set<string>();
  for (const m of members) {
    if (hidden.has(m.id) || !m.spouse_id) continue;
    // Cousin wife: her marital link is already shown as a chip inside the
    // husband's card; skip drawing the extra spouse edge.
    if (wifeHusbandOf.has(m.id)) continue;
    const sp = memberById.get(m.spouse_id);
    if (!sp || hidden.has(sp.id)) continue;
    if (wifeHusbandOf.has(sp.id)) continue;
    const key = [m.id, sp.id].sort().join("~");
    if (spouseSeen.has(key)) continue;
    spouseSeen.add(key);
    edges.push({
      id: `spouse:${key}`,
      source: m.id,
      target: sp.id,
      sourceHandle: "spouse-r",
      targetHandle: "spouse-l",
      type: "relationship",
      style: { stroke: "#a855f7", strokeWidth: 1.5, strokeDasharray: "2 4", strokeOpacity: 0.7 },
      data: { kind: "spouse", familyKey: `spouse:${key}` },
    });
  }

  dagre.layout(g);
  const hierarchy = hierarchyPositions(members, new Set(renderedIds));

  // Generation depth â€” sons, cousins, second cousins etc. share a level.
  const genCache = new Map<string, number>();
  const genOf = (id: string, seen = new Set<string>()): number => {
    if (genCache.has(id)) return genCache.get(id)!;
    if (seen.has(id)) return 0;
    seen.add(id);
    const m = memberById.get(id);
    if (!m) return 0;
    const parents: number[] = [];
    if (m.father_id && memberById.has(m.father_id)) parents.push(genOf(m.father_id, seen) + 1);
    if (m.mother_id && memberById.has(m.mother_id)) parents.push(genOf(m.mother_id, seen) + 1);
    const g = parents.length ? Math.max(...parents) : 0;
    genCache.set(id, g);
    return g;
  };

  const nodes: Node<MemberNodeData>[] = renderedIds.map((id) => {
    const m = memberById.get(id)!;
    const pos = g.node(id);
    const band = generationBandFor(m);
    const earliestBand = Math.min(
      ...members
        .map(generationBandFor)
        .filter((value): value is GenerationBand => value !== null)
        .map((value) => value.start),
    );
    const autoY =
      chronological && band && Number.isFinite(earliestBand)
        ? ((band.start - earliestBand) / 10) * DECADE_ROW_H
        : genOf(id) * FAMILY_ROW_H;
    const hierarchyPosition = hierarchy.get(id);
    const autoX = chronological
      ? pos.x - pos.width / 2
      : (hierarchyPosition?.x ?? pos.x - pos.width / 2);
    const hierarchyY = hierarchyPosition?.y ?? genOf(id) * FAMILY_ROW_H;
    const hasCustom = typeof m.pos_x === "number" && typeof m.pos_y === "number";
    const hasDecadeCustom =
      typeof m.decade_pos_x === "number" && typeof m.decade_pos_y === "number";
    return {
      id,
      type: "member",
      position:
        chronological && hasDecadeCustom
          ? { x: m.decade_pos_x!, y: m.decade_pos_y! }
          : hasCustom && !chronological
            ? { x: m.pos_x!, y: m.pos_y! }
            : { x: autoX, y: chronological ? autoY : hierarchyY },
      data: {
        member: m,
        highlighted: highlightId === id,
        onOpen,
        onAddParent,
        onAddChild,
        wives: wivesByHusband.get(id),
        hasDescendants: (childrenMap.get(id)?.length ?? 0) > 0,
        collapsed: collapsed.has(id),
        onToggleCollapsed,
        editable,
      },
      draggable: editable,
      connectable: editable,
    };
  });

  // Collision resolution â€” enforce min horizontal gap per generation row.
  const HGAP = 40;
  const VGAP = 40;
  const fixedIds = new Set(
    members
      .filter((member) =>
        chronological
          ? typeof member.decade_pos_x === "number" && typeof member.decade_pos_y === "number"
          : typeof member.pos_x === "number" && typeof member.pos_y === "number",
      )
      .map((member) => member.id),
  );
  const ordered = [...nodes].sort(
    (a, b) => a.position.y - b.position.y || a.position.x - b.position.x,
  );
  const byRow = new Map<number, Node<MemberNodeData>[]>();
  for (const node of ordered)
    byRow.set(node.position.y, [...(byRow.get(node.position.y) ?? []), node]);
  for (const row of byRow.values()) {
    const layoutRow = row.filter((node) => !fixedIds.has(node.id));
    if (!layoutRow.length) continue;
    if (chronological) {
      const nodeById = new Map(layoutRow.map((node) => [node.id, node]));
      const memberOrder = layoutRow
        .map((node) => node.data.member)
        .sort(
          (first, second) =>
            (hierarchy.get(first.id)?.x ?? 0) - (hierarchy.get(second.id)?.x ?? 0) ||
            (birthYear(second) ?? Number.MIN_SAFE_INTEGER) -
              (birthYear(first) ?? Number.MIN_SAFE_INTEGER) ||
            first.id.localeCompare(second.id),
        );
      const totalWidth =
        memberOrder.length * NODE_W + Math.max(0, memberOrder.length - 1) * DECADE_CARD_GAP;
      memberOrder.forEach((member, index) => {
        const node = nodeById.get(member.id)!;
        node.position.x = index * (NODE_W + DECADE_CARD_GAP) - totalWidth / 2;
      });
      continue;
    }

    // Family Levels already uses subtree widths from hierarchyPositions.
  }
  for (let i = 0; i < ordered.length; i++) {
    const current = ordered[i];
    if (fixedIds.has(current.id)) continue;
    const currentHeight = current.data.member.gender === "male" ? NODE_H_HUSBAND : NODE_H;
    let moved = true;
    while (moved) {
      moved = false;
      for (let j = 0; j < i; j++) {
        const other = ordered[j];
        const otherHeight = other.data.member.gender === "male" ? NODE_H_HUSBAND : NODE_H;
        const overlapsY =
          current.position.y < other.position.y + otherHeight + VGAP &&
          current.position.y + currentHeight + VGAP > other.position.y;
        const overlapsX =
          current.position.x < other.position.x + NODE_W + HGAP &&
          current.position.x + NODE_W + HGAP > other.position.x;
        if (overlapsX && overlapsY) {
          current.position.x = other.position.x + NODE_W + HGAP;
          moved = true;
        }
      }
    }
  }

  if (chronological) alignDecadeSingleChildren(nodes, edges, DECADE_CARD_GAP);
  const routedEdges = routeParentEdges(nodes, edges, chronological);

  return { nodes, edges: routedEdges };
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

function Inner({ readOnly = false, preview }: { readOnly?: boolean; preview: TreePreviewType }) {
  const members = useFamily();
  const persistence = useFamilyPersistence();
  const canEdit = !readOnly && familyStore.canEditActiveTree();
  const canManageSubfamilies = familyStore.canManageSubfamilies();
  const { t, lang } = useI18n();
  const navigate = useNavigate();
  const [collapsedByPreview, setCollapsedByPreview] = useState<
    Record<TreePreviewType, Set<string>>
  >({
    lineage: new Set(),
    chronological: new Set(),
  });
  const [query, setQuery] = useState("");
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [selectedSubfamilyId, setSelectedSubfamilyId] = useState<string | null>(null);
  const [subfamilyFilterEnabled, setSubfamilyFilterEnabled] = useState(false);
  const [generationYear, setGenerationYear] = useState("");
  const [viewport, setViewport] = useState({ x: 0, y: 0, zoom: 1 });
  const previewType = preview;
  const capabilities = canvasCapabilities(canEdit, previewType);
  const canvasCanEdit = capabilities.canMutate;
  const collapsed = collapsedByPreview[previewType];
  const [collapsedWidgets, setCollapsedWidgets] = useState({
    preview: false,
    generation: false,
    subfamilies: false,
  });
  const toggleWidget = (widget: keyof typeof collapsedWidgets) =>
    setCollapsedWidgets((current) => ({ ...current, [widget]: !current[widget] }));
  const { setCenter, fitView } = useReactFlow();
  const didFit = useRef(false);
  const previousPreviewType = useRef<TreePreviewType>(previewType);
  const replacePositionsOnNextLayout = useRef(false);
  const edgeUpdateSuccessful = useRef(true);
  const visibleNodePositions = useRef(new Map<string, { x: number; y: number }>());
  const nodeDragStartPositions = useRef(new Map<string, { x: number; y: number }>());

  useEffect(() => {
    if (readOnly || !persistence.error) return;
    const conflict = persistence.error === "VERSION_CONFLICT";
    toast.error(
      conflict ? "This tree changed in another session." : "Unable to save tree changes.",
      {
        id: "tree-persistence-error",
        duration: Infinity,
        action: conflict
          ? { label: "Reload latest", onClick: () => familyStore.reloadAfterConflict() }
          : undefined,
      },
    );
  }, [persistence.error, readOnly]);

  const [motherPicker, setMotherPicker] = useState<{
    fatherId: string;
    childId: string;
    wives: FamilyMember[];
  } | null>(null);
  const [creationChoice, setCreationChoice] = useState<{
    kind: "parent" | "child-role";
    memberId: string;
  } | null>(null);
  const [childMotherChoice, setChildMotherChoice] = useState<{
    fatherId: string;
    wives: FamilyMember[];
  } | null>(null);
  const [removeParentChoice, setRemoveParentChoice] = useState<{
    childId: string;
    fatherId: string;
    motherId: string;
  } | null>(null);

  const onOpen = useCallback(
    (id: string) => {
      if (!canvasCanEdit) return;
      navigate({
        to: "/member/$id",
        params: { id },
        search: { returnPreview: previewType },
      });
    },
    [canvasCanEdit, navigate, previewType],
  );
  const navigateToAdd = useCallback(
    (search: {
      fatherId?: string;
      motherId?: string;
      childId?: string;
      parentRole?: "father" | "mother";
    }) =>
      navigate({
        to: "/tree/$id/add",
        params: { id: familyStore.getActiveTreeId() },
        search: { ...search, returnPreview: previewType },
      }),
    [navigate, previewType],
  );
  const onAddParent = useCallback(
    (id: string) => {
      const child = familyStore.get(id);
      if (!canvasCanEdit || !child || (child.father_id && child.mother_id)) return;
      if (!child.father_id && !child.mother_id) {
        setCreationChoice({ kind: "parent", memberId: id });
        return;
      }
      navigateToAdd({
        childId: id,
        parentRole: child.father_id ? "mother" : "father",
      });
    },
    [canvasCanEdit, navigateToAdd],
  );
  const onAddChild = useCallback(
    (id: string) => {
      const parent = familyStore.get(id);
      if (!canvasCanEdit || !parent) return;
      if (parent.gender === "unspecified") {
        setCreationChoice({ kind: "child-role", memberId: id });
        return;
      }
      if (parent.gender === "female") {
        const husbands = [...computeWivesByHusband(familyStore.getAll()).entries()]
          .filter(([, wives]) => wives.some((wife) => wife.id === id))
          .map(([husbandId]) => husbandId);
        navigateToAdd({
          motherId: id,
          fatherId: husbands.length === 1 ? husbands[0] : undefined,
        });
        return;
      }
      const wives = computeWivesByHusband(familyStore.getAll()).get(id) ?? [];
      if (wives.length > 1) {
        setChildMotherChoice({ fatherId: id, wives });
        return;
      }
      navigateToAdd({ fatherId: id, motherId: wives[0]?.id });
    },
    [canvasCanEdit, navigateToAdd],
  );
  const preserveDetachedSubtree = useCallback(
    (childId: string, removedRole: "father_id" | "mother_id") => {
      const child = familyStore.get(childId);
      if (!child) return;
      const remainingParent = removedRole === "father_id" ? child.mother_id : child.father_id;
      if (remainingParent) return;
      const positions = new Map<string, { x: number; y: number }>();
      for (const id of descendantIds(familyStore.getAll(), childId)) {
        const position = visibleNodePositions.current.get(id);
        if (position) positions.set(id, position);
      }
      familyStore.setPositions(positions);
    },
    [],
  );
  const onRequestRemove = useCallback(
    (relationship: { parentId: string; childId: string; motherId?: string }) => {
      const child = familyStore.get(relationship.childId);
      if (!canvasCanEdit || !child) return;
      if (
        relationship.motherId &&
        relationship.motherId !== relationship.parentId &&
        child.father_id &&
        child.mother_id
      ) {
        setRemoveParentChoice({
          childId: child.id,
          fatherId: relationship.parentId,
          motherId: relationship.motherId,
        });
        return;
      }
      const role = relationship.parentId === child.mother_id ? "mother_id" : "father_id";
      preserveDetachedSubtree(child.id, role);
      familyStore.detachParent(child.id, role);
      toast.success(t("link_removed"));
    },
    [canvasCanEdit, preserveDetachedSubtree, t],
  );

  const onToggleCollapsed = useCallback(
    (id: string) => {
      setCollapsedByPreview((current) => {
        const next = new Set(current[previewType]);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return { ...current, [previewType]: next };
      });
    },
    [previewType],
  );

  const generations = useMemo(() => {
    const unique = new Map<string, GenerationBand>();
    for (const member of members) {
      const band = generationBandFor(member);
      if (band) unique.set(generationKey(band), band);
    }
    return [...unique.values()].sort((a, b) => a.start - b.start);
  }, [members]);

  const visibleMembers = useMemo(() => {
    const result =
      !subfamilyFilterEnabled || !selectedSubfamilyId
        ? members
        : familyStore.getSubfamilyMembers(selectedSubfamilyId);
    return result;
  }, [members, selectedSubfamilyId, subfamilyFilterEnabled]);

  const { nodes: initialNodes, edges: initialEdges } = useMemo(
    () =>
      layout(
        visibleMembers,
        collapsed,
        onOpen,
        onAddParent,
        onAddChild,
        onRequestRemove,
        highlightId,
        canvasCanEdit,
        previewType === "chronological",
        onToggleCollapsed,
      ),
    [
      visibleMembers,
      collapsed,
      onOpen,
      onAddParent,
      onAddChild,
      onRequestRemove,
      highlightId,
      canvasCanEdit,
      previewType,
      onToggleCollapsed,
    ],
  );

  const earliestGeneration = generations[0]?.start ?? 0;
  const activeGeneration = useMemo(() => {
    if (!generations.length) return null;
    const graphCenterY =
      ((typeof window === "undefined" ? 800 : window.innerHeight) / 2 - viewport.y) / viewport.zoom;
    return generations.reduce((closest, band) => {
      const bandY = ((band.start - earliestGeneration) / 10) * DECADE_ROW_H;
      const closestY = ((closest.start - earliestGeneration) / 10) * DECADE_ROW_H;
      return Math.abs(bandY - graphCenterY) < Math.abs(closestY - graphCenterY) ? band : closest;
    });
  }, [generations, earliestGeneration, viewport]);

  const scrollToGeneration = () => {
    const year = Number.parseInt(generationYear, 10);
    if (!Number.isFinite(year) || !generations.length) return;
    const requestedStart = Math.floor(year / 10) * 10;
    const closest = generations.reduce((best, band) =>
      Math.abs(band.start - requestedStart) < Math.abs(best.start - requestedStart) ? band : best,
    );
    const y = ((closest.start - earliestGeneration) / 10) * DECADE_ROW_H + NODE_H / 2;
    setCenter(0, y, { zoom: Math.max(viewport.zoom, 0.65), duration: 600 });
    setGenerationYear(String(year));
  };

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  useEffect(() => {
    const previewChanged = previousPreviewType.current !== previewType;
    previousPreviewType.current = previewType;
    if (previewChanged) didFit.current = false;
    setNodes((current) => {
      const currentById = new Map(current.map((node) => [node.id, node]));
      const replacePositions = replacePositionsOnNextLayout.current;
      replacePositionsOnNextLayout.current = false;
      if (previewChanged) return initialNodes;
      const merged = initialNodes.map((node) => {
        const existing = currentById.get(node.id);
        if (!existing || replacePositions) return node;
        const hasPersistedPosition =
          previewType === "chronological"
            ? typeof node.data.member.decade_pos_x === "number" &&
              typeof node.data.member.decade_pos_y === "number"
            : typeof node.data.member.pos_x === "number" &&
              typeof node.data.member.pos_y === "number";
        return {
          ...node,
          position: hasPersistedPosition ? node.position : existing.position,
        };
      });
      return merged;
    });
    setEdges((current) => {
      if (previewChanged) return initialEdges;
      const currentById = new Map(current.map((edge) => [edge.id, edge]));
      return initialEdges.map((edge) => {
        const existing = currentById.get(edge.id);
        return existing
          ? {
              ...edge,
              data: { ...edge.data, ...existing.data },
            }
          : edge;
      });
    });
    if (!didFit.current && initialNodes.length) {
      requestAnimationFrame(() => fitView({ padding: 0.2, duration: 300 }));
      didFit.current = true;
    }
  }, [initialNodes, initialEdges, previewType, setNodes, setEdges, fitView]);

  useEffect(() => {
    visibleNodePositions.current = new Map(
      nodes.map((node) => [node.id, { x: node.position.x, y: node.position.y }]),
    );
  }, [nodes]);

  useEffect(() => {
    if (previewType !== "chronological") return;
    setEdges((current) => routeParentEdges(nodes, current, true));
  }, [nodes, previewType, setEdges]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))
      ) {
        return;
      }

      const isMeta = event.ctrlKey || event.metaKey;
      if (!isMeta || !canvasCanEdit) return;

      const key = event.key.toLowerCase();
      if (key === "z" && !event.shiftKey) {
        event.preventDefault();
        familyStore.undo();
      } else if (key === "y" || (key === "z" && event.shiftKey)) {
        event.preventDefault();
        familyStore.redo();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [canvasCanEdit]);

  const onConnect = useCallback(
    (conn: Connection) => {
      if (!canvasCanEdit) return;
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

      // If the parent is a male with more than one wife, ask which wife is
      // the child's mother before wiring the parent link.
      if (parent.gender === "male") {
        const wives = computeWivesByHusband(familyStore.getAll()).get(parent.id) ?? [];
        if (wives.length > 1) {
          setMotherPicker({ fatherId: parent.id, childId: child.id, wives });
          return;
        }
        const patch: Partial<FamilyMember> = { father_id: parent.id };
        if (wives.length === 1) patch.mother_id = wives[0].id;
        familyStore.update(child.id, patch);
      } else {
        familyStore.update(child.id, { mother_id: parent.id } as Partial<FamilyMember>);
      }
      toast.success(
        t("connection_success", {
          parent: displayName(parent, lang),
          child: displayName(child, lang),
        }),
      );
    },
    [canvasCanEdit, t, lang],
  );

  const onEdgesDelete = useCallback(
    (removed: Edge[]) => {
      if (!canvasCanEdit) return;
      let cleared = 0;
      for (const e of removed) {
        const data = e.data as { parentId?: string; childId?: string; kind?: string } | undefined;
        if (data?.kind === "spouse") {
          const a = familyStore.get(e.source);
          const b = familyStore.get(e.target);
          if (!a || !b) continue;
          if (a) familyStore.update(a.id, { spouse_id: undefined } as Partial<FamilyMember>);
          if (b) familyStore.update(b.id, { spouse_id: undefined } as Partial<FamilyMember>);
          cleared++;
          continue;
        }
        if (!data?.childId || !data?.parentId) continue;
        const child = familyStore.get(data.childId);
        const parent = familyStore.get(data.parentId);
        if (!child || !parent) continue;
        const key =
          child.father_id === parent.id
            ? "father_id"
            : child.mother_id === parent.id
              ? "mother_id"
              : undefined;
        if (!key) continue;
        preserveDetachedSubtree(child.id, key);
        familyStore.detachParent(child.id, key);
        cleared++;
      }
      if (cleared) toast.success(t("link_removed"));
    },
    [canvasCanEdit, preserveDetachedSubtree, t],
  );

  const onEdgeUpdateStart = useCallback(() => {
    edgeUpdateSuccessful.current = false;
  }, []);

  const onEdgeUpdate = useCallback(
    (oldEdge: Edge, newConn: Connection) => {
      if (!canvasCanEdit) return;
      edgeUpdateSuccessful.current = true;
      if (!newConn.source || !newConn.target) return;
      const data = oldEdge.data as
        { parentId?: string; childId?: string; kind?: string } | undefined;

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
      const newParent = newSource;
      const newChild = newTarget;
      if (isDescendant(familyStore.getAll(), newChild.id, newParent.id)) {
        toast.error(t("cannot_link_cycle"));
        return;
      }
      const newRole = newParent.gender === "male" ? "father_id" : "mother_id";

      familyStore.detachParent(oldChild.id, oldRole);
      familyStore.update(newChild.id, { [newRole]: newParent.id } as Partial<FamilyMember>);
      setEdges((es) => updateEdge(oldEdge, newConn, es));
      toast.success(t("link_updated"));
    },
    [canvasCanEdit, setEdges, t],
  );

  const onEdgeUpdateEnd = useCallback(
    (_evt: unknown, edge: Edge) => {
      if (!edgeUpdateSuccessful.current) {
        setEdges((es) => es.filter((e) => e.id !== edge.id));
        onEdgesDelete([edge]);
      }
      edgeUpdateSuccessful.current = true;
    },
    [setEdges, onEdgesDelete],
  );

  const onNodeDragStart = useCallback((_event: unknown, node: Node, draggedNodes: Node[]) => {
    const selection = [
      ...new Map([node, ...draggedNodes].map((dragged) => [dragged.id, dragged])).values(),
    ];
    nodeDragStartPositions.current = new Map(
      selection.map((dragged) => [dragged.id, { x: dragged.position.x, y: dragged.position.y }]),
    );
  }, []);

  const onNodeDrag = useCallback(
    (_event: unknown, draggedNode: Node, draggedNodes: Node[]) => {
      const selection = [
        ...new Map([draggedNode, ...draggedNodes].map((dragged) => [dragged.id, dragged])).values(),
      ];
      const draggedById = new Map(selection.map((node) => [node.id, node]));
      const draggedIds = new Set(draggedById.keys());
      const nextNodes = nodes.map((node) => draggedById.get(node.id) ?? node);
      setEdges((current) => {
        const affectedFamilyKeys = new Set(
          current
            .filter((edge) => draggedIds.has(edge.source) || draggedIds.has(edge.target))
            .map((edge) => (edge.data as { familyKey?: string } | undefined)?.familyKey)
            .filter((key): key is string => !!key),
        );
        const rerouted = new Map(
          routeParentEdges(nextNodes, current, previewType === "chronological").map((edge) => [
            edge.id,
            edge,
          ]),
        );
        return current.map((edge) =>
          draggedIds.has(edge.source) ||
          draggedIds.has(edge.target) ||
          affectedFamilyKeys.has((edge.data as { familyKey?: string } | undefined)?.familyKey ?? "")
            ? (rerouted.get(edge.id) ?? edge)
            : edge,
        );
      });
    },
    [nodes, previewType, setEdges],
  );

  const onNodeDragStop = useCallback(
    (_e: unknown, node: Node, draggedNodes: Node[]) => {
      if (!canvasCanEdit || node.type !== "member") return;
      const selection = [
        ...new Map([node, ...draggedNodes].map((dragged) => [dragged.id, dragged])).values(),
      ];
      const starts = nodeDragStartPositions.current;
      nodeDragStartPositions.current = new Map();
      const leadStart = starts.get(node.id);
      if (
        leadStart &&
        Math.hypot(node.position.x - leadStart.x, node.position.y - leadStart.y) < 4
      ) {
        setNodes((current) =>
          current.map((candidate) => {
            const start = starts.get(candidate.id);
            return start ? { ...candidate, position: start } : candidate;
          }),
        );
        return;
      }
      const positions = new Map(
        selection
          .filter((dragged) => dragged.type === "member")
          .map((dragged) => [dragged.id, { x: dragged.position.x, y: dragged.position.y }]),
      );
      if (previewType === "chronological") familyStore.setDecadePositions(positions);
      else familyStore.setPositions(positions);
    },
    [canvasCanEdit, previewType, setNodes],
  );

  const onAutoLayout = useCallback(() => {
    if (!capabilities.canAutoLayout) return;
    const auto = layout(
      visibleMembers.map((member) => ({
        ...member,
        pos_x: undefined,
        pos_y: undefined,
        decade_pos_x: undefined,
        decade_pos_y: undefined,
      })),
      collapsed,
      onOpen,
      onAddParent,
      onAddChild,
      onRequestRemove,
      highlightId,
      canvasCanEdit,
      previewType === "chronological",
      onToggleCollapsed,
    );
    replacePositionsOnNextLayout.current = true;
    setNodes(auto.nodes);
    setEdges(auto.edges);
    const positions = new Map(auto.nodes.map((node) => [node.id, node.position]));
    if (previewType === "lineage") familyStore.setPositions(positions);
    else familyStore.setDecadePositions(positions);
    didFit.current = false;
    requestAnimationFrame(() => fitView({ padding: 0.2, duration: 400 }));
    toast.success(t("auto_layout_done"));
  }, [
    canvasCanEdit,
    capabilities.canAutoLayout,
    collapsed,
    fitView,
    highlightId,
    onAddChild,
    onAddParent,
    onOpen,
    onRequestRemove,
    onToggleCollapsed,
    previewType,
    setEdges,
    setNodes,
    t,
    visibleMembers,
  ]);

  const pickMother = (wifeId: string | null) => {
    if (!motherPicker) return;
    const patch: Partial<FamilyMember> = { father_id: motherPicker.fatherId };
    if (wifeId) patch.mother_id = wifeId;
    familyStore.update(motherPicker.childId, patch);
    const father = familyStore.get(motherPicker.fatherId);
    const child = familyStore.get(motherPicker.childId);
    if (father && child) {
      toast.success(
        t("connection_success", {
          parent: displayName(father, lang),
          child: displayName(child, lang),
        }),
      );
    }
    setMotherPicker(null);
  };

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
      setCollapsedByPreview((current) => ({ ...current, [previewType]: new Set() }));
    }
  };

  return (
    <div className="relative h-full w-full">
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex flex-wrap items-start justify-between gap-3 p-4">
        <div className="pointer-events-auto w-full max-w-sm">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground ltr:left-3 rtl:right-3" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("search_placeholder")}
              className="h-10 rounded-xl border-border/80 bg-card/95 shadow-[0_4px_18px_-8px_rgba(15,23,42,0.28)] backdrop-blur ltr:pl-9 rtl:pr-9"
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
            <div className="mt-2 max-h-72 overflow-y-auto rounded-xl border bg-popover/98 p-1 shadow-xl backdrop-blur">
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
        {canEdit && (
          <div className="pointer-events-auto flex flex-wrap items-center justify-end gap-1 rounded-xl border border-border/80 bg-card/95 p-1 shadow-[0_4px_18px_-8px_rgba(15,23,42,0.28)] backdrop-blur">
            <Button asChild size="sm" variant="ghost">
              <Link to="/">{t("back_to_dashboard")}</Link>
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => familyStore.undo()}
              disabled={!canvasCanEdit || !familyStore.canUndo()}
              className="shadow-none"
            >
              {t("undo")}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => familyStore.redo()}
              disabled={!canvasCanEdit || !familyStore.canRedo()}
              className="shadow-none"
            >
              {t("redo")}
            </Button>
            {capabilities.canAutoLayout && (
              <Button
                size="sm"
                variant="ghost"
                onClick={onAutoLayout}
                className="gap-1.5 shadow-none"
              >
                <LayoutGrid className="h-3.5 w-3.5" />
                {t("auto_layout")}
              </Button>
            )}
          </div>
        )}
      </div>

      <ReactFlow
        key={previewType}
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={capabilities.canConnect ? onConnect : undefined}
        onEdgesDelete={canvasCanEdit ? onEdgesDelete : undefined}
        onEdgeUpdate={canvasCanEdit ? onEdgeUpdate : undefined}
        onEdgeUpdateStart={canvasCanEdit ? onEdgeUpdateStart : undefined}
        onEdgeUpdateEnd={canvasCanEdit ? onEdgeUpdateEnd : undefined}
        onNodeDragStart={capabilities.canDrag ? onNodeDragStart : undefined}
        onNodeDrag={capabilities.canDrag ? onNodeDrag : undefined}
        onNodeDragStop={capabilities.canDrag ? onNodeDragStop : undefined}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        nodesDraggable={capabilities.canDrag}
        nodesConnectable={capabilities.canConnect}
        elementsSelectable={capabilities.canSelect}
        edgesUpdatable={canvasCanEdit}
        edgesFocusable={capabilities.canSelect}
        minZoom={0.1}
        maxZoom={2}
        selectionOnDrag={capabilities.canSelect}
        panOnDrag={[1, 2]}
        multiSelectionKeyCode={["Meta", "Control"]}
        selectionKeyCode="Shift"
        zoomOnDoubleClick={false}
        proOptions={{ hideAttribution: true }}
        connectionLineStyle={{ stroke: "#0ea5e9", strokeWidth: 2, strokeDasharray: "6 4" }}
        defaultEdgeOptions={{
          type: "relationship",
          focusable: capabilities.canSelect,
          deletable: false,
          updatable: canvasCanEdit,
        }}
        deleteKeyCode={null}
        fitView
        onMove={(_event, nextViewport) => setViewport(nextViewport)}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={20}
          size={1.35}
          color="var(--color-border)"
          className="bg-muted/20!"
        />
        {previewType === "chronological" && activeGeneration && (
          <div
            className="pointer-events-none absolute inset-x-0 z-0 border-t-2 border-dashed border-primary/25"
            style={{
              top: `${((activeGeneration.start - earliestGeneration) / 10) * DECADE_ROW_H * viewport.zoom + viewport.y}px`,
            }}
          >
            <span className="ms-3 rounded-b bg-background/90 px-2 py-1 text-[10px] font-medium text-muted-foreground">
              {activeGeneration.start}
              {"\u2013"}
              {activeGeneration.end}
            </span>
          </div>
        )}
        <MiniMap
          pannable
          zoomable
          position="bottom-right"
          nodeStrokeWidth={3}
          maskColor="color-mix(in oklab, var(--color-background) 72%, transparent)"
          className="canvas-minimap! overflow-hidden! rounded-xl! border! border-border/80! bg-card/95! shadow-lg!"
        />
        <Controls
          showInteractive={false}
          position="bottom-left"
          className="canvas-controls! overflow-hidden! rounded-xl! border! border-border/80! bg-card/95! p-1! shadow-lg!"
        />
      </ReactFlow>

      <div className="absolute top-24 right-4 z-10 flex max-h-[calc(100%-8rem)] w-72 max-w-[calc(100%-2rem)] flex-col gap-2 overflow-y-auto">
        <div className="rounded-xl border border-border/80 bg-card/95 p-3 text-xs shadow-lg backdrop-blur">
          <button
            type="button"
            onClick={() => toggleWidget("preview")}
            className={`flex w-full items-center justify-between font-semibold ${collapsedWidgets.preview ? "" : "mb-2"}`}
          >
            {t("preview_type")}
            <ChevronDown
              className={`h-4 w-4 transition-transform ${collapsedWidgets.preview ? "-rotate-90" : ""}`}
            />
          </button>
          {!collapsedWidgets.preview && (
            <div className="grid grid-cols-2 gap-1 rounded-md bg-muted p-1">
              <button
                onClick={() =>
                  navigate({
                    to: "/tree/$id",
                    params: { id: familyStore.getActiveTreeId() },
                    search: { mode: readOnly ? "view" : "edit", preview: "lineage" },
                  })
                }
                className={`rounded px-2 py-1.5 ${previewType === "lineage" ? "bg-card font-medium shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
              >
                {t("lineage_view")}
              </button>
              <button
                onClick={() =>
                  navigate({
                    to: "/tree/$id",
                    params: { id: familyStore.getActiveTreeId() },
                    search: { mode: readOnly ? "view" : "edit", preview: "chronological" },
                  })
                }
                className={`rounded px-2 py-1.5 ${previewType === "chronological" ? "bg-card font-medium shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
              >
                {t("generation_view")}
              </button>
            </div>
          )}
        </div>
        {previewType === "chronological" && (
          <div className="rounded-xl border border-border/80 bg-card/95 p-3 text-xs shadow-lg backdrop-blur">
            <button
              type="button"
              onClick={() => toggleWidget("generation")}
              className={`flex w-full items-center justify-between font-semibold ${collapsedWidgets.generation ? "" : "mb-2"}`}
            >
              <span className="flex items-center gap-2">
                <CalendarRange className="h-4 w-4 text-primary" />
                {t("generation")}
              </span>
              <ChevronDown
                className={`h-4 w-4 transition-transform ${collapsedWidgets.generation ? "-rotate-90" : ""}`}
              />
            </button>
            {!collapsedWidgets.generation && (
              <>
                <div className="flex gap-1">
                  <Input
                    value={generationYear}
                    onChange={(event) =>
                      setGenerationYear(event.target.value.replace(/[^0-9]/g, "").slice(0, 4))
                    }
                    onKeyDown={(event) => event.key === "Enter" && scrollToGeneration()}
                    inputMode="numeric"
                    placeholder="1975"
                    className="h-8 text-xs"
                    disabled={generations.length === 0}
                  />
                  <Button
                    size="sm"
                    onClick={scrollToGeneration}
                    disabled={generations.length === 0 || generationYear.length !== 4}
                  >
                    {t("go")}
                  </Button>
                </div>
                {activeGeneration && (
                  <div className="mt-2 text-[10px] text-muted-foreground">
                    {activeGeneration.start}
                    {"\u2013"}
                    {activeGeneration.end}
                  </div>
                )}
                {generations.length === 0 && (
                  <p className="mt-2 text-muted-foreground">{t("no_generation_data")}</p>
                )}
              </>
            )}
          </div>
        )}
        {canManageSubfamilies && (
          <div className="rounded-xl border border-border/80 bg-card/95 p-3 text-xs shadow-lg backdrop-blur">
            <button
              type="button"
              onClick={() => toggleWidget("subfamilies")}
              className={`flex w-full items-center justify-between font-semibold ${collapsedWidgets.subfamilies ? "" : "mb-2"}`}
            >
              {t("subfamilies")}
              <ChevronDown
                className={`h-4 w-4 transition-transform ${collapsedWidgets.subfamilies ? "-rotate-90" : ""}`}
              />
            </button>
            {!collapsedWidgets.subfamilies && (
              <div className="max-h-[calc(100vh-260px)] overflow-y-auto overscroll-contain pr-1">
                <SubfamilyPanel
                  mode="home"
                  selectedSubfamilyId={selectedSubfamilyId}
                  onSelectSubfamily={setSelectedSubfamilyId}
                  filterEnabled={subfamilyFilterEnabled}
                  onToggleFilter={setSubfamilyFilterEnabled}
                  hideHeading
                />
              </div>
            )}
          </div>
        )}
      </div>

      {canvasCanEdit && (
        <Dialog
          open={!!removeParentChoice}
          onOpenChange={(open) => !open && setRemoveParentChoice(null)}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t("remove_connection")}</DialogTitle>
              <DialogDescription>{t("choose_parent_to_remove")}</DialogDescription>
            </DialogHeader>
            <div className="grid gap-2 sm:grid-cols-2">
              <Button
                variant="destructive"
                onClick={() => {
                  if (!removeParentChoice) return;
                  preserveDetachedSubtree(removeParentChoice.childId, "father_id");
                  familyStore.detachParent(removeParentChoice.childId, "father_id");
                  setRemoveParentChoice(null);
                  toast.success(t("link_removed"));
                }}
              >
                {t("father")}
              </Button>
              <Button
                variant="destructive"
                onClick={() => {
                  if (!removeParentChoice) return;
                  preserveDetachedSubtree(removeParentChoice.childId, "mother_id");
                  familyStore.detachParent(removeParentChoice.childId, "mother_id");
                  setRemoveParentChoice(null);
                  toast.success(t("link_removed"));
                }}
              >
                {t("mother")}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {canvasCanEdit && (
        <Dialog open={!!creationChoice} onOpenChange={(open) => !open && setCreationChoice(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {creationChoice?.kind === "parent" ? t("add_parent") : t("add_child")}
              </DialogTitle>
              <DialogDescription>{t("choose_relative_to_add")}</DialogDescription>
            </DialogHeader>
            <div className="grid gap-2 sm:grid-cols-2">
              <Button
                variant="outline"
                onClick={() => {
                  if (!creationChoice) return;
                  if (creationChoice.kind === "parent")
                    navigateToAdd({
                      childId: creationChoice.memberId,
                      parentRole: "father",
                    });
                  else navigateToAdd({ fatherId: creationChoice.memberId });
                  setCreationChoice(null);
                }}
              >
                {t("father")}
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  if (!creationChoice) return;
                  if (creationChoice.kind === "parent")
                    navigateToAdd({
                      childId: creationChoice.memberId,
                      parentRole: "mother",
                    });
                  else navigateToAdd({ motherId: creationChoice.memberId });
                  setCreationChoice(null);
                }}
              >
                {t("mother")}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {canvasCanEdit && (
        <Dialog
          open={!!childMotherChoice}
          onOpenChange={(open) => !open && setChildMotherChoice(null)}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t("select_mother")}</DialogTitle>
              <DialogDescription>{t("select_mother_desc")}</DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-2">
              {childMotherChoice?.wives.map((wife) => (
                <Button
                  key={wife.id}
                  variant="outline"
                  onClick={() => {
                    navigateToAdd({
                      fatherId: childMotherChoice.fatherId,
                      motherId: wife.id,
                    });
                    setChildMotherChoice(null);
                  }}
                >
                  {displayName(wife, lang)}
                </Button>
              ))}
              <Button
                variant="ghost"
                onClick={() => {
                  if (!childMotherChoice) return;
                  navigateToAdd({ fatherId: childMotherChoice.fatherId });
                  setChildMotherChoice(null);
                }}
              >
                {t("unknown_mother")}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {canvasCanEdit && (
        <Dialog open={!!motherPicker} onOpenChange={(o) => !o && setMotherPicker(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t("select_mother")}</DialogTitle>
              <DialogDescription>{t("select_mother_desc")}</DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-2">
              {motherPicker?.wives.map((w, i) => {
                const c = wifeColorFor(i);
                const father = motherPicker && familyStore.get(motherPicker.fatherId);
                const divorced = father?.divorced_from?.includes(w.id);
                return (
                  <button
                    key={w.id}
                    onClick={() => pickMother(w.id)}
                    className="flex items-center gap-3 rounded-md border p-3 text-start hover:bg-accent"
                  >
                    <span
                      className="h-3 w-3 shrink-0 rounded-full ring-2 ring-background"
                      style={{ backgroundColor: divorced ? DIVORCED_COLOR : c.stroke }}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium">
                        <span className="opacity-60 me-1">{ordinal(i + 1, lang)}</span>
                        {displayName(w, lang)}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {w.birth_date?.slice(0, 4)}
                        {w.death_date ? `â€“${w.death_date.slice(0, 4)}` : ""}
                        {divorced ? ` Â· ${t("divorced")}` : ""}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => pickMother(null)}>
                {t("unknown_mother")}
              </Button>
              <Button variant="outline" onClick={() => setMotherPicker(null)}>
                {t("cancel")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

export function FamilyTree({
  readOnly = false,
  preview = "lineage",
}: {
  readOnly?: boolean;
  preview?: TreePreviewType;
}) {
  return (
    <ReactFlowProvider>
      <Inner readOnly={readOnly} preview={preview} />
    </ReactFlowProvider>
  );
}
