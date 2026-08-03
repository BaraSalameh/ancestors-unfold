import type { PoolClient } from "pg";
import { describe, expect, it, vi } from "vitest";
import type { AnalysisScope, SummaryData } from "../domain/types";
import { readAnalysisMembers, readAnalysisSummary, readBranchReport } from "./repository";

const scope: AnalysisScope = {
  kind: "tree",
  treeId: "00000000-0000-4000-8000-000000000001",
  treeNameEn: "Family",
  treeNameAr: "العائلة",
  branchId: null,
  branchNameEn: null,
  branchNameAr: null,
  role: "owner",
};

const summary: SummaryData = {
  total: 0,
  living: 0,
  deceased: 0,
  male: 0,
  female: 0,
  adults: 0,
  living_adults: 0,
  minors: 0,
  unknown_age: 0,
  resident: 0,
  non_resident: 0,
  average_age: null,
  median_age: null,
  average_lifespan: null,
  oldest_member: null,
  youngest_member: null,
  age_bands: [],
  birth_decades: [],
  death_decades: [],
};

describe("analysis repository queries", () => {
  it("limits overview demographics and ten-year bands to living members", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [summary], rowCount: 1 });
    await readAnalysisSummary({ query } as unknown as PoolClient, scope);
    const sql = String(query.mock.calls[0][0]);

    expect(sql).toContain("NOT is_deceased AND gender='male'");
    expect(sql).toContain("NOT is_deceased AND lifecycle_age>=18");
    expect(sql).toContain("generate_series(0,stats.max_band,10)");
    expect(sql).toContain("WHERE NOT is_deceased AND lifecycle_age IS NOT NULL");
    expect(sql).not.toContain("gender='unspecified'");
  });

  it("derives explorer branches from direct assignments and ancestry without unions", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [], rowCount: 0 });
    await readAnalysisMembers(
      { query } as unknown as PoolClient,
      scope,
      { filters: {}, sort: "name", direction: "asc", limit: 25 },
      null,
    );
    const sql = String(query.mock.calls[0][0]);

    expect(sql).toContain("branch_lineage");
    expect(sql).toContain("direct_assignment DESC");
    expect(sql).toContain("LEFT JOIN scoped_members father ON father.id=ps.father_id");
    expect(sql).toContain("LEFT JOIN parent_stats father_ps ON father_ps.child_id=father.id");
    expect(sql).toContain("grandfather.name_en grandfather_name_en");
    expect(sql).toContain(
      "LEFT JOIN parent_stats grandfather_ps ON grandfather_ps.child_id=grandfather.id",
    );
    expect(sql).toContain("great_grandfather.name_en great_grandfather_name_en");
    expect(sql).not.toContain("union_partners mine");
  });

  it("keeps one unknown-age diagnostic in branch reports", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [], rowCount: 0 });
    await readBranchReport({ query } as unknown as PoolClient, scope);
    const sql = String(query.mock.calls[0][0]);

    expect(sql).toContain("unknown_age");
    expect(sql).not.toContain("missing_birth_date");
    expect(sql).not.toContain("unknown_citizenship");
    expect(sql).not.toContain("missing_name_en");
  });

  it("serializes dates and calculates generation for exports", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [], rowCount: 0 });
    await readAnalysisMembers(
      { query } as unknown as PoolClient,
      scope,
      { filters: {}, sort: "name", direction: "asc", limit: 100 },
      null,
      10_001,
    );
    const sql = String(query.mock.calls[0][0]);
    const values = query.mock.calls[0][1] as unknown[];

    expect(sql).toContain("birth_date::text birth_date");
    expect(sql).toContain("death_date::text death_date");
    expect(values[3]).toBe(true);
  });

  it("applies wife exclusion to the shared explorer and export query", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [], rowCount: 0 });
    await readAnalysisMembers(
      { query } as unknown as PoolClient,
      scope,
      { filters: { excludeWives: true }, sort: "name", direction: "asc", limit: 25 },
      null,
    );
    const sql = String(query.mock.calls[0][0]);

    expect(sql).toContain("SELECT * FROM base member WHERE NOT (");
    expect(sql).toContain("JOIN scoped_members husband");
    expect(sql).toContain("NOT EXISTS");
  });
});
