/* eslint-disable max-lines -- The CSV grammar and graph validation form one versioned import contract. */
import Papa from "papaparse";
import type { FamilyMember, SubFamily } from "@/features/members/domain";

export const FAMILY_CSV_MAX_BYTES = 10 * 1024 * 1024;
const FAMILY_CSV_MAX_MEMBERS = 10_000;
const FAMILY_CSV_MAX_BRANCHES = 2_000;

const FAMILY_CSV_HEADERS = [
  "member_ref",
  "name_en",
  "name_ar",
  "gender",
  "father_ref",
  "mother_ref",
  "spouse_refs",
  "divorced_spouse_refs",
  "branch_ref",
  "branch_name_en",
  "branch_name_ar",
  "birth_date",
  "death_date",
  "is_deceased",
  "citizen_status",
  "notes",
] as const;

const FAMILY_CSV_HEADER_ALIASES = {
  member_id: "member_ref",
  father_id: "father_ref",
  mother_id: "mother_ref",
  spouse_ids: "spouse_refs",
  divorced_spouse_ids: "divorced_spouse_refs",
  branch_id: "branch_ref",
} as const satisfies Record<string, FamilyCsvHeader>;

type FamilyCsvHeader = (typeof FAMILY_CSV_HEADERS)[number];
type CsvRow = Record<FamilyCsvHeader, string>;

export type FamilyCsvIssue = {
  code: string;
  message: string;
  row?: number;
  column?: string;
  severity: "error" | "warning";
};

type FamilyCsvSummary = {
  members: number;
  parentLinks: number;
  spouseLinks: number;
  branches: number;
};

export type FamilyCsvPreview = {
  members: FamilyMember[];
  subfamilies: SubFamily[];
  summary: FamilyCsvSummary;
  warnings: FamilyCsvIssue[];
};

export type RemappedFamilyCsvPreview = FamilyCsvPreview & {
  sourceMemberIds: Array<{ sourceId: string; targetId: string }>;
  sourceBranchIds: Array<{ sourceId: string; targetId: string }>;
};

type FamilyCsvParseResult =
  { ok: true; preview: FamilyCsvPreview } | { ok: false; issues: FamilyCsvIssue[] };

const allowedHeaders = new Set<string>([
  ...FAMILY_CSV_HEADERS,
  ...Object.keys(FAMILY_CSV_HEADER_ALIASES),
]);
const isoDate = /^\d{4}-\d{2}-\d{2}$/;
const MAX_REPORTED_ISSUES = 500;

function error(code: string, message: string, row?: number, column?: string): FamilyCsvIssue {
  return { code, message, row, column, severity: "error" };
}

function warning(code: string, message: string, row?: number, column?: string): FamilyCsvIssue {
  return { code, message, row, column, severity: "warning" };
}

function byteLength(value: string) {
  return new TextEncoder().encode(value).byteLength;
}

function normalizeHeader(value: string, index: number) {
  return (index === 0 ? value.replace(/^\uFEFF/, "") : value).trim().toLowerCase();
}

function canonicalHeader(value: string): FamilyCsvHeader | undefined {
  if ((FAMILY_CSV_HEADERS as readonly string[]).includes(value)) return value as FamilyCsvHeader;
  return FAMILY_CSV_HEADER_ALIASES[value as keyof typeof FAMILY_CSV_HEADER_ALIASES];
}

function validSourceId(value: string) {
  return value.length > 0 && value.length <= 200 && !/[|\r\n\0]/.test(value);
}

function splitIds(value: string) {
  const result: string[] = [];
  for (const item of value.split("|").map((part) => part.trim())) {
    if (item && !result.includes(item)) result.push(item);
  }
  return result;
}

function parseBoolean(value: string): boolean | undefined | null {
  if (!value) return undefined;
  const normalized = value.trim().toLowerCase();
  if (["true", "1", "yes"].includes(normalized)) return true;
  if (["false", "0", "no"].includes(normalized)) return false;
  return null;
}

