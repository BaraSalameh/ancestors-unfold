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
import {
  Search,
  X,
  Info,
  LayoutGrid,
  Pencil,
  Trash2,
  CalendarRange,
  ChevronDown,
} from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { MemberNode, type MemberNodeData } from "./MemberNode";
import { RelationshipEdge } from "./RelationshipEdge";
import { familyStore, useFamily, useFamilyPersistence } from "@/lib/family-store";
import { displayName, ordinal, useI18n } from "@/lib/i18n";
import { useNavigate } from "@tanstack/react-router";
import type { FamilyMember, SubFamily } from "@/lib/family-types";
import { computeWivesByHusband, wifeColorFor } from "@/lib/wife-colors";

const NODE_W = 260;
const NODE_H = 130;
const NODE_H_HUSBAND = 220;
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

export function SubfamilyPanel({
  selectedSubfamilyId,
  onSelectSubfamily,
  filterEnabled,
  onToggleFilter,
  mode = "manage",
  hideHeading = false,
}: {
  selectedSubfamilyId: string | null;
  onSelectSubfamily: (id: string | null) => void;
  filterEnabled: boolean;
  onToggleFilter: (enabled: boolean) => void;
  mode?: "home" | "manage";
  hideHeading?: boolean;
}) {
  const { t, lang } = useI18n();
  const members = useFamily();
  const [newName, setNewName] = useState("");
  const [maleSearch, setMaleSearch] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftNameEn, setDraftNameEn] = useState("");
  const [draftNameAr, setDraftNameAr] = useState("");
  const [draftMaleId, setDraftMaleId] = useState("");
  const [attachmentName, setAttachmentName] = useState("");
  const [attachmentType, setAttachmentType] = useState("Document");
  const [attachmentUrl, setAttachmentUrl] = useState("");
  const subfamilies = familyStore.getSubfamilies();
  const maleMembers = members.filter((member) => member.gender === "male");

  const selected = selectedSubfamilyId
    ? subfamilies.find((sf) => sf.id === selectedSubfamilyId)
    : null;
  const selectedMembers = selectedSubfamilyId
    ? familyStore.getSubfamilyMembers(selectedSubfamilyId)
    : [];
  const livingMembers = selectedMembers.filter((member) => !member.death_date);
  const maleCount = selectedMembers.filter((member) => member.gender === "male").length;
  const femaleCount = selectedMembers.filter((member) => member.gender === "female").length;
  const livingMaleCount = livingMembers.filter((member) => member.gender === "male").length;
  const livingFemaleCount = livingMembers.filter((member) => member.gender === "female").length;
  const linkedMale = selected?.linked_male_id
    ? (maleMembers.find((member) => member.id === selected.linked_male_id) ?? null)
    : null;
  const isHomeMode = mode === "home";

  const handleAddSubfamily = () => {
    const name = newName.trim();
    if (!name) return;

    const created = familyStore.addSubfamily(name, name);
    setNewName("");
    setMaleSearch("");
    onSelectSubfamily(created.id);
    setEditingId(null);
  };

  const startEdit = (subfamily: SubFamily) => {
    setEditingId(subfamily.id);
    setDraftNameEn(subfamily.name_en);
    setDraftNameAr(subfamily.name_ar);
    setDraftMaleId(subfamily.linked_male_id ?? "");
    const linked = maleMembers.find((member) => member.id === subfamily.linked_male_id);
    setMaleSearch(linked ? displayName(linked, lang) : "");
  };

  const handleSaveEdit = () => {
    if (!selected) return;

    const nextNameEn = draftNameEn.trim();
    const nextNameAr = draftNameAr.trim();
    if (!nextNameEn && !nextNameAr) return;

    const matchedMale = maleMembers.find((member) => {
      const candidate = displayName(member, lang).toLowerCase();
      return (
        candidate === maleSearch.trim().toLowerCase() ||
        member.name_en.toLowerCase() === maleSearch.trim().toLowerCase() ||
        member.name_ar === maleSearch.trim()
      );
    });

    familyStore.updateSubfamily(selected.id, {
      name_en: nextNameEn || selected.name_en,
      name_ar: nextNameAr || selected.name_ar,
      linked_male_id: matchedMale?.id ?? (draftMaleId || undefined),
    });
    setEditingId(null);
  };

  const handleDeleteSubfamily = () => {
    if (!selected) return;
    familyStore.deleteSubfamily(selected.id);
    onSelectSubfamily(null);
    setEditingId(null);
  };

  const handleAddAttachment = () => {
    if (!selected || !attachmentName.trim() || !attachmentUrl.trim()) return;
    const nextAttachments = [
      ...(selected.attachments ?? []),
      {
        id: crypto.randomUUID(),
        name: attachmentName.trim(),
        type: attachmentType.trim() || "Document",
        url: attachmentUrl.trim(),
        created_at: new Date().toISOString(),
      },
    ];
    familyStore.updateSubfamily(selected.id, { attachments: nextAttachments });
    setAttachmentName("");
    setAttachmentType("Document");
    setAttachmentUrl("");
  };

  const handleRemoveAttachment = (attachmentId: string) => {
    if (!selected) return;
    const nextAttachments = (selected.attachments ?? []).filter(
      (attachment) => attachment.id !== attachmentId,
    );
    familyStore.updateSubfamily(selected.id, { attachments: nextAttachments });
  };

  const toggleSelection = (subfamilyId: string) => {
    if (selectedSubfamilyId === subfamilyId) {
      onSelectSubfamily(null);
      onToggleFilter(false);
      return;
    }
    onSelectSubfamily(subfamilyId);
    onToggleFilter(true);
  };

  if (selectedSubfamilyId && selected && isHomeMode) {
    return (
      <div className="space-y-2">
        <button
          onClick={() => {
            onSelectSubfamily(null);
            onToggleFilter(false);
          }}
          className="text-xs hover:underline"
        >
          ← {t("back")}
        </button>
        <h3 className="font-semibold text-card-foreground">{displayName(selected, lang)}</h3>
        <div className="space-y-1 text-[10px] text-muted-foreground">
          <div className="flex justify-between">
            <span>{t("subfamily_total")}:</span>
            <span className="font-medium">{selectedMembers.length}</span>
          </div>
          <div className="flex justify-between">
            <span>{t("subfamily_living")}:</span>
            <span className="font-medium">{livingMembers.length}</span>
          </div>
        </div>
      </div>
    );
  }

  if (selectedSubfamilyId && selected && !isHomeMode) {
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <button onClick={() => onSelectSubfamily(null)} className="text-xs hover:underline">
            ← {t("back")}
          </button>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => startEdit(selected)}
              className="rounded border p-1 text-muted-foreground hover:bg-accent"
              title={t("edit")}
            >
              <Pencil className="h-3 w-3" />
            </button>
            <button
              type="button"
              onClick={handleDeleteSubfamily}
              className="rounded border p-1 text-muted-foreground hover:bg-accent"
              title={t("delete")}
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </div>
        </div>

        {editingId === selected.id ? (
          <div className="space-y-2 rounded border bg-background/50 p-2">
            <input
              type="text"
              value={draftNameEn}
              onChange={(event) => setDraftNameEn(event.target.value)}
              placeholder={t("name_en")}
              className="w-full rounded border bg-background px-2 py-1 text-[10px]"
            />
            <input
              type="text"
              value={draftNameAr}
              onChange={(event) => setDraftNameAr(event.target.value)}
              placeholder={t("name_ar")}
              className="w-full rounded border bg-background px-2 py-1 text-[10px]"
            />
            <input
              type="text"
              value={maleSearch}
              onChange={(event) => {
                setMaleSearch(event.target.value);
                const matched = maleMembers.find((member) => {
                  const candidate = displayName(member, lang).toLowerCase();
                  return (
                    candidate === event.target.value.trim().toLowerCase() ||
                    member.name_en.toLowerCase() === event.target.value.trim().toLowerCase() ||
                    member.name_ar === event.target.value.trim()
                  );
                });
                setDraftMaleId(matched?.id ?? "");
              }}
              placeholder={t("search_male")}
              className="w-full rounded border bg-background px-2 py-1 text-[10px]"
              list="subfamily-male-list"
            />
            <datalist id="subfamily-male-list">
              {maleMembers.map((member) => (
                <option key={member.id} value={displayName(member, lang)} />
              ))}
            </datalist>
            <div className="flex gap-1">
              <button
                type="button"
                onClick={handleSaveEdit}
                className="rounded bg-primary px-2 py-1 text-[10px] text-primary-foreground"
              >
                {t("save")}
              </button>
              <button
                type="button"
                onClick={() => setEditingId(null)}
                className="rounded border px-2 py-1 text-[10px]"
              >
                {t("cancel")}
              </button>
            </div>
          </div>
        ) : (
          <>
            <h3 className="font-semibold text-card-foreground">{displayName(selected, lang)}</h3>
            {linkedMale ? (
              <div className="text-[10px] text-muted-foreground">
                {t("linked_male")}:{" "}
                <span className="font-medium text-foreground">{displayName(linkedMale, lang)}</span>
              </div>
            ) : null}
            <div className="grid grid-cols-2 gap-2">
              {[
                ["subfamily_total", selectedMembers.length],
                ["subfamily_living", livingMembers.length],
                ["subfamily_living_males", livingMaleCount],
                ["subfamily_living_females", livingFemaleCount],
                ["subfamily_males", maleCount],
                ["subfamily_females", femaleCount],
              ].map(([label, value]) => (
                <div key={label} className="rounded-lg border bg-card p-2 shadow-sm">
                  <div className="text-lg font-bold leading-none text-foreground">{value}</div>
                  <div className="mt-1 text-[10px] text-muted-foreground">
                    {t(label as Parameters<typeof t>[0])}
                  </div>
                </div>
              ))}
            </div>

            <div className="space-y-2 rounded border bg-background/50 p-2">
              <div className="text-[10px] font-semibold text-card-foreground">
                {t("add_attachment")}
              </div>
              <div className="flex flex-col gap-1">
                <input
                  type="text"
                  value={attachmentName}
                  onChange={(event) => setAttachmentName(event.target.value)}
                  placeholder={t("attachment_name")}
                  className="w-full rounded border bg-background px-2 py-1 text-[10px]"
                />
                <input
                  type="text"
                  value={attachmentType}
                  onChange={(event) => setAttachmentType(event.target.value)}
                  placeholder={t("attachment_type")}
                  className="w-full rounded border bg-background px-2 py-1 text-[10px]"
                />
                <input
                  type="text"
                  value={attachmentUrl}
                  onChange={(event) => setAttachmentUrl(event.target.value)}
                  placeholder={t("attachment_url")}
                  className="w-full rounded border bg-background px-2 py-1 text-[10px]"
                />
                <button
                  type="button"
                  onClick={handleAddAttachment}
                  disabled={!attachmentName.trim() || !attachmentUrl.trim()}
                  className="rounded bg-primary px-2 py-1 text-[10px] text-primary-foreground disabled:opacity-50"
                >
                  {t("add_attachment")}
                </button>
              </div>
              {(selected.attachments?.length ?? 0) === 0 ? (
                <p className="text-[10px] text-muted-foreground">{t("no_attachments")}</p>
              ) : (
                <div className="flex flex-col gap-1">
                  {(selected.attachments ?? []).map((attachment) => (
                    <div
                      key={attachment.id}
                      className="flex items-center justify-between gap-2 rounded border bg-background px-2 py-1"
                    >
                      <a
                        href={attachment.url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[10px] text-primary underline-offset-2 hover:underline"
                      >
                        {attachment.name} ({attachment.type})
                      </a>
                      <button
                        type="button"
                        onClick={() => handleRemoveAttachment(attachment.id)}
                        className="text-[10px] text-muted-foreground hover:text-destructive"
                        title={t("delete")}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {!hideHeading && <div className="font-semibold text-card-foreground">{t("subfamilies")}</div>}
      {subfamilies.length === 0 ? (
        <p className="text-[10px] text-muted-foreground">{t("none")}</p>
      ) : (
        <div className="flex flex-wrap gap-1">
          {subfamilies.map((sf) => {
            const count = familyStore.getSubfamilyMembers(sf.id).length;
            return (
              <button
                key={sf.id}
                onClick={() => (isHomeMode ? toggleSelection(sf.id) : onSelectSubfamily(sf.id))}
                className={`h-6 rounded-md border bg-background px-2 py-0.5 text-[10px] hover:bg-accent ${selectedSubfamilyId === sf.id ? "border-primary bg-primary/10 text-primary" : ""}`}
              >
                {displayName(sf, lang)} ({count})
              </button>
            );
          })}
        </div>
      )}
      {!isHomeMode ? (
        <div className="flex flex-col gap-1">
          <div className="flex gap-1">
            <input
              type="text"
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
              onKeyPress={(event) => event.key === "Enter" && handleAddSubfamily()}
              placeholder={t("add_subfamily")}
              className="flex-1 rounded border bg-background px-2 py-1 text-[10px]"
            />
            <button
              type="button"
              onClick={handleAddSubfamily}
              disabled={!newName.trim()}
              className="rounded border bg-primary px-2 py-1 text-[10px] text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              +
            </button>
          </div>
          <p className="text-[10px] text-muted-foreground">{t("select_linked_male")}</p>
        </div>
      ) : null}
    </div>
  );
}

function layout(
  members: FamilyMember[],
  collapsed: Set<string>,
  onOpen: (id: string) => void,
  highlightId: string | null,
  chronological = false,
  onToggleCollapsed?: (id: string) => void,
) {
  const memberById = new Map(members.map((m) => [m.id, m]));
  const wivesByHusband = computeWivesByHusband(members);

  // A wife's standalone card is hidden ONLY when she is an outsider (no
  // father resolvable in this tree) or a placeholder unknown wife. Cousin
  // wives (father exists in the tree) keep their own card so the family
  // link to their father remains visible.
  const asWife = new Set<string>();
  const wifeHusbandOf = new Map<string, string>(); // wifeId -> husbandId
  for (const [husbandId, list] of wivesByHusband.entries()) {
    for (const w of list) {
      wifeHusbandOf.set(w.id, husbandId);
      const hasFamily = !!(w.father_id && memberById.has(w.father_id));
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

  // Parent → child edges. Source is the father's card (husband). Color reflects
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
        data: { parentId: mId, childId: m.id, familyKey: `${mId}:mother-only`, kind: "parent" },
      });
    }
  }

  // Spouse "married to" edges — only when both endpoints are still visible.
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
      type: "straight",
      style: { stroke: "#a855f7", strokeWidth: 1.5, strokeDasharray: "2 4", strokeOpacity: 0.7 },
      data: { kind: "spouse" },
    });
  }

  dagre.layout(g);

  // Generation depth — sons, cousins, second cousins etc. share a level.
  const ROW_H = 340;
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
        ? ((band.start - earliestBand) / 10) * ROW_H
        : genOf(id) * ROW_H;
    const autoX = pos.x - pos.width / 2;
    const hasCustom = typeof m.pos_x === "number" && typeof m.pos_y === "number";
    return {
      id,
      type: "member",
      position: hasCustom && !chronological ? { x: m.pos_x!, y: m.pos_y! } : { x: autoX, y: autoY },
      data: {
        member: m,
        highlighted: highlightId === id,
        onOpen,
        wives: wivesByHusband.get(id),
        hasDescendants: (childrenMap.get(id)?.length ?? 0) > 0,
        collapsed: collapsed.has(id),
        onToggleCollapsed,
      },
      draggable: true,
    };
  });

  // Collision resolution — enforce min horizontal gap per generation row.
  const HGAP = 40;
  const VGAP = 40;
  const ordered = [...nodes].sort(
    (a, b) => a.position.y - b.position.y || a.position.x - b.position.x,
  );
  const byRow = new Map<number, Node<MemberNodeData>[]>();
  for (const node of ordered)
    byRow.set(node.position.y, [...(byRow.get(node.position.y) ?? []), node]);
  for (const row of byRow.values()) {
    const byAge = (a: Node<MemberNodeData>, b: Node<MemberNodeData>) =>
      (birthYear(b.data.member) ?? Number.MIN_SAFE_INTEGER) -
      (birthYear(a.data.member) ?? Number.MIN_SAFE_INTEGER);
    if (chronological) {
      row.sort(byAge);
      const totalWidth = row.length * NODE_W + Math.max(0, row.length - 1) * HGAP;
      row.forEach((node, index) => {
        node.position.x = index * (NODE_W + HGAP) - totalWidth / 2;
      });
      continue;
    }

    // Family Levels: keep siblings as a cluster beneath their parent instead
    // of flattening cousins into one row. Wider inter-family gaps make branch
    // ownership immediately visible and leave clean connector corridors.
    const nodeByMemberId = new Map(nodes.map((node) => [node.id, node]));
    const groups = new Map<string, Node<MemberNodeData>[]>();
    for (const node of row) {
      const member = node.data.member;
      const parentId =
        member.father_id && nodeByMemberId.has(member.father_id)
          ? member.father_id
          : member.mother_id && nodeByMemberId.has(member.mother_id)
            ? member.mother_id
            : `root:${member.id}`;
      groups.set(parentId, [...(groups.get(parentId) ?? []), node]);
    }
    const FAMILY_GAP = 170;
    const arranged = [...groups.entries()]
      .map(([parentId, children]) => {
        children.sort(byAge); // newest left, oldest right
        const width = children.length * NODE_W + Math.max(0, children.length - 1) * HGAP;
        const parent = nodeByMemberId.get(parentId);
        const anchor = parent
          ? parent.position.x + NODE_W / 2
          : children[0].position.x + NODE_W / 2;
        return { children, width, anchor, start: anchor - width / 2 };
      })
      .sort((a, b) => a.anchor - b.anchor);
    let cursor = Number.NEGATIVE_INFINITY;
    for (const group of arranged) {
      group.start = Math.max(group.start, cursor);
      cursor = group.start + group.width + FAMILY_GAP;
    }
    const balancingShift = arranged.length
      ? arranged.reduce((sum, group) => sum + group.anchor - (group.start + group.width / 2), 0) /
        arranged.length
      : 0;
    for (const group of arranged) {
      group.children.forEach((node, index) => {
        node.position.x = group.start + balancingShift + index * (NODE_W + HGAP);
      });
    }
  }
  for (let i = 0; i < ordered.length; i++) {
    const current = ordered[i];
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

  // Route each parent connector through a distinct gutter. Vertical segments
  // are rejected when they would pass through any card, while the staggered
  // entry/exit corridors prevent siblings from sharing the same visible line.
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const usedLanes: Array<{ x: number; top: number; bottom: number }> = [];
  const parentGroups = new Map<string, Edge[]>();
  for (const edge of edges) {
    const data = edge.data as { kind?: string; familyKey?: string } | undefined;
    if (data?.kind !== "parent") continue;
    const key = data.familyKey ?? edge.source;
    parentGroups.set(key, [...(parentGroups.get(key) ?? []), edge]);
  }
  const routeByEdge = new Map<string, Record<string, unknown>>();
  const sourceFamilyCounts = new Map<string, number>();
  for (const familyEdges of parentGroups.values()) {
    const source = nodeById.get(familyEdges[0].source);
    const targets = familyEdges
      .map((edge) => nodeById.get(edge.target))
      .filter((node): node is Node<MemberNodeData> => !!node);
    if (!source || !targets.length) continue;
    const sourceFamilyIndex = sourceFamilyCounts.get(source.id) ?? 0;
    sourceFamilyCounts.set(source.id, sourceFamilyIndex + 1);
    const sourceHeight = source.data.member.gender === "male" ? NODE_H_HUSBAND : NODE_H;
    const verticalTop = source.position.y + sourceHeight + 24;
    const verticalBottom = Math.max(...targets.map((target) => target.position.y - 24));
    const sourceCenter = source.position.x + NODE_W / 2;
    const targetCenter =
      targets.reduce((sum, target) => sum + target.position.x + NODE_W / 2, 0) / targets.length;
    const clearance = 28;
    const candidates = [
      sourceCenter,
      source.position.x - clearance,
      source.position.x + NODE_W + clearance,
      ...targets.flatMap((target) => [
        target.position.x - clearance,
        target.position.x + NODE_W + clearance,
      ]),
      ...nodes.flatMap((node) => [
        node.position.x - clearance,
        node.position.x + NODE_W + clearance,
      ]),
    ];
    const isClear = (x: number) =>
      nodes.every((node) => {
        if (node.id === source.id) return true;
        const height = node.data.member.gender === "male" ? NODE_H_HUSBAND : NODE_H;
        const overlapsY =
          node.position.y - 14 < verticalBottom && node.position.y + height + 14 > verticalTop;
        return !(overlapsY && x > node.position.x - 14 && x < node.position.x + NODE_W + 14);
      });
    const clear = [...new Set(candidates)].filter(isClear);
    const conflictsWithLane = (x: number) =>
      usedLanes.some(
        (lane) =>
          Math.abs(lane.x - x) < 24 && lane.top < verticalBottom && lane.bottom > verticalTop,
      );
    let routeX = (clear.length ? clear : candidates).sort((a, b) => {
      const score = (x: number) =>
        Math.abs(x - sourceCenter) +
        Math.abs(x - targetCenter) +
        (x === sourceCenter ? -500 : 0) +
        (conflictsWithLane(x) ? 10000 : 0);
      return score(a) - score(b);
    })[0];
    // A single child needs no shared family gutter: move toward that child
    // once, then descend directly into the card.
    if (familyEdges.length === 1) {
      const directX = targets[0].position.x + NODE_W / 2;
      if (isClear(directX) && !conflictsWithLane(directX)) routeX = directX;
    } else {
      // Snap once for the whole sibling group, never independently per edge.
      // This keeps one canonical family trunk when a child is already close
      // to the selected lane and avoids a visually parallel short drop.
      const nearbyTargetX = targets
        .map((target) => target.position.x + NODE_W / 2)
        .sort((a, b) => Math.abs(a - routeX) - Math.abs(b - routeX))[0];
      if (
        Math.abs(nearbyTargetX - routeX) < 72 &&
        isClear(nearbyTargetX) &&
        !conflictsWithLane(nearbyTargetX)
      ) {
        routeX = nearbyTargetX;
      }
    }
    usedLanes.push({ x: routeX, top: verticalTop, bottom: verticalBottom });
    const generationYs = [...new Set(targets.map((target) => target.position.y - 24))].sort(
      (a, b) => a - b,
    );
    const sharedFamilyJunctionY = generationYs[0];
    const trunkEndY = generationYs[generationYs.length - 1];
    const trunkOwnerId = familyEdges[0].id;
    familyEdges.sort(
      (a, b) =>
        (nodeById.get(a.target)?.position.x ?? 0) - (nodeById.get(b.target)?.position.x ?? 0),
    );
    familyEdges.forEach((edge, index) => {
      const target = nodeById.get(edge.target);
      const decadeJunctionY = target ? target.position.y - 24 : sharedFamilyJunctionY;
      routeByEdge.set(edge.id, {
        routeX,
        // Separate each spouse/family group immediately below the parent card.
        // Children in the same group still share this exact source segment.
        sourceLane: 24 + sourceFamilyIndex * 14,
        targetLane: 24,
        // Family Levels has one family bus. By Decade has one bus per decade;
        // siblings on the same decade row therefore share the exact junction.
        branchY: chronological ? decadeJunctionY : sharedFamilyJunctionY,
        drawTrunk: edge.id === trunkOwnerId,
        trunkEndY,
        generationBreakpoints:
          index === 0 ? (chronological ? generationYs : [sharedFamilyJunctionY]) : undefined,
      });
    });
  }
  const routedEdges = edges.map((edge) => ({
    ...edge,
    data: { ...edge.data, ...(routeByEdge.get(edge.id) ?? {}) },
  }));

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

function Inner({ readOnly = false }: { readOnly?: boolean }) {
  const members = useFamily();
  const persistence = useFamilyPersistence();
  const { t, lang } = useI18n();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [selectedSubfamilyId, setSelectedSubfamilyId] = useState<string | null>(null);
  const [subfamilyFilterEnabled, setSubfamilyFilterEnabled] = useState(false);
  const [generationYear, setGenerationYear] = useState("");
  const [viewport, setViewport] = useState({ x: 0, y: 0, zoom: 1 });
  const [previewType, setPreviewType] = useState<"lineage" | "chronological">("lineage");
  const [collapsedWidgets, setCollapsedWidgets] = useState({
    preview: false,
    generation: false,
    subfamilies: false,
  });
  const toggleWidget = (widget: keyof typeof collapsedWidgets) =>
    setCollapsedWidgets((current) => ({ ...current, [widget]: !current[widget] }));
  const { setCenter, fitView } = useReactFlow();
  const didFit = useRef(false);
  const edgeUpdateSuccessful = useRef(true);

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

  const onOpen = useCallback(
    (id: string) => {
      if (readOnly) return;
      navigate({ to: "/member/$id", params: { id } });
    },
    [navigate, readOnly],
  );

  const onToggleCollapsed = useCallback((id: string) => {
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

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
        highlightId,
        previewType === "chronological",
        onToggleCollapsed,
      ),
    [visibleMembers, collapsed, onOpen, highlightId, previewType, onToggleCollapsed],
  );

  const earliestGeneration = generations[0]?.start ?? 0;
  const activeGeneration = useMemo(() => {
    if (!generations.length) return null;
    const graphCenterY =
      ((typeof window === "undefined" ? 800 : window.innerHeight) / 2 - viewport.y) / viewport.zoom;
    return generations.reduce((closest, band) => {
      const bandY = ((band.start - earliestGeneration) / 10) * 340;
      const closestY = ((closest.start - earliestGeneration) / 10) * 340;
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
    const y = ((closest.start - earliestGeneration) / 10) * 340 + NODE_H / 2;
    setCenter(0, y, { zoom: Math.max(viewport.zoom, 0.65), duration: 600 });
    setGenerationYear(String(year));
  };

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
      if (!isMeta || readOnly) return;

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
  }, [readOnly]);

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
      toast.success(`${displayName(parent, lang)} → ${displayName(child, lang)}`);
    },
    [t, lang],
  );

  const onEdgesDelete = useCallback(
    (removed: Edge[]) => {
      let cleared = 0;
      for (const e of removed) {
        const data = e.data as { parentId?: string; childId?: string; kind?: string } | undefined;
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

  const onEdgeUpdateStart = useCallback(() => {
    edgeUpdateSuccessful.current = false;
  }, []);

  const onEdgeUpdate = useCallback(
    (oldEdge: Edge, newConn: Connection) => {
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

      familyStore.update(oldChild.id, { [oldRole]: undefined } as Partial<FamilyMember>);
      familyStore.update(newChild.id, { [newRole]: newParent.id } as Partial<FamilyMember>);
      setEdges((es) => updateEdge(oldEdge, newConn, es));
      toast.success(t("link_updated"));
    },
    [setEdges, t],
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

  const pickMother = (wifeId: string | null) => {
    if (!motherPicker) return;
    const patch: Partial<FamilyMember> = { father_id: motherPicker.fatherId };
    if (wifeId) patch.mother_id = wifeId;
    familyStore.update(motherPicker.childId, patch);
    const father = familyStore.get(motherPicker.fatherId);
    const child = familyStore.get(motherPicker.childId);
    if (father && child) {
      toast.success(`${displayName(father, lang)} → ${displayName(child, lang)}`);
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
      setCollapsed(new Set());
    }
  };

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
        {!readOnly && (
          <div className="pointer-events-auto flex flex-wrap items-center justify-center gap-2">
            <div className="inline-flex items-center gap-2 rounded-full border bg-card/90 px-3 py-1 text-[11px] text-muted-foreground shadow-sm backdrop-blur">
              <Info className="h-3 w-3" />
              {t("connect_hint")}
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => familyStore.undo()}
              disabled={!familyStore.canUndo()}
              className="shadow-sm"
            >
              {t("undo")}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => familyStore.redo()}
              disabled={!familyStore.canRedo()}
              className="shadow-sm"
            >
              {t("redo")}
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={onAutoLayout}
              className="gap-1.5 shadow-sm"
            >
              <LayoutGrid className="h-3.5 w-3.5" />
              {t("auto_layout")}
            </Button>
          </div>
        )}
      </div>

      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={readOnly ? undefined : onConnect}
        onEdgesDelete={readOnly ? undefined : onEdgesDelete}
        onEdgeUpdate={readOnly ? undefined : onEdgeUpdate}
        onEdgeUpdateStart={readOnly ? undefined : onEdgeUpdateStart}
        onEdgeUpdateEnd={readOnly ? undefined : onEdgeUpdateEnd}
        onNodeDragStop={readOnly ? undefined : onNodeDragStop}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        nodesDraggable={!readOnly}
        nodesConnectable={!readOnly}
        elementsSelectable={!readOnly}
        edgesUpdatable={!readOnly}
        edgesFocusable={!readOnly}
        minZoom={0.1}
        maxZoom={2}
        proOptions={{ hideAttribution: true }}
        connectionLineStyle={{ stroke: "#0ea5e9", strokeWidth: 2, strokeDasharray: "6 4" }}
        defaultEdgeOptions={{
          type: "relationship",
          focusable: !readOnly,
          deletable: !readOnly,
          updatable: !readOnly,
        }}
        deleteKeyCode={readOnly ? null : ["Backspace", "Delete"]}
        fitView
        onMove={(_event, nextViewport) => setViewport(nextViewport)}
      >
        <Background gap={24} className="!bg-background" />
        {previewType === "chronological" && activeGeneration && (
          <div
            className="pointer-events-none absolute inset-x-0 z-0 border-t-2 border-dashed border-primary/25"
            style={{
              top: `${((activeGeneration.start - earliestGeneration) / 10) * 340 * viewport.zoom + viewport.y}px`,
            }}
          >
            <span className="ms-3 rounded-b bg-background/90 px-2 py-1 text-[10px] font-medium text-muted-foreground">
              {activeGeneration.start}–{activeGeneration.end}
            </span>
          </div>
        )}
        <MiniMap pannable zoomable className="!bg-card !border" />
        <Controls showInteractive={false} className="!bg-card !border" />
      </ReactFlow>

      <div className="absolute bottom-[180px] right-4 z-10 flex w-72 max-w-[calc(100%-2rem)] flex-col gap-2">
        <div className="rounded-lg border bg-card p-3 text-xs shadow-sm">
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
                onClick={() => setPreviewType("lineage")}
                className={`rounded px-2 py-1.5 ${previewType === "lineage" ? "bg-card font-medium shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
              >
                {t("lineage_view")}
              </button>
              <button
                onClick={() => setPreviewType("chronological")}
                className={`rounded px-2 py-1.5 ${previewType === "chronological" ? "bg-card font-medium shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
              >
                {t("generation_view")}
              </button>
            </div>
          )}
        </div>
        {previewType === "chronological" && generations.length > 0 && (
          <div className="rounded-lg border bg-card p-3 text-xs shadow-sm">
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
                  />
                  <Button
                    size="sm"
                    onClick={scrollToGeneration}
                    disabled={generationYear.length !== 4}
                  >
                    {t("go")}
                  </Button>
                </div>
                {activeGeneration && (
                  <div className="mt-2 text-[10px] text-muted-foreground">
                    {activeGeneration.start}–{activeGeneration.end}
                  </div>
                )}
              </>
            )}
          </div>
        )}
        <div className="rounded-lg border bg-card p-3 text-xs shadow-sm">
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
      </div>

      {!readOnly && (
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
                        {w.death_date ? `–${w.death_date.slice(0, 4)}` : ""}
                        {divorced ? ` · ${t("divorced")}` : ""}
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

export function FamilyTree({ readOnly = false }: { readOnly?: boolean }) {
  return (
    <ReactFlowProvider>
      <Inner readOnly={readOnly} />
    </ReactFlowProvider>
  );
}
