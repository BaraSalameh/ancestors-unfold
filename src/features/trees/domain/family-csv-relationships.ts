import {
  csvError,
  csvWarning,
  validFamilyCsvSourceId,
  type FamilyCsvIssue,
  type PendingMember,
} from "./family-csv-contract";

export function synthesizeUnknownWives(members: PendingMember[]) {
  const warnings: FamilyCsvIssue[] = [];
  const knownIds = new Set(members.map(({ id }) => id));
  const now = new Date().toISOString();
  for (const husband of [...members]) {
    if (husband.gender !== "male") continue;
    for (const spouseRef of husband.rawSpouses) {
      if (knownIds.has(spouseRef) || !validFamilyCsvSourceId(spouseRef)) continue;
      knownIds.add(spouseRef);
      members.push({
        id: spouseRef,
        name_en: "Unknown wife",
        name_ar: "زوجة غير معروفة",
        gender: "female",
        citizen_status: "resident",
        is_unknown: true,
        created_at: now,
        updated_at: now,
        sourceRow: husband.sourceRow,
        rawSpouses: [],
        rawDivorced: [],
      });
      warnings.push(
        csvWarning(
          "CREATED_UNKNOWN_WIFE",
          `Created an unknown wife for missing spouse reference ${spouseRef}.`,
          husband.sourceRow,
          "spouse_refs",
        ),
      );
    }
  }
  return warnings;
}

function validateParents(member: PendingMember, byId: ReadonlyMap<string, PendingMember>) {
  const issues: FamilyCsvIssue[] = [];
  for (const [column, parentId, gender] of [
    ["father_id", member.father_id, "male"],
    ["mother_id", member.mother_id, "female"],
  ] as const) {
    if (!parentId) continue;
    const parent = byId.get(parentId);
    if (!parent)
      issues.push(
        csvError(
          "MISSING_REFERENCE",
          `${column} references missing member ${parentId}.`,
          member.sourceRow,
          column,
        ),
      );
    else if (parent.id === member.id)
      issues.push(
        csvError("SELF_PARENT", "A member cannot be their own parent.", member.sourceRow, column),
      );
    else if (parent.gender !== gender)
      issues.push(
        csvError(
          "PARENT_GENDER",
          `${column} must reference a ${gender} member.`,
          member.sourceRow,
          column,
        ),
      );
  }
  return issues;
}

function validateSpouses(
  member: PendingMember,
  byId: ReadonlyMap<string, PendingMember>,
  spouseOrder: Map<string, string[]>,
  divorced: Map<string, Set<string>>,
) {
  const issues: FamilyCsvIssue[] = [];
  for (const spouseId of member.rawSpouses) {
    const spouse = byId.get(spouseId);
    if (!spouse)
      issues.push(
        csvError(
          "MISSING_REFERENCE",
          `spouse_ids references missing member ${spouseId}.`,
          member.sourceRow,
          "spouse_ids",
        ),
      );
    else if (spouse.id === member.id)
      issues.push(
        csvError(
          "SELF_SPOUSE",
          "A member cannot be their own spouse.",
          member.sourceRow,
          "spouse_ids",
        ),
      );
    else if (spouse.gender === member.gender)
      issues.push(
        csvError(
          "SPOUSE_GENDER",
          "Spouses must have opposite genders in this tree model.",
          member.sourceRow,
          "spouse_ids",
        ),
      );
    else linkSpouses(member.id, spouseId, spouseOrder, divorced);
  }
  return issues;
}

function linkSpouses(
  memberId: string,
  spouseId: string,
  spouseOrder: Map<string, string[]>,
  divorced: Map<string, Set<string>>,
) {
  const reverse = spouseOrder.get(spouseId)!;
  if (!reverse.includes(memberId)) reverse.push(memberId);
  if (divorced.get(memberId)!.has(spouseId) || divorced.get(spouseId)!.has(memberId)) {
    divorced.get(memberId)!.add(spouseId);
    divorced.get(spouseId)!.add(memberId);
  }
}

function inferParentUnion(
  member: PendingMember,
  byId: ReadonlyMap<string, PendingMember>,
  spouseOrder: Map<string, string[]>,
) {
  if (!member.father_id || !member.mother_id) return undefined;
  const father = byId.get(member.father_id);
  const mother = byId.get(member.mother_id);
  if (father?.gender !== "male" || mother?.gender !== "female") return undefined;
  const fatherOrder = spouseOrder.get(father.id)!;
  const motherOrder = spouseOrder.get(mother.id)!;
  const inferred = !fatherOrder.includes(mother.id) && !motherOrder.includes(father.id);
  if (!fatherOrder.includes(mother.id)) fatherOrder.push(mother.id);
  if (!motherOrder.includes(father.id)) motherOrder.push(father.id);
  return inferred
    ? csvWarning(
        "INFERRED_PARENT_UNION",
        `Added spouse relationship between ${father.id} and ${mother.id}.`,
        member.sourceRow,
      )
    : undefined;
}

function applyNormalizedSpouses(
  member: PendingMember,
  spouseOrder: ReadonlyMap<string, string[]>,
  divorced: ReadonlyMap<string, Set<string>>,
) {
  const next = spouseOrder.get(member.id)!;
  const issues =
    next.length > 100
      ? [
          csvError(
            "TOO_MANY_SPOUSES",
            "A member may have at most 100 spouses.",
            member.sourceRow,
            "spouse_ids",
          ),
        ]
      : [];
  member.spouse_ids = next.length ? next : undefined;
  member.spouse_id = next[0];
  const divorcedIds = next.filter((id) => divorced.get(member.id)!.has(id));
  member.divorced_from = divorcedIds.length ? divorcedIds : undefined;
  return issues;
}

export function validateAndNormalizeRelationships(members: PendingMember[]) {
  const issues: FamilyCsvIssue[] = [];
  const warnings: FamilyCsvIssue[] = [];
  const byId = new Map(members.map((member) => [member.id, member]));
  const spouseOrder = new Map(members.map((member) => [member.id, [...member.rawSpouses]]));
  const divorced = new Map(members.map((member) => [member.id, new Set(member.rawDivorced)]));
  for (const member of members) {
    issues.push(...validateParents(member, byId));
    issues.push(...validateSpouses(member, byId, spouseOrder, divorced));
    const warning = inferParentUnion(member, byId, spouseOrder);
    if (warning) warnings.push(warning);
  }
  for (const member of members)
    issues.push(...applyNormalizedSpouses(member, spouseOrder, divorced));
  return { issues, warnings };
}

export function ancestryCycleIssues(members: PendingMember[]) {
  const issues: FamilyCsvIssue[] = [];
  const byId = new Map(members.map((member) => [member.id, member]));
  const complete = new Set<string>();
  const visiting = new Set<string>();
  const visit = (id: string): boolean => {
    if (complete.has(id)) return false;
    if (visiting.has(id)) return true;
    visiting.add(id);
    const member = byId.get(id);
    for (const parentId of [member?.father_id, member?.mother_id])
      if (parentId && byId.has(parentId) && visit(parentId)) return true;
    visiting.delete(id);
    complete.add(id);
    return false;
  };
  for (const member of members)
    if (visit(member.id)) {
      issues.push(
        csvError(
          "ANCESTRY_CYCLE",
          `An ancestry cycle includes member ${member.id}.`,
          member.sourceRow,
        ),
      );
      break;
    }
  return issues;
}
