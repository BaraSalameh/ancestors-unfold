import type { FamilyMember } from "@/features/members";
import {
  chronologicalBandForYear,
  hierarchyPositions,
  type ChronologicalPeriod,
} from "./canvas-preview";
import { computeWivesByHusband } from "./wife-colors";

const NODE_WIDTH = 260;
const DECADE_CARD_GAP = 140;
const DECADE_ROW_HEIGHT = 520;

export type TreeNodePosition = { x: number; y: number };
export type TreeLayoutGeometry = {
  renderedIds: string[];
  positions: Record<string, TreeNodePosition>;
};

const birthYear = (member: FamilyMember) => {
  const year = Number.parseInt(member.birth_date?.slice(0, 4) ?? "", 10);
  return Number.isFinite(year) ? year : null;
};

// Visibility covers explicit collapse, inferred spouses, unknown wives, and parent links.
// eslint-disable-next-line complexity
function visibleMemberIds(members: FamilyMember[], collapsed: ReadonlySet<string>): string[] {
  const byId = new Map(members.map((member) => [member.id, member]));
  const wivesByHusband = computeWivesByHusband(members);
  const hidden = new Set<string>();
  const children = new Map<string, string[]>();
  for (const member of members) {
    for (const parentId of [member.father_id, member.mother_id]) {
      if (!parentId) continue;
      const current = children.get(parentId);
      if (current) current.push(member.id);
      else children.set(parentId, [member.id]);
    }
  }
  for (const wives of wivesByHusband.values())
    for (const wife of wives) {
      const hasFamily = Boolean(
        (wife.father_id && byId.has(wife.father_id)) ||
        (wife.mother_id && byId.has(wife.mother_id)),
      );
      if (!hasFamily || wife.is_unknown) hidden.add(wife.id);
    }
  const queue = [...collapsed];
  for (let index = 0; index < queue.length; index++) {
    for (const childId of children.get(queue[index]) ?? []) {
      if (hidden.has(childId)) continue;
      hidden.add(childId);
      queue.push(childId);
    }
  }
  return members.filter(({ id }) => !hidden.has(id)).map(({ id }) => id);
}

export function computeTreeLayoutGeometry(
  members: FamilyMember[],
  collapsedIds: readonly string[],
  chronological: boolean,
  period: ChronologicalPeriod,
): TreeLayoutGeometry {
  const renderedIds = visibleMemberIds(members, new Set(collapsedIds));
  const rendered = new Set(renderedIds);
  const hierarchy = hierarchyPositions(members, rendered);
  const positions: Record<string, TreeNodePosition> = {};
  if (!chronological) {
    const byId = new Map(members.map((member) => [member.id, member]));
    for (const id of renderedIds) {
      const member = byId.get(id)!;
      positions[id] =
        typeof member.pos_x === "number" && typeof member.pos_y === "number"
          ? { x: member.pos_x, y: member.pos_y }
          : (hierarchy.get(id) ?? { x: 0, y: 0 });
    }
    return { renderedIds, positions };
  }

  const byBand = new Map<number, FamilyMember[]>();
  const memberById = new Map(members.map((member) => [member.id, member]));
  for (const id of renderedIds) {
    const member = memberById.get(id)!;
    const year = birthYear(member);
    const start =
      year === null ? Number.MIN_SAFE_INTEGER : chronologicalBandForYear(year, period).start;
    const row = byBand.get(start);
    if (row) row.push(member);
    else byBand.set(start, [member]);
  }
  const datedBands = [...byBand.keys()].filter((band) => band !== Number.MIN_SAFE_INTEGER);
  const earliest = datedBands.length ? Math.min(...datedBands) : 0;
  for (const [band, row] of byBand) {
    row.sort(
      (first, second) =>
        (hierarchy.get(first.id)?.x ?? 0) - (hierarchy.get(second.id)?.x ?? 0) ||
        (birthYear(second) ?? Number.MIN_SAFE_INTEGER) -
          (birthYear(first) ?? Number.MIN_SAFE_INTEGER) ||
        first.id.localeCompare(second.id),
    );
    const width = row.length * NODE_WIDTH + Math.max(0, row.length - 1) * DECADE_CARD_GAP;
    row.forEach((member, index) => {
      positions[member.id] = {
        x: index * (NODE_WIDTH + DECADE_CARD_GAP) - width / 2,
        y:
          band === Number.MIN_SAFE_INTEGER
            ? -DECADE_ROW_HEIGHT
            : ((band - earliest) / period) * DECADE_ROW_HEIGHT,
      };
    });
  }
  return { renderedIds, positions };
}
