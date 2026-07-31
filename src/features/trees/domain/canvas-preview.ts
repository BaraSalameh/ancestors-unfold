import type { FamilyMember } from "@/features/members";

export type TreePreviewType = "lineage" | "chronological";
export const MIN_CHRONOLOGICAL_PERIOD = 1;
export const MAX_CHRONOLOGICAL_PERIOD = 50;
export const DEFAULT_CHRONOLOGICAL_PERIOD = 10;
export type ChronologicalPeriod = number;

export interface ChronologicalBand {
  start: number;
  end: number;
}

export function isChronologicalPeriod(value: unknown): value is ChronologicalPeriod {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= MIN_CHRONOLOGICAL_PERIOD &&
    value <= MAX_CHRONOLOGICAL_PERIOD
  );
}

export function chronologicalPeriodOrDefault(value: unknown): ChronologicalPeriod {
  const numericValue = typeof value === "string" ? Number(value) : value;
  return isChronologicalPeriod(numericValue) ? numericValue : DEFAULT_CHRONOLOGICAL_PERIOD;
}

export function chronologicalBandForYear(
  year: number,
  period: ChronologicalPeriod,
): ChronologicalBand {
  const start = Math.floor(year / period) * period;
  return { start, end: start + period - 1 };
}

export function chronologicalBandsForMembers(
  members: readonly Pick<FamilyMember, "birth_date">[],
  period: ChronologicalPeriod,
): ChronologicalBand[] {
  const unique = new Map<string, ChronologicalBand>();
  for (const member of members) {
    const year = Number.parseInt(member.birth_date?.slice(0, 4) ?? "", 10);
    if (!Number.isFinite(year)) continue;
    const band = chronologicalBandForYear(year, period);
    unique.set(`${band.start}-${band.end}`, band);
  }
  return [...unique.values()].sort((first, second) => first.start - second.start);
}

export interface CanvasCapabilities {
  canMutate: boolean;
  canDrag: boolean;
  canConnect: boolean;
  canSelect: boolean;
  canAutoLayout: boolean;
}

export type CanvasWheelIntent = "pan" | "zoom";

export interface CanvasWheelInput {
  deltaX: number;
  deltaY: number;
  deltaMode: number;
  ctrlKey?: boolean;
  metaKey?: boolean;
}

export interface CanvasPoint {
  x: number;
  y: number;
}

export interface CanvasRect extends CanvasPoint {
  width: number;
  height: number;
}

export function canvasWheelIntent(input: CanvasWheelInput): CanvasWheelIntent {
  if (input.ctrlKey || input.metaKey) return "zoom";
  if (input.deltaMode !== 0) return "zoom";
  const hasHorizontalMotion = Math.abs(input.deltaX) > 0.5;
  const fineVerticalMotion = Math.abs(input.deltaY) < 40;
  return hasHorizontalMotion || fineVerticalMotion ? "pan" : "zoom";
}

export function isDoublePanePress(
  previous: (CanvasPoint & { at: number }) | null,
  current: CanvasPoint & { at: number },
  maxDelay = 350,
  maxDistance = 6,
): boolean {
  if (!previous || current.at - previous.at < 0 || current.at - previous.at > maxDelay)
    return false;
  return Math.hypot(current.x - previous.x, current.y - previous.y) <= maxDistance;
}

export function canvasRectBetween(start: CanvasPoint, end: CanvasPoint): CanvasRect {
  return {
    x: Math.min(start.x, end.x),
    y: Math.min(start.y, end.y),
    width: Math.abs(end.x - start.x),
    height: Math.abs(end.y - start.y),
  };
}

export function hasCanvasDragStarted(
  start: CanvasPoint,
  current: CanvasPoint,
  minimumDistance = 4,
): boolean {
  return Math.hypot(current.x - start.x, current.y - start.y) >= minimumDistance;
}

export function canvasRectsIntersect(first: CanvasRect, second: CanvasRect): boolean {
  return (
    first.x <= second.x + second.width &&
    first.x + first.width >= second.x &&
    first.y <= second.y + second.height &&
    first.y + first.height >= second.y
  );
}

export function canvasCapabilities(
  hasTreeEditAccess: boolean,
  previewType: TreePreviewType,
): CanvasCapabilities {
  const canMutate = hasTreeEditAccess && previewType === "lineage";
  return {
    canMutate,
    canDrag: canMutate,
    canConnect: canMutate,
    canSelect: true,
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