function validDate(value: string) {
  if (!isoDate.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  if (year < 1 || month < 1 || month > 12 || day < 1) return false;
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day <= daysInMonth[month - 1];
}

function emptyRow(): CsvRow {
  return Object.fromEntries(FAMILY_CSV_HEADERS.map((header) => [header, ""])) as CsvRow;
}

function csvRows(
  csv: string,
):
  | { ok: true; rows: Array<{ row: number; value: CsvRow }> }
  | { ok: false; issues: FamilyCsvIssue[] } {
  if (byteLength(csv) > FAMILY_CSV_MAX_BYTES)
    return {
      ok: false,
      issues: [error("FILE_TOO_LARGE", "CSV files may not exceed 10 MiB.")],
    };
  if (!csv.trim()) return { ok: false, issues: [error("EMPTY_FILE", "The CSV file is empty.")] };

  const parsed = Papa.parse<string[]>(csv, {
    skipEmptyLines: "greedy",
  });
  const parseIssues = parsed.errors.map((item) =>
    error("MALFORMED_CSV", item.message, item.row == null ? undefined : item.row + 1),
  );
  if (parseIssues.length) return { ok: false, issues: parseIssues.slice(0, MAX_REPORTED_ISSUES) };
  if (!parsed.data.length)
    return { ok: false, issues: [error("EMPTY_FILE", "The CSV file is empty.")] };

  const headers = parsed.data[0].map(normalizeHeader);
  const issues: FamilyCsvIssue[] = [];
  const seen = new Set<string>();
  const seenCanonical = new Map<FamilyCsvHeader, string>();
  headers.forEach((header, index) => {
    if (!header) {
      issues.push(error("EMPTY_HEADER", "CSV headers may not be empty.", 1, String(index + 1)));
      return;
    }
    if (seen.has(header))
      issues.push(error("DUPLICATE_HEADER", `Duplicate header: ${header}.`, 1, header));
    seen.add(header);
    if (!allowedHeaders.has(header))
      issues.push(error("UNKNOWN_HEADER", `Unknown header: ${header}.`, 1, header));
    const canonical = canonicalHeader(header);
    const prior = canonical ? seenCanonical.get(canonical) : undefined;
    if (canonical && prior && prior !== header)
      issues.push(
        error(
          "AMBIGUOUS_HEADER",
          `Headers ${prior} and ${header} represent the same field; use only one.`,
          1,
          header,
        ),
      );
    else if (canonical) seenCanonical.set(canonical, header);
  });
  for (const required of ["member_ref", "gender"] as const)
    if (!seenCanonical.has(required))
      issues.push(error("MISSING_HEADER", `Missing required header: ${required}.`, 1, required));
  if (!seenCanonical.has("name_en") && !seenCanonical.has("name_ar"))
    issues.push(
      error("MISSING_NAME_HEADER", "The CSV must include name_en or name_ar.", 1, "name_en"),
    );
  if (issues.length) return { ok: false, issues: issues.slice(0, MAX_REPORTED_ISSUES) };

  const dataRows = parsed.data.slice(1);
  if (dataRows.length > FAMILY_CSV_MAX_MEMBERS)
    return {
      ok: false,
      issues: [error("TOO_MANY_MEMBERS", "A CSV may contain at most 10,000 members.")],
    };
  if (!dataRows.length)
    return { ok: false, issues: [error("NO_MEMBERS", "The CSV contains no member rows.")] };

  const rows = dataRows.map((cells, rowIndex) => {
    const value = emptyRow();
    headers.forEach((header, columnIndex) => {
      const canonical = canonicalHeader(header);
      if (canonical) value[canonical] = (cells[columnIndex] ?? "").trim();
    });
    if (cells.length > headers.length && cells.slice(headers.length).some((cell) => cell.trim()))
      issues.push(
        error("EXTRA_COLUMNS", "This row has more values than the header row.", rowIndex + 2),
      );
    return { row: rowIndex + 2, value };
  });
  return issues.length
    ? { ok: false, issues: issues.slice(0, MAX_REPORTED_ISSUES) }
    : { ok: true, rows };
}

type PendingMember = FamilyMember & {
  sourceRow: number;
  rawSpouses: string[];
  rawDivorced: string[];
};

// Each conditional emits a stable row/column issue for one independent CSV field rule.
// eslint-disable-next-line complexity, max-lines-per-function
function parseMembers(rows: Array<{ row: number; value: CsvRow }>) {
  const issues: FamilyCsvIssue[] = [];
  const members: PendingMember[] = [];
  const subfamilies: SubFamily[] = [];
  const memberRows = new Map<string, number>();
  const branchRows = new Map<string, number>();
  const now = new Date().toISOString();

  for (const { row, value } of rows) {
    if (!validSourceId(value.member_ref))
      issues.push(
        error(
          "INVALID_MEMBER_ID",
          "member_ref is required, must be at most 200 characters, and cannot contain | or line breaks.",
          row,
          "member_ref",
        ),
      );
    else if (memberRows.has(value.member_ref))
      issues.push(
        error(
          "DUPLICATE_MEMBER_ID",
          `Duplicate member_ref: ${value.member_ref}.`,
          row,
          "member_ref",
        ),
      );
    else memberRows.set(value.member_ref, row);

    if (!value.name_en && !value.name_ar)
      issues.push(error("NAME_REQUIRED", "At least one member name is required.", row, "name_en"));
    if (value.name_en.length > 200 || value.name_ar.length > 200)
      issues.push(error("NAME_TOO_LONG", "Member names may not exceed 200 characters.", row));
    if (value.gender !== "male" && value.gender !== "female")
      issues.push(error("INVALID_GENDER", "gender must be male or female.", row, "gender"));
    for (const [column, date] of [
      ["birth_date", value.birth_date],
      ["death_date", value.death_date],
    ] as const)
      if (date && !validDate(date))
        issues.push(error("INVALID_DATE", `${column} must use YYYY-MM-DD.`, row, column));
    if (value.birth_date && value.death_date && value.death_date < value.birth_date)
      issues.push(
        error("DEATH_BEFORE_BIRTH", "death_date cannot be before birth_date.", row, "death_date"),
      );
    const deceased = parseBoolean(value.is_deceased);
    if (deceased === null)
      issues.push(
        error(
          "INVALID_BOOLEAN",
          "is_deceased must be true, false, 1, 0, yes, or no.",
          row,
          "is_deceased",
        ),
      );
    if (value.death_date && deceased === false)
      issues.push(
        error(
          "DECEASED_CONTRADICTION",
          "A member with a death_date cannot have is_deceased=false.",
          row,
          "is_deceased",
        ),
      );
    if (value.citizen_status && !["resident", "non_resident"].includes(value.citizen_status))
      issues.push(
        error(
          "INVALID_CITIZEN_STATUS",
          "citizen_status must be resident or non_resident.",
          row,
          "citizen_status",
        ),
      );
    if (value.notes.length > 10_000)
      issues.push(error("NOTES_TOO_LONG", "notes may not exceed 10,000 characters.", row, "notes"));

    const rawSpouses = splitIds(value.spouse_refs);
    const rawDivorced = splitIds(value.divorced_spouse_refs);
    for (const id of [...rawSpouses, ...rawDivorced])
      if (!validSourceId(id))
        issues.push(error("INVALID_RELATION_ID", `Invalid relationship ID: ${id}.`, row));
    if (rawSpouses.length > 100)
      issues.push(
        error(
          "TOO_MANY_SPOUSES",
          "A member may reference at most 100 spouses.",
          row,
          "spouse_refs",
        ),
      );
    for (const id of rawDivorced)
      if (!rawSpouses.includes(id))
        issues.push(
          error(
            "DIVORCE_NOT_SPOUSE",
            `${id} appears in divorced_spouse_refs but not spouse_refs.`,
            row,
            "divorced_spouse_refs",
          ),
        );

    members.push({
      id: value.member_ref,
      name_en: value.name_en,
      name_ar: value.name_ar,
      gender: value.gender === "female" ? "female" : "male",
      birth_date: value.birth_date || undefined,
      death_date: value.death_date || undefined,
      is_deceased: deceased ?? Boolean(value.death_date),
      citizen_status: value.citizen_status === "non_resident" ? "non_resident" : "resident",
      notes: value.notes || undefined,
      father_id: value.father_ref || undefined,
      mother_id: value.mother_ref || undefined,
      created_at: now,
      updated_at: now,
      sourceRow: row,
      rawSpouses,
      rawDivorced,
    });

    const hasBranch = Boolean(value.branch_ref || value.branch_name_en || value.branch_name_ar);
    if (hasBranch) {
      if (!validSourceId(value.branch_ref))
        issues.push(
          error(
            "BRANCH_ID_REQUIRED",
            "A valid branch_ref is required for a branch root.",
            row,
            "branch_ref",
          ),
        );
      if (!value.branch_name_en && !value.branch_name_ar)
        issues.push(
          error(
            "BRANCH_NAME_REQUIRED",
            "At least one branch name is required.",
            row,
            "branch_name_en",
          ),
        );
      if (value.gender !== "male")
        issues.push(
          error("BRANCH_ROOT_NOT_MALE", "A branch root must be male.", row, "branch_ref"),
        );
      if (branchRows.has(value.branch_ref))
        issues.push(
          error(
            "DUPLICATE_BRANCH_ID",
            `Duplicate branch_ref: ${value.branch_ref}.`,
            row,
            "branch_ref",
          ),
        );
      else if (value.branch_ref) branchRows.set(value.branch_ref, row);
      if (value.branch_name_en.length > 200 || value.branch_name_ar.length > 200)
        issues.push(
          error("BRANCH_NAME_TOO_LONG", "Branch names may not exceed 200 characters.", row),
        );
      subfamilies.push({
        id: value.branch_ref,
        name_en: value.branch_name_en || value.branch_name_ar,
        name_ar: value.branch_name_ar,
        linked_male_id: value.member_ref,
        status: "active",
        attachments: [],
        created_at: now,
        updated_at: now,
      });
    }
  }
  return { issues, members, subfamilies };
}

// Relationship normalization deliberately handles all parent/spouse invariants in one graph pass.
// eslint-disable-next-line complexity
function validateAndNormalizeRelationships(members: PendingMember[]) {
  const issues: FamilyCsvIssue[] = [];
  const warnings: FamilyCsvIssue[] = [];
  const byId = new Map(members.map((member) => [member.id, member]));
  const spouseOrder = new Map(members.map((member) => [member.id, [...member.rawSpouses]]));
  const divorced = new Map(members.map((member) => [member.id, new Set(member.rawDivorced)]));

  for (const member of members) {
    for (const [column, parentId, gender] of [
      ["father_id", member.father_id, "male"],
      ["mother_id", member.mother_id, "female"],
    ] as const) {
      if (!parentId) continue;
      const parent = byId.get(parentId);
      if (!parent)
        issues.push(
          error(
            "MISSING_REFERENCE",
            `${column} references missing member ${parentId}.`,
            member.sourceRow,
            column,
          ),
        );
      else if (parent.id === member.id)
        issues.push(
          error("SELF_PARENT", "A member cannot be their own parent.", member.sourceRow, column),
        );
      else if (parent.gender !== gender)
        issues.push(
          error(
            "PARENT_GENDER",
            `${column} must reference a ${gender} member.`,
            member.sourceRow,
            column,
          ),
        );
    }
    for (const spouseId of member.rawSpouses) {
      const spouse = byId.get(spouseId);
      if (!spouse)
        issues.push(
          error(
            "MISSING_REFERENCE",
            `spouse_ids references missing member ${spouseId}.`,
            member.sourceRow,
            "spouse_ids",
          ),
        );
      else if (spouse.id === member.id)
        issues.push(
          error(
            "SELF_SPOUSE",
            "A member cannot be their own spouse.",
            member.sourceRow,
            "spouse_ids",
          ),
        );
      else if (spouse.gender === member.gender)
        issues.push(
          error(
            "SPOUSE_GENDER",
            "Spouses must have opposite genders in this tree model.",
            member.sourceRow,
            "spouse_ids",
          ),
        );
      else {
        const reverse = spouseOrder.get(spouseId)!;
        if (!reverse.includes(member.id)) reverse.push(member.id);
        if (divorced.get(member.id)!.has(spouseId) || divorced.get(spouseId)!.has(member.id)) {
          divorced.get(member.id)!.add(spouseId);
          divorced.get(spouseId)!.add(member.id);
        }
      }
    }
    if (member.father_id && member.mother_id) {
      const father = byId.get(member.father_id);
      const mother = byId.get(member.mother_id);
      if (father?.gender === "male" && mother?.gender === "female") {
        const fatherOrder = spouseOrder.get(father.id)!;
        const motherOrder = spouseOrder.get(mother.id)!;
        const inferred = !fatherOrder.includes(mother.id) && !motherOrder.includes(father.id);
        if (!fatherOrder.includes(mother.id)) fatherOrder.push(mother.id);
        if (!motherOrder.includes(father.id)) motherOrder.push(father.id);
        if (inferred)
          warnings.push(
            warning(
              "INFERRED_PARENT_UNION",
              `Added spouse relationship between ${father.id} and ${mother.id}.`,
              member.sourceRow,
            ),
          );
      }
    }
  }

  for (const member of members) {
    const next = spouseOrder.get(member.id)!;
    if (next.length > 100)
      issues.push(
        error(
          "TOO_MANY_SPOUSES",
          "A member may have at most 100 spouses.",
          member.sourceRow,
          "spouse_ids",
        ),
      );
    member.spouse_ids = next.length ? next : undefined;
    member.spouse_id = next[0];
    const divorcedIds = next.filter((id) => divorced.get(member.id)!.has(id));
    member.divorced_from = divorcedIds.length ? divorcedIds : undefined;
  }
  return { issues, warnings };
}

function ancestryCycleIssues(members: PendingMember[]) {
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
        error(
          "ANCESTRY_CYCLE",
          `An ancestry cycle includes member ${member.id}.`,
          member.sourceRow,
        ),
      );
      break;
    }
  return issues;
}

