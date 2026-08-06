import { describe, expect, it } from "vitest";
import {
  FAMILY_CSV_MAX_BYTES,
  familyCsvTemplate,
  parseFamilyCsv,
  remapFamilyCsvPreview,
  validateFamilyImportGraph,
} from "./family-csv-import";

// The contract scenarios stay together so canonical and legacy CSV behavior is reviewed as one unit.
// eslint-disable-next-line max-lines-per-function
describe("family CSV import", () => {
  it("parses the UTF-8 bilingual template and infers the parents' union", () => {
    const result = parseFamilyCsv(familyCsvTemplate());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.preview.summary).toEqual({
      members: 3,
      parentLinks: 2,
      spouseLinks: 1,
      branches: 1,
    });
    expect(result.preview.members.find(({ id }) => id === "P001")?.spouse_ids).toEqual(["P002"]);
    expect(result.preview.subfamilies[0]).toMatchObject({ id: "B001", linked_male_id: "P001" });
  });

  it("supports quoted commas, line breaks, Arabic-only names, and disconnected roots", () => {
    const csv =
      'member_id,name_ar,gender,notes\r\nA,"أحمد، الأول",male,"line one\r\nline two"\r\nB,ليلى,female,""\r\n';
    const result = parseFamilyCsv(csv);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.preview.members).toHaveLength(2);
    expect(result.preview.members[0]).toMatchObject({
      name_ar: "أحمد، الأول",
      notes: "line one\r\nline two",
    });
  });

  it("normalizes multiple spouses and symmetric divorce state in declared order", () => {
    const csv = [
      "member_id,name_en,gender,spouse_ids,divorced_spouse_ids",
      "H,Husband,male,W2|W1,W1",
      "W1,First wife,female,H,H",
      "W2,Second wife,female,,",
    ].join("\n");
    const result = parseFamilyCsv(csv);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.preview.members[0].spouse_ids).toEqual(["W2", "W1"]);
    expect(result.preview.members[0].divorced_from).toEqual(["W1"]);
    expect(result.preview.members[1].divorced_from).toEqual(["H"]);
  });

  it("turns canonical file references into generated IDs and rewrites the complete graph", () => {
    const csv = [
      "member_ref,name_en,gender,father_ref,mother_ref,spouse_refs,branch_ref,branch_name_en",
      "Dad,Father,male,,,Mom,Main,Main branch",
      "Mom,Mother,female,,,Dad,,",
      "row-17,Child,male,Dad,Mom,,,",
    ].join("\n");
    const parsed = parseFamilyCsv(csv);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    let sequence = 100;
    const remapped = remapFamilyCsvPreview(
      parsed.preview,
      () => `00000000-0000-4000-8000-${String(sequence++).padStart(12, "0")}`,
    );

    const sourceMembers = new Map(
      remapped.sourceMemberIds.map(({ sourceId, targetId }) => [sourceId, targetId]),
    );
    const sourceBranches = new Map(
      remapped.sourceBranchIds.map(({ sourceId, targetId }) => [sourceId, targetId]),
    );
    expect(remapped.members.map(({ id }) => id)).not.toContain("Dad");
    expect(remapped.members.find(({ id }) => id === sourceMembers.get("row-17"))).toMatchObject({
      father_id: sourceMembers.get("Dad"),
      mother_id: sourceMembers.get("Mom"),
    });
    expect(remapped.members.find(({ id }) => id === sourceMembers.get("Dad"))?.spouse_ids).toEqual([
      sourceMembers.get("Mom"),
    ]);
    expect(remapped.subfamilies[0]).toMatchObject({
      id: sourceBranches.get("Main"),
      linked_male_id: sourceMembers.get("Dad"),
    });
  });

  it("always remaps UUID-shaped source references and generates fresh IDs per preview", () => {
    const sourceId = "00000000-0000-4000-8000-000000000001";
    const parsed = parseFamilyCsv(`member_ref,name_en,gender\n${sourceId},One,male`);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const first = remapFamilyCsvPreview(
      parsed.preview,
      () => "00000000-0000-4000-8000-000000000101",
    );
    const second = remapFamilyCsvPreview(
      parsed.preview,
      () => "00000000-0000-4000-8000-000000000102",
    );
    expect(first.members[0].id).not.toBe(sourceId);
    expect(first.members[0].id).not.toBe(second.members[0].id);
    expect(first.sourceMemberIds[0]).toEqual({
      sourceId,
      targetId: "00000000-0000-4000-8000-000000000101",
    });
  });

  it("rejects ambiguous canonical and legacy headers", () => {
    const result = parseFamilyCsv("member_ref,member_id,name_en,gender\nA,A,One,male");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues.map(({ code }) => code)).toContain("AMBIGUOUS_HEADER");
  });

  it("validates the legacy primary spouse field in edited import drafts", () => {
    const timestamps = {
      created_at: "2026-08-01T00:00:00.000Z",
      updated_at: "2026-08-01T00:00:00.000Z",
    };
    const issues = validateFamilyImportGraph(
      [
        {
          id: crypto.randomUUID(),
          name_en: "One",
          name_ar: "",
          gender: "male",
          citizen_status: "resident",
          spouse_id: "missing-member",
          spouse_ids: [],
          ...timestamps,
        },
      ],
      [],
    );
    expect(issues.map(({ code }) => code)).toContain("MISSING_REFERENCE");
  });

  it("rejects malformed and oversized CSV payloads", () => {
    const malformed = parseFamilyCsv('member_id,name_en,gender\nA,"unterminated,male');
    expect(malformed.ok).toBe(false);
    if (!malformed.ok) expect(malformed.issues.map(({ code }) => code)).toContain("MALFORMED_CSV");

    const oversized = parseFamilyCsv("x".repeat(FAMILY_CSV_MAX_BYTES + 1));
    expect(oversized).toMatchObject({
      ok: false,
      issues: [expect.objectContaining({ code: "FILE_TOO_LARGE" })],
    });
  });

  it.each([
    ["duplicate IDs", "member_id,name_en,gender\nA,One,male\nA,Two,female", "DUPLICATE_MEMBER_ID"],
    ["missing references", "member_id,name_en,gender,father_id\nA,One,male,X", "MISSING_REFERENCE"],
    [
      "wrong parent gender",
      "member_id,name_en,gender,father_id\nA,One,female,B\nB,Two,female,",
      "PARENT_GENDER",
    ],
    ["cycles", "member_id,name_en,gender,father_id\nA,One,male,B\nB,Two,male,A", "ANCESTRY_CYCLE"],
    [
      "death before birth",
      "member_id,name_en,gender,birth_date,death_date\nA,One,male,2020-01-01,2019-01-01",
      "DEATH_BEFORE_BIRTH",
    ],
    [
      "contradictory deceased state",
      "member_id,name_en,gender,death_date,is_deceased\nA,One,male,2020-01-01,false",
      "DECEASED_CONTRADICTION",
    ],
    ["duplicate headers", "member_id,name_en,name_en,gender\nA,One,One,male", "DUPLICATE_HEADER"],
  ])("rejects %s", (_label, csv, code) => {
    const result = parseFamilyCsv(csv);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues.map((issue) => issue.code)).toContain(code);
  });
});
