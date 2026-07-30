import type { FamilyMember } from "@/features/members";

export type TreePreviewType = "lineage" | "chronological";

export interface CanvasCapabilities {
  canMutate: boolean;
  canDrag: boolean;
  canConnect: boolean;
  canSelect: boolean;
  canAutoLayout: boolean;
}

export function canvasCapabilities(
  hasTreeEditAccess: boolean,
  _previewType: TreePreviewType,
): CanvasCapabilities {
  const canMutate = hasTreeEditAccess;
  return {
    canMutate,
    canDrag: canMutate,
    canConnect: canMutate,
    canSelect: canMutate,
    canAutoLayout: canMutate,
  };
}

const NODE_WIDTH = 260;
const GENERATION_GAP = 340;
const SIBLING_GAP = 40;
const ROOT_GAP = 170;

function year(member: FamilyMember): number {
  const value = Number.parseInt(member.birth_date?.slice(0, 4) ?? "", 10);
  return Number.isFinite(value) ? value : Number.MIN_SAFE_INTEGER;
}

export function strictDecadeOrder(members: FamilyMember[]): FamilyMember[] {
  return [...members].sort(
    (first, second) => year(second) - year(first) || first.id.localeCompare(second.id),
  );
}

export function hierarchyPositions(
  members: FamilyMember[],
  visibleIds: ReadonlySet<string>,
): Map<string, { x: number; y: number }> {
  const byId = new Map(members.filter((member) => visibleIds.has(member.id)).map((m) => [m.id, m]));
  const compare = (a: string, b: string) => {
    const first = byId.get(a)!;
    const second = byId.get(b)!;
    return year(second) - year(first) || a.localeCompare(b);
  };
  const parentByChild = new Map<string, string>();
  const childrenByParent = new Map<string, string[]>();

  for (const member of byId.values()) {
    const parentId =
      member.father_id && byId.has(member.father_id)
        ? member.father_id
        : member.mother_id && byId.has(member.mother_id)
          ? member.mother_id
          : undefined;
    if (!parentId || parentId === member.id) continue;
    parentByChild.set(member.id, parentId);
    childrenByParent.set(parentId, [...(childrenByParent.get(parentId) ?? []), member.id]);
  }
  for (const children of childrenByParent.values()) children.sort(compare);

  const widths = new Map<string, number>();
  const widthOf = (id: string, visiting = new Set<string>()): number => {
    if (widths.has(id)) return widths.get(id)!;
    if (visiting.has(id)) return NODE_WIDTH;
    const nextVisiting = new Set(visiting).add(id);
    const children = childrenByParent.get(id) ?? [];
    const childrenWidth = children.reduce(
      (total, childId, index) =>
        total + widthOf(childId, nextVisiting) + (index === 0 ? 0 : SIBLING_GAP),
      0,
    );
    const width = Math.max(NODE_WIDTH, childrenWidth);
    widths.set(id, width);
    return width;
  };

  const roots = [...byId.keys()].filter((id) => !parentByChild.has(id)).sort(compare);
  const covered = new Set<string>();
  const positions = new Map<string, { x: number; y: number }>();
  const place = (id: string, left: number, depth: number, visiting = new Set<string>()) => {
    if (covered.has(id) || visiting.has(id)) return;
    covered.add(id);
    const width = widthOf(id);
    positions.set(id, { x: left + (width - NODE_WIDTH) / 2, y: depth * GENERATION_GAP });
    const children = childrenByParent.get(id) ?? [];
    let cursor = left;
    for (const childId of children) {
      place(childId, cursor, depth + 1, new Set(visiting).add(id));
      cursor += widthOf(childId) + SIBLING_GAP;
    }
  };

  let cursor = 0;
  for (const rootId of roots) {
    place(rootId, cursor, 0);
    cursor += widthOf(rootId) + ROOT_GAP;
  }
  for (const id of [...byId.keys()].sort(compare)) {
    if (covered.has(id)) continue;
    place(id, cursor, 0);
    cursor += widthOf(id) + ROOT_GAP;
  }
  return positions;
}
