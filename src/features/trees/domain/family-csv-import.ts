import type { BranchUniquenessInput } from "./branch-uniqueness";
import { newBranchConflicts } from "./branch-uniqueness";
import {
  FAMILY_CSV_HEADERS,
  FAMILY_CSV_MAX_BRANCHES,
  FAMILY_CSV_MAX_MEMBERS,
  MAX_REPORTED_ISSUES,
  csvError,
  type FamilyCsvIssue,
  type FamilyCsvParseResult,
  type FamilyCsvPreview,
  type RemappedFamilyCsvPreview,
} from "./family-csv-contract";
import { parseFamilyCsvMembers } from "./family-csv-member-parser";
import { readFamilyCsvRows } from "./family-csv-reader";
import {
  ancestryCycleIssues,
  synthesizeUnknownWives,
  validateAndNormalizeRelationships,
} from "./family-csv-relationships";

export { FAMILY_CSV_MAX_BYTES } from "./family-csv-contract";
export { validateFamilyImportGraph } from "./family-csv-graph-validation";
export type { FamilyCsvIssue } from "./family-csv-contract";

export function familyCsvBranchConflictIssues(
  current: readonly BranchUniquenessInput[],
  next: readonly BranchUniquenessInput[],
  sourceRows: ReadonlyMap<string, number> = new Map(),
): FamilyCsvIssue[] {
  return newBranchConflicts(current, next).map((conflict) => ({
    code: conflict.code,
    message:
      conflict.code === "DUPLICATE_BRANCH_ROOT"
        ? "A family root may be linked to only one branch."
        : "A branch with this name already exists in the family tree.",
    row: conflict.branchIds.map((id) => sourceRows.get(id)).find((row) => row !== undefined),
    column: conflict.column === "linked_male_id" ? "member_ref" : conflict.column,
    severity: "error",
  }));
}

function importSummary(members: FamilyCsvPreview["members"], branchCount: number) {
  const spousePairs = new Set<string>();
  for (const member of members)
    for (const spouseId of member.spouse_ids ?? [])
      spousePairs.add([member.id, spouseId].sort().join("\0"));
  return {
    members: members.length,
    parentLinks: members.reduce(
      (count, member) =>
        count + Number(Boolean(member.father_id)) + Number(Boolean(member.mother_id)),
      0,
    ),
    spouseLinks: spousePairs.size,
    branches: branchCount,
  };
}

export function parseFamilyCsv(csv: string): FamilyCsvParseResult {
  const rows = readFamilyCsvRows(csv);
  if (!rows.ok) return rows;
  const parsed = parseFamilyCsvMembers(rows.rows);
  const unknownWifeWarnings = synthesizeUnknownWives(parsed.members);
  parsed.issues.push(...familyCsvBranchConflictIssues([], parsed.subfamilies, parsed.branchRows));
  if (parsed.members.length > FAMILY_CSV_MAX_MEMBERS)
    parsed.issues.push(
      csvError(
        "TOO_MANY_MEMBERS",
        "A CSV may contain at most 10,000 members, including generated unknown wives.",
      ),
    );
  if (parsed.subfamilies.length > FAMILY_CSV_MAX_BRANCHES)
    parsed.issues.push(csvError("TOO_MANY_BRANCHES", "A CSV may define at most 2,000 branches."));
  const relationships = validateAndNormalizeRelationships(parsed.members);
  const issues = [
    ...parsed.issues,
    ...relationships.issues,
    ...ancestryCycleIssues(parsed.members),
  ];
  if (issues.length) return { ok: false, issues: issues.slice(0, MAX_REPORTED_ISSUES) };
  const members = parsed.members.map(
    ({ sourceRow: _sourceRow, rawSpouses: _rawSpouses, rawDivorced: _rawDivorced, ...member }) =>
      member,
  );
  return {
    ok: true,
    preview: {
      members,
      subfamilies: parsed.subfamilies,
      summary: importSummary(members, parsed.subfamilies.length),
      warnings: [...unknownWifeWarnings, ...relationships.warnings],
    },
  };
}

/** Converts file-local references into server-issued draft UUIDs. */
export function remapFamilyCsvPreview(
  preview: FamilyCsvPreview,
  createId: () => string,
): RemappedFamilyCsvPreview {
  const memberTargets = new Map(preview.members.map((member) => [member.id, createId()]));
  const branchTargets = new Map(preview.subfamilies.map((branch) => [branch.id, createId()]));
  const mapMember = (sourceId: string | undefined) =>
    sourceId ? memberTargets.get(sourceId) : undefined;
  const mapBranch = (sourceId: string | undefined) =>
    sourceId ? branchTargets.get(sourceId) : undefined;
  return {
    ...preview,
    members: preview.members.map((member) => ({
      ...member,
      id: memberTargets.get(member.id)!,
      father_id: mapMember(member.father_id),
      mother_id: mapMember(member.mother_id),
      spouse_id: mapMember(member.spouse_id),
      spouse_ids: member.spouse_ids?.map((id) => memberTargets.get(id)!),
      divorced_from: member.divorced_from?.map((id) => memberTargets.get(id)!),
      subfamily_id: mapBranch(member.subfamily_id),
    })),
    subfamilies: preview.subfamilies.map((branch) => ({
      ...branch,
      id: branchTargets.get(branch.id)!,
      linked_male_id: mapMember(branch.linked_male_id),
      parent_subfamily_id: mapBranch(branch.parent_subfamily_id),
    })),
    sourceMemberIds: [...memberTargets].map(([sourceId, targetId]) => ({ sourceId, targetId })),
    sourceBranchIds: [...branchTargets].map(([sourceId, targetId]) => ({ sourceId, targetId })),
  };
}

function csvCell(value: string) {
  return /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

export function familyCsvTemplate() {
  const rows = [
    [...FAMILY_CSV_HEADERS],
    [
      "P001",
      "Father",
      "الأب",
      "male",
      "",
      "",
      "P002",
      "",
      "B001",
      "Main branch",
      "الفرع الرئيسي",
      "1950-01-01",
      "",
      "false",
      "resident",
      "",
    ],
    [
      "P003",
      "Child",
      "الابن",
      "male",
      "P001",
      "P002",
      "",
      "",
      "",
      "",
      "",
      "1980-01-01",
      "",
      "false",
      "resident",
      "",
    ],
  ];
  return `\uFEFF${rows.map((row) => row.map(csvCell).join(",")).join("\r\n")}\r\n`;
}
