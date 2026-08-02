import { describe, expect, it } from "vitest";
import { analysisMembersCsv, decodeAnalysisCursor, encodeAnalysisCursor } from "./projection";
import type { AnalysisMember } from "./types";

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

  it("escapes bilingual CSV cells without exposing extra fields", () => {
    const member: AnalysisMember = {
      id: "member-1",
      name_en: 'Doe, "Jane"',
      name_ar: "جين\nدو",
      gender: "female",
      birth_date: "2000-01-01",
      death_date: null,
      lifecycle_age: 26,
      citizen_status: "resident",
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
    };
    const csv = analysisMembersCsv([member]);
    expect(csv).toContain('"Doe, ""Jane"""');
    expect(csv).toContain('"جين\nدو"');
    expect(csv).not.toContain("notes");
  });
});
