import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from "react";
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
import {
  memberDetailsSearch,
  memberNameWithBirthYear,
  type FamilyMember,
} from "@/features/members";

const NODE_W = 260;
const NODE_H = 130;
const NODE_H_HUSBAND = 220;
const FAMILY_ROW_H = 340;
const DECADE_ROW_H = 520;
const DECADE_CARD_GAP = 140;
const nodeTypes = { member: MemberNode };
const edgeTypes = { relationship: RelationshipEdge };

const isEmptyCanvasTarget = (target: EventTarget | null) =>
  target instanceof Element &&
  Boolean(target.closest(".react-flow__pane")) &&
  !target.closest(
    ".react-flow__node, .react-flow__edge, .react-flow__controls, .react-flow__minimap",
  );

const birthYear = (member: FamilyMember) => {
  const year = Number.parseInt(member.birth_date?.slice(0, 4) ?? "", 10);
  return Number.isFinite(year) ? year : null;
};

const generationBandFor = (
  member: FamilyMember,
  period: ChronologicalPeriod,
): ChronologicalBand | null => {
  const year = birthYear(member);
  if (year === null) return null;
  return chronologicalBandForYear(year, period);
};

const generationKey = (band: ChronologicalBand) => `${band.start}-${band.end}`;

const DIVORCED_COLOR = "#94a3b8";