export function parseFamilyCsv(csv: string): FamilyCsvParseResult {
  const rows = csvRows(csv);
  if (!rows.ok) return rows;
  const parsed = parseMembers(rows.rows);
  if (parsed.subfamilies.length > FAMILY_CSV_MAX_BRANCHES)
    parsed.issues.push(error("TOO_MANY_BRANCHES", "A CSV may define at most 2,000 branches."));
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
  const spousePairs = new Set<string>();
  for (const member of members)
    for (const spouseId of member.spouse_ids ?? [])
      spousePairs.add([member.id, spouseId].sort().join("\0"));
  return {
    ok: true,
    preview: {
      members,
      subfamilies: parsed.subfamilies,
      summary: {
        members: members.length,
        parentLinks: members.reduce(
          (count, member) =>
            count + Number(Boolean(member.father_id)) + Number(Boolean(member.mother_id)),
          0,
        ),
        spouseLinks: spousePairs.size,
        branches: parsed.subfamilies.length,
      },
      warnings: relationships.warnings,
    },
  };
}

/**
 * Converts file-local references into server-issued draft UUIDs before the graph crosses the API
 * boundary. Source references remain available only in the explicit audit mappings.
 */
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

// Apply-time graph validation mirrors the complete import contract before any transaction writes.
// eslint-disable-next-line complexity, max-lines-per-function
export function validateFamilyImportGraph(
  members: FamilyMember[],
  subfamilies: SubFamily[],
): FamilyCsvIssue[] {
  const issues: FamilyCsvIssue[] = [];
  const byId = new Map<string, FamilyMember>();
  for (const member of members) {
    if (byId.has(member.id))
      issues.push(error("DUPLICATE_MEMBER_ID", `Duplicate member ID: ${member.id}.`));
    byId.set(member.id, member);
    if (!member.name_en.trim() && !member.name_ar.trim())
      issues.push(error("NAME_REQUIRED", `Member ${member.id} requires at least one name.`));
  }

  const pairs = new Set<string>();
  for (const member of members) {
    for (const [column, parentId, gender] of [
      ["father_id", member.father_id, "male"],
      ["mother_id", member.mother_id, "female"],
    ] as const) {
      if (!parentId) continue;
      const parent = byId.get(parentId);
      if (!parent)
        issues.push(
          error(
            "MISSING_REFERENCE",
            `${column} references missing member ${parentId}.`,
            undefined,
            column,
          ),
        );
      else if (parent.id === member.id)
        issues.push(
          error(
            "SELF_PARENT",
            `Member ${member.id} cannot be their own parent.`,
            undefined,
            column,
          ),
        );
      else if (parent.gender !== gender)
        issues.push(
          error(
            "PARENT_GENDER",
            `${column} for ${member.id} must reference a ${gender} member.`,
            undefined,
            column,
          ),
        );
    }
    const spouseIds = [
      ...(member.spouse_ids ?? []),
      ...(member.spouse_id ? [member.spouse_id] : []),
    ].filter((id, index, all) => all.indexOf(id) === index);
    if (spouseIds.length > 100)
      issues.push(error("TOO_MANY_SPOUSES", `Member ${member.id} has more than 100 spouses.`));
    for (const spouseId of spouseIds) {
      const spouse = byId.get(spouseId);
      if (!spouse)
        issues.push(
          error(
            "MISSING_REFERENCE",
            `Spouse reference ${spouseId} does not exist.`,
            undefined,
            "spouse_ids",
          ),
        );
      else if (spouse.id === member.id)
        issues.push(
          error(
            "SELF_SPOUSE",
            `Member ${member.id} cannot be their own spouse.`,
            undefined,
            "spouse_ids",
          ),
        );
      else if (spouse.gender === member.gender)
        issues.push(
          error(
            "SPOUSE_GENDER",
            `Spouses ${member.id} and ${spouse.id} must have opposite genders.`,
            undefined,
            "spouse_ids",
          ),
        );
      pairs.add([member.id, spouseId].sort().join("\0"));
    }
    for (const divorcedId of member.divorced_from ?? [])
      if (!spouseIds.includes(divorcedId))
        issues.push(
          error(
            "DIVORCE_NOT_SPOUSE",
            `${divorcedId} is divorced from ${member.id} but is not listed as a spouse.`,
            undefined,
            "divorced_from",
          ),
        );
    if (member.birth_date && !validDate(member.birth_date))
      issues.push(
        error("INVALID_DATE", `Invalid birth_date for ${member.id}.`, undefined, "birth_date"),
      );
    if (member.death_date && !validDate(member.death_date))
      issues.push(
        error("INVALID_DATE", `Invalid death_date for ${member.id}.`, undefined, "death_date"),
      );
    if (member.birth_date && member.death_date && member.death_date < member.birth_date)
      issues.push(
        error(
          "DEATH_BEFORE_BIRTH",
          `death_date cannot be before birth_date for ${member.id}.`,
          undefined,
          "death_date",
        ),
      );
    if (member.death_date && member.is_deceased === false)
      issues.push(
        error(
          "DECEASED_CONTRADICTION",
          `Member ${member.id} has a death date but is_deceased=false.`,
          undefined,
          "is_deceased",
        ),
      );
  }

  const branchIds = new Set<string>();
  for (const branch of subfamilies) {
    if (branchIds.has(branch.id))
      issues.push(error("DUPLICATE_BRANCH_ID", `Duplicate branch ID: ${branch.id}.`));
    branchIds.add(branch.id);
    const root = branch.linked_male_id ? byId.get(branch.linked_male_id) : undefined;
    if (!branch.name_en.trim() && !branch.name_ar.trim())
      issues.push(error("BRANCH_NAME_REQUIRED", `Branch ${branch.id} requires a name.`));
    if (!root)
      issues.push(
        error("MISSING_BRANCH_ROOT", `Branch ${branch.id} must reference an imported member.`),
      );
    else if (root.gender !== "male")
      issues.push(
        error("BRANCH_ROOT_NOT_MALE", `Branch ${branch.id} must be rooted at a male member.`),
      );
  }

  const pending = members.map((member) => ({
    ...member,
    sourceRow: 0,
    rawSpouses: member.spouse_ids ?? (member.spouse_id ? [member.spouse_id] : []),
    rawDivorced: member.divorced_from ?? [],
  }));
  issues.push(...ancestryCycleIssues(pending));
  return issues;
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
      "P002",
      "Mother",
      "الأم",
      "female",
      "",
      "",
      "P001",
      "",
      "",
      "",
      "",
      "1955-01-01",
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
