import { describe, expect, it } from "vitest";
import {
  analysisMembersCsv,
  analysisMembersJson,
  decodeAnalysisCursor,
  encodeAnalysisCursor,
} from "./projection";
import type { AnalysisEnvelope, AnalysisMember } from "./types";

describe("analysis projection", () => {
  it("round trips bounded cursors and rejects invalid cursors", () => {
    const cursor = {
      sort: "name" as const,
      direction: "asc" as const,
      value: "jane doe",
      id: "00000000-0000-4000-8000-000000000001",
    };
    expect(decodeAnalysisCursor(encodeAnalysisCursor(cursor))).toEqual(cursor);
    expect(() => decodeAnalysisCursor("not-a-cursor")).toThrow("INVALID_CURSOR");
  });
});

describe("analysis export names", () => {
  it("exports one bilingual four-part name cell without identifiers or internal timestamps", () => {
    const memberArabicName = "\u062c\u064a\u0646\n\u062f\u0648";
    const fatherArabicName = "\u064a\u0648\u0633\u0641";
    const grandfatherArabicName = "\u0645\u062d\u0645\u062f";
    const greatGrandfatherArabicName = "\u0646\u0645\u0631";
    const familyArabicName = "\u0627\u0644\u0639\u0627\u0626\u0644\u0629";
    const branchArabicName = "\u0627\u0644\u0641\u0631\u0639 \u0627\u0644\u0634\u0631\u0642\u064a";
    const expectedEnglishName = 'Doe, "Jane" Joseph Mohammed Nimer';
    const expectedArabicName = `${memberArabicName} ${fatherArabicName} ${grandfatherArabicName} ${greatGrandfatherArabicName}`;
    const member: AnalysisMember = {
      id: "member-1",
      name_en: 'Doe, "Jane"',
      name_ar: memberArabicName,
      father_name_en: "Joseph",
      father_name_ar: fatherArabicName,
      grandfather_name_en: "Mohammed",
      grandfather_name_ar: grandfatherArabicName,
      great_grandfather_name_en: "Nimer",
      great_grandfather_name_ar: greatGrandfatherArabicName,
      gender: "female",
      birth_date: "2000-01-01",
      death_date: "2025-12-31",
      is_deceased: true,
      lifecycle_age: 26,
      citizen_status: "resident",
      branch_id: null,
      branch_name_en: "East branch",
      branch_name_ar: branchArabicName,
      father_id: null,
      mother_id: null,
      parent_count: 0,
      has_spouse: false,
      child_count: 0,
      generation: 0,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    };
    const envelope: AnalysisEnvelope<AnalysisMember[]> = {
      schema_version: 1,
      as_of_date: "2026-08-03",
      scope: {
        kind: "branch",
        treeId: "tree-1",
        treeNameEn: "Family",
        treeNameAr: familyArabicName,
        branchId: "branch-1",
        branchNameEn: "East branch",
        branchNameAr: branchArabicName,
        role: "owner",
      },
      data: [member],
    };

    const csv = analysisMembersCsv(envelope);
    const csvHeader = csv.slice(1).split("\r\n", 1)[0]?.split(",") ?? [];
    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(csvHeader.slice(0, 2)).toEqual(["name_en", "name_ar"]);
    expect(csvHeader).not.toContain("first_name_en");
    expect(csvHeader).not.toContain("father_name_en");
    expect(csvHeader).not.toContain("grandfather_name_en");
    expect(csvHeader).not.toContain("family_name_en");
    expect(csvHeader).not.toContain("parent_count");
    expect(csv).toContain('"Doe, ""Jane"" Joseph Mohammed Nimer"');
    expect(csv).toContain(`"${expectedArabicName}"`);
    expect(csv).toContain("01/01/2000");
    expect(csv).toContain("12/31/2025");
    expect(csv).toContain(branchArabicName);
    expect(csv).not.toContain("member-1");
    expect(csv).not.toContain("created_at");
    expect(csv).not.toContain("father_id");

    const json = analysisMembersJson(envelope);
    const parsed = JSON.parse(json) as {
      schema_version: number;
      members: Array<Record<string, unknown>>;
    };
    expect(parsed.schema_version).toBe(2);
    expect(parsed.members[0]).toMatchObject({
      name_en: expectedEnglishName,
      name_ar: expectedArabicName,
    });
    expect(parsed.members[0]).not.toHaveProperty("parent_count");
    expect(json).toContain(branchArabicName);
    expect(json).toContain("12/31/2025");
    expect(json).not.toContain("tree-1");
    expect(json).not.toContain("branch-1");
    expect(json).not.toContain("member-1");
    expect(json).not.toContain("created_at");
  });
});

describe("analysis export missing values", () => {
  it("omits missing name components instead of leaving gaps", () => {
    const familyArabicName = "\u0627\u0644\u0639\u0627\u0626\u0644\u0629";
    const member = {
      id: "member-2",
      name_en: "Sara",
      name_ar: "\u0633\u0627\u0631\u0629",
      father_name_en: null,
      father_name_ar: null,
      grandfather_name_en: null,
      grandfather_name_ar: null,
      great_grandfather_name_en: null,
      great_grandfather_name_ar: null,
      gender: "female" as const,
      birth_date: null,
      death_date: null,
      is_deceased: false,
      lifecycle_age: null,
      citizen_status: "resident" as const,
      branch_id: null,
      branch_name_en: null,
      branch_name_ar: null,
      father_id: null,
      mother_id: null,
      parent_count: 0,
      has_spouse: false,
      child_count: 0,
      generation: 0,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    } satisfies AnalysisMember;
    const json = analysisMembersJson({
      schema_version: 1,
      as_of_date: "2026-08-03",
      scope: {
        kind: "tree",
        treeId: "tree-1",
        treeNameEn: "Family",
        treeNameAr: familyArabicName,
        branchId: null,
        branchNameEn: null,
        branchNameAr: null,
        role: "owner",
      },
      data: [
        member,
        {
          ...member,
          id: "member-3",
          name_en: "Khalil",
          name_ar: "\u062e\u0644\u064a\u0644",
          father_name_en: "Ibrahim",
          father_name_ar: "\u0625\u0628\u0631\u0627\u0647\u064a\u0645",
        },
      ],
    });
    const parsed = JSON.parse(json) as { members: Array<Record<string, unknown>> };

    expect(parsed.members[0]).toMatchObject({
      name_en: "Sara",
      name_ar: "\u0633\u0627\u0631\u0629",
      birth_date: null,
      death_date: null,
      generation: 0,
    });
    expect(parsed.members[1]).toMatchObject({
      name_en: "Khalil Ibrahim",
      name_ar: "\u062e\u0644\u064a\u0644 \u0625\u0628\u0631\u0627\u0647\u064a\u0645",
    });
  });
});