import { SubfamilyPanel } from "@/features/subfamilies";
import { descendantIds } from "@/features/members";
import {
  alignDecadeSingleChildren,
  routeParentEdges,
  sharedRouteSelectionIds,
} from "../domain/route-edges";
import { familyLevelSharedSelectionIds } from "../domain/edge-selection";
import {
  canvasCapabilities,
  canvasRectBetween,
  canvasRectsIntersect,
  canvasWheelIntent,
  hasCanvasDragStarted,
  hierarchyPositions,
  isDoublePanePress,
  DEFAULT_CHRONOLOGICAL_PERIOD,
  MAX_CHRONOLOGICAL_PERIOD,
  MIN_CHRONOLOGICAL_PERIOD,
  chronologicalBandForYear,
  isChronologicalPeriod,
  type ChronologicalBand,
  type ChronologicalPeriod,
  type CanvasPoint,
  type CanvasRect,
  type TreePreviewType,
} from "../domain/canvas-preview";
import type { TreeAccessMode } from "../domain/access-policy";
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
  chronologicalPeriod: ChronologicalPeriod = DEFAULT_CHRONOLOGICAL_PERIOD,
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
    const band = generationBandFor(m, chronologicalPeriod);
    const earliestBand = Math.min(
      ...members
        .map((member) => generationBandFor(member, chronologicalPeriod))
        .filter((value): value is ChronologicalBand => value !== null)
        .map((value) => value.start),
    );
    const autoY =
      chronological && band && Number.isFinite(earliestBand)
        ? ((band.start - earliestBand) / chronologicalPeriod) * DECADE_ROW_H
        : genOf(id) * FAMILY_ROW_H;
    const hierarchyPosition = hierarchy.get(id);
    const autoX = chronological
      ? pos.x - pos.width / 2
      : (hierarchyPosition?.x ?? pos.x - pos.width / 2);
    const hierarchyY = hierarchyPosition?.y ?? genOf(id) * FAMILY_ROW_H;
    const hasCustom = typeof m.pos_x === "number" && typeof m.pos_y === "number";
    return {
      id,
      type: "member",
      position:
        hasCustom && !chronological
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
      .filter(
        (member) =>
          !chronological && typeof member.pos_x === "number" && typeof member.pos_y === "number",
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

function Inner({
  readOnly = false,
  overviewMode = false,
  preview,
  chronologicalPeriod,
  accessMode,
}: {
  readOnly?: boolean;
  overviewMode?: boolean;
  preview: TreePreviewType;
  chronologicalPeriod: ChronologicalPeriod;
  accessMode: TreeAccessMode;
}) {
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
  const [periodDraft, setPeriodDraft] = useState(String(chronologicalPeriod));
  const [viewport, setViewport] = useState({ x: 0, y: 0, zoom: 1 });
  const viewportRef = useRef(viewport);
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
  const { setCenter, fitView, setViewport: setFlowViewport, screenToFlowPosition } = useReactFlow();
  const didFit = useRef(false);
  const previousPreviewType = useRef<TreePreviewType>(previewType);
  const previousChronologicalPeriod = useRef<ChronologicalPeriod>(chronologicalPeriod);
  const replacePositionsOnNextLayout = useRef(false);
  const edgeUpdateSuccessful = useRef(true);
  const visibleNodePositions = useRef(new Map<string, { x: number; y: number }>());
  const nodeDragStartPositions = useRef(new Map<string, { x: number; y: number }>());
  const canvasRef = useRef<HTMLDivElement>(null);
  const firstPanePress = useRef<
    (CanvasPoint & { pointerId: number; moved: boolean; at: number }) | null
  >(null);
  const previousPaneClick = useRef<(CanvasPoint & { at: number }) | null>(null);
  const marqueePointer = useRef<{
    pointerId: number;
    start: CanvasPoint;
    dragging: boolean;
  } | null>(null);
  const [marqueeRect, setMarqueeRect] = useState<CanvasRect | null>(null);

  useEffect(() => setPeriodDraft(String(chronologicalPeriod)), [chronologicalPeriod]);

  useEffect(() => {
    if (previewType !== "chronological") return;
    const value = Number(periodDraft);
    if (!isChronologicalPeriod(value) || value === chronologicalPeriod) return;
    const timeout = window.setTimeout(() => {
      void navigate({
        to: "/tree/$id",
        params: { id: familyStore.getActiveTreeId() },
        search: { mode: "preview", preview: "chronological", period: value },
        replace: true,
      });
    }, 500);
    return () => window.clearTimeout(timeout);
  }, [chronologicalPeriod, navigate, periodDraft, previewType]);

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
      navigate({
        to: "/member/$id",
        params: { id },
        search: memberDetailsSearch({
          treeId: familyStore.getActiveTreeId(),
          returnMode: accessMode,
          returnPreview: previewType,
        }),
      });
    },
    [accessMode, navigate, previewType],
  );

  const onCanvasWheel = useCallback(
    (event: ReactWheelEvent<HTMLDivElement>) => {
      const target = event.target as HTMLElement | null;
      const interactiveTarget = target?.closest("input, textarea, select, button, [role='dialog']");
      if (interactiveTarget && !interactiveTarget.closest("[data-member-card]")) return;
      event.preventDefault();
      const intent = canvasWheelIntent(event);
      const currentViewport = viewportRef.current;
      if (intent === "pan") {
        const horizontal =
          event.shiftKey && Math.abs(event.deltaX) < 0.5 ? event.deltaY : event.deltaX;
        const vertical = event.shiftKey ? 0 : event.deltaY;
        const nextViewport = {
          x: currentViewport.x - horizontal,
          y: currentViewport.y - vertical,
          zoom: currentViewport.zoom,
        };
        viewportRef.current = nextViewport;
        void setFlowViewport(nextViewport);
        return;
      }

      const bounds = canvasRef.current?.getBoundingClientRect();
      if (!bounds) return;
      const deltaScale = event.deltaMode === WheelEvent.DOM_DELTA_PIXEL ? 0.002 : 0.08;
      const nextZoom = Math.min(
        2,
        Math.max(0.1, currentViewport.zoom * Math.exp(-event.deltaY * deltaScale)),
      );
      const pointerX = event.clientX - bounds.left;
      const pointerY = event.clientY - bounds.top;
      const ratio = nextZoom / currentViewport.zoom;
      const nextViewport = {
        x: pointerX - (pointerX - currentViewport.x) * ratio,
        y: pointerY - (pointerY - currentViewport.y) * ratio,
        zoom: nextZoom,
      };
      viewportRef.current = nextViewport;
      void setFlowViewport(nextViewport);
    },
    [setFlowViewport],
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
    const unique = new Map<string, ChronologicalBand>();
    for (const member of members) {
      const band = generationBandFor(member, chronologicalPeriod);
      if (band) unique.set(generationKey(band), band);
    }
    return [...unique.values()].sort((a, b) => a.start - b.start);
  }, [members, chronologicalPeriod]);

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
        chronologicalPeriod,
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
      chronologicalPeriod,
      onToggleCollapsed,
    ],
  );

  const earliestGeneration = generations[0]?.start ?? 0;
  const activeGeneration = useMemo(() => {
    if (!generations.length) return null;
    const graphCenterY =
      ((typeof window === "undefined" ? 800 : window.innerHeight) / 2 - viewport.y) / viewport.zoom;
    return generations.reduce((closest, band) => {
      const bandY = ((band.start - earliestGeneration) / chronologicalPeriod) * DECADE_ROW_H;
      const closestY = ((closest.start - earliestGeneration) / chronologicalPeriod) * DECADE_ROW_H;
      return Math.abs(bandY - graphCenterY) < Math.abs(closestY - graphCenterY) ? band : closest;
    });
  }, [generations, earliestGeneration, chronologicalPeriod, viewport]);

  const scrollToGeneration = () => {
    const year = Number.parseInt(generationYear, 10);
    if (!Number.isFinite(year) || !generations.length) return;
    const requestedStart = chronologicalBandForYear(year, chronologicalPeriod).start;
    const closest = generations.reduce((best, band) =>
      Math.abs(band.start - requestedStart) < Math.abs(best.start - requestedStart) ? band : best,
    );
    const y =
      ((closest.start - earliestGeneration) / chronologicalPeriod) * DECADE_ROW_H + NODE_H / 2;
    setCenter(0, y, { zoom: Math.max(viewport.zoom, 0.65), duration: 600 });
    setGenerationYear(String(year));
  };

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  const clearCanvasSelection = useCallback(() => {
    setNodes((current) =>
      current.map((node) => (node.selected ? { ...node, selected: false } : node)),
    );
    setEdges((current) =>
      current.map((edge) => (edge.selected ? { ...edge, selected: false } : edge)),
    );
  }, [setEdges, setNodes]);

  const cancelMarquee = useCallback(() => {
    marqueePointer.current = null;
    firstPanePress.current = null;
    previousPaneClick.current = null;
    setMarqueeRect(null);
  }, []);

  const onCanvasPointerDownCapture = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || !isEmptyCanvasTarget(event.target)) {
      previousPaneClick.current = null;
      firstPanePress.current = null;
      return;
    }
    const point = { x: event.clientX, y: event.clientY, at: event.timeStamp };
    if (isDoublePanePress(previousPaneClick.current, point)) {
      previousPaneClick.current = null;
      firstPanePress.current = null;
      marqueePointer.current = {
        pointerId: event.pointerId,
        start: point,
        dragging: false,
      };
      event.currentTarget.setPointerCapture(event.pointerId);
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    firstPanePress.current = {
      ...point,
      pointerId: event.pointerId,
      moved: false,
    };
  }, []);

  const onCanvasPointerMoveCapture = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const marquee = marqueePointer.current;
    if (marquee?.pointerId === event.pointerId) {
      event.preventDefault();
      event.stopPropagation();
      const end = { x: event.clientX, y: event.clientY };
      if (!marquee.dragging && hasCanvasDragStarted(marquee.start, end)) {
        marquee.dragging = true;
      }
      if (marquee.dragging) {
        const bounds = canvasRef.current?.getBoundingClientRect();
        if (bounds) {
          setMarqueeRect(
            canvasRectBetween(
              { x: marquee.start.x - bounds.left, y: marquee.start.y - bounds.top },
              { x: end.x - bounds.left, y: end.y - bounds.top },
            ),
          );
        }
      }
      return;
    }

    const first = firstPanePress.current;
    if (
      first?.pointerId === event.pointerId &&
      hasCanvasDragStarted(first, { x: event.clientX, y: event.clientY })
    ) {
      first.moved = true;
    }
  }, []);

  const onCanvasPointerUpCapture = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const marquee = marqueePointer.current;
      if (marquee?.pointerId === event.pointerId) {
        event.preventDefault();
        event.stopPropagation();
        clearCanvasSelection();
        if (marquee.dragging) {
          const start = screenToFlowPosition(marquee.start);
          const end = screenToFlowPosition({ x: event.clientX, y: event.clientY });
          const selection = canvasRectBetween(start, end);
          setNodes((current) =>
            current.map((node) => {
              const nodeRect = {
                x: node.position.x,
                y: node.position.y,
                width: node.width ?? NODE_W,
                height: node.height ?? NODE_H,
              };
              return {
                ...node,
                selected: node.type === "member" && canvasRectsIntersect(selection, nodeRect),
              };
            }),
          );
        }
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          event.currentTarget.releasePointerCapture(event.pointerId);
        }
        marqueePointer.current = null;
        setMarqueeRect(null);
        return;
      }

      const first = firstPanePress.current;
      if (first?.pointerId !== event.pointerId) return;
      if (!first.moved && isEmptyCanvasTarget(event.target)) {
        previousPaneClick.current = { x: first.x, y: first.y, at: event.timeStamp };
      } else {
        previousPaneClick.current = null;
      }
      firstPanePress.current = null;
    },
    [clearCanvasSelection, screenToFlowPosition, setNodes],
  );

  const onCanvasPointerCancelCapture = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (
        marqueePointer.current?.pointerId === event.pointerId ||
        firstPanePress.current?.pointerId === event.pointerId
      ) {
        cancelMarquee();
      }
    },
    [cancelMarquee],
  );

  useEffect(() => {
    const previewChanged = previousPreviewType.current !== previewType;
    const periodChanged = previousChronologicalPeriod.current !== chronologicalPeriod;
    previousPreviewType.current = previewType;
    previousChronologicalPeriod.current = chronologicalPeriod;
    if (previewChanged || periodChanged) didFit.current = false;
    setNodes((current) => {
      const currentById = new Map(current.map((node) => [node.id, node]));
      const replacePositions = replacePositionsOnNextLayout.current;
      replacePositionsOnNextLayout.current = false;
      if (previewChanged || previewType === "chronological") {
        return initialNodes.map((node) => ({
          ...node,
          selected: currentById.get(node.id)?.selected ?? false,
        }));
      }
      const merged = initialNodes.map((node) => {
        const existing = currentById.get(node.id);
        if (!existing || replacePositions) return node;
        const hasPersistedPosition =
          typeof node.data.member.pos_x === "number" && typeof node.data.member.pos_y === "number";
        return {
          ...node,
          position: hasPersistedPosition ? node.position : existing.position,
        };
      });
      return merged;
    });
    setEdges((current) => {
      if (previewChanged || previewType === "chronological") {
        const selectedIds = new Set(current.filter((edge) => edge.selected).map((edge) => edge.id));
        return initialEdges.map((edge) => ({ ...edge, selected: selectedIds.has(edge.id) }));
      }
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
  }, [initialNodes, initialEdges, previewType, chronologicalPeriod, setNodes, setEdges, fitView]);

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
      if (event.key === "Escape") {
        cancelMarquee();
        clearCanvasSelection();
        return;
      }
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
  }, [cancelMarquee, canvasCanEdit, clearCanvasSelection]);

  useEffect(() => {
    cancelMarquee();
    return cancelMarquee;
  }, [cancelMarquee, previewType]);

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
      chronologicalPeriod,
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
    chronologicalPeriod,
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
    <div
      ref={canvasRef}
      className={`family-canvas relative h-full w-full ${marqueeRect ? "is-marquee-selecting" : ""}`}
      onWheel={onCanvasWheel}
      onPointerDownCapture={onCanvasPointerDownCapture}
      onPointerMoveCapture={onCanvasPointerMoveCapture}
      onPointerUpCapture={onCanvasPointerUpCapture}
      onPointerCancelCapture={onCanvasPointerCancelCapture}
      onLostPointerCapture={onCanvasPointerCancelCapture}
    >
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
                    <div className="font-medium">{memberNameWithBirthYear(m, lang)}</div>
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
        onEdgeClick={(event, clickedEdge) => {
          const sharedScope =
            event.target instanceof Element
              ? event.target.closest<SVGPathElement>("[data-shared-scope]")?.dataset.sharedScope
              : undefined;
          const sharedSelection =
            sharedScope === "source" || sharedScope === "family"
              ? sharedRouteSelectionIds(edges, clickedEdge, sharedScope)
              : previewType === "lineage"
                ? familyLevelSharedSelectionIds(
                    edges,
                    nodes,
                    clickedEdge,
                    screenToFlowPosition({ x: event.clientX, y: event.clientY }),
                  )
                : null;
          setEdges((current) =>
            current.map((edge) => ({
              ...edge,
              selected: sharedSelection?.has(edge.id) ?? edge.id === clickedEdge.id,
            })),
          );
        }}
        onNodeClick={() =>
          setEdges((current) =>
            current.map((edge) => (edge.selected ? { ...edge, selected: false } : edge)),
          )
        }
        onPaneClick={clearCanvasSelection}
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
        defaultEdgeOptions={{
          type: "relationship",
          focusable: capabilities.canSelect,
          deletable: false,
          updatable: canvasCanEdit,
        }}
        deleteKeyCode={null}
        fitView
        onMove={(_event, nextViewport) => {
          viewportRef.current = nextViewport;
          setViewport(nextViewport);
        }}
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
              top: `${((activeGeneration.start - earliestGeneration) / chronologicalPeriod) * DECADE_ROW_H * viewport.zoom + viewport.y}px`,
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

      {marqueeRect && (
        <div
          className="pointer-events-none absolute z-[5] border border-primary bg-primary/10"
          style={{
            left: marqueeRect.x,
            top: marqueeRect.y,
            width: marqueeRect.width,
            height: marqueeRect.height,
          }}
          aria-hidden="true"
        />
      )}

      <div className="absolute top-24 right-4 z-10 flex max-h-[calc(100%-8rem)] w-72 max-w-[calc(100%-2rem)] flex-col gap-2 overflow-y-auto">
        {overviewMode && (
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
                      search: { mode: "preview", preview: "lineage", period: chronologicalPeriod },
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
                      search: {
                        mode: "preview",
                        preview: "chronological",
                        period: chronologicalPeriod,
                      },
                    })
                  }
                  className={`rounded px-2 py-1.5 ${previewType === "chronological" ? "bg-card font-medium shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
                >
                  {t("generation_view")}
                </button>
              </div>
            )}
          </div>
        )}
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
                <label className="mb-1 block text-[10px] text-muted-foreground">
                  {t("period_length")}
                </label>
                <Input
                  value={periodDraft}
                  onChange={(event) => setPeriodDraft(event.target.value)}
                  inputMode="numeric"
                  type="text"
                  placeholder={t("period_placeholder")}
                  aria-invalid={
                    periodDraft.length > 0 && !isChronologicalPeriod(Number(periodDraft))
                  }
                  className="h-8 text-xs"
                />
                <p
                  className={`mb-2 mt-1 text-[10px] ${
                    periodDraft.length > 0 && !isChronologicalPeriod(Number(periodDraft))
                      ? "text-destructive"
                      : "text-muted-foreground"
                  }`}
                >
                  {periodDraft.length > 0 && !isChronologicalPeriod(Number(periodDraft))
                    ? t("period_invalid")
                    : t("period_range", {
                        min: MIN_CHRONOLOGICAL_PERIOD,
                        max: MAX_CHRONOLOGICAL_PERIOD,
                      })}
                </p>
                <div className="flex gap-1">
                  <Input
                    value={generationYear}
                    onChange={(event) =>
                      setGenerationYear(event.target.value.replace(/[^0-9]/g, "").slice(0, 4))
                    }
                    onKeyDown={(event) => event.key === "Enter" && scrollToGeneration()}
                    inputMode="numeric"
                    placeholder={t("generation_year_placeholder")}
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
        {(overviewMode || canManageSubfamilies) && (
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
                  readOnly={overviewMode || !canManageSubfamilies}
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
  overviewMode = false,
  preview = "lineage",
  chronologicalPeriod = DEFAULT_CHRONOLOGICAL_PERIOD,
  accessMode = "edit",
}: {
  readOnly?: boolean;
  overviewMode?: boolean;
  preview?: TreePreviewType;
  chronologicalPeriod?: ChronologicalPeriod;
  accessMode?: TreeAccessMode;
}) {
  return (
    <ReactFlowProvider>
      <Inner
        readOnly={readOnly}
        overviewMode={overviewMode}
        preview={preview}
        chronologicalPeriod={chronologicalPeriod}
        accessMode={accessMode}
      />
    </ReactFlowProvider>
  );
}
