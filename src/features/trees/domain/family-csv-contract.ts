import type { FamilyMember, SubFamily } from "@/features/members/domain";

export const FAMILY_CSV_MAX_BYTES = 10 * 1024 * 1024;
export const FAMILY_CSV_MAX_MEMBERS = 10_000;
export const FAMILY_CSV_MAX_BRANCHES = 2_000;
export const MAX_REPORTED_ISSUES = 500;

export const FAMILY_CSV_HEADERS = [
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

export type FamilyCsvHeader = (typeof FAMILY_CSV_HEADERS)[number];
export type CsvRow = Record<FamilyCsvHeader, string>;

export const FAMILY_CSV_HEADER_ALIASES = {
  member_id: "member_ref",
  father_id: "father_ref",
  mother_id: "mother_ref",
  spouse_ids: "spouse_refs",
  divorced_spouse_ids: "divorced_spouse_refs",
  branch_id: "branch_ref",
} as const satisfies Record<string, FamilyCsvHeader>;

export type FamilyCsvIssue = {
  code: string;
  message: string;
  row?: number;
  column?: string;
  severity: "error" | "warning";
};

export type FamilyCsvSummary = {
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

export type FamilyCsvParseResult =
  { ok: true; preview: FamilyCsvPreview } | { ok: false; issues: FamilyCsvIssue[] };

export type PendingMember = FamilyMember & {
  sourceRow: number;
  rawSpouses: string[];
  rawDivorced: string[];
};

export function csvError(
  code: string,
  message: string,
  row?: number,
  column?: string,
): FamilyCsvIssue {
  return { code, message, row, column, severity: "error" };
}

export function csvWarning(
  code: string,
  message: string,
  row?: number,
  column?: string,
): FamilyCsvIssue {
  return { code, message, row, column, severity: "warning" };
}

export function validFamilyCsvSourceId(value: string) {
  return value.length > 0 && value.length <= 200 && !/[|\r\n\0]/.test(value);
}

export function splitFamilyCsvIds(value: string) {
  const result: string[] = [];
  for (const item of value.split("|").map((part) => part.trim()))
    if (item && !result.includes(item)) result.push(item);
  return result;
}

export function parseFamilyCsvBoolean(value: string): boolean | undefined | null {
  if (!value) return undefined;
  const normalized = value.trim().toLowerCase();
  if (["true", "1", "yes"].includes(normalized)) return true;
  if (["false", "0", "no"].includes(normalized)) return false;
  return null;
}

export function validFamilyCsvDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  if (year < 1 || month < 1 || month > 12 || day < 1) return false;
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day <= daysInMonth[month - 1];
}
