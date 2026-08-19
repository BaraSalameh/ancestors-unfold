import type { SubFamily } from "@/features/members/domain";
import {
  csvError,
  parseFamilyCsvBoolean,
  splitFamilyCsvIds,
  validFamilyCsvDate,
  validFamilyCsvSourceId,
  type CsvRow,
  type FamilyCsvIssue,
  type PendingMember,
} from "./family-csv-contract";

function validateMemberIdentity(value: CsvRow, row: number, memberRows: Map<string, number>) {
  const issues: FamilyCsvIssue[] = [];
  if (!validFamilyCsvSourceId(value.member_ref))
    issues.push(
      csvError(
        "INVALID_MEMBER_ID",
        "member_ref is required, must be at most 200 characters, and cannot contain | or line breaks.",
        row,
        "member_ref",
      ),
    );
  else if (memberRows.has(value.member_ref))
    issues.push(
      csvError(
        "DUPLICATE_MEMBER_ID",
        `Duplicate member_ref: ${value.member_ref}.`,
        row,
        "member_ref",
      ),
    );
  else memberRows.set(value.member_ref, row);
  if (!value.name_en && !value.name_ar)
    issues.push(csvError("NAME_REQUIRED", "At least one member name is required.", row, "name_en"));
  if (value.name_en.length > 200 || value.name_ar.length > 200)
    issues.push(csvError("NAME_TOO_LONG", "Member names may not exceed 200 characters.", row));
  if (value.gender !== "male" && value.gender !== "female")
    issues.push(csvError("INVALID_GENDER", "gender must be male or female.", row, "gender"));
  return issues;
}

function validateLifeFields(value: CsvRow, row: number) {
  const issues: FamilyCsvIssue[] = [];
  for (const [column, date] of [
    ["birth_date", value.birth_date],
    ["death_date", value.death_date],
  ] as const)
    if (date && !validFamilyCsvDate(date))
      issues.push(csvError("INVALID_DATE", `${column} must use YYYY-MM-DD.`, row, column));
  if (value.birth_date && value.death_date && value.death_date < value.birth_date)
    issues.push(
      csvError("DEATH_BEFORE_BIRTH", "death_date cannot be before birth_date.", row, "death_date"),
    );
  const deceased = parseFamilyCsvBoolean(value.is_deceased);
  if (deceased === null)
    issues.push(
      csvError(
        "INVALID_BOOLEAN",
        "is_deceased must be true, false, 1, 0, yes, or no.",
        row,
        "is_deceased",
      ),
    );
  if (value.death_date && deceased === false)
    issues.push(
      csvError(
        "DECEASED_CONTRADICTION",
        "A member with a death_date cannot have is_deceased=false.",
        row,
        "is_deceased",
      ),
    );
  if (value.citizen_status && !["resident", "non_resident"].includes(value.citizen_status))
    issues.push(
      csvError(
        "INVALID_CITIZEN_STATUS",
        "citizen_status must be resident or non_resident.",
        row,
        "citizen_status",
      ),
    );
  if (value.notes.length > 10_000)
    issues.push(
      csvError("NOTES_TOO_LONG", "notes may not exceed 10,000 characters.", row, "notes"),
    );
  return { issues, deceased };
}

function relationshipFields(value: CsvRow, row: number) {
  const issues: FamilyCsvIssue[] = [];
  const rawSpouses = splitFamilyCsvIds(value.spouse_refs);
  const rawDivorced = splitFamilyCsvIds(value.divorced_spouse_refs);
  for (const id of [...rawSpouses, ...rawDivorced])
    if (!validFamilyCsvSourceId(id))
      issues.push(csvError("INVALID_RELATION_ID", `Invalid relationship ID: ${id}.`, row));
  if (rawSpouses.length > 100)
    issues.push(
      csvError(
        "TOO_MANY_SPOUSES",
        "A member may reference at most 100 spouses.",
        row,
        "spouse_refs",
      ),
    );
  for (const id of rawDivorced)
    if (!rawSpouses.includes(id))
      issues.push(
        csvError(
          "DIVORCE_NOT_SPOUSE",
          `${id} appears in divorced_spouse_refs but not spouse_refs.`,
          row,
          "divorced_spouse_refs",
        ),
      );
  return { issues, rawSpouses, rawDivorced };
}

function branchFromRow(value: CsvRow, row: number, branchRows: Map<string, number>, now: string) {
  const issues: FamilyCsvIssue[] = [];
  if (!value.branch_ref && !value.branch_name_en && !value.branch_name_ar)
    return { issues, branch: undefined };
  if (!validFamilyCsvSourceId(value.branch_ref))
    issues.push(
      csvError(
        "BRANCH_ID_REQUIRED",
        "A valid branch_ref is required for a branch root.",
        row,
        "branch_ref",
      ),
    );
  if (!value.branch_name_en && !value.branch_name_ar)
    issues.push(
      csvError(
        "BRANCH_NAME_REQUIRED",
        "At least one branch name is required.",
        row,
        "branch_name_en",
      ),
    );
  if (value.gender !== "male")
    issues.push(csvError("BRANCH_ROOT_NOT_MALE", "A branch root must be male.", row, "branch_ref"));
  if (branchRows.has(value.branch_ref))
    issues.push(
      csvError(
        "DUPLICATE_BRANCH_ID",
        `Duplicate branch_ref: ${value.branch_ref}.`,
        row,
        "branch_ref",
      ),
    );
  else if (value.branch_ref) branchRows.set(value.branch_ref, row);
  if (value.branch_name_en.length > 200 || value.branch_name_ar.length > 200)
    issues.push(
      csvError("BRANCH_NAME_TOO_LONG", "Branch names may not exceed 200 characters.", row),
    );
  const branch: SubFamily = {
    id: value.branch_ref,
    name_en: value.branch_name_en || value.branch_name_ar,
    name_ar: value.branch_name_ar,
    linked_male_id: value.member_ref,
    status: "active",
    attachments: [],
    created_at: now,
    updated_at: now,
  };
  return { issues, branch };
}

function memberFromRow(
  value: CsvRow,
  row: number,
  now: string,
  deceased: boolean | null | undefined,
) {
  const relationships = relationshipFields(value, row);
  const member: PendingMember = {
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
    rawSpouses: relationships.rawSpouses,
    rawDivorced: relationships.rawDivorced,
  };
  return { member, issues: relationships.issues };
}

export function parseFamilyCsvMembers(rows: Array<{ row: number; value: CsvRow }>) {
  const issues: FamilyCsvIssue[] = [];
  const members: PendingMember[] = [];
  const subfamilies: SubFamily[] = [];
  const memberRows = new Map<string, number>();
  const branchRows = new Map<string, number>();
  const now = new Date().toISOString();
  for (const { row, value } of rows) {
    issues.push(...validateMemberIdentity(value, row, memberRows));
    const life = validateLifeFields(value, row);
    issues.push(...life.issues);
    const parsedMember = memberFromRow(value, row, now, life.deceased);
    members.push(parsedMember.member);
    issues.push(...parsedMember.issues);
    const parsedBranch = branchFromRow(value, row, branchRows, now);
    issues.push(...parsedBranch.issues);
    if (parsedBranch.branch) subfamilies.push(parsedBranch.branch);
  }
  return { issues, members, subfamilies, branchRows };
}
