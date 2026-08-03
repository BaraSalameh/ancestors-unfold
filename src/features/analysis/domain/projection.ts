import type { AnalysisMember, AnalysisSort } from "./types";

export type AnalysisCursor = {
  sort: AnalysisSort;
  direction: "asc" | "desc";
  value: string | null;
  id: string;
};

const cursorId = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function encodeAnalysisCursor(cursor: AnalysisCursor): string {
  return Buffer.from(JSON.stringify(cursor)).toString("base64url");
}

export function decodeAnalysisCursor(cursor?: string | null): AnalysisCursor | null {
  if (!cursor) return null;
  try {
    const parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as AnalysisCursor;
    const sorts: AnalysisSort[] = [
      "name",
      "age",
      "birth_date",
      "death_date",
      "children",
      "generation",
      "created_at",
      "updated_at",
    ];
    if (!sorts.includes(parsed.sort) || !["asc", "desc"].includes(parsed.direction))
      throw new Error("invalid cursor");
    if (!cursorId.test(parsed.id) || (parsed.value !== null && typeof parsed.value !== "string"))
      throw new Error("invalid cursor");
    if (parsed.value && parsed.value.length > 200) throw new Error("invalid cursor");
    return parsed;
  } catch {
    throw new Error("INVALID_CURSOR");
  }
}

const csvCell = (value: unknown) => {
  if (value === null || value === undefined) return "";
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};

export function analysisMembersCsv(members: AnalysisMember[]): string {
  const fields: Array<keyof AnalysisMember> = [
    "id",
    "name_en",
    "name_ar",
    "gender",
    "birth_date",
    "death_date",
    "is_deceased",
    "lifecycle_age",
    "citizen_status",
    "branch_name_en",
    "branch_name_ar",
    "father_id",
    "mother_id",
    "parent_count",
    "has_spouse",
    "child_count",
    "generation",
    "created_at",
    "updated_at",
  ];
  return [
    fields.join(","),
    ...members.map((member) => fields.map((field) => csvCell(member[field])).join(",")),
  ].join("\r\n");
}
