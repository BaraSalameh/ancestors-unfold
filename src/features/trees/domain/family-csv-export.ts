import type { FamilyMember, SubFamily } from "@/features/members/domain";
import { FAMILY_CSV_HEADERS, type CsvRow } from "./family-csv-contract";

function compareEntities(
  first: { id: string; created_at: string },
  second: { id: string; created_at: string },
) {
  return first.created_at.localeCompare(second.created_at) || first.id.localeCompare(second.id);
}

function referenceMap<T extends { id: string; created_at: string }>(
  entities: readonly T[],
  prefix: "P" | "B",
) {
  const width = Math.max(3, String(entities.length).length);
  return new Map(
    [...entities]
      .sort(compareEntities)
      .map((entity, index) => [entity.id, `${prefix}${String(index + 1).padStart(width, "0")}`]),
  );
}

function csvCell(value: string) {
  return /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

function spouseIds(member: FamilyMember) {
  return [...(member.spouse_ids ?? []), ...(member.spouse_id ? [member.spouse_id] : [])].filter(
    (id, index, all) => all.indexOf(id) === index,
  );
}

function exportedRow(
  member: FamilyMember,
  memberRefs: ReadonlyMap<string, string>,
  branch: SubFamily | undefined,
  branchRefs: ReadonlyMap<string, string>,
): CsvRow {
  const memberRef = (id: string | undefined) => (id ? (memberRefs.get(id) ?? "") : "");
  return {
    member_ref: memberRefs.get(member.id)!,
    name_en: member.name_en,
    name_ar: member.name_ar,
    gender: member.gender,
    father_ref: memberRef(member.father_id),
    mother_ref: memberRef(member.mother_id),
    spouse_refs: spouseIds(member).map(memberRef).filter(Boolean).join("|"),
    divorced_spouse_refs: (member.divorced_from ?? []).map(memberRef).filter(Boolean).join("|"),
    branch_ref: branch ? (branchRefs.get(branch.id) ?? "") : "",
    branch_name_en: branch?.name_en ?? "",
    branch_name_ar: branch?.name_ar ?? "",
    birth_date: member.birth_date ?? "",
    death_date: member.death_date ?? "",
    is_deceased: member.is_deceased === undefined ? "" : String(member.is_deceased),
    citizen_status: member.citizen_status,
    notes: member.notes ?? "",
  };
}

export function exportFamilyCsv(
  members: readonly FamilyMember[],
  subfamilies: readonly SubFamily[],
) {
  const orderedMembers = [...members].sort(compareEntities);
  const activeBranches = subfamilies
    .filter((branch) => branch.status !== "inactive" && branch.linked_male_id)
    .sort(compareEntities);
  const memberRefs = referenceMap(orderedMembers, "P");
  const branchRefs = referenceMap(activeBranches, "B");
  const branchByRoot = new Map(activeBranches.map((branch) => [branch.linked_male_id!, branch]));
  const rows = orderedMembers.map((member) =>
    exportedRow(member, memberRefs, branchByRoot.get(member.id), branchRefs),
  );
  return `\uFEFF${[
    FAMILY_CSV_HEADERS.join(","),
    ...rows.map((row) => FAMILY_CSV_HEADERS.map((header) => csvCell(row[header])).join(",")),
  ].join("\r\n")}\r\n`;
}
