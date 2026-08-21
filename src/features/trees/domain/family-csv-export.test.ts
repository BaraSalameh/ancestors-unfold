import { describe, expect, it } from "vitest";
import type { FamilyMember, SubFamily } from "@/features/members/domain";
import { FAMILY_CSV_HEADERS } from "./family-csv-contract";
import { exportFamilyCsv } from "./family-csv-export";
import { parseFamilyCsv } from "./family-csv-import";

const timestamp = "2026-01-01T00:00:00.000Z";
const member = (id: string, patch: Partial<FamilyMember> = {}): FamilyMember => ({
  id,
  name_en: id,
  name_ar: "",
  gender: "male",
  citizen_status: "resident",
  created_at: timestamp,
  updated_at: timestamp,
  ...patch,
});

describe("family CSV export", () => {
  it("uses the canonical import columns and round-trips the importable graph", () => {
    const members = [
      member("child", {
        name_en: 'Child, "Junior"',
        name_ar: "الابن",
        gender: "male",
        father_id: "father",
        mother_id: "mother",
        birth_date: "2000-01-01",
        notes: "first line\nsecond line",
        created_at: "2026-01-03T00:00:00.000Z",
      }),
      member("mother", {
        name_en: "Mother",
        gender: "female",
        spouse_id: "father",
        spouse_ids: ["father"],
        divorced_from: ["father"],
        is_deceased: false,
        created_at: "2026-01-02T00:00:00.000Z",
      }),
      member("father", {
        name_en: "Father",
        spouse_id: "mother",
        spouse_ids: ["mother"],
        divorced_from: ["mother"],
        is_deceased: true,
        death_date: "2025-01-01",
        created_at: "2026-01-01T00:00:00.000Z",
      }),
    ];
    const branches: SubFamily[] = [
      {
        id: "active-branch",
        name_en: "Main, branch",
        name_ar: "الفرع الرئيسي",
        linked_male_id: "father",
        status: "active",
        created_at: timestamp,
        updated_at: timestamp,
      },
      {
        id: "inactive-branch",
        name_en: "Archived",
        name_ar: "",
        linked_male_id: "child",
        status: "inactive",
        created_at: "2026-01-02T00:00:00.000Z",
        updated_at: timestamp,
      },
    ];

    const csv = exportFamilyCsv(members, branches);
    expect(csv.startsWith(`\uFEFF${FAMILY_CSV_HEADERS.join(",")}\r\n`)).toBe(true);
    expect(csv.endsWith("\r\n")).toBe(true);
    expect(csv).toContain('"Child, ""Junior"""');
    expect(csv).toContain('"first line\nsecond line"');
    expect(csv).not.toContain("Archived");

    const parsed = parseFamilyCsv(csv);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.preview.members).toHaveLength(3);
    expect(parsed.preview.subfamilies).toHaveLength(1);
    expect(parsed.preview.subfamilies[0]).toMatchObject({
      id: "B001",
      linked_male_id: "P001",
      name_en: "Main, branch",
    });
    expect(parsed.preview.members.find(({ id }) => id === "P003")).toMatchObject({
      father_id: "P001",
      mother_id: "P002",
      notes: "first line\nsecond line",
    });
    expect(parsed.preview.members.find(({ id }) => id === "P001")).toMatchObject({
      spouse_ids: ["P002"],
      divorced_from: ["P002"],
      is_deceased: true,
    });
    expect(parsed.preview.members.find(({ id }) => id === "P002")?.is_deceased).toBe(false);
  });

  it("orders equal timestamps by ID and leaves absent optional values empty", () => {
    const csv = exportFamilyCsv([member("z"), member("a")], []);
    const rows = csv
      .replace(/^\uFEFF/, "")
      .trimEnd()
      .split("\r\n");
    expect(rows[1].startsWith("P001,a,")).toBe(true);
    expect(rows[2].startsWith("P002,z,")).toBe(true);
    expect(rows[1].split(",")[13]).toBe("");
  });
});
