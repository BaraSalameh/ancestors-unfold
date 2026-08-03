import type { AnalysisEnvelope, AnalysisMember, AnalysisSort } from "./types";
import { analysisMemberNames } from "./member-name";

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

type AnalysisExportMember = {
  name_en: string;
  name_ar: string;
  gender: AnalysisMember["gender"];
  birth_date: string | null;
  death_date: string | null;
  is_deceased: boolean;
  lifecycle_age: number | null;
  citizen_status: AnalysisMember["citizen_status"];
  branch_name_en: string | null;
  branch_name_ar: string | null;
  has_spouse: boolean;
  child_count: number;
  generation: number | null;
};

const exportFields: Array<keyof AnalysisExportMember> = [
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
  "has_spouse",
  "child_count",
  "generation",
];

function exportDate(value: string | null): string | null {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  return match ? `${match[2]}/${match[3]}/${match[1]}` : null;
}

function analysisExportMembers(members: AnalysisMember[]): AnalysisExportMember[] {
  return members.map((member) => {
    const names = analysisMemberNames(member);
    return {
      name_en: names.en,
      name_ar: names.ar,
      gender: member.gender,
      birth_date: exportDate(member.birth_date),
      death_date: exportDate(member.death_date),
      is_deceased: member.is_deceased,
      lifecycle_age: member.lifecycle_age,
      citizen_status: member.citizen_status,
      branch_name_en: member.branch_name_en,
      branch_name_ar: member.branch_name_ar,
      has_spouse: member.has_spouse,
      child_count: member.child_count,
      generation: member.generation,
    };
  });
}

export function analysisMembersCsv(envelope: AnalysisEnvelope<AnalysisMember[]>): string {
  const projected = analysisExportMembers(envelope.data);
  return `\uFEFF${[
    exportFields.join(","),
    ...projected.map((member) => exportFields.map((field) => csvCell(member[field])).join(",")),
  ].join("\r\n")}`;
}

export function analysisMembersJson(envelope: AnalysisEnvelope<AnalysisMember[]>): string {
  return JSON.stringify(
    {
      schema_version: 2,
      as_of_date: envelope.as_of_date,
      scope: {
        kind: envelope.scope.kind,
        role: envelope.scope.role,
        tree_name_en: envelope.scope.treeNameEn,
        tree_name_ar: envelope.scope.treeNameAr,
        branch_name_en: envelope.scope.branchNameEn,
        branch_name_ar: envelope.scope.branchNameAr,
      },
      members: analysisExportMembers(envelope.data),
    },
    null,
    2,
  );
}
